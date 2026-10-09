#!/usr/bin/env node
/**
 * One command from "my photos + my words" to several finished carousel options.
 *
 *   npm run create -- --name my-post                 build every style option
 *   npm run create -- --name my-post --seed 3        reshuffle which photo lands on which slide
 *   npm run create -- --name my-post --pick luxe     finalise one option (add --video for a reel)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';
import { ROOT, loadBrand, loadProject } from './core.mjs';
import { analyzeImage } from './analyze.mjs';
import { renderCarousel } from './carousel.mjs';

const argv = process.argv.slice(2);
const flag = (k) => argv.includes(k);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);

const name = opt('--name', 'my-post');
const imagesDir = path.resolve(ROOT, opt('--images', 'inbox'));
const contentFile = opt('--content', fs.existsSync(path.join(ROOT, 'content.json')) ? 'content.json' : 'content.example.json');
const seed = opt('--seed') != null ? Number(opt('--seed')) : null;
const projectDir = path.join(ROOT, 'projects', name);
const optionsDir = path.join(projectDir, 'options');
const outRoot = path.join(ROOT, 'output', name, 'options');

const STYLES = {
  cinematic: { label: 'Cinematic', blurb: 'Moody full-bleed photos, translucent text bars, numbered rows.' },
  luxe: { label: 'Luxe headline', blurb: 'Tight serif, roman + italic, highlight box, script aside.' },
  playful: { label: 'Playful note', blurb: 'Heavy blush caps, handwriting, taped note cards.' },
  type: { label: 'Typographic', blurb: 'No photos needed: colour slides with editorial type.' },
};

// ---------- helpers ----------
function mulberry(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Break text into lines of ≤ max chars, keeping *emphasis* balanced across line breaks. */
function breakLines(text, max) {
  const toks = [];
  let em = false;
  for (const raw of String(text).split(/\s+/)) {
    let w = raw, startEm = em;
    const marks = (w.match(/\*/g) || []).length;
    if (marks % 2) em = !em;
    toks.push({ w, startEm, endEm: em });
  }
  const lines = [[]];
  let len = 0;
  for (const t of toks) {
    const plain = t.w.replace(/\*/g, '');
    if (len && len + 1 + plain.length > max) { lines.push([]); len = 0; }
    lines[lines.length - 1].push(t);
    len += (len ? 1 : 0) + plain.length;
  }
  return lines
    .map((ln) => {
      let s = ln.map((t) => t.w).join(' ');
      if (ln[0].startEm && !s.startsWith('*')) s = '*' + s;
      if (ln[ln.length - 1].endEm && (s.match(/\*/g) || []).length % 2) s += '*';
      return s;
    })
    .join('\n');
}
const plainText = (s) => String(s).replace(/[*=]/g, '');
const words = (s) => plainText(s || '').split(/\s+/).filter(Boolean).length;
const inkFor = (a) => (a && a.avg > 0.6 ? 'dark' : 'light');

// ---------- inputs ----------
if (flag('--pick')) {
  const style = opt('--pick');
  const src = path.join(optionsDir, `${style}.json`);
  if (!fs.existsSync(src)) throw new Error(`No option "${style}" for ${name}. Run create first.`);
  fs.copyFileSync(src, path.join(projectDir, 'spec.json'));
  console.log(`✓ projects/${name}/spec.json  (edit this file, then re-run carousel / video)`);
  execFileSync('node', [path.join(ROOT, 'src/carousel.mjs'), projectDir], { stdio: 'inherit' });
  if (flag('--video')) execFileSync('node', [path.join(ROOT, 'src/video.mjs'), projectDir], { stdio: 'inherit' });
  process.exit(0);
}

const brand = loadBrand();
const content = JSON.parse(fs.readFileSync(path.resolve(ROOT, contentFile), 'utf8'));
if (contentFile === 'content.example.json') console.log('ℹ No content.json found — using content.example.json. Copy it to content.json and edit.');
const points = content.points || [];
const warnings = [];
if (!content.hook) throw new Error('content.json needs a "hook" (the cover headline).');
if (points.length < 1) throw new Error('content.json needs at least one entry in "points".');
if (points.length > 8) warnings.push(`${points.length} points is a lot — 3–6 keeps saves and completion high.`);
if (words(content.hook) > 14) warnings.push(`Hook is ${words(content.hook)} words. Aim for 12 or fewer.`);

