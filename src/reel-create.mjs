#!/usr/bin/env node
/**
 * Footage + captions + your words -> one reel option per style.
 *   npm run reel:create -- --name my-reel --video inbox/clip.mp4 --captions inbox/clip.json
 *   npm run reel:create -- --name my-reel --pick tutorial        finalise one (full quality)
 * Reads content.json (same file as carousels): topic, hook, intro, points[{title,text,at,proof}], cta{keyword,after}.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './core.mjs';
import { loadReelSpec, renderReel } from './reel.mjs';
import { parseCaptions } from './reel/timeline.mjs';

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);

const name = opt('--name', 'my-reel');
const projectDir = path.join(ROOT, 'projects', name, 'reel');
const optDir = path.join(projectDir, 'options');
const outRoot = path.join(ROOT, 'output', name, 'reel-options');
const STYLES = {
  editorial: 'Editorial serif + proof cards',
  kinetic: 'Bold sans + gold italic emphasis',
  tutorial: 'How-to: typewriter titles + numbered steps',
  beatcards: 'Fast montage + beat cards',
};

// ---------- pick: finalise ----------
if (flag('--pick')) {
  const style = opt('--pick');
  const src = path.join(optDir, `${style}.json`);
  if (!fs.existsSync(src)) throw new Error(`No option "${style}" for ${name}. Run reel:create first.`);
  fs.copyFileSync(src, path.join(projectDir, 'spec.json'));
  const r = loadReelSpec(projectDir);
  await renderReel({ ...r, outFile: path.join(ROOT, 'output', name, 'reel', `${name}.mp4`) });
  console.log(`✓ projects/${name}/reel/spec.json  (edit it, then: npm run reel -- projects/${name}/reel)`);
  process.exit(0);
}

// ---------- inputs ----------
const contentFile = opt('--content', fs.existsSync(path.join(ROOT, 'content.json')) ? 'content.json' : 'content.example.json');
const content = JSON.parse(fs.readFileSync(path.resolve(ROOT, contentFile), 'utf8'));
const warnings = [];
let video = opt('--video');
if (!video) {
  const inbox = path.join(ROOT, 'inbox');
  const f = fs.existsSync(inbox) ? fs.readdirSync(inbox).filter((x) => /\.(mp4|mov|m4v)$/i.test(x)).sort()[0] : null;
  video = f ? path.join('inbox', f) : flag('--sample') ? 'assets/footage/sample.mp4' : null;
}
if (!video) throw new Error('No footage. Put a vertical .mp4 in inbox/ or pass --video <file> (or --sample to try the stand-in clip).');
const videoAbs = path.resolve(ROOT, video);
let captions = opt('--captions');
if (!captions) {
  const stem = videoAbs.replace(/\.[^.]+$/, '');
  captions = ['-words.json', '.json', '.srt', '.vtt'].map((e) => stem + e).find((f) => fs.existsSync(f));
  captions = captions ? path.relative(ROOT, captions) : null;
}
let words = [];
if (captions) words = parseCaptions(path.resolve(ROOT, captions));
else warnings.push('No captions file found next to the video. Word-by-word captions are the signature of every style, so supply words.json / .srt / .vtt (--captions). Built without captions.');

const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', videoAbs], { encoding: 'utf8' }).stdout);
const vs = probe.streams.find((s) => s.codec_type === 'video');
const srcDur = Number(probe.format.duration);
if (vs.width > vs.height) warnings.push(`Footage is landscape (${vs.width}x${vs.height}); it will be centre-cropped to 9:16. Film vertically for best results.`);
if (Math.min(vs.width, vs.height) < 720) warnings.push(`Footage is only ${Math.min(vs.width, vs.height)}px on its short side; 720px+ recommended.`);

// ---------- pause trimming (the references all have silence removed) ----------
let cuts = [];
if (!flag('--keep-pauses')) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', videoAbs, '-af', 'silencedetect=n=-35dB:d=0.5', '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
  const starts = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  starts.forEach((s, i) => { if (ends[i] != null && ends[i] - s > 0.6) cuts.push([+(s + 0.15).toFixed(2), +(ends[i] - 0.1).toFixed(2)]); });
}
const outDur = srcDur - cuts.reduce((s, [a, b]) => s + b - a, 0);
if (outDur > 180) warnings.push(`Reel is ${Math.round(outDur)} s. The reference reels run 52-172 s; under 90 s keeps more viewers.`);

// ---------- helpers ----------
const wrap = (text, max) => {
  const out = [[]];
  let len = 0;
  for (const w of String(text).replace(/\*/g, '').split(/\s+/)) {
    if (len && len + 1 + w.length > max) { out.push([]); len = 0; }
    out[out.length - 1].push(w); len += (len ? 1 : 0) + w.length;
  }
  return out.map((l) => l.join(' '));
};
const sig = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 2);
function findInTranscript(title, from) {
  const keys = sig(title).slice(0, 2);
  if (!keys.length || !words.length) return null;
  const norm = words.map((w) => w.w.toLowerCase().replace(/[^a-z0-9]/g, ''));
  for (let i = 0; i < words.length; i++) {
    if (words[i].t0 < from) continue;
    if (norm[i] === keys[0] && (keys.length < 2 || norm.slice(i, i + 5).includes(keys[1]))) return words[i].t0;
  }
  return null;
}
const points = content.points || [];
const hookDur = Math.min(6, Math.max(3.5, srcDur * 0.12));
const ctaDur = 4;
const times = [];
let cursor = hookDur + 0.5;
points.forEach((p, i) => {
  let at = p.at ?? findInTranscript(p.title, cursor);
  if (at == null) at = hookDur + 0.5 + ((srcDur - ctaDur - hookDur - 1) * i) / Math.max(1, points.length);
  at = Math.max(at, cursor);
  times.push(at);
  cursor = at + 3;
});
if (points.some((p, i) => p.at == null && findInTranscript(p.title, 0) == null) && words.length) {
  warnings.push('Some points were not found in the transcript, so they are spaced evenly. Add "at": seconds to those points in content.json to pin them.');
}
if (points.length < 2) warnings.push('1 point is thin for a reel. 3-5 steps is the pattern in the reference reels.');
const cta = content.cta || {};
const ctaAt = Math.max(cursor, srcDur - ctaDur - 0.5);
const brand = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'brand.json'), 'utf8')); } catch { return {}; } })();

