#!/usr/bin/env node
/**
 * Footage + captions + your words -> one reel option per style.
 *   npm run reel:create -- --name my-reel --video inbox/clip.mp4 --captions inbox/clip-words.json
 *   npm run reel:create -- --name my-reel --pick tutorial        finalise one (full quality)
 * Reads content.json (same file as carousels): topic, hook, intro, points[{title,text,at,proof}], proof, cta{keyword,after}.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './core.mjs';
import { loadReelSpec, renderReel } from './reel.mjs';
import { buildEdl, parseCaptions } from './reel/timeline.mjs';

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);

const name = opt('--name', 'my-reel');
if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') {
  console.error('--name must be a slug: letters, digits, ".", "_" or "-" (no spaces or quotes).');
  process.exit(1);
}
const projectDir = path.join(ROOT, 'projects', name, 'reel');
const optDir = path.join(projectDir, 'options');
const outRoot = path.join(ROOT, 'output', name, 'reel-options');
const STYLES = {
  editorial: 'Editorial serif + proof cards',
  kinetic: 'Bold sans + gold italic emphasis',
  tutorial: 'How-to: typewriter titles + numbered steps',
  beatcards: 'Fast montage + beat cards',
};
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- pick: finalise ----------
if (flag('--pick')) {
  const style = opt('--pick');
  const src = path.join(optDir, `${style}.json`);
  if (!fs.existsSync(src)) { console.error(`No option "${style}" for ${name}. Run reel:create first.`); process.exit(1); }
  const dest = path.join(projectDir, 'spec.json');
  if (fs.existsSync(dest) && !fs.readFileSync(dest).equals(fs.readFileSync(src)) && !flag('--force')) {
    console.error(`projects/${name}/reel/spec.json already exists and differs from option "${style}" (hand edits?).\nRe-render it with:  npm run reel -- projects/${name}/reel\nor overwrite it with --force.`);
    process.exit(1);
  }
  fs.copyFileSync(src, dest);
  const r = loadReelSpec(projectDir);
  await renderReel({ ...r, outFile: path.join(ROOT, 'output', name, 'reel', `${name}.mp4`) });
  console.log(`✓ projects/${name}/reel/spec.json  (edit it, then: npm run reel -- projects/${name}/reel)`);
  process.exit(0);
}

// ---------- inputs ----------
const contentFile = opt('--content', fs.existsSync(path.join(ROOT, 'content.json')) ? 'content.json' : 'content.example.json');
const content = JSON.parse(fs.readFileSync(path.resolve(ROOT, contentFile), 'utf8'));
const warnings = [];
if (!String(content.hook ?? '').trim()) { console.error('content.json needs a "hook" (the reel title).'); process.exit(1); }
const points = content.points || [];
if (points.length < 1) { console.error('content.json needs at least one entry in "points".'); process.exit(1); }
points.forEach((p, i) => { if (!String(p.title ?? '').trim()) { console.error(`content.json: points[${i}] needs a "title".`); process.exit(1); } });

let video = opt('--video');
if (!video) {
  const inbox = path.join(ROOT, 'inbox');
  const f = fs.existsSync(inbox) ? fs.readdirSync(inbox).filter((x) => /\.(mp4|mov|m4v)$/i.test(x)).sort()[0] : null;
  video = f ? path.join('inbox', f) : flag('--sample') ? 'assets/footage/sample.mp4' : null;
}
if (!video) { console.error('No footage. Put a vertical .mp4 in inbox/ or pass --video <file> (or --sample to try the stand-in clip).'); process.exit(1); }
const videoAbs = path.resolve(ROOT, video);
if (!fs.existsSync(videoAbs)) { console.error(`Footage not found: ${video}`); process.exit(1); }
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
// portrait phone clips are often stored landscape with a rotation tag; judge the displayed size
const rotation = Number(vs.side_data_list?.find((d) => d.rotation != null)?.rotation ?? vs.tags?.rotate ?? 0);
const [dispW, dispH] = Math.abs(rotation) % 180 === 90 ? [vs.height, vs.width] : [vs.width, vs.height];
if (dispW > dispH) warnings.push(`Footage is landscape (${dispW}x${dispH}); it will be centre-cropped to 9:16. Film vertically for best results.`);
if (Math.min(dispW, dispH) < 720) warnings.push(`Footage is only ${Math.min(dispW, dispH)}px on its short side; 720px+ recommended.`);

// ---------- pause trimming (the references all have silence removed) ----------
const cuts = [];
if (!flag('--keep-pauses')) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-i', videoAbs, '-af', 'silencedetect=n=-35dB:d=0.5', '-vn', '-f', 'null', '-'], { encoding: 'utf8' });
  const starts = [...r.stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...r.stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  // a trailing silence has no end marker: treat it as running to the end of the clip
  starts.forEach((s, i) => { const e = ends[i] ?? srcDur; if (e - s > 0.6) cuts.push([+(s + 0.15).toFixed(2), +Math.max(s + 0.2, e - 0.1).toFixed(2)]); });
}
const edl = buildEdl({ cuts }, srcDur);
const outDur = edl.outDur;
// source time of the last frame that survives the cuts
const endSrc = (() => { const l = edl.cuts[edl.cuts.length - 1]; return l && l[1] >= srcDur - 0.3 ? l[0] : srcDur; })();
const invMap = (o) => { let shift = 0; for (const [s, e] of edl.cuts) if (edl.a + o + shift >= s) shift += e - s; return edl.a + o + shift; };
if (outDur > 180) warnings.push(`Reel is ${Math.round(outDur)} s. The reference reels run 52-172 s; under 90 s keeps more viewers.`);

// ---------- helpers ----------
const wrap = (text, max) => {
  const out = [[]];
  let len = 0;
  for (const w of String(text ?? '').replace(/\*/g, '').split(/\s+/).filter(Boolean)) {
    if (len && len + 1 + w.length > max) { out.push([]); len = 0; }
    out[out.length - 1].push(w); len += (len ? 1 : 0) + w.length;
  }
  return out.map((l) => l.join(' ')).filter(Boolean);
};
const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sig = (t) => String(t).toLowerCase().replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 2);
const normW = words.map((w) => w.w.toLowerCase().replace(/[^a-z0-9]/g, ''));
function findInTranscript(title, from) {
  const keys = sig(title).slice(0, 2);
  if (!keys.length || !words.length) return null;
  for (let i = 0; i < words.length; i++) {
    if (words[i].t0 < from) continue;
    if (normW[i] === keys[0] && (keys.length < 2 || normW.slice(i, i + 5).includes(keys[1]))) return words[i].t0;
  }
  return null;
}