let imageFiles = fs.existsSync(imagesDir)
  ? fs.readdirSync(imagesDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort().map((f) => path.join(imagesDir, f))
  : [];
if (!imageFiles.length && flag('--placeholders')) {
  const ph = path.join(ROOT, 'assets/photos');
  imageFiles = fs.readdirSync(ph).filter((f) => /\.jpg$/i.test(f)).sort().map((f) => path.join(ph, f));
}
let styles = (opt('--styles') || Object.keys(STYLES).join(',')).split(',');
if (!imageFiles.length) {
  warnings.push(`No photos in ${path.relative(ROOT, imagesDir) || '.'}/ — only the Typographic option was built. Add images (or pass --placeholders) for the photo styles.`);
  styles = styles.filter((s) => s === 'type');
}
if (seed != null) {
  const rnd = mulberry(seed);
  imageFiles = imageFiles.map((f) => [rnd(), f]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
}
const info = imageFiles.map((f) => ({ file: f, rel: path.relative(ROOT, f), ...analyzeImage(f) }));
info.forEach((i) => {
  if (i.width < 1080) warnings.push(`${path.basename(i.file)} is only ${i.width}px wide; it will look soft. Use 1080px+ (ideally 2000px).`);
});

const total = points.length + 2;
const imgAt = (i) => (info.length ? info[i % info.length] : null);
if (info.length && info.length < total) warnings.push(`${info.length} photo(s) for ${total} slides: photos repeat. One per slide looks best.`);

// ---------- style builders ----------
const withImg = (slide, i) => {
  const im = imgAt(i);
  return im ? { ...slide, image: im.rel, ink: slide.ink ?? inkFor(im) } : slide;
};
const cta = content.cta || {};
const ctaTitle = cta.title || 'Save this for later';

const builders = {
  cinematic() {
    const slides = [withImg({ layout: 'hero', label: content.topic, title: breakLines(content.hook, 16), footer: brand.name }, 0)];
    for (let i = 0; i < points.length; i += 2) {
      const chunk = points.slice(i, i + 2);
      const s = {
        layout: 'feature',
        items: chunk.map((p, j) => ({ n: String(i + j + 1).padStart(2, '0'), title: plainText(p.title), text: p.text })),
      };
      if (i === 0 && content.intro) s.text = content.intro;
      slides.push(withImg(s, slides.length));
    }
    slides.push(withImg({ layout: 'hero', label: 'Save for later', title: breakLines(ctaTitle, 16), footer: brand.name }, slides.length));
    return slides;
  },
  luxe() {
    const slides = [withImg({ layout: 'headline', kicker: content.topic, title: breakLines(content.hook, 13), body: content.intro, tag: brand.tagline }, 0)];
    points.forEach((p, i) => slides.push(withImg({ layout: 'headline', kicker: `Point ${String(i + 1).padStart(2, '0')}`, title: breakLines(p.title, 13), body: p.text, tag: brand.tagline }, slides.length)));
    let t = breakLines(ctaTitle, 13);
    if (cta.highlight) t = t.replace(new RegExp(`(${cta.highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`), '==$1==').replace(/\*/g, '');
    slides.push(withImg({ layout: 'headline', kicker: 'Next', title: t, body: cta.body, aside: cta.aside || 'See you\ninside', tag: brand.tagline }, slides.length));
    return slides;
  },
  playful() {
    const heavy = (s) => breakLines(plainText(s), 9);
    const note = (s, i) => { const im = imgAt(i); return im ? { ...s, image: im.rel, shade: im.avg > 0.6 ? 0.5 : 0.18 } : s; };
    const slides = [note({ layout: 'note', script: content.topic, title: heavy(content.hook), card: content.intro, tag: 'read this' }, 0)];
    points.forEach((p, i) => slides.push(note({ layout: 'note', script: `Tip ${i + 1}`, title: heavy(p.title), card: p.text, arrow: i < points.length - 1 }, slides.length)));
    slides.push(note({ layout: 'note', script: 'Your turn', title: heavy(ctaTitle), card: cta.body, arrow: false }, slides.length));
    return slides;
  },
  type() {
    const tones = ['paper', 'ink', 'sage', 'paper'];
    const slides = [{ layout: 'cover', kicker: content.topic, title: content.hook, subtitle: content.intro }];
    points.forEach((p, i) => slides.push({ layout: 'statement', tone: tones[i % tones.length], kicker: `Point ${String(i + 1).padStart(2, '0')}`, title: p.title, body: p.text }));
    slides.push({ layout: 'cta', tone: 'clay', title: ctaTitle, body: cta.body, button: cta.button || 'Save' });
    return slides;
  },
};

// ---------- build + render ----------
fs.mkdirSync(optionsDir, { recursive: true });
fs.mkdirSync(outRoot, { recursive: true });
const browser = await chromium.launch();
const built = [];
for (const style of styles) {
  if (!builders[style]) { console.warn(`Unknown style "${style}"`); continue; }
  const slides = builders[style]();
  slides.forEach((s, i) => {
    const wc = words([s.title, s.body, s.text, s.card, s.subtitle, ...(s.items || []).map((x) => (typeof x === 'string' ? x : `${x.title} ${x.text || ''}`))].join(' '));
    if (wc > 45) warnings.push(`${style} · slide ${i + 1} has ${wc} words — trim to ~40 for readability.`);
  });
  const spec = { handle: brand.handle, brand: brand.name, format: 'carousel', slides };
  const file = path.join(optionsDir, `${style}.json`);
  fs.writeFileSync(file, JSON.stringify(spec, null, 2));
  const { spec: loaded, theme, base } = loadProject(file);
  const outDir = path.join(outRoot, style);
  const res = await renderCarousel({ spec: loaded, theme, base, outDir, name: `${name}-${style}`, browser });
  res.forEach((r, i) => { if (r.fitMin < 0.6) warnings.push(`${style} · slide ${i + 1}: text shrank to ${Math.round(r.fitMin * 100)}% to fit — shorten the copy.`); });
  built.push({ style, count: res.length });
  console.log(`✓ ${STYLES[style].label.padEnd(14)} ${res.length} slides → ${path.relative(ROOT, outDir)}`);
}
await browser.close();

// ---------- comparison page ----------
const rows = built.map(({ style, count }) => `
<section><header><h2>${STYLES[style].label}</h2><p>${STYLES[style].blurb}</p>
<code>npm run create -- --name ${name} --pick ${style}</code></header>
<div class="strip">${Array.from({ length: count }, (_, i) => `<img loading="lazy" src="${style}/slide-${String(i + 1).padStart(2, '0')}.png">`).join('')}</div></section>`).join('');
const uniqWarn = [...new Set(warnings)];
fs.writeFileSync(path.join(outRoot, 'index.html'), `<!doctype html><meta charset="utf-8"><title>${name} options</title>
<style>body{font:15px/1.5 system-ui,sans-serif;margin:0;padding:32px;background:#f4f1ec;color:#1b1a17}h1{font-weight:600}section{margin:36px 0}header{display:flex;gap:18px;align-items:baseline;flex-wrap:wrap}h2{margin:0}p{margin:0;color:#6b655c}code{background:#fff;padding:4px 10px;border-radius:6px;font-size:13px}.strip{display:flex;gap:14px;overflow-x:auto;padding:14px 0}.strip img{height:520px;border-radius:6px;box-shadow:0 4px 18px rgba(0,0,0,.15)}.warn{background:#fff3e0;border-left:4px solid #e08a00;padding:12px 18px;border-radius:6px}</style>
<h1>${name}: ${built.length} options</h1>
${uniqWarn.length ? `<div class="warn"><strong>Standards check</strong><ul>${uniqWarn.map((w) => `<li>${w}</li>`).join('')}</ul></div>` : ''}
${rows}`);
console.log(`\nCompare options: output/${name}/options/index.html`);
if (uniqWarn.length) console.log('\nStandards check:\n' + uniqWarn.map((w) => '  ! ' + w).join('\n'));
else console.log('\nStandards check: all clear.');
console.log(`\nPick one:   npm run create -- --name ${name} --pick <${built.map((b) => b.style).join('|')}> [--video]`);
