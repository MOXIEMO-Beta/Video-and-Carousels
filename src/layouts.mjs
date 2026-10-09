import { fontCss, md, resolveAsset } from './core.mjs';
import { PHOTO_LAYOUTS, renderPhotoHtml } from './photo.mjs';

const LAYOUTS = ['cover', 'statement', 'list', 'quote', 'stat', 'image', 'cta'];

function css({ w, h, tone, theme, mode }) {
  const t = theme.tones[tone];
  const story = h > 1500;
  const padT = story ? 250 : 84;
  const padB = story ? 340 : 84;
  const padX = 88;
  const d = theme.fonts.display;
  const b = theme.fonts.body;
  return `
${fontCss()}
:root{--bg:${t.bg};--fg:${t.fg};--muted:${t.muted};--accent:${t.accent};--rule:${t.rule}}
*{box-sizing:border-box;margin:0;padding:0}
html{font-size:10px}
body{width:${w}px;height:${h}px;background:var(--bg);color:var(--fg);font-family:'${b}',sans-serif;overflow:hidden;position:relative;-webkit-font-smoothing:antialiased}
.slide{position:absolute;inset:0;padding:${padT}px ${padX}px ${padB}px;display:flex;flex-direction:column}
.grain{position:absolute;inset:0;pointer-events:none;opacity:${theme.grain};mix-blend-mode:multiply;z-index:50;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1.1 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")}
.tone-ink .grain,.tone-clay .grain{mix-blend-mode:screen;opacity:${theme.grain * 0.6}}
.chrome{display:flex;justify-content:space-between;align-items:center;font-size:2.2rem;letter-spacing:.18em;text-transform:uppercase;font-weight:600;color:var(--muted);padding-bottom:28px;border-bottom:2px solid var(--rule)}
.chrome .pg{font-variant-numeric:tabular-nums}
.foot{display:flex;justify-content:space-between;align-items:center;font-size:2.2rem;letter-spacing:.18em;text-transform:uppercase;font-weight:600;color:var(--muted)}
.arrow{font-family:'${d}',serif;font-size:5rem;letter-spacing:0;color:var(--accent);line-height:1}
.main{flex:1;min-height:0;display:flex;flex-direction:column;justify-content:center;gap:44px;padding:56px 0 40px}
.kicker{font-size:2.4rem;letter-spacing:.2em;text-transform:uppercase;font-weight:600;color:var(--accent)}
.t{font-family:'${d}',serif;font-weight:700;line-height:1.02;letter-spacing:-.015em;font-size:var(--fs,12rem)}
.t em,.q em,.big em{font-style:italic;font-weight:400;color:var(--accent)}
.sub{font-size:3.4rem;line-height:1.4;color:var(--muted);max-width:86%}
.sub strong,.items strong{color:var(--fg);font-weight:600}
.body{font-size:3.6rem;line-height:1.42;max-width:92%}
.rule{width:140px;height:6px;background:var(--accent)}
.items{list-style:none;display:flex;flex-direction:column}
.items li{display:flex;gap:40px;align-items:baseline;padding:34px 0;border-top:2px solid var(--rule);font-size:3.8rem;line-height:1.28}
.items li:last-child{border-bottom:2px solid var(--rule)}
.items .n{font-family:'${d}',serif;font-style:italic;color:var(--accent);font-size:4.4rem;min-width:100px}
.q{font-family:'${d}',serif;font-style:italic;font-weight:400;line-height:1.16;font-size:var(--fs,7.6rem)}
.qm{font-family:'${d}',serif;font-size:30rem;line-height:.55;color:var(--accent);height:14rem}
.author{font-size:2.6rem;letter-spacing:.18em;text-transform:uppercase;font-weight:600;color:var(--muted)}
.big{font-family:'${d}',serif;font-weight:700;font-size:var(--fs,34rem);line-height:.9;letter-spacing:-.04em}
.label{font-family:'${d}',serif;font-style:italic;font-size:5.4rem;line-height:1.12}
.pill{align-self:flex-start;border:3px solid var(--fg);border-radius:999px;padding:26px 56px;font-size:2.8rem;letter-spacing:.16em;text-transform:uppercase;font-weight:600}
.pill.solid{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.row{display:flex;gap:24px;flex-wrap:wrap}
.photo{position:absolute;inset:0;background-size:cover;background-position:center;z-index:0}
.photo::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(10,9,7,.55) 0%,rgba(10,9,7,.1) 35%,rgba(10,9,7,.82) 100%)}
.has-photo .slide{z-index:2;color:#F6EFE4}
.has-photo .chrome,.has-photo .foot,.has-photo .sub{color:rgba(246,239,228,.85);border-color:rgba(246,239,228,.6)}
.has-photo .t em{color:#F2C9A0}
.has-photo .kicker{color:#F2C9A0}
.progress{position:absolute;left:${padX}px;right:${padX}px;bottom:${story ? 250 : 40}px;height:6px;background:rgba(127,127,127,.25);z-index:60}
.progress i{display:block;height:100%;width:100%;background:var(--accent);transform-origin:left;transform:scaleX(0)}
${mode === 'video' ? videoCss() : ''}
`;
}

