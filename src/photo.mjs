import { fontCss, loadPhotoTheme, md, resolveAsset } from './core.mjs';
import { fitScript, videoCss } from './layouts.mjs';

/**
 * Photo-first layouts. Each takes a full-bleed `image` and sets type over it.
 *   hero      cinematic title on translucent text bars with cursor markers
 *   feature   optional highlighted statement up top + numbered rows along the bottom
 *   headline  luxe serif headline (roman + italic), ==highlight==, kicker rule, script aside
 *   note      playful: heavy blush caps, handwritten kicker, taped note card, brush arrow
 */
export const PHOTO_LAYOUTS = ['hero', 'feature', 'headline', 'note'];

const theme = loadPhotoTheme();
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

function css({ w, h, ink, shade, layout, mode }) {
  const c = theme.colors;
  const f = theme.fonts;
  const story = h > 1500;
  const padT = story ? 250 : 84;
  const padB = story ? 340 : 84;
  const fg = ink === 'dark' ? c.dark : c.light;
  return `
${fontCss()}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:10px}
body{width:${w}px;height:${h}px;background:#2a2622;color:${fg};font-family:'${f.body}',sans-serif;overflow:hidden;position:relative;-webkit-font-smoothing:antialiased}
.photo{position:absolute;inset:0;background-size:cover;background-position:var(--focus,center);z-index:0}
.photo::after{content:"";position:absolute;inset:0;background:${shadeGradient(layout, ink, shade)}}
.slide{position:absolute;inset:0;padding:${padT}px 88px ${padB}px;display:flex;flex-direction:column;z-index:2}
.grain{position:absolute;inset:0;pointer-events:none;opacity:${theme.grain};mix-blend-mode:${ink === 'dark' ? 'multiply' : 'screen'};z-index:50;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1.1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.main{flex:1;min-height:0;display:flex;flex-direction:column}
.wide{font-family:'${f.sans}',sans-serif;font-weight:300;font-size:3rem;letter-spacing:.5em;text-transform:uppercase;text-align:center;opacity:.92;padding-left:.5em}
.wide.sm{font-size:2.4rem;letter-spacing:.45em}
.serif{font-family:'${f.serif}',serif;font-weight:400}
.serif em{font-style:italic}
.hl{position:relative;width:fit-content;max-width:100%;font-size:var(--fs,11rem)}
.hl-text{font-family:'${f.serif}',serif;line-height:1.3;font-size:1em;background:${ink === 'dark' ? 'rgba(246,241,233,.78)' : c.barDark};padding:.04em .18em .02em;-webkit-box-decoration-break:clone;box-decoration-break:clone;letter-spacing:-.01em}
.hl-text em{font-style:italic}
.mk{position:absolute;width:.075em;min-width:7px;background:${fg};border-radius:99px;height:.62em}
.mk::before{content:"";position:absolute;left:50%;width:.3em;min-width:26px;aspect-ratio:1;border-radius:50%;background:${fg};transform:translateX(-50%)}
.mk.a{left:-.12em;top:-.02em}
.mk.a::before{top:-.2em}
.mk.b{right:-.12em;bottom:-.02em}
.mk.b::before{bottom:-.2em}
.rows{display:flex;flex-direction:column}
.row{display:grid;grid-template-columns:150px 330px 1fr;align-items:center;gap:0;padding:44px 0}
.row+.row{border-top:2px solid currentColor}
.row .n{font-family:'${f.serif}',serif;font-size:7.4rem;line-height:1;opacity:.9}
.row .tt{font-family:'${f.serif}',serif;font-size:7.4rem;line-height:1}
.row .tx{font-family:'${f.serif}',serif;font-size:3.8rem;line-height:1.14;opacity:.95;max-width:520px}
.row.solo{grid-template-columns:150px 1fr}
.kick{display:flex;align-items:center;gap:36px;font-family:'${f.sans}',sans-serif;font-weight:400;font-size:2.5rem;letter-spacing:.34em;text-transform:uppercase}
.kick::after{content:"";flex:1;height:2px;background:currentColor;opacity:.6}
.big{font-family:'${f.serif}',serif;font-size:var(--fs,17rem);line-height:.86;letter-spacing:-.035em}
.big em{font-style:italic}
.big .sm{font-size:.56em;letter-spacing:-.02em;display:inline-block;line-height:1.05}
.big mark{background:${c.barLight};color:${c.dark};padding:0 .08em;display:inline-block;line-height:.95;margin-left:-.04em}
.lede{font-family:'${f.body}',sans-serif;font-size:4.2rem;line-height:1.3;max-width:80%;font-weight:400;letter-spacing:-.01em}
.aside{position:absolute;right:70px;top:${padT + (story ? 520 : 170)}px;font-family:'${f.serif}',serif;font-style:italic;font-size:5rem;line-height:1.05;transform:rotate(-12deg);text-align:left;width:230px}
.aside::after{content:"";display:block;margin-top:18px;width:220px;height:2px;background:currentColor;transform:rotate(-12deg);transform-origin:left}
.handle{font-family:'${f.sans}',sans-serif;font-size:2.4rem;letter-spacing:.3em;text-transform:uppercase}
.foot{display:flex;justify-content:space-between;align-items:flex-end}
.foot .rule{flex:1;height:2px;background:currentColor;opacity:.6;margin:0 32px 14px}
.foot .tag{text-align:right;font-family:'${f.sans}',sans-serif;font-size:2.4rem;letter-spacing:.3em;text-transform:uppercase;line-height:1.6;max-width:380px}
/* playful note */
.script{font-family:'${f.hand}',cursive;font-size:7.6rem;line-height:1;font-weight:700;color:${c.blush}}
.heavy{overflow-wrap:normal;font-family:'${f.heavy}',sans-serif;font-size:var(--fs,22rem);line-height:.9;letter-spacing:-.02em;color:${c.blush};text-transform:uppercase}
.heavy small{white-space:nowrap;font-family:'${f.sans}',sans-serif;font-size:3rem;letter-spacing:.18em;font-weight:400;margin-left:18px;vertical-align:baseline;opacity:.9}
.card{position:relative;align-self:flex-start;margin-left:20px;background:${c.paper};color:${c.navy};font-family:'${f.hand}',cursive;font-weight:700;font-size:4.6rem;line-height:1.35;padding:64px 70px 74px;transform:rotate(-3deg);width:94%;box-shadow:0 10px 40px rgba(0,0,0,.25);margin-bottom:36px}
.card::before,.card::after{content:"";position:absolute;width:120px;height:56px;background:rgba(240,190,185,.75)}
.card::before{left:-34px;top:-8px;transform:rotate(-38deg)}
.card::after{right:-30px;top:-14px;transform:rotate(38deg)}
.card .wave{position:absolute;left:5%;right:0;bottom:6px;height:40px;background:${c.peach};opacity:.8;clip-path:polygon(0 60%,8% 30%,20% 55%,33% 28%,48% 52%,62% 30%,78% 55%,90% 30%,100% 55%,100% 100%,0 100%)}
.arrow{align-self:flex-end;width:240px;margin-top:40px}
${mode === 'video' ? videoCss() : ''}
`;
}

