#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { FORMATS, ROOT, loadProject } from './core.mjs';
import { renderSlideHtml } from './layouts.mjs';

/**
 * Render every slide of a spec to PNGs (+ optional PDF).
 * Returns [{ png, fitMin }] where fitMin < 1 means text had to shrink to fit.
 */
export async function renderCarousel({ spec, theme, base, outDir, name, only = null, pdf = true, browser = null }) {
  const fmt = FORMATS[spec.format || 'carousel'];
  if (!fmt) throw new Error(`Unknown format "${spec.format}". Use: ${Object.keys(FORMATS).join(', ')}`);
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = path.join(outDir, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const own = !browser;
  browser ??= await chromium.launch();
  const page = await browser.newPage({ viewport: { width: fmt.w, height: fmt.h }, deviceScaleFactor: 1 });
  const results = [];
  const slides = spec.slides;
  for (let i = 0; i < slides.length; i++) {
    if (only && only !== i + 1) continue;
    const html = renderSlideHtml(slides[i], { ...fmt, theme, spec, base, index: i, total: slides.length });
    const file = path.join(tmp, `slide-${i + 1}.html`);
    fs.writeFileSync(file, html);
    await page.goto('file://' + file);
    await page.waitForSelector('body[data-ready="1"]');
    const fitMin = await page.evaluate(() => window.__fitMin ?? 1);
    const png = path.join(outDir, `slide-${String(i + 1).padStart(2, '0')}.png`);
    await page.screenshot({ path: png });
    results.push({ png, fitMin });
  }
  if (pdf && !only) {
    const imgs = results.map((r) => `<img src="file://${r.png}">`).join('');
    const pdfHtml = path.join(tmp, 'deck.html');
    fs.writeFileSync(pdfHtml, `<style>@page{size:${fmt.w}px ${fmt.h}px;margin:0}*{margin:0}img{display:block;width:${fmt.w}px;height:${fmt.h}px;page-break-after:always}</style>${imgs}`);
    await page.goto('file://' + pdfHtml);
    await page.pdf({ path: path.join(outDir, `${name}.pdf`), width: `${fmt.w}px`, height: `${fmt.h}px`, printBackground: true });
  }
  await page.close();
  if (own) await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  return results;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2];
  if (!dir) {
    console.error('Usage: npm run carousel -- projects/<name> [--only 3]');
    process.exit(1);
  }
  const only = process.argv.includes('--only') ? Number(process.argv[process.argv.indexOf('--only') + 1]) : null;
  const { spec, theme, base, name } = loadProject(dir);
  const outDir = path.join(ROOT, 'output', name, 'carousel');
  const res = await renderCarousel({ spec, theme, base, outDir, name, only });
  res.forEach((r) => console.log('✓', path.relative(ROOT, r.png)));
}