export function videoCss() {
  return `
.r{opacity:0;animation:rise .9s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(.15s + var(--i,0) * .16s)}
@keyframes rise{from{opacity:0;transform:translateY(44px)}to{opacity:1;transform:none}}
.w{display:inline-block;opacity:0;animation:wordin .7s cubic-bezier(.2,.7,.2,1) both;animation-delay:calc(.2s + var(--wi,0) * .09s)}
@keyframes wordin{from{opacity:0;transform:translateY(.35em)}to{opacity:1;transform:none}}
.rule.r{transform-origin:left;animation-name:grow}
@keyframes grow{from{opacity:1;transform:scaleX(0)}to{opacity:1;transform:none}}
.photo{animation:kb var(--dur,5s) linear both}
@keyframes kb{from{transform:scale(1.04)}to{transform:scale(1.14)}}
.progress i{animation:prog var(--dur,5s) linear both}
@keyframes prog{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.fade{position:absolute;inset:0;background:var(--bg);z-index:99;pointer-events:none;animation:fadeio var(--dur,5s) linear both}
@keyframes fadeio{0%{opacity:1}7%{opacity:0}92%{opacity:0}100%{opacity:1}}
`;
}

export const fitScript = `
function fit(){
  document.querySelectorAll('[data-fit]').forEach(el=>{
    const box=el.closest('.main'); let fs=parseFloat(el.dataset.fit);
    el.style.setProperty('--fs',fs+'px');
    let guard=0;
    while(guard++<200 && box.scrollHeight>box.clientHeight+1 && fs>40){fs-=4;el.style.setProperty('--fs',fs+'px');}
  });
}
function splitWords(){
  document.querySelectorAll('[data-words]').forEach(el=>{
    let i=0;
    const walk=n=>{
      [...n.childNodes].forEach(c=>{
        if(c.nodeType===3){
          const f=document.createDocumentFragment();
          c.textContent.split(/(\\s+)/).forEach(p=>{
            if(!p) return;
            if(/^\\s+$/.test(p)){f.appendChild(document.createTextNode(p));return;}
            const s=document.createElement('span');s.className='w';s.style.setProperty('--wi',i++);s.textContent=p;f.appendChild(s);
          });
          c.replaceWith(f);
        } else if(c.nodeType===1 && c.tagName!=='BR') walk(c);
      });
    };
    walk(el);
  });
}
document.fonts.ready.then(()=>{fit();if(document.body.dataset.mode==='video')splitWords();document.body.dataset.ready='1';});
`;