function shadeGradient(layout, ink, shade) {
  const s = shade ?? { hero: 0.45, feature: 0.35, headline: 0.0, note: 0.18 }[layout];
  if (ink === 'dark') {
    return `linear-gradient(180deg,rgba(246,241,233,${s * 0.9}) 0%,rgba(246,241,233,0) 40%)`;
  }
  return `linear-gradient(180deg,rgba(14,12,9,${s * 0.8}) 0%,rgba(14,12,9,${s * 0.25}) 38%,rgba(14,12,9,${s * 1.7}) 100%)`;
}

const brush = `<svg class="arrow r" viewBox="0 0 240 70" fill="none" stroke="#fff" stroke-linecap="round"><path d="M6 52 C60 40 130 30 214 22" stroke-width="9" opacity=".95"/><path d="M180 6 C198 12 212 18 226 24 C212 32 198 44 186 58" stroke-width="7"/></svg>`;

export function renderPhotoHtml(slide, ctx) {
  const { w, h, spec, base, index, total, mode = 'still', duration = 5 } = ctx;
  const layout = slide.layout;
  const video = mode === 'video';
  const story = h > 1500;
  const ink = slide.ink || (layout === 'headline' ? 'dark' : 'light');
  let n = 0;
  const r = (cls = '') => `class="${cls} r" style="--i:${n++}"`;
  const words = video ? ' data-words' : '';
  const brand = spec.brand || spec.handle || '';
  const lineBreaks = (t) => md(t);

  // each line gets its own translucent bar
  const bars = (text, fs, markers = true) =>
    `<div ${r('hl')} data-fit="${fs}"><span class="hl-text"${words}>${lineBreaks(text)}</span>${
      markers ? '<i class="mk a"></i><i class="mk b"></i>' : ''}</div>`;

  let top = '';
  let main = '';
  let foot = '';
  switch (layout) {
    case 'hero': {
      top = slide.label ? `<div ${r('wide')}>${md(slide.label)}</div>` : '';
      main = `<div style="flex:${slide.pos ?? 0.55}"></div>${bars(slide.title, story ? 150 : 136, slide.markers !== false)}`;
      foot = `<div ${r('wide sm')}>${esc(slide.footer ?? brand)}</div>`;
      break;
    }
    case 'feature': {
      const text = slide.text ? bars(slide.text, story ? 78 : 70, slide.markers !== false) : '';
      const items = (slide.items || []).map((it, i) => {
        const o = typeof it === 'string' ? { title: it } : it;
        const num = o.n ?? String(i + 1).padStart(2, '0');
        return `<div ${r('row' + (o.text ? '' : ' solo'))}><span class="n">${esc(num)}</span><span class="tt">${md(o.title)}</span>${o.text ? `<span class="tx">${md(o.text)}</span>` : ''}</div>`;
      }).join('');
      main = `<div style="padding-top:${story ? 0 : 20}px">${text}</div><div style="flex:1"></div><div class="rows">${items}</div>`;
      foot = `<div ${r('wide sm')} style="margin-top:34px">${esc(slide.footer ?? brand)}</div>`;
      break;
    }
    case 'headline': {
      top = `<div ${r('kick')}>${md(slide.kicker || '')}</div>`;
      main = `<div style="flex:.18"></div><h1 ${r('big')} data-fit="${story ? 190 : 170}"${words}>${md(slide.title).replace(/\{\{(.+?)\}\}/g, '<span class="sm">$1</span>')}</h1><div style="height:46px"></div>${
        slide.body ? `<p ${r('lede')}>${md(slide.body)}</p>` : ''}`;
      foot = `<div class="foot"><span class="handle">${esc(spec.handle || '')}</span><i class="rule"></i><span class="tag">${md(slide.tag || '')}</span></div>`;
      break;
    }
    case 'note': {
      top = slide.script ? `<div ${r('script')}>${md(slide.script)}</div>` : '';
      main = `<h1 ${r('heavy')} data-fit="${story ? 215 : 190}"${words}>${noteTitle(slide)}</h1>
        <div style="flex:1"></div>${slide.card ? `<div ${r('card')}>${md(slide.card)}<i class="wave"></i></div>` : ''}${slide.arrow === false ? '' : brush}`;
      break;
    }
  }
  const aside = slide.aside ? `<div ${r('aside')}>${md(slide.aside)}</div>` : '';
  const photo = slide.image ? resolveAsset(base, slide.image) : null;
  const bg = photo
    ? `<div class="photo" style="background-image:url('${photo}');${slide.focus ? `--focus:${slide.focus}` : ''}"></div>`
    : `<div class="photo" style="background:linear-gradient(160deg,#6d6258,#2a2520)"></div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css({ w, h, ink, shade: slide.shade, layout, mode })}</style></head>
<body data-mode="${mode}" style="--dur:${duration}s">${bg}
<div class="slide">${top}<div class="main">${main}</div>${foot}</div>${aside}
${video ? '<div class="fade" style="background:#16130F"></div>' : ''}
<div class="grain"></div>
<script>${fitScript}</script></body></html>`;
}

function noteTitle(slide) {
  const lines = String(slide.title).split('\n');
  const at = slide.tagLine ?? Math.max(0, lines.length - 2);
  return lines.map((l, i) => md(l) + (slide.tag && i === at ? `<small>${esc(slide.tag)}</small>` : '')).join('<br>');
}
