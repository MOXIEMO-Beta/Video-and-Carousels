/* Reel overlay runtime. Runs inside Chromium. Everything is a pure function of time:
 *   REEL.init({ w, h, tokens, items, words })   items/words are in OUTPUT time (seconds)
 *   REEL.view(t) -> HTML string for that instant
 * The renderer screenshots only when the HTML changes between frames.
 *
 * Layout contract (all positions are % of the frame):
 *   titles   top band      (tokens.zones.title)
 *   captions mid frame     (tokens.zones.caption)
 *   cards    lower band    (tokens.zones.card)
 * z-order: beat cards < overlays < captions (captions always on top; they flip to dark on light cards).
 */
(function () {
  const R = (window.REEL = {});
  let C;

  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const md = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i class="acc">$1</i>')
      .replace(/\n/g, '<br>');
  const P = (n) => ((n * C.w) / 720).toFixed(2) + 'px';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const font = (k) => `font-family:'${(C.tokens.fonts && C.tokens.fonts[k]) || k}',sans-serif;`;
  const col = (k) => (C.tokens.colors && C.tokens.colors[k]) || k;

  /* ---------- helpers ---------- */
  function ent(lt, kind, d = 0.14) {
    if (kind === 'fade') return `opacity:${clamp(lt / (d * 2)).toFixed(2)};`;
    if (kind === 'pop') {
      const e = clamp(lt / d);
      return `transform:scale(${(0.93 + 0.07 * e).toFixed(3)});opacity:${clamp(lt / (d * 0.6)).toFixed(2)};`;
    }
    if (kind === 'rise') {
      const e = 1 - Math.pow(1 - clamp(lt / 0.35), 3);
      return `transform:translateY(${((1 - e) * 40).toFixed(1)}px);opacity:${e.toFixed(2)};`;
    }
    return '';
  }
  // reveal text progressively across multiple lines
  function typedLines(lines, lt, cps) {
    let n = Math.max(0, Math.floor(lt * cps) + 1);
    return lines.map((l) => {
      const take = Math.min(l.length, n);
      n -= l.length;
      return l.slice(0, Math.max(0, take));
    });
  }
  const block = (it, inner, extra = '') => {
    const align = it.align || 'center';
    const x = it.x ?? 50;
    const w = it.w ? `width:${it.w}%;` : '';
    const tx = align === 'left' ? 'transform:none;' : align === 'right' ? 'transform:translateX(-100%);' : 'transform:translateX(-50%);';
    return `<div class="it" style="left:${x}%;top:${it.y ?? 15}%;${w}text-align:${align};${tx}${extra}">${inner}</div>`;
  };
  const wrapEnt = (it, lt, inner) => {
    const e = ent(lt, it.entrance === 'type' ? 'none' : it.entrance, 0.14);
    return e ? `<div style="${e}transform-origin:50% 50%;">${inner}</div>` : inner;
  };

  /* ---------- components ---------- */
  const T = {};

  // top-band title (hook) or numbered section title; lines may be highlighted with per-line boxes
  T.title = T.section = (it, lt) => {
    const k = it.type;
    const base = Object.assign({}, C.tokens[k] || C.tokens.title, it);
    let lines = String(base.lines ? base.lines.join('\n') : base.text || '').split('\n');
    if (base.num) lines[0] = base.num + ' ' + lines[0];
    if (base.lower) lines = lines.map((l) => l.toLowerCase());
    const shown = base.entrance === 'type' ? typedLines(lines, lt, base.cps || 40) : lines;
    const caret = base.entrance === 'type' && shown.join('').length < lines.join('').length;
    let lastIdx = -1;
    shown.forEach((s, i) => { if (s.length) lastIdx = i; });
    const html = shown
      .map((s, i) => {
        if (!s.length) return '';
        const cur = caret && i === lastIdx ? '<span class="cur">|</span>' : '';
        const style = `${font(base.font)}font-size:${P(base.size)};color:${col(base.color)};${base.boxes ? `background:${col(base.boxes)};` : ''}`;
        return `<div class="ln"><span class="${base.boxes ? 'bx' : ''}" style="${style}">${md(s)}${cur}</span></div>`;
      })
      .join('');
    let sub = '';
    if (base.sub) {
      const sk = C.tokens.sub || {};
      const subLt = lt - (base.subAt ?? 0.5);
      if (subLt >= 0) {
        const st = typedLines([base.sub], subLt, 30)[0];
        sub = `<div class="sub" style="${font(sk.font || 'hand')}font-size:${P(sk.size || 26)};color:#fff;margin-top:${P(10)};">${md(st)}</div>`;
      }
    }
    return block(base, `<div style="line-height:${base.boxes ? 1.02 : 1.08};">${html}</div>${sub}`);
  };

  T.label = (it, lt) => {
    const f = it.font || 'hand';
    let txt = it.lower ? String(it.text).toLowerCase() : String(it.text);
    if (it.entrance === 'type') txt = typedLines([txt], lt, it.cps || 32)[0];
    const style = `${font(f)}font-size:${P(it.size || 28)};color:${col(it.color || 'text')};line-height:1.15;${it.rotate ? `transform:rotate(${it.rotate}deg);` : ''}${it.boxes ? `background:${col(it.boxes)};padding:${P(4)} ${P(10)};` : ''}`;
    const inner = `<span style="${style}">${md(txt)}</span>`;
    return block(it, it.entrance === 'type' ? inner : wrapEnt(it, lt, inner), 'text-shadow:0 1px 8px rgba(0,0,0,.35);');
  };

  // white document / proof card. rows are list items; image is a screenshot
  T.card = (it, lt) => {
    const w = it.w ?? 78;
    const dark = it.style === 'dark';
    const bg = dark ? '#16161a' : col('card');
    const ink = dark ? '#f2f2f2' : col('cardInk');
    let inner = '';
    if (it.heading) inner += `<div style="font-weight:700;font-size:${P(it.hsize || 30)};margin-bottom:${P(12)};">${md(it.heading)}</div>`;
    if (it.text) inner += `<div style="font-size:${P(it.size || 25)};line-height:1.45;">${md(it.text)}</div>`;
    if (it.rows) {
      inner += `<ol style="padding-left:${P(30)};font-size:${P(it.size || 25)};line-height:1.5;${it.bullets ? 'list-style:disc;' : ''}">${it.rows.map((r) => `<li>${md(r)}</li>`).join('')}</ol>`;
    }
    if (it.image) inner += `<img src="${it.image}" style="width:100%;display:block;margin-top:${P(inner ? 10 : 0)};">`;
    const style = `text-align:left;background:${bg};color:${ink};padding:${P(it.pad ?? 22)};border-radius:${P(it.radius ?? 2)};box-shadow:0 ${P(6)} ${P(28)} rgba(0,0,0,.22);${font('body')}${it.h ? `height:${it.h}%;overflow:hidden;` : ''}`;
    return block({ ...it, w }, `<div style="${style}${ent(lt, it.entrance || 'pop')}">${inner}</div>`);
  };

  // small label with a bold lead-in
  T.box = (it, lt) => {
    const inner = `<div style="background:#fff;color:#111;padding:${P(12)} ${P(16)};border-radius:${P(3)};font-size:${P(it.size || 23)};line-height:1.35;${font('body')}box-shadow:0 ${P(4)} ${P(16)} rgba(0,0,0,.2);${ent(lt, 'pop')}">${it.lead ? `<b>${esc(it.lead)}</b> ` : ''}${md(it.text || '')}</div>`;
    return block({ w: it.w ?? 70, ...it, align: it.align || 'left' }, inner);
  };

  T.sticker = (it, lt) => block(it, `<div style="font-size:${P(it.size || 70)};line-height:1;${it.rotate ? `transform:rotate(${it.rotate}deg);` : ''}${ent(lt, 'pop', 0.18)}">${esc(it.emoji || '✨')}</div>`);

  T.image = (it, lt) =>
    block({ w: it.w ?? 60, ...it }, `<img src="${it.src}" style="width:100%;display:block;border-radius:${P(it.radius ?? 6)};box-shadow:0 ${P(6)} ${P(26)} rgba(0,0,0,.28);${it.rotate ? `transform:rotate(${it.rotate}deg);` : ''}${ent(lt, 'pop')}">`);

  // huge stacked words, e.g. 'automate' (white) / 'everything' (gold italic)
  T.hero = (it, lt) => {
    const em = (C.tokens.captions && C.tokens.captions.emphasis) || {};
    const lines = (it.lines || []).map((l, i) => {
      const o = typeof l === 'string' ? { t: l, accent: i % 2 === 1 } : l;
      const st = o.accent
        ? `${font(em.font || 'serif')}font-style:${em.italic === false ? 'normal' : 'italic'};color:${em.color || col('accent')};font-size:${P((it.size || 110) * 1.25)};font-weight:400;`
        : `${font('sans')}font-weight:800;color:#fff;font-size:${P(it.size || 110)};letter-spacing:-.04em;`;
      const d = clamp((lt - i * 0.18) / 0.12);
      return `<div style="${st}line-height:.95;opacity:${d.toFixed(2)};${o.accent ? '' : ''}text-shadow:0 2px 16px rgba(0,0,0,.4);">${esc(o.t)}</div>`;
    });
    return block({ y: 30, ...it }, lines.join(''));
  };

  // 'Comment KEYWORD' lock-up
  T.cta = (it, lt) => {
    const em = (C.tokens.captions && C.tokens.captions.emphasis) || {};
    const inner = `<div style="${font('body')}font-size:${P(26)};color:#fff;letter-spacing:.02em;">${esc(it.lead || 'Comment')}</div>
      <div style="${font(it.font || 'sans')}font-weight:800;font-size:${P(it.size || 84)};letter-spacing:-.03em;color:${em.color || col('accent')};line-height:1;text-transform:uppercase;">${esc(it.keyword || 'LAUNCH')}</div>
      ${it.after ? `<div style="${font('hand')}font-size:${P(26)};color:#fff;margin-top:${P(6)};">${md(it.after)}</div>` : ''}`;
    return block({ y: 14, ...it }, `<div style="${ent(lt, 'pop', 0.2)}">${inner}</div>`, 'text-shadow:0 2px 14px rgba(0,0,0,.45);');
  };

  // full-frame solid card that shows one word at a time (fast montage beat)
  T.beat = (it, lt) => {
    const words = it.words || String(it.text || '').split(/\s+/);
    const per = it.per || Math.max(0.17, (it.dur || 1.5) / Math.max(1, words.length));
    const i = Math.min(words.length - 1, Math.floor(lt / per));
    const em = (C.tokens.captions && C.tokens.captions.emphasis) || {};
    const w = words[i] || '';
    const isEm = it.emphasis && it.emphasis.includes(i);
    const style = isEm
      ? `${font(em.font || 'serif')}font-style:italic;color:${col(it.emColor || 'maroon')};font-size:${P((it.size || 150) * 1.2)};font-weight:400;`
      : `${font('sans')}font-weight:800;color:${col(it.ink || 'text')};font-size:${P(it.size || 150)};letter-spacing:-.05em;`;
    return `<div class="beat" style="background:${col(it.color || 'sage')};"><div style="position:absolute;left:50%;top:${it.y ?? 50}%;transform:translate(-50%,-50%);width:92%;text-align:center;line-height:.95;${style}text-transform:${it.lower === false ? 'none' : 'lowercase'};">${esc(w)}</div></div>`;
  };

  T.checklist = (it, lt) => {
    const items = it.items || [];
    const per = it.stagger ?? 0.9;
    const rows = items
      .map((s, i) => {
        const a = lt - i * per;
        if (a < 0) return '';
        const txt = typedLines([s], a, it.cps || 36)[0];
        return `<div style="display:flex;gap:${P(10)};margin-bottom:${P(6)};"><span style="${font('hand')}font-size:${P(it.size || 30)};color:${col(it.numColor || 'accent')};min-width:${P(26)};">${i + 1}.</span><span style="${font(it.font || 'hand')}font-size:${P(it.size || 30)};color:#fff;">${md(txt)}</span></div>`;
      })
      .join('');
    return block({ align: 'left', x: 14, y: 14, ...it }, `<div style="text-shadow:0 1px 8px rgba(0,0,0,.4);">${rows}</div>`);
  };

  T.count = (it, lt) => {
    const d = clamp(lt / (it.count_dur || 1.1));
    const e = 1 - Math.pow(1 - d, 3);
    const v = Math.round((it.from || 0) + ((it.to ?? 0) - (it.from || 0)) * e);
    const s = (it.prefix || '') + v.toLocaleString('en-US') + (it.suffix || '');
    return block({ y: 22, ...it }, `<div style="${font(it.font || 'sans')}font-weight:800;font-size:${P(it.size || 120)};color:${col(it.color || 'text')};letter-spacing:-.04em;text-shadow:0 3px 20px rgba(0,0,0,.4);${ent(lt, 'pop', 0.12)}">${esc(s)}</div>`);
  };

  /* ---------- captions ---------- */
  function normWord(w) { return w.toLowerCase().replace(/[^a-z0-9$%]/g, ''); }

  function groupWords(words, max, gap) {
    const groups = [];
    let cur = [];
    words.forEach((w, i) => {
      const prev = words[i - 1];
      const brk = prev && (w.t0 - prev.t1 > gap || /[.!?]$/.test(prev.w) || cur.length >= max);
      if (brk && cur.length) { groups.push(cur); cur = []; }
      cur.push(w);
    });
    if (cur.length) groups.push(cur);
    groups.forEach((g) => { g.t0 = g[0].t0; g.t1 = g[g.length - 1].t1; });
    return groups;
  }

  function wordHtml(w, cap) {
    const em = cap.emphasis || {};
    let txt = cap.case === 'lower' ? w.w.toLowerCase() : w.w;
    if (w.e) {
      const st = `color:${em.color || '#fff'};${font(em.font || cap.font)}${em.italic ? 'font-style:italic;' : ''}font-weight:${em.weight || cap.weight};font-size:${em.scale || 1}em;`;
      return `<span style="${st}">${esc(txt)}</span>`;
    }
    return esc(txt);
  }

  function capAt(t) {
    const cap = C.tokens.captions;
    if (C.items.some((it) => it.type === 'beat' && t >= it.at && t < it.at + it.dur)) return '';
    const words = C.words;
    if (!words.length) return '';
    let html = '';
    if (cap.mode === 'word') {
      let i = words.findIndex((w) => t >= w.t0 && t < w.t1);
      if (i < 0) {
        // hold the previous word through short gaps
        const prev = [...words].reverse().find((w) => w.t1 <= t);
        const nxt = words.find((w) => w.t0 > t);
        if (prev && nxt && nxt.t0 - prev.t1 < 0.25 && t - prev.t1 < 0.25) i = words.indexOf(prev);
      }
      if (i >= 0) html = wordHtml(words[i], cap);
    } else {
      const groups = C._groups || (C._groups = groupWords(words, cap.max || (cap.mode === 'phrase' ? 4 : 5), cap.gap ?? 0.55));
      const g = groups.find((gr) => t >= gr.t0 && t < gr.t1 + 0.12);
      if (g) {
        const vis = cap.mode === 'stack' ? g.filter((w) => w.t0 <= t) : g;
        html = vis.map((w) => wordHtml(w, cap)).join(' ');
      }
    }
    if (!html) return '';
    // flip to dark when a light card covers the caption anchor
    const onLight = C.items.some((it) => it.type === 'card' && it.style !== 'dark' && t >= it.at && t < it.at + it.dur && covers(it, cap));
    const colr = onLight ? '#111' : col(cap.color || 'text');
    const sh = onLight ? 'none' : `0 2px ${P(10)} rgba(0,0,0,${cap.shadow ?? 0.45}),0 0 ${P(2)} rgba(0,0,0,.25)`;
    const boxed = cap.boxed ? `background:rgba(255,255,255,.94);color:#111;padding:${P(6)} ${P(14)};border-radius:${P(6)};text-shadow:none;` : '';
    return `<div class="cap" style="left:${cap.x}%;top:${cap.y}%;width:${cap.w}%;text-align:${cap.align};${font(cap.font)}font-size:${P(cap.size)};font-weight:${cap.weight};letter-spacing:${cap.tracking ?? 0}em;color:${colr};text-shadow:${sh};${boxed}">${html}</div>`;
  }
  function covers(card, cap) {
    const w = card.w ?? 78;
    const x0 = (card.x ?? 50) - w / 2;
    const h = card.h ?? 20 + (card.rows ? card.rows.length * 4.2 : 0) + (card.text ? 6 : 0) + (card.heading ? 4 : 0) + (card.image ? 30 : 0);
    const y0 = card.y ?? 30;
    return cap.x >= x0 && cap.x <= x0 + w && cap.y >= y0 && cap.y <= y0 + h;
  }

  /* ---------- public ---------- */
  R.init = (cfg) => {
    C = cfg;
    C.words = (cfg.words || []).slice().sort((a, b) => a.t0 - b.t0);
    C._groups = null;
    document.documentElement.style.setProperty('--w', cfg.w + 'px');
  };

  R.view = (t) => {
    const under = []; // beat cards
    const over = [];
    C.items.forEach((it) => {
      const lt = t - it.at;
      if (lt < 0 || lt >= it.dur) return;
      const fn = T[it.type];
      if (!fn) return;
      (it.type === 'beat' ? under : over).push(fn(it, lt));
    });
    return under.join('') + over.join('') + capAt(t);
  };

  R.render = (t) => {
    const html = R.view(t);
    document.getElementById('root').innerHTML = html;
    return html;
  };
})();