// hook: drop a tail that the intro repeats ("... in under 3 months" + sub "in under 3 months")
const intro = String(content.intro ?? '').trim();
let hook = String(content.hook).replace(/\*/g, '').trim();
if (intro && hook.toLowerCase().endsWith(intro.toLowerCase()) && hook.length > intro.length + 8) hook = hook.slice(0, -intro.length).trim();
const subOf = (n) => (intro ? wrap(intro, n).join('\n') : undefined);
if (intro.length > 70) warnings.push(`intro is ${intro.length} characters; it becomes the hook sub-line, so 60 or fewer reads best.`);

const cta = content.cta || {};
if (!cta.keyword) warnings.push('content.json has no cta.keyword, so there is no "Comment KEYWORD" lock-up. Every reference reel ends on a call to action.');
if (points.length < 2) warnings.push('1 point is thin for a reel. 3-5 steps is the pattern in the reference reels.');
const brand = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'brand.json'), 'utf8')); } catch { return {}; } })();

// ---------- scheduling (spacing is checked in OUTPUT time so cuts cannot cause overlaps) ----------
const CTA_DUR = 4;
const STYLE = {
  editorial: { hook: 5.5, hold: (p) => (p.proof ? 4.8 : 4.2) },
  kinetic: { hook: 3.4, hold: (p) => (p.proof ? 3.6 : 3.0) },
  tutorial: { hook: 6, hold: (p) => (p.proof ? 4.2 : 3.6) },
  beatcards: { hook: 4.2, hold: (p) => (p.proof ? 4.8 : 1.8) },
};
let unmatched = 0;
function schedule(style) {
  const { hook: hookDur, hold } = STYLE[style];
  const startOut = hookDur + 0.4;
  let cursorOut = startOut;
  const times = [];
  points.forEach((p, i) => {
    const pinned = p.at != null;
    let at;
    if (pinned) at = Math.min(Math.max(0, Number(p.at)), endSrc - 1);
    else {
      at = findInTranscript(p.title, invMap(cursorOut)) ?? null;
      if (at == null && i === 0) at = findInTranscript(p.title, 0);
      if (at == null) {
        unmatched += style === 'editorial' ? 1 : 0;
        at = invMap(startOut + ((outDur - CTA_DUR - startOut - 1) * i) / points.length);
      }
      if (edl.mapStart(at) < cursorOut) at = invMap(cursorOut); // never overlap the previous point
    }
    times.push(at);
    cursorOut = Math.max(cursorOut, edl.mapStart(at) + hold(p));
  });
  const ctaAt = Math.min(invMap(Math.max(cursorOut, outDur - CTA_DUR - 0.5)), Math.max(0, endSrc - CTA_DUR - 0.3));
  const needed = startOut + points.reduce((s, p) => s + hold(p), 0) + CTA_DUR;
  return { times, ctaAt, hookDur, needed };
}
const common = (extra = {}) => ({
  footage: { src: video, cuts, zooms: 'auto' },
  ...(captions ? { captions: { src: captions, numbers: true, ...extra } } : {}),
});