const common = (extra = {}) => ({
  footage: { src: video, cuts, zooms: 'auto' },
  ...(captions ? { captions: { src: captions, numbers: true, ...extra } } : {}),
});
const ctaItem = (style) => (cta.keyword ? [{ type: 'cta', at: ctaAt, dur: ctaDur, lead: cta.lead || 'Comment', keyword: String(cta.keyword).toUpperCase(), after: cta.after, y: style === 'beatcards' ? 12 : 14 }] : []);
const proofCard = (p, at, dur) => (p.proof ? [{ type: 'card', at: at + 0.4, dur, x: 50, y: 64, w: 80, heading: p.proof.heading || p.title, rows: p.proof.rows, text: p.proof.text }] : []);

const builders = {
  editorial() {
    const tl = [{ type: 'title', at: 0, dur: hookDur, lines: wrap(content.hook, 22), sub: content.intro && wrap(content.intro, 40)[0] }];
    points.forEach((p, i) => { tl.push({ type: 'section', at: times[i], dur: 4, lines: wrap(`${i + 1}. ${p.title}`, 26) }); tl.push(...proofCard(p, times[i], 4)); });
    return { style: 'editorial', ...common({ auto: true }), timeline: [...tl, ...ctaItem('editorial')] };
  },
  kinetic() {
    const tl = [{ type: 'title', at: 0, dur: Math.min(hookDur, 3.6), lines: wrap(content.hook, 18), sub: content.intro && wrap(content.intro, 36)[0] }];
    points.forEach((p, i) => {
      const w = wrap(p.title, 14);
      tl.push({ type: 'label', at: times[i], dur: 2.8, text: `step ${i + 1}.`, font: 'sans', size: 36, y: 12, x: 50, color: 'accent' });
      tl.push({ type: 'hero', at: times[i] + 0.15, dur: 2.65, y: 17, size: 84, lines: [{ t: w[0].toLowerCase() }, ...(w.slice(1).length ? [{ t: w.slice(1).join(' ').toLowerCase(), accent: true }] : [])] });
      tl.push(...proofCard(p, times[i], 3));
    });
    return { style: 'kinetic', ...common({ auto: true }), timeline: [...tl, ...ctaItem('kinetic')] };
  },
  tutorial() {
    const tl = [{ type: 'title', at: 0, dur: Math.max(hookDur, 6), lines: wrap(content.hook, 20), sub: content.intro && wrap(content.intro, 40)[0] }];
    points.forEach((p, i) => { tl.push({ type: 'section', at: times[i], dur: 3.4, num: String(i + 1).padStart(2, '0') + '.', lines: wrap(p.title, 22) }); tl.push(...proofCard(p, times[i], 3.6)); });
    return { style: 'tutorial', ...common(), timeline: [...tl, ...ctaItem('tutorial')] };
  },
  beatcards() {
    const tl = [{ type: 'title', at: 0, dur: Math.min(hookDur, 4.2), lines: wrap(content.hook, 16) }];
    points.forEach((p, i) => {
      const ws = sig(p.title).length ? String(p.title).split(/\s+/) : [p.title];
      tl.push({ type: 'beat', at: times[i], dur: Math.max(1.4, ws.length * 0.34), words: ws, per: 0.34, color: ['sage', 'khaki', 'sage'][i % 3], emphasis: [ws.length - 1], size: 150 });
      tl.push(...proofCard(p, times[i] + 1.6, 3));
    });
    return { style: 'beatcards', ...common({ auto: true }), timeline: [...tl, ...ctaItem('beatcards')] };
  },
};

