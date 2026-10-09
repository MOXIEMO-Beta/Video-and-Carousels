#!/usr/bin/env node
/**
 * Render a reel: your footage + word-timed captions + a timeline of overlay components.
 *   npm run reel -- projects/<name> [--preview]
 * Everything in the spec is in SOURCE time; cuts and zooms are applied to the footage and the
 * overlays are mapped through the edit list automatically.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { ROOT, fontCss, resolveAsset, resolveAssetPath } from './core.mjs';
import { parseCaptions, markEmphasis, buildEdl, zoomExpr, autoZooms } from './reel/timeline.mjs';

const ff = (args, label) => {
  const r = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed (${label}):\n${r.stderr}`);
};
const probe = (file) => {
  const o = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' }).stdout);
  const v = o.streams.find((s) => s.codec_type === 'video');
  return { w: v.width, h: v.height, dur: Number(o.format.duration), hasAudio: o.streams.some((s) => s.codec_type === 'audio') };
};

/** Chromium writes fully opaque screenshots as RGB PNGs. Mixed RGB/RGBA frames make ffmpeg drop frames, so force RGBA. */
function forceRgba(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(26);
  fs.readSync(fd, head, 0, 26, 0);
  fs.closeSync(fd);
  if (head[25] === 6) return; // already RGBA
  const tmp = file + '.rgba.png';
  ff(['-i', file, '-vf', 'format=rgba', '-frames:v', '1', tmp], 'rgba');
  fs.renameSync(tmp, file);
}

export function loadReelSpec(dir) {
  const specPath = fs.existsSync(path.join(dir, 'spec.json')) ? path.join(dir, 'spec.json') : dir;
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const base = path.dirname(path.resolve(specPath));
  const tokens = JSON.parse(fs.readFileSync(path.join(ROOT, 'styles/reel', `${spec.style || 'tutorial'}.json`), 'utf8'));
  const bn = path.basename(base);
  return { spec, base, tokens, name: bn === 'reel' ? path.basename(path.dirname(base)) : bn };
}

export async function renderReel({ spec, base, tokens, name, outFile, preview = false, quiet = false }) {
  const log = (...a) => !quiet && console.log(...a);
  const srcFile = resolveAssetPath(base, spec.footage.src);
  const src = probe(srcFile);
  const edl = buildEdl(spec.footage, src.dur);

  const W = preview ? 360 : spec.output?.w ?? 720;
  const H = preview ? 640 : spec.output?.h ?? 1280;
  const FPS = preview ? 12 : spec.output?.fps ?? 30;
  const work = path.join(ROOT, 'output', name, 'reel', preview ? '.work-preview' : '.work');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });

  // ---- zooms (source time -> output time)
  const zooms = [];
  const zspec = spec.footage.zooms === 'auto' ? autoZooms(tokens, edl.outDur) : null;
  if (zspec) zooms.push(...zspec);
  else for (const z of spec.footage.zooms || []) {
    const at = edl.mapStart(z.at);
    zooms.push({ ...z, at });
  }
  const zexpr = zoomExpr(zooms);
  const fx = spec.footage.focus?.[0] ?? 0.5, fy = spec.footage.focus?.[1] ?? 0.38;

  // ---- pass A: footage with cuts + zooms
  const A = edl.a, B = edl.b;
  const cutExpr = edl.cuts.map(([s, e]) => `gte(t,${(s - A).toFixed(3)})*lt(t,${(e - A).toFixed(3)})`).join('+');
  const vf = [`[0:v]trim=start=${A}:end=${B},setpts=PTS-STARTPTS,fps=${FPS}`];
  if (cutExpr) vf.push(`select='not(${cutExpr})',setpts=N/FRAME_RATE/TB`);
  vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`);
  if (zexpr) vf.push(`scale=w='trunc(${W}*(${zexpr})/2)*2':h='trunc(${H}*(${zexpr})/2)*2':eval=frame,crop=${W}:${H}:(iw-${W})*${fx}:(ih-${H})*${fy}`);
  const filters = [vf.join(',') + '[v]'];
  const mapArgs = ['-map', '[v]'];
  if (src.hasAudio) {
    let af = `[0:a]atrim=start=${A}:end=${B},asetpts=PTS-STARTPTS`;
    if (cutExpr) af += `,aselect='not(${cutExpr})',asetpts=N/SR/TB`;
    filters.push(af + '[a]');
    mapArgs.push('-map', '[a]');
  }
  const baseFile = path.join(work, 'base.mp4');
  log(`• footage: ${edl.outDur.toFixed(1)} s after ${edl.cuts.length} cut(s), ${zooms.length} zoom event(s)`);
  ff(['-i', srcFile, '-filter_complex', filters.join(';'), ...mapArgs, '-c:v', 'libx264', '-crf', preview ? '30' : '15', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', ...(src.hasAudio ? ['-c:a', 'aac', '-b:a', '192k'] : []), baseFile], 'footage');

  // ---- captions + overlays into output time
  let words = [];
  if (spec.captions?.src) {
    words = parseCaptions(resolveAssetPath(base, spec.captions.src));
    markEmphasis(words, spec.captions);
    const cl = (x) => Math.min(edl.outDur, Math.max(0, x));
    words = words
      .filter((w) => w.t1 > edl.a && w.t0 < edl.b)
      .map((w) => ({ ...w, t0: cl(edl.mapStart(w.t0)), t1: cl(edl.mapStart(w.t1)) }))
      .filter((w) => w.t1 - w.t0 > 0.02); // words that lie wholly inside a cut vanish
  }
  const capTokens = { ...tokens.captions, ...(spec.captions?.style || {}) };
  const useTokens = { ...tokens, captions: capTokens };
  const items = [];
  const clips = [];
  for (const it of spec.timeline || []) {
    const at = edl.mapStart(it.at);
    const o = { ...it, at };
    if (typeof o.image === 'string' && o.image) o.image = resolveAsset(base, o.image);
    if (typeof o.src === 'string' && o.type === 'image') o.src = resolveAsset(base, o.src);
    if (o.type === 'clip') clips.push(o); else items.push(o);
  }

  // ---- render overlay states (screenshot only when the DOM changes)
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const htmlFile = path.join(work, 'overlay.html');
  fs.writeFileSync(htmlFile, `<!doctype html><html><head><meta charset="utf-8"><style>${fontCss()}