// number call-outs: big counting numbers where the speaker says a figure ("$700,000")
function numberCallouts(avoid) {
  if (!words.length) return [];
  const out = [];
  let last = -99;
  words.forEach((w) => {
    const m = w.w.match(/^(\$?)(\d[\d,]*\.?\d*)(%?)[.,!?]?$/);
    if (!m) return;
    const v = Number(m[2].replace(/,/g, ''));
    if (!(v >= 100) || w.t0 - last < 8) return;
    const o = edl.mapStart(w.t0);
    if (o < 1 || o > outDur - 5) return;
    if (avoid.some(([a, b]) => o < b && o + 1.8 > a)) return;
    last = w.t0;
    out.push({ type: 'count', at: w.t0, dur: 1.8, prefix: m[1], suffix: m[3], from: 0, to: v, size: 130, y: 24 });
  });
  return out.slice(0, 3);
}
const windows = (tl) => tl.filter((i) => !['count'].includes(i.type)).map((i) => [edl.mapStart(i.at), edl.mapStart(i.at) + (i.dur ?? 3)]);

// ---------- per-style recipes ----------
const CARD = { editorial: { y: 64, w: 54, radius: 9 }, kinetic: { y: 60, w: 72, radius: 8 }, tutorial: { y: 64, w: 78, radius: 3 }, beatcards: { y: 22, w: 66, radius: 4, size: 30, hsize: 36 } };
const card = (style, p, at, dur) => (p.proof ? [{ type: 'card', at: at + 0.4, dur, ...CARD[style], heading: p.proof.heading || p.title, rows: p.proof.rows, text: p.proof.text, stat: p.proof.stat, image: p.proof.image }] : []);
const hookProof = (style, hookDur) => (content.proof ? [{ type: 'card', at: 1.2, dur: Math.max(3, hookDur - 1), ...CARD[style], heading: content.proof.heading, rows: content.proof.rows, text: content.proof.text, stat: content.proof.stat, image: content.proof.image }] : []);
const ctaItem = (s) => (cta.keyword ? [{ type: 'cta', at: s.ctaAt, dur: CTA_DUR, lead: cta.lead || 'Comment', keyword: String(cta.keyword), after: cta.after, y: style_y(s) }] : []);
const style_y = () => 13;
const secSub = (p) => (p.text ? wrap(String(p.text).split(/[.!?]/)[0], 40)[0] : undefined);

