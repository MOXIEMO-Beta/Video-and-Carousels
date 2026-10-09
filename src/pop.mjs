import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fontCss, md, resolveAsset } from './core.mjs';
import { fitScript, videoCss } from './layouts.mjs';

/**
 * Styles built from the owner's Canva designs (values read from the files):
 *   pop    neon-yellow tight lowercase + script accent over a tinted photo, four-dot pager
 *   notes  pale-yellow headline cover, white "Notes" app cards with arrows over a photo
 *   craft  kraft-paper background, heavy black caps, pink marker highlight and dashed arrows
 *   quiet  off-white page, condensed serif headline, sans body, Share / Save footer
 */
export const POP_LAYOUTS = ['pop', 'notes', 'craft', 'quiet'];

const T = JSON.parse(fs.readFileSync(path.join(ROOT, 'themes', 'pop.json'), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
const lower = (s) => md(String(s));

const grain = (op, blend) => `.grain{position:absolute;inset:0;pointer-events:none;opacity:${op};mix-blend-mode:${blend};z-index:50;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 .5  0 0 0 0 .5  0 0 0 0 .5  0 0 0 1.1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}`;

function base({ w, h, bg, extra, mode }) {
  return `${fontCss()}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:10px}
body{width:${w}px;height:${h}px;background:${bg};font-family:'${T.fonts.body}',sans-serif;overflow:hidden;position:relative;-webkit-font-smoothing:antialiased}
.photo{position:absolute;inset:0;background-size:cover;background-position:var(--focus,center);z-index:0}
.slide{position:absolute;inset:0;z-index:2;display:flex;flex-direction:column}
.main{flex:1;min-height:0;display:flex;flex-direction:column}
${extra}
${mode === 'video' ? videoCss() : ''}`;
}

// ---------- A: pop ----------
function popCss(ctx, slide) {
  const { w, h } = ctx;
  const p = T.pop;
  const story = h > 1500;
  const shade = slide.shade ?? 0.12;
  const bw = slide.look === 'bw';
  return `
.photo{${bw ? 'filter:grayscale(1) contrast(1.05);' : ''}}
.photo::after{content:"";position:absolute;inset:0;background:rgba(10,12,10,${shade})}
.panel{position:absolute;left:35px;right:35px;top:${story ? 120 : 33}px;bottom:${story ? 120 : 33}px;border-radius:26px;background:${p.panel};opacity:${p.panelOpacity};z-index:1;display:${slide.panel === false ? 'none' : 'block'}}
.slide{padding:${story ? 260 : 71}px 72px ${story ? 340 : 80}px}
.top{display:flex;align-items:center;gap:36px;color:#fff;font-weight:700;font-size:28px;letter-spacing:.054em;text-transform:uppercase;font-family:'${T.fonts.body}',sans-serif}
.top::after{content:"";flex:1;max-width:420px;height:4px;background:#fff;margin-left:auto}
.main{justify-content:center;padding-bottom:${story ? 80 : 90}px}
.t{font-family:'${T.fonts.head}',sans-serif;font-weight:700;color:${p.yellow};text-transform:lowercase;font-size:var(--fs,190px);line-height:.86;letter-spacing:-.05em}
.t em{font-family:'${T.fonts.script}',cursive;font-style:normal;font-weight:400;font-size:1.4em;letter-spacing:0;line-height:.9;display:inline-block;transform:rotate(-4deg);margin-bottom:.12em;padding-right:.1em}
.b{margin-top:44px;color:#fff;font-size:47px;line-height:1.2;letter-spacing:-.03em;max-width:90%;font-family:'${T.fonts.body}',sans-serif}
.b em{font-style:italic}
.dots{display:flex;gap:18px;margin-top:34px}
.dots i{width:24px;height:24px;border-radius:50%;border:3px solid ${p.yellow}}
.dots i.on{background:${p.yellow}}
${grain(0.05, 'screen')}`;
}
function popBody(slide, ctx, r, words) {
  const kick = slide.kicker ? `<div ${r('top')}>${esc(slide.kicker)}</div>` : '<div></div>';
  const dots = slide.dots === false ? '' : `<div ${r('dots')}>${[0, 1, 2, 3].map((i) => `<i class="${i === ctx.index % 4 ? 'on' : ''}"></i>`).join('')}</div>`;
  return `<div class="panel"></div><div class="slide">${kick}<div class="main"><h1 ${r('t')} data-fit="${ctx.h > 1500 ? 230 : 200}"${words}>${lower(slide.title)}</h1>${
    slide.body ? `<p ${r('b')}>${lower(slide.body)}</p>` : ''}${dots}</div></div>`;
}

// ---------- B: notes ----------
function notesCss(ctx, slide) {
  const n = T.notes;
  const story = ctx.h > 1500;
  const shade = slide.shade ?? 0.2;
  return `
.photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,15,12,${shade}),rgba(15,15,12,${shade * 0.6}))}
.slide{padding:${story ? 260 : 108}px 70px ${story ? 340 : 100}px}
.kick{font-style:italic;font-size:26px;color:${n.pale};letter-spacing:-.05em;font-family:'${T.fonts.head}',sans-serif;font-weight:700}
.cover{align-items:center;text-align:center;justify-content:center;color:${n.pale}}
.lead{font-family:'${T.fonts.head}',sans-serif;font-weight:700;font-size:38px;line-height:.95;letter-spacing:-.04em;text-transform:uppercase;max-width:420px;margin-bottom:6px}
.t{font-family:'${T.fonts.head}',sans-serif;font-weight:800;font-size:var(--fs,205px);line-height:.78;letter-spacing:-.07em;text-transform:lowercase;color:${n.pale}}
.t em{font-style:normal}
.cards{display:flex;flex-direction:column;gap:26px;justify-content:flex-end;flex:1;padding-bottom:70px}
.card{background:${n.card};border-radius:12px;padding:38px 46px 46px;width:78%;box-shadow:0 14px 40px rgba(0,0,0,.18);font-family:'${T.fonts.body}',sans-serif;color:${n.text}}
.card:nth-child(2){align-self:flex-end}
.card .hd{display:flex;justify-content:space-between;align-items:center}
.card .hd b{color:${n.heading};font-size:34px;font-weight:700}
.card .ar{display:flex;gap:16px}
.card .ar i{width:38px;height:38px;border-radius:50%;border:3px solid ${n.arrowOn};display:grid;place-items:center;font-style:normal;color:${n.arrowOn};font-size:22px;line-height:1}
.card .ar i.off{border-color:${n.arrowOff};color:${n.arrowOff}}
.card .dt{text-align:center;color:${n.date};font-size:22px;margin:8px 0 26px}
.card h3{display:inline;background:${n.pale};padding:6px 10px;font-size:28px;line-height:1.9;font-weight:700;text-transform:uppercase;letter-spacing:-.01em;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.card p{margin-top:22px;font-size:30px;line-height:1.5;letter-spacing:-.01em}
.card ul{margin:22px 0 0 28px;font-size:30px;line-height:1.55}
.foot{display:flex;justify-content:space-between;color:${n.pale};font-weight:700;font-size:22px;letter-spacing:-.02em}
${grain(0.05, 'screen')}`;
}
function notesBody(slide, ctx, r, words) {
  const date = slide.date || '';
  const cards = (slide.cards || []).map((c, i) => `<div ${r('card')}><div class="hd"><b>Notes</b><span class="ar"><i class="off">←</i><i>→</i></span></div>${
    date ? `<div class="dt">${esc(date)}</div>` : '<div style="height:20px"></div>'}<h3>${md(c.heading)}</h3>${
    c.items ? `<ul>${c.items.map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : `<p>${md(c.body || '')}</p>`}</div>`).join('');
  const foot = `<div class="foot"><span>${String(ctx.index + 1).padStart(2, '0')}/${String(ctx.total).padStart(2, '0')}</span><span>${esc(ctx.spec.handle || '')}</span></div>`;
  if (slide.cards?.length) {
    return `<div class="slide"><div class="kick">${esc(slide.kicker || '')}</div><div class="cards main">${cards}</div>${foot}</div>`;
  }
  return `<div class="slide"><div class="kick">${esc(slide.kicker || '')}</div><div class="main cover">${
    slide.lead ? `<div ${r('lead')}>${md(slide.lead)}</div>` : ''}<h1 ${r('t')} data-fit="${ctx.h > 1500 ? 240 : 205}"${words}>${lower(slide.title)}</h1></div>${foot}</div>`;
}

// ---------- E: craft ----------
const squiggle = (c) => `<svg class="deco r" viewBox="0 0 200 120" fill="none" stroke="${c}" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 16"><path d="M8 100 C 40 10, 90 130, 120 50 S 170 20, 192 60"/></svg>`;
const dashArrow = (c) => `<svg class="deco r" viewBox="0 0 240 90" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"><path d="M6 60 C 60 20, 120 80, 200 36" stroke-dasharray="2 16"/><path d="M178 14 L 214 34 L 186 64"/></svg>`;
function craftCss(ctx, slide) {
  const c = T.craft;
  const story = ctx.h > 1500;
  return `
body{background:${c.bg}}
.kraft{position:absolute;inset:0;z-index:0;opacity:.5;background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='540' height='540'><filter id='k'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3' seed='4'/><feColorMatrix values='0 0 0 0 .55  0 0 0 0 .47  0 0 0 0 .35  0 0 0 1.4 -.15'/></filter><rect width='100%' height='100%' filter='url(%23k)'/></svg>");mix-blend-mode:multiply}
.slide{padding:${story ? 250 : 108}px 108px ${story ? 340 : 100}px;color:${c.ink}}
.head{display:flex;justify-content:space-between;font-size:35px;color:${c.label};font-family:'${T.fonts.body}',sans-serif}
.head b{font-weight:700}
.main{justify-content:center;position:relative}
.t{font-family:'${T.fonts.craft}',sans-serif;font-weight:400;text-transform:uppercase;font-size:var(--fs,170px);line-height:.98;letter-spacing:.005em;color:${c.ink}}
.t em{font-style:normal;color:${c.ink};background:linear-gradient(transparent 62%,${c.pink} 62% 92%,transparent 92%)}
.under{width:60%;height:14px;border-radius:99px;background:${c.pink};margin-top:34px;transform:rotate(-1deg);transform-origin:left}
.body{margin-top:50px;width:fit-content;max-width:640px;font-size:43px;line-height:1.5}
.body span{background:${c.pink};padding:4px 12px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.deco{position:absolute;width:260px}
.deco.a{right:70px;bottom:${story ? 330 : 120}px;transform:rotate(8deg);z-index:3}
.deco.b{right:60px;bottom:${story ? 380 : 190}px;z-index:3}
${grain(0.05, 'multiply')}`;
}
function craftBody(slide, ctx, r, words) {
  const c = T.craft;
  const alt = ctx.index % 2;
  const tag = slide.tag ? `<b>${esc(slide.tag)}</b>` : '<b></b>';
  const deco = slide.deco === false ? '' : alt ? dashArrow(c.pink).replace('class="deco r"', 'class="deco b r"').replace('<svg', `<svg style="--i:${6}"`) : squiggle(c.pink).replace('class="deco r"', 'class="deco a r"');
  const under = slide.body ? '' : `<div ${r('under')}></div>`;
  return `<div class="kraft"></div><div class="slide"><div class="head"><span>${esc(ctx.spec.brand || ctx.spec.handle || '')}</span>${tag}</div><div class="main"><h1 ${r('t')} data-fit="${ctx.h > 1500 ? 200 : 170}"${words}>${md(slide.title)}</h1>${under}${
    slide.body ? `<p ${r('body')}><span>${md(slide.body)}</span></p>` : ''}</div></div>${deco}`;
}

// ---------- D: quiet ----------
function quietCss(ctx, slide) {
  const q = T.quiet;
  const story = ctx.h > 1500;
  return `
body{background:${q.bg}}
.slide{padding:${story ? 250 : 92}px 92px ${story ? 340 : 92}px;color:${q.ink}}
.hd{font-size:23px;letter-spacing:.02em;font-family:'${T.fonts.body}',sans-serif}
.main{justify-content:center}
.t{font-family:'Instrument Serif',serif;font-weight:400;font-size:var(--fs,128px);line-height:.92;letter-spacing:-.025em;max-width:90%}
.t em{font-style:italic}
.b{margin-top:56px;font-size:41px;line-height:1.5;color:${q.muted};max-width:92%;letter-spacing:-.005em}
.ft{display:flex;justify-content:space-between;font-size:22px;letter-spacing:.06em;text-transform:uppercase;font-family:'${T.fonts.body}',sans-serif}
.ft span{display:flex;gap:12px;align-items:center}
${grain(0.04, 'multiply')}`;
}
function quietBody(slide, ctx, r, words) {
  const photo = '';
  return `<div class="slide"><div class="hd">${esc(ctx.spec.handle || '')}</div><div class="main"><h1 ${r('t')} data-fit="${ctx.h > 1500 ? 150 : 128}"${words}>${md(slide.title)}</h1>${
    slide.body ? `<p ${r('b')}>${md(slide.body)}</p>` : ''}</div><div class="ft"><span>➤ Share</span><span>Save ▯</span></div></div>`;
}

const STYLES = {
  pop: { css: popCss, body: popBody, bg: '#2a2a28', photo: true },
  notes: { css: notesCss, body: notesBody, bg: '#cfd2d4', photo: true },
  craft: { css: craftCss, body: craftBody, bg: T.craft.bg, photo: false },
  quiet: { css: quietCss, body: quietBody, bg: T.quiet.bg, photo: false },
};

export function renderPopHtml(slide, ctx) {
  const { w, h, base: dir, mode = 'still', duration = 5 } = ctx;
  const st = STYLES[slide.layout];
  const video = mode === 'video';
  let n = 0;
  const r = (cls = '') => `class="${cls} r" style="--i:${n++}"`;
  const words = video ? ' data-words' : '';
  const photo = st.photo && slide.image ? resolveAsset(dir, slide.image) : null;
  const bg = photo ? `<div class="photo" style="background-image:url('${photo}');${slide.focus ? `--focus:${slide.focus}` : ''}"></div>` : '';
  return `<!doctype html><html><head><meta charset="utf-8"><style>${base({ w, h, bg: st.bg, mode, extra: st.css(ctx, slide) })}</style></head>
<body data-mode="${video ? 'video' : 'still'}" style="--dur:${duration}s">${bg}${st.body(slide, ctx, r, words)}
${video ? `<div class="fade" style="background:${st.bg}"></div>` : ''}
<div class="grain"></div><script>${fitScript}</script></body></html>`;
}
