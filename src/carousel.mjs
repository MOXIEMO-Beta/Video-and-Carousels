#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { FORMATS, ROOT, loadProject } from './core.mjs';
import { renderSlideHtml } from './layouts.mjs';

const dir = process.argv[2];
if (!dir) {
  console.error('Usage: npm run carousel -- projects/<name> [--only 3]');
  process.exit(1);
}
const onlyIdx = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;

const { spec, theme, base, name } = loadProject(dir);
const fmt = FORMATS[spec.format || 'carousel'];
if (!fmt) throw new Error(`Unknown format "${spec.format}". Use: ${Object.keys(FORMATS).join(', ')}`);
const out = path.join(ROOT, 'output', name, 'carousel');
fs.mkdirSync(out, { recursive: true });
const tmp = path.join(out, '.tmp');
fs.mkdirSync(tmp, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: fmt.w, height: fmt.h }, deviceScaleFactor: 1 });
const pngs = [];
const slides = spec.slides;
for (let i = 0; i < slides.length; i++) {
  if (onlyIdx && onlyIdx !== i + 1) continue;
  const html = renderSlideHtml(slides[i], { ...fmt, theme, spec, base, index: i, total: slides.length });
  const file = path.join(tmp, `slide-${i + 1}.html`);
  fs.writeFileSync(file, html);
  await page.goto('file://' + file);
  await page.waitForSelector('body[data-ready="1"]');
  const png = path.join(out, `slide-${String(i + 1).padStart(2, '0')}.png`);
  await page.screenshot({ path: png });
  pngs.push(png);
  console.log('✓', path.relative(ROOT, png));
}

// Single PDF (LinkedIn document posts)
if (!onlyIdx) {
  const imgs = pngs.map((p) => `<img src="file://${p}">`).join('');
  const pdfHtml = path.join(tmp, 'deck.html');
  fs.writeFileSync(pdfHtml, `<style>@page{size:${fmt.w}px ${fmt.h}px;margin:0}*{margin:0}img{display:block;width:${fmt.w}px;height:${fmt.h}px;page-break-after:always}</style>${imgs}`);
  await page.goto('file://' + pdfHtml);
  await page.pdf({ path: path.join(out, `${name}.pdf`), width: `${fmt.w}px`, height: `${fmt.h}px`, printBackground: true });
  console.log('✓', path.relative(ROOT, path.join(out, `${name}.pdf`)));
}
await browser.close();
fs.rmSync(tmp, { recursive: true, force: true });