const builders = {
  editorial() {
    const s = schedule('editorial');
    const tl = [{ type: 'title', at: 0, dur: s.hookDur, lines: wrap(hook, 22), sub: subOf(36) }, ...hookProof('editorial', s.hookDur)];
    points.forEach((p, i) => { tl.push({ type: 'section', at: s.times[i], dur: 4, lines: wrap(`${i + 1}. ${cap1(p.title)}`, 24), sub: secSub(p), subAt: 0.9 }); tl.push(...card('editorial', p, s.times[i], 4)); });
    tl.push(...numberCallouts(windows(tl)), ...ctaItem(s));
    return { spec: { style: 'editorial', ...common({ auto: true }), timeline: tl }, s };
  },
  kinetic() {
    const s = schedule('kinetic');
    const tl = [{ type: 'title', at: 0, dur: s.hookDur, lines: wrap(hook, 22), sub: subOf(34) }, ...hookProof('kinetic', s.hookDur)];
    points.forEach((p, i) => {
      const w = wrap(p.title, 14);
      tl.push({ type: 'label', at: s.times[i], dur: 2.8, text: `step ${i + 1}.`, font: 'sans', size: 36, y: 11, x: 50, color: 'accent' });
      tl.push({ type: 'hero', at: s.times[i] + 0.15, dur: 2.65, y: 15, size: 120, lines: [{ t: w[0].toLowerCase() }, ...(w.slice(1).length ? [{ t: w.slice(1).join(' ').toLowerCase(), accent: true }] : [])] });
      if (p.text) tl.push({ type: 'label', at: s.times[i] + 1.1, dur: 1.9, text: secSub(p).toLowerCase(), size: 40, y: 52, x: 50, rotate: -3 });
      tl.push(...card('kinetic', p, s.times[i], 3));
    });
    tl.push(...numberCallouts(windows(tl)), ...ctaItem(s));
    return { spec: { style: 'kinetic', ...common({ auto: true }), timeline: tl }, s };
  },
  tutorial() {
    const s = schedule('tutorial');
    const tl = [{ type: 'title', at: 0, dur: s.hookDur, lines: wrap(hook, 20), sub: subOf(34) }, ...hookProof('tutorial', s.hookDur)];
    points.forEach((p, i) => { tl.push({ type: 'section', at: s.times[i], dur: 3.4, num: String(i + 1).padStart(2, '0') + '.', lines: wrap(p.title, 22) }); tl.push(...card('tutorial', p, s.times[i], 3.6)); });
    tl.push(...ctaItem(s));
    return { spec: { style: 'tutorial', ...common(), timeline: tl }, s };
  },
  beatcards() {
    const s = schedule('beatcards');
    const tl = [{ type: 'title', at: 0, dur: s.hookDur, lines: wrap(hook, 14), sub: subOf(30), subColor: 'text' }, ...hookProof('beatcards', s.hookDur)];
    points.forEach((p, i) => {
      const clean = String(p.title).replace(/\*/g, '').trim();
      const ws = clean.split(/\s+/);
      const colour = ['sage', 'khaki', 'sage'][i % 3];
      tl.push({ type: 'beat', at: s.times[i], dur: Math.max(1.4, ws.length * 0.34), words: ws, per: 0.34, color: colour, ink: colour === 'khaki' ? 'cardInk' : 'text', emColor: colour === 'khaki' ? 'maroon' : 'maroon', emphasis: [ws.length - 1], size: 150 });
      tl.push(...card('beatcards', p, s.times[i] + 1.6, 3));
    });
    tl.push(...numberCallouts(windows(tl)), ...ctaItem(s));
    return { spec: { style: 'beatcards', ...common({ auto: true }), timeline: tl }, s };
  },
};

