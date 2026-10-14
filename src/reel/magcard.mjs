import fs from 'node:fs';
import { chromium } from 'playwright';
import { fontCss } from '../core.mjs';

/**
 * Typographic "magazine" B-roll stills, rendered to PNG, for when there is no photo to cut to.
 * Two looks taken from the reference layouts:
 *   letterpress  blush paper, giant condensed red type, inky and slightly rough (like a printed spread)
 *   masthead     greige page, one giant white serif word across the top, small tracked caption below (like a magazine cover)
 * Used by `broll` items that carry a `card` instead of a `src`:
 *   { "type": "broll", "card": { "style": "masthead", "word": "HARDER.", "caption": "Building got easy. *Growth and distribution* got harder." }, "at": 63, "dur": 3.4 }
 *   { "type": "broll", "card": { "style": "letterpress", "lines": ["GROWTH", "+", "DISTRIBUTION"], "kicker": "KEY DRIVERS" }, ... }
 */
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const em = (s) => esc(s).replace(/\*(.+?)\*/g, '<b class="r">$1</b>');

const GRAIN = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .3  0 0 0 0 .25  0 0 0 0 .2  0 0 0 .9 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`;

function html(c, W, H) {
  const style = c.style || 'masthead';
  const common = `${fontCss()}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${W}px;height:${H}px;overflow:hidden}
.grain{position:absolute;inset:0;background-image:${GRAIN};opacity:${style === 'letterpress' ? 0.16 : 0.1};mix-blend-mode:multiply;pointer-events:none}
.r{color:var(--red);font-weight:inherit}`;
  if (style === 'letterpress') {
    const lines = (c.lines || [c.word || '']).map(String);
    return `<style>${common}
:root{--red:${c.ink || '#D8352A'}}
body{background:${c.bg || '#F2C5BB'};position:relative;font-family:'Jost',sans-serif}
.kick{position:absolute;left:${W * 0.07}px;top:${H * 0.07}px;font-size:${W * 0.026}px;letter-spacing:.3em;text-transform:uppercase;color:${c.ink || '#D8352A'};font-weight:500}
.cap{position:absolute;left:${W * 0.07}px;right:${W * 0.07}px;bottom:${H * 0.07}px;font-size:${W * 0.03}px;letter-spacing:.18em;text-transform:uppercase;color:#3a2a28;font-weight:400;line-height:1.5}
.stack{position:absolute;left:${W * 0.07}px;right:${W * 0.07}px;top:${H * 0.17}px}
.stack div{width:max-content;font-family:'Anton',sans-serif;text-transform:uppercase;color:${c.ink || '#D8352A'};line-height:.9;white-space:nowrap;filter:url(#rough)}
</style>
<svg width="0" height="0"><filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="3" result="t"/><feDisplacementMap in="SourceGraphic" in2="t" scale="${W * 0.006}"/><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" result="g"/><feColorMatrix in="g" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.5 1.55" result="m"/><feComposite in="SourceGraphic" in2="m" operator="in"/></filter></svg>
<body>${c.kicker ? `<div class="kick">${esc(c.kicker)}</div>` : ''}
<div class="stack" id="stack">${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
${c.caption ? `<div class="cap">${em(c.caption)}</div>` : ''}<div class="grain"></div>
<script>
// fit every line to the width, then centre the stack
const W=${W}*0.86;
document.fonts.ready.then(()=>{document.querySelectorAll('#stack div').forEach(d=>{let s=${H * 0.14};d.style.fontSize=s+'px';while(d.offsetWidth>W&&s>40){s-=4;d.style.fontSize=s+'px'}});document.body.dataset.ready=1});
</script></body>`;
  }
  // masthead
  return `<style>${common}
:root{--red:${c.accent || '#C9382B'}}
body{background:${c.image ? `linear-gradient(180deg,rgba(20,16,12,.35),rgba(20,16,12,.05) 40%,rgba(20,16,12,.55)),url('${c.image}') center/cover` : (c.bg || 'linear-gradient(180deg,#d9d2c7 0%,#cfc7ba 100%)')};position:relative;font-family:'Jost',sans-serif}
.word{position:absolute;left:50%;transform:translateX(-50%);width:max-content;top:${H * 0.06}px;text-align:center;font-family:'Instrument Serif',serif;color:${c.ink || '#FFFFFF'};line-height:.9;letter-spacing:-.03em;white-space:nowrap;text-shadow:0 2px 30px rgba(0,0,0,.06)}
.sub{position:absolute;left:${W * 0.07}px;bottom:${H * 0.085}px;width:${W * 0.55}px;font-size:${W * 0.038}px;letter-spacing:.14em;text-transform:uppercase;color:#fff;line-height:1.45;font-weight:400}
.kick{position:absolute;right:${W * 0.07}px;top:${H * 0.06 + W * 0.36}px;font-size:${W * 0.03}px;color:#fff;font-weight:400}
.bar{position:absolute;left:${W * 0.07}px;bottom:${H * 0.055}px;width:${W * 0.1}px;height:4px;background:var(--red)}
</style>
<body><div class="word" id="word">${esc(c.word || '')}</div>${c.kicker ? `<div class="kick">${esc(c.kicker)}</div>` : ''}
${c.caption ? `<div class="sub">${em(c.caption)}</div>` : ''}<div class="bar"></div><div class="grain"></div>
<script>
const W=${W}*0.96;
document.fonts.ready.then(()=>{const d=document.getElementById('word');let s=${H * 0.3};d.style.fontSize=s+'px';while(d.offsetWidth>W&&s>60){s-=6;d.style.fontSize=s+'px'}document.body.dataset.ready=1});
</script></body>`;
}

/** Render one card to a PNG at W x H. */
export async function renderMagCard(card, outFile, W = 1080, H = 1920, browser = null) {
  const own = !browser;
  browser ??= await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const file = outFile.replace(/\.png$/, '.html');
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"></head>${html(card, W, H)}</html>`);
  await page.goto('file://' + file);
  await page.waitForSelector('body[data-ready="1"]');
  await page.screenshot({ path: outFile });
  await page.close();
  fs.rmSync(file, { force: true });
  if (own) await browser.close();
}
