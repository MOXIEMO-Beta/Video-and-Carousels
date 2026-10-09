import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const FORMATS = {
  carousel: { w: 1080, h: 1350 },   // Instagram / LinkedIn 4:5
  square: { w: 1080, h: 1080 },
  story: { w: 1080, h: 1920 },      // Reels / TikTok / Shorts 9:16
};

export function loadProject(dir) {
  const projectDir = path.resolve(dir);
  const specPath = fs.existsSync(path.join(projectDir, 'spec.json'))
    ? path.join(projectDir, 'spec.json')
    : projectDir;
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const base = path.dirname(specPath);
  const theme = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'themes', `${spec.theme || 'editorial'}.json`), 'utf8'),
  );
  return { spec, theme, base, name: path.basename(base) };
}

export function resolveAsset(base, p) {
  if (!p) return null;
  if (/^(https?:|data:|file:)/.test(p)) return p;
  const candidates = [path.resolve(base, p), path.resolve(ROOT, p), path.resolve(ROOT, 'assets', p)];
  const hit = candidates.find((c) => fs.existsSync(c));
  if (!hit) throw new Error(`Asset not found: ${p}`);
  return pathToFileURL(hit).href;
}

export function resolveAssetPath(base, p) {
  return fileURLToPath(resolveAsset(base, p));
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Inline markup: *italic accent*, **bold**, ==highlight==, line breaks via \n. */
export function md(s = '') {
  return esc(s)
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

function fontFace(family, weight, style, pkg, file) {
  const p = path.join(ROOT, 'node_modules', '@fontsource', pkg, 'files', file);
  return `@font-face{font-family:'${family}';font-weight:${weight};font-style:${style};src:url('${pathToFileURL(p).href}') format('woff2');}`;
}

export function fontCss() {
  const pf = 'playfair-display';
  return [
    fontFace('Playfair Display', 400, 'normal', pf, 'playfair-display-latin-400-normal.woff2'),
    fontFace('Playfair Display', 400, 'italic', pf, 'playfair-display-latin-400-italic.woff2'),
    fontFace('Playfair Display', 700, 'normal', pf, 'playfair-display-latin-700-normal.woff2'),
    fontFace('Playfair Display', 700, 'italic', pf, 'playfair-display-latin-700-italic.woff2'),
    fontFace('Inter', 400, 'normal', 'inter', 'inter-latin-400-normal.woff2'),
    fontFace('Inter', 600, 'normal', 'inter', 'inter-latin-600-normal.woff2'),
    fontFace('Instrument Serif', 400, 'normal', 'instrument-serif', 'instrument-serif-latin-400-normal.woff2'),
    fontFace('Instrument Serif', 400, 'italic', 'instrument-serif', 'instrument-serif-latin-400-italic.woff2'),
    fontFace('Archivo Black', 400, 'normal', 'archivo-black', 'archivo-black-latin-400-normal.woff2'),
    fontFace('Gaegu', 400, 'normal', 'gaegu', 'gaegu-latin-400-normal.woff2'),
    fontFace('Gaegu', 700, 'normal', 'gaegu', 'gaegu-latin-700-normal.woff2'),
    fontFace('Jost', 300, 'normal', 'jost', 'jost-latin-300-normal.woff2'),
    fontFace('Jost', 400, 'normal', 'jost', 'jost-latin-400-normal.woff2'),
    fontFace('Jost', 500, 'normal', 'jost', 'jost-latin-500-normal.woff2'),
  ].join('\n');
}

/** Reading-time based default scene length (seconds). */
export function autoDuration(slide) {
  const text = [slide.title, slide.subtitle, slide.body, slide.quote, ...(slide.items || [])]
    .filter(Boolean)
    .join(' ');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(6, Math.max(2.5, 1 + words * 0.24));
}