// ---------- build + preview ----------
fs.mkdirSync(optDir, { recursive: true });
fs.mkdirSync(outRoot, { recursive: true });
const styles = (opt('--styles') || Object.keys(STYLES).join(',')).split(',');
const built = [];
for (const style of styles) {
  if (!builders[style]) { console.warn(`Unknown style "${style}"`); continue; }
  const { spec, s } = builders[style]();
  if (s.needed > outDur) warnings.push(`${style}: ${points.length} point(s) need about ${Math.ceil(s.needed)} s but the footage is ${Math.round(outDur)} s after trimming pauses. Titles will crowd; use fewer points or longer footage.`);
  // attention gaps: stretches with only captions
  const wins = spec.timeline.filter((i) => i.type !== 'cta').map((i) => [edl.mapStart(i.at), edl.mapStart(i.at) + (i.dur ?? 3)]).sort((a, b) => a[0] - b[0]);
  let at = 0, worst = [0, 0];
  for (const [a, b] of wins) { if (a - at > worst[1] - worst[0]) worst = [at, a]; at = Math.max(at, b); }
  if (outDur - at > worst[1] - worst[0]) worst = [at, outDur];
  if (worst[1] - worst[0] > 12) warnings.push(`${style}: ${Math.round(worst[1] - worst[0])} s with only captions on screen (${worst[0].toFixed(0)}-${worst[1].toFixed(0)} s). The references add a card, label or sticker every 4-8 s; add points with "proof" or pin "at" times.`);
  const file = path.join(optDir, `${style}.json`);
  fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  const r = loadReelSpec(file);
  const out = path.join(outRoot, `${style}.mp4`);
  await renderReel({ ...r, name, base: projectDir, outFile: out, preview: !flag('--full'), quiet: true });
  spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', '2', '-i', out, '-frames:v', '1', path.join(outRoot, `${style}.jpg`)]);
  built.push(style);
  console.log(`✓ ${STYLES[style].padEnd(46)} → output/${name}/reel-options/${style}.mp4`);
}
if (unmatched) warnings.push('Some points were not found in the transcript, so they are spaced evenly. Add "at": seconds to those points in content.json to pin them.');

const uniq = [...new Set(warnings)];
fs.writeFileSync(path.join(outRoot, 'index.html'), `<!doctype html><meta charset="utf-8"><title>${esc(name)} reel options</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:32px;background:#f4f1ec;color:#1b1a17}h1{font-weight:600}.grid{display:flex;gap:22px;flex-wrap:wrap}figure{margin:0;width:300px}video{width:300px;border-radius:8px;background:#000}code{display:block;background:#fff;padding:6px 10px;border-radius:6px;font-size:12px;margin-top:8px;word-break:break-all}.warn{background:#fff3e0;border-left:4px solid #e08a00;padding:12px 18px;border-radius:6px}</style>
<h1>${esc(name)}: ${built.length} reel options</h1>
${uniq.length ? `<div class="warn"><strong>Standards check</strong><ul>${uniq.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
<div class="grid">${built.map((s) => `<figure><video src="${s}.mp4" poster="${s}.jpg" controls loop muted playsinline></video><figcaption><b>${esc(STYLES[s])}</b><code>npm run reel:create -- --name ${esc(name)} --pick ${s}</code></figcaption></figure>`).join('')}</div>`);
console.log(`\nCompare: output/${name}/reel-options/index.html`);
console.log(uniq.length ? '\nStandards check:\n' + uniq.map((w) => '  ! ' + w).join('\n') : '\nStandards check: all clear.');
console.log(`\nPick one:  npm run reel:create -- --name ${name} --pick <${built.join('|')}>`);