// ---------- build + preview ----------
fs.mkdirSync(optDir, { recursive: true });
fs.mkdirSync(outRoot, { recursive: true });
const styles = (opt('--styles') || Object.keys(STYLES).join(',')).split(',');
const built = [];
for (const style of styles) {
  if (!builders[style]) { console.warn(`Unknown style "${style}"`); continue; }
  const spec = builders[style]();
  const file = path.join(optDir, `${style}.json`);
  fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  const r = loadReelSpec(file);
  const out = path.join(outRoot, `${style}.mp4`);
  await renderReel({ ...r, name, base: projectDir, outFile: out, preview: !flag('--full'), quiet: true });
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2', '-i', out, '-frames:v', '1', path.join(outRoot, `${style}.jpg`)]);
  built.push(style);
  console.log(`✓ ${STYLES[style].padEnd(46)} → output/${name}/reel-options/${style}.mp4`);
}

const uniq = [...new Set(warnings)];
fs.writeFileSync(path.join(outRoot, 'index.html'), `<!doctype html><meta charset="utf-8"><title>${name} reel options</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:32px;background:#f4f1ec;color:#1b1a17}h1{font-weight:600}.grid{display:flex;gap:22px;flex-wrap:wrap}figure{margin:0;width:300px}video{width:300px;border-radius:8px;background:#000}code{display:block;background:#fff;padding:6px 10px;border-radius:6px;font-size:12px;margin-top:8px;word-break:break-all}.warn{background:#fff3e0;border-left:4px solid #e08a00;padding:12px 18px;border-radius:6px}</style>
<h1>${name}: ${built.length} reel options</h1>
${uniq.length ? `<div class="warn"><strong>Standards check</strong><ul>${uniq.map((w) => `<li>${w}</li>`).join('')}</ul></div>` : ''}
<div class="grid">${built.map((s) => `<figure><video src="${s}.mp4" poster="${s}.jpg" controls loop muted playsinline></video><figcaption><b>${STYLES[s]}</b><code>npm run reel:create -- --name ${name} --pick ${s}</code></figcaption></figure>`).join('')}</div>`);
console.log(`\nCompare: output/${name}/reel-options/index.html`);
console.log(uniq.length ? '\nStandards check:\n' + uniq.map((w) => '  ! ' + w).join('\n') : '\nStandards check: all clear.');
console.log(`\nPick one:  npm run reel:create -- --name ${name}${argv.includes('--video') ? ' --video ' + opt('--video') : ''} --pick <${built.join('|')}>`);
