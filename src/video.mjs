#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import { FORMATS, ROOT, autoDuration, loadProject, resolveAssetPath } from './core.mjs';
import { renderSlideHtml } from './layouts.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npm run video -- projects/<name> [--fps 30] [--preview]');
  process.exit(1);
}
const arg = (k, d) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : d);
const preview = process.argv.includes('--preview');

const { spec, theme, base, name } = loadProject(dir);
const v = spec.video || {};
const fmt = FORMATS[v.format || 'story'];
const fps = Number(arg('--fps', v.fps || (preview ? 12 : 30)));
const out = path.join(ROOT, 'output', name, 'video');
fs.mkdirSync(out, { recursive: true });
const tmp = path.join(out, '.tmp');
fs.mkdirSync(tmp, { recursive: true });
const mp4 = path.join(out, `${name}${preview ? '-preview' : ''}.mp4`);

const slides = spec.slides;
const durations = slides.map((s) => s.duration || autoDuration(s));
const total = durations.reduce((a, b) => a + b, 0);

const args = ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-'];
const music = v.music ? resolveAssetPath(base, v.music) : null;
if (music) args.push('-i', music, '-af', `afade=t=in:d=1,afade=t=out:st=${Math.max(0, total - 1.5)}:d=1.5`, '-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', preview ? '28' : '17', '-preset', preview ? 'veryfast' : 'medium', '-movflags', '+faststart', mp4);
const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((res, rej) => { ff.on('close', (c) => (c ? rej(new Error('ffmpeg exited ' + c)) : res())); ff.stdin.on('error', () => {}); });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: fmt.w, height: fmt.h }, deviceScaleFactor: preview ? 0.5 : 1 });
if (preview) console.log('(preview mode: half resolution, low fps)');

for (let i = 0; i < slides.length; i++) {
  const dur = durations[i];
  const file = path.join(tmp, `scene-${i + 1}.html`);
  fs.writeFileSync(file, renderSlideHtml(slides[i], { ...fmt, theme, spec, base, index: i, total: slides.length, mode: 'video', duration: dur }));
  await page.goto('file://' + file);
  await page.waitForSelector('body[data-ready="1"]');
  const frames = Math.round(dur * fps);
  for (let f = 0; f < frames; f++) {
    const ms = (f / fps) * 1000;
    await page.evaluate((t) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = t; }), ms);
    const buf = await page.screenshot({ type: 'jpeg', quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
  }
  console.log(`✓ scene ${i + 1}/${slides.length} (${dur.toFixed(1)}s)`);
}
ff.stdin.end();
await done;
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log('✓', path.relative(ROOT, mp4), `${total.toFixed(1)}s @ ${fps}fps`);