export function renderSlideHtml(slide, ctx) {
  if (PHOTO_LAYOUTS.includes(slide.layout)) return renderPhotoHtml(slide, ctx);
  const { w, h, theme, spec, base, index, total, mode = 'still', duration = 5 } = ctx;
  const layout = slide.layout || (index === 0 ? 'cover' : index === total - 1 ? 'cta' : 'statement');
  if (!LAYOUTS.includes(layout)) throw new Error(`Unknown layout "${layout}" on slide ${index + 1}`);
  const tone = slide.tone || spec.tone || 'paper';
  if (!theme.tones[tone]) throw new Error(`Unknown tone "${tone}"`);
  const video = mode === 'video';
  const photo = layout === 'image' ? resolveAsset(base, slide.image) : null;
  const story = h > 1500;
  let n = 0;
  const r = (cls = '') => `class="${cls} r" style="--i:${n++}"`;
  const words = video ? ' data-words' : '';

  const titleFs = { cover: 150, statement: 150, cta: 130, image: 120, list: 100, stat: 100 }[layout] * (story ? 1.1 : 1);
  const title = slide.title ? `<h1 ${r('t')} data-fit="${titleFs}"${words}>${md(slide.title)}</h1>` : '';
  const kicker = slide.kicker ? `<div ${r('kicker')}>${md(slide.kicker)}</div>` : '';
  const sub = slide.subtitle ? `<p ${r('sub')}>${md(slide.subtitle)}</p>` : '';
  const bodyP = slide.body ? `<p ${r('body')}>${md(slide.body)}</p>` : '';

  let main = '';
  switch (layout) {
    case 'cover':
      main = `${kicker}${title}<div ${r('rule')}></div>${sub}`;
      break;
    case 'statement':
      main = `${kicker}${title}${bodyP}`;
      break;
    case 'list':
      main = `${kicker}${title}<ul class="items">${(slide.items || [])
        .map((it, i) => `<li ${r()}><span class="n">${String(i + 1).padStart(2, '0')}</span><span>${md(it)}</span></li>`)
        .join('')}</ul>`;
      break;
    case 'quote':
      main = `<div ${r('qm')}>“</div><blockquote ${r('q')} data-fit="${story ? 92 : 80}"${words}>${md(slide.quote)}</blockquote>${
        slide.author ? `<div ${r('author')}>— ${md(slide.author)}</div>` : ''}`;
      break;
    case 'stat':
      main = `${kicker}<div ${r('big')} data-fit="${story ? 380 : 340}">${md(slide.stat)}</div><div ${r('label')}>${md(slide.label || '')}</div>${bodyP}`;
      break;
    case 'image':
      main = `<div style="flex:1"></div>${kicker}${title}${sub}`;
      break;
    case 'cta':
      main = `${kicker}${title}${bodyP}<div class="row" ${r()}><span class="pill solid">${md(slide.button || 'Save this')}</span>${
        slide.button2 === false ? '' : `<span class="pill">${md(slide.button2 || 'Share')}</span>`}</div>`;
      break;
  }

  const handle = esc(spec.handle || '');
  const pg = `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
  const last = index === total - 1;
  const chrome = `<div class="chrome"><span>${handle}</span><span class="pg">${esc(spec.label || '')}${spec.label ? ' · ' : ''}${pg}</span></div>`;
  const foot = video
    ? ''
    : `<div class="foot"><span>${esc(slide.footer || (last ? '' : 'Swipe'))}</span>${last ? '' : '<span class="arrow">→</span>'}</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>${css({ w, h, tone, theme, mode })}</style></head>
<body class="tone-${tone}${photo ? ' has-photo' : ''}" data-mode="${mode}" style="--dur:${duration}s">
${photo ? `<div class="photo" style="background-image:url('${photo}')"></div>` : ''}
<div class="slide">${chrome}<div class="main">${main}</div>${foot}</div>
${video ? '<div class="progress"><i></i></div><div class="fade"></div>' : ''}
<div class="grain"></div>
<script>${fitScript}</script></body></html>`;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