html,body{margin:0;width:${W}px;height:${H}px;background:transparent;overflow:hidden}
#root{position:absolute;inset:0}
.it{position:absolute;box-sizing:border-box}
.ln{line-height:1.06;margin:0}
.bx{display:inline-block;padding:.03em .16em .07em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.cur{opacity:.85}
.cap{position:absolute;transform:translate(-50%,-50%);line-height:1.1;white-space:normal}
.beat{position:absolute;inset:0}
em,i.acc{font-style:italic}
img{max-width:100%}
</style></head><body><div id="root"></div></body></html>`);
  await page.goto(pathToFileURL(htmlFile).href);
  await page.addScriptTag({ path: path.join(ROOT, 'src/reel/runtime.browser.js') });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate((cfg) => window.REEL.init(cfg), { w: W, h: H, tokens: useTokens, items, words });

  const total = Math.ceil(edl.outDur * FPS);
  const states = [];
  let prev = null;
  for (let f = 0; f < total; f++) {
    const t = f / FPS;
    const html = await page.evaluate((t) => window.REEL.render(t), t);
    if (html !== prev) {
      const file = path.join(work, `o_${String(states.length).padStart(5, '0')}.png`);
      await page.waitForFunction(() => [...document.images].every((i) => i.complete));
      await page.screenshot({ path: file, omitBackground: true });
      forceRgba(file);
      states.push({ file, t });
      prev = html;
    }
  }
  await browser.close();
  log(`• overlay: ${states.length} distinct states over ${total} frames`);

  const q = (f) => `file '${f.replace(/'/g, "'\\''")}'`;
  const list = states
    .map((s, i) => `${q(s.file)}\nduration ${((i + 1 < states.length ? states[i + 1].t : total / FPS) - s.t).toFixed(5)}`)
    .join('\n') + `\n${q(states[states.length - 1].file)}\n`;
  fs.writeFileSync(path.join(work, 'overlay.txt'), list);

  // ---- pass B: composite clips + overlay onto the footage
  const inputs = ['-i', baseFile];
  const fg = [];
  let last = '[0:v]';
  clips.forEach((c, i) => {
    const k = i + 1;
    inputs.push('-i', resolveAssetPath(base, c.src));
    const cw = Math.round((c.w ?? 60) / 100 * W / 2) * 2;
    const cx = Math.round(((c.x ?? 50) / 100) * W - cw / 2);
    const cy = Math.round(((c.y ?? 50) / 100) * H);
    const s = c.start ?? 0;
    fg.push(`[${k}:v]trim=start=${s}:duration=${c.dur},setpts=PTS-STARTPTS+${c.at.toFixed(3)}/TB,fps=${FPS},scale=${cw}:-2[c${k}]`);
    fg.push(`${last}[c${k}]overlay=x=${cx}:y=${cy}:eof_action=pass:enable='between(t,${c.at.toFixed(3)},${(c.at + c.dur).toFixed(3)})'[m${k}]`);
    last = `[m${k}]`;
  });
  const ovIdx = clips.length + 1;
  inputs.push('-f', 'concat', '-safe', '0', '-i', path.join(work, 'overlay.txt'));
  fg.push(`[${ovIdx}:v]fps=${FPS},format=rgba[ov]`);
  fg.push(`${last}[ov]overlay=format=auto:shortest=0[out]`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  ff([...inputs, '-filter_complex', fg.join(';'), '-map', '[out]', ...(src.hasAudio ? ['-map', '0:a'] : []), '-c:v', 'libx264', '-crf', preview ? '30' : '17', '-preset', preview ? 'veryfast' : 'medium', '-pix_fmt', 'yuv420p', ...(src.hasAudio ? ['-c:a', 'copy'] : []), '-t', edl.outDur.toFixed(3), '-movflags', '+faststart', outFile], 'composite');
  log('✓', path.relative(ROOT, outFile), `${edl.outDur.toFixed(1)}s ${W}x${H}@${FPS}`);
  if (!process.env.REEL_KEEP) fs.rmSync(work, { recursive: true, force: true });
  return { outDur: edl.outDur, states: states.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: npm run reel -- projects/<name> [--preview]'); process.exit(1); }
  const preview = process.argv.includes('--preview');
  const r = loadReelSpec(dir);
  await renderReel({ ...r, preview, outFile: path.join(ROOT, 'output', r.name, 'reel', `${r.name}${preview ? '-preview' : ''}.mp4`) });
}
