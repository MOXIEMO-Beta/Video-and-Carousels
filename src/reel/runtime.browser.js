/* Reel overlay runtime. Runs inside Chromium. Everything is a pure function of time:
 *   REEL.init({ w, h, tokens, items, words })   items/words are in OUTPUT time (seconds)
 *   REEL.view(t) -> HTML string for that instant
 * The renderer screenshots only when the HTML changes between frames.
 *
 * Layout contract (all positions are % of the frame):
 *   titles   top band      (tokens.zones.title)
 *   captions mid frame     (tokens.zones.caption)
 *   cards    lower band    (tokens.zones.card)
 * z-order: beat cards < overlays < captions. Captions flip to dark on light cards, and styles may give
 * captions a "busy" placement (e.g. a chip lower down) that is used while a title or card occupies their lane.
 */
(function () {
  const R = (window.REEL = {});
  let C;

  /* ---------- escaping / sanitising ---------- */
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const attr = (s) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const md = (s) =>
    esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.+?)\*/g, '<i class="acc">$1</i>')
      .replace(/\n/g, '<br>');
  const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);
  const P = (n) => ((num(n, 0) * C.w) / 720).toFixed(2) + 'px';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const safeFont = (k) => String(k).replace(/[^\w \-]/g, '');
  const safeCol = (k) => (/^[#\w(),.%\s-]+$/.test(String(k)) ? String(k) : '#ffffff');
  const font = (k) => `font-family:'${safeFont((C.tokens.fonts && C.tokens.fonts[k]) || k)}',sans-serif;`;
  const col = (k) => safeCol((C.tokens.colors && C.tokens.colors[k]) || k);
  const colOr = (k, fb) => {
    if (k && C.tokens.colors && C.tokens.colors[k]) return C.tokens.colors[k];
    if (k && /^#[0-9a-f]{3,8}$/i.test(k)) return k;
    return col(fb);
  };
  const cased = (s, mode) => (mode === 'none' ? s : mode === 'lower' ? s.toLowerCase() : s.toUpperCase());
  const rot = (it, inner) => (it.rotate ? `<div style="transform:rotate(${num(it.rotate, 0)}deg);">${inner}</div>` : inner);

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

  // Typewriter reveal over the VISIBLE characters of the rendered markup, so *italic* markers never flash
  // and surrogate pairs stay whole. Returns [{ html, vis, total }] per line.
  function typedMd(lines, lt, cps) {
    let n = Math.max(0, Math.floor(lt * cps) + 1);
    return lines.map((l) => {
      const toks = md(l).match(/<[^>]+>|&amp;|&lt;|&gt;|[\s\S]/gu) || [];
      const total = toks.filter((t) => t[0] !== '<').length;
      const take = Math.min(total, n);
      n -= total;
      let out = '', vis = 0;
      const stack = [];
      for (const t of toks) {
        if (t[0] === '<') {
          out += t;
          if (/^<br/.test(t)) continue;
          if (t[1] === '/') stack.pop(); else stack.push(t.match(/<(\w+)/)[1]);
          continue;
        }
        if (vis >= take) break;
        out += t; vis++;
      }
      while (stack.length) out += `</${stack.pop()}>`;
      return { html: out, vis, total };
    });
  }
  const plain = (lines) => lines.map((l) => ({ html: md(l), vis: 1, total: 1 }));

  const DEFAULT_W = { title: 92, section: 92, hero: 92, cta: 92, count: 92, label: 90, checklist: 80 };
  const block = (it, inner, extra = '') => {
    const align = it.align || 'center';
    const x = num(it.x, 50);
    const w0 = it.w ?? DEFAULT_W[it.type];
    const w = w0 ? `width:${num(w0, 90)}%;` : '';
    const tx = align === 'left' ? 'transform:none;' : align === 'right' ? 'transform:translateX(-100%);' : 'transform:translateX(-50%);';
    return `<div class="it" style="left:${x}%;top:${num(it.y, 15)}%;${w}text-align:${['left', 'right'].includes(align) ? align : 'center'};${tx}${extra}">${inner}</div>`;
  };

  /* ---------- components ---------- */
  const T = {};

  // top-band title (hook) or numbered section title; lines may be highlighted with per-line boxes
  T.title = T.section = (it, lt) => {
    const base = Object.assign({}, C.tokens[it.type] || C.tokens.title, it);
    let lines = String(base.lines ? [].concat(base.lines).join('\n') : base.text || '').split('\n');
    if (base.num) lines[0] = base.num + ' ' + lines[0];
    if (base.lower) lines = lines.map((l) => l.toLowerCase());
    const typing = base.entrance === 'type';
    const parts = typing ? typedMd(lines, lt, base.cps || 40) : plain(lines);
    let last = -1;
    parts.forEach((p, i) => { if (p.vis > 0) last = i; });
    const caret = typing && parts.some((p) => p.vis < p.total);
    const html = parts
      .map((p, i) => {
        if (!p.vis) return '';
        const cur = caret && i === last ? '<span class="cur">|</span>' : '';
        const style = `${font(base.font)}font-size:${P(base.size)};color:${col(base.color)};${base.boxes ? `background:${col(base.boxes)};` : ''}`;
        return `<div class="ln"><span class="${base.boxes ? 'bx' : ''}" style="${style}">${p.html}${cur}</span></div>`;
      })
      .join('');
    let sub = '';
    if (base.sub) {
      const sk = C.tokens.sub || {};
      const subLt = lt - num(base.subAt, 0.5);
      if (subLt >= 0) {
        const st = typedMd([String(base.sub)], subLt, 30)[0].html;
        sub = `<div class="sub" style="${font(sk.font || 'hand')}font-size:${P(sk.size || 26)};color:${col(base.subColor || sk.color || 'text')};margin-top:${P(10)};">${st}</div>`;
      }
    }
    const fade = base.entrance === 'fade' ? ent(lt, 'fade') : '';
    return block(base, `<div style="line-height:${base.boxes ? 1.02 : 1.08};">${html}</div>${sub}`, fade);
  };

  T.label = (it, lt) => {
    const txt = it.lower ? String(it.text).toLowerCase() : String(it.text);
    const shown = it.entrance === 'type' ? typedMd([txt], lt, it.cps || 32)[0].html : md(txt);
    const style = `${font(it.font || 'hand')}font-size:${P(it.size || 28)};color:${col(it.color || 'text')};line-height:1.15;display:inline-block;${it.boxes ? `background:${col(it.boxes)};padding:${P(4)} ${P(10)};` : ''}`;
    const inner = `<span style="${style}">${shown}</span>`;
    const e = it.entrance && it.entrance !== 'type' ? ent(lt, it.entrance) : '';
    return block(it, rot(it, e ? `<div style="${e}">${inner}</div>` : inner), 'text-shadow:0 1px 8px rgba(0,0,0,.35);');
  };

  // white document / proof card. rows are list items; image is a screenshot; stat is a headline number
  T.card = (it, lt) => {
    const w = num(it.w, 78);
    const dark = it.style === 'dark';
    const bg = dark ? '#16161a' : col('card');
    const ink = dark ? '#f2f2f2' : col('cardInk');
    let inner = '';
    if (it.stat) {
      const s = it.stat;
      inner += `${s.chip ? `<span style="display:inline-block;background:#4F46E5;color:#fff;border-radius:${P(5)};padding:${P(3)} ${P(10)};font-size:${P(17)};font-weight:600;margin-bottom:${P(8)};">${esc(s.chip)}</span>` : ''}
        <div style="font-size:${P(s.size || 54)};font-weight:800;letter-spacing:-.03em;line-height:1;">${esc(s.value)}</div>
        ${s.label ? `<div style="font-size:${P(20)};color:#777;margin-top:${P(6)};">${esc(s.label)}</div>` : ''}`;
    }
    if (it.heading) inner += `<div style="font-weight:700;font-size:${P(it.hsize || 30)};margin-bottom:${P(12)};">${md(it.heading)}</div>`;
    if (it.text) inner += `<div style="font-size:${P(it.size || 25)};line-height:1.45;">${md(it.text)}</div>`;
    if (it.rows) {
      const rows = [].concat(it.rows).map(String);
      inner += `<ol style="padding-left:${P(30)};font-size:${P(it.size || 25)};line-height:1.5;${it.bullets ? 'list-style:disc;' : ''}">${rows.map((r) => `<li>${md(r)}</li>`).join('')}</ol>`;
    }
    if (it.image) inner += `<img src="${attr(it.image)}" style="width:100%;display:block;margin-top:${P(inner ? 10 : 0)};">`;
    const style = `text-align:left;background:${bg};color:${ink};padding:${P(it.pad ?? 22)};border-radius:${P(it.radius ?? 2)};box-shadow:0 ${P(6)} ${P(28)} rgba(0,0,0,.22);${font('body')}${it.h ? `height:${num(it.h, 20)}%;overflow:hidden;` : ''}`;
    return block({ ...it, w }, `<div style="${style}${ent(lt, it.entrance || 'pop')}">${inner}</div>`);
  };

  // small label with a bold lead-in
  T.box = (it, lt) => {
    const w = num(it.w, 70);
    const align = it.align || 'left';
    const inner = `<div style="text-align:left;background:#fff;color:#111;padding:${P(12)} ${P(16)};border-radius:${P(3)};font-size:${P(it.size || 23)};line-height:1.35;${font('body')}box-shadow:0 ${P(4)} ${P(16)} rgba(0,0,0,.2);${ent(lt, 'pop')}">${it.lead ? `<b>${esc(it.lead)}</b> ` : ''}${md(it.text || '')}</div>`;
    return block({ ...it, w, align, x: it.x ?? (align === 'left' ? (100 - w) / 2 : 50) }, inner);
  };

  T.sticker = (it, lt) => block(it, rot(it, `<div style="font-size:${P(it.size || 70)};line-height:1;${ent(lt, 'pop', 0.18)}">${esc(it.emoji || '✨')}</div>`));

  T.image = (it, lt) =>
    block({ w: it.w ?? 60, ...it }, rot(it, `<img src="${attr(it.src)}" style="width:100%;display:block;border-radius:${P(it.radius ?? 6)};box-shadow:0 ${P(6)} ${P(26)} rgba(0,0,0,.28);${ent(lt, 'pop')}">`));

  // huge stacked words, e.g. 'automate' (white) / 'everything' (gold italic)
  T.hero = (it, lt) => {
    const em = (C.tokens.captions && C.tokens.captions.emphasis) || {};
    const lines = (it.lines || []).map((l, i) => {
      const o = typeof l === 'string' ? { t: l, accent: i % 2 === 1 } : l;
      const st = o.accent
        ? `${font(em.font || 'serif')}font-style:${em.italic === false ? 'normal' : 'italic'};color:${col(em.color || 'accent')};font-size:${P(num(it.size, 120) * 1.25)};font-weight:400;`
        : `${font('sans')}font-weight:800;color:#fff;font-size:${P(it.size || 120)};letter-spacing:-.04em;`;
      const d = clamp((lt - i * 0.18) / 0.12);
      return `<div style="${st}line-height:.95;opacity:${d.toFixed(2)};text-shadow:0 2px 16px rgba(0,0,0,.4);">${esc(o.t)}</div>`;
    });
    return block({ y: 24, ...it }, lines.join(''));
  };

  // 'Comment KEYWORD' lock-up. Styled by tokens.cta so each style gets its own treatment.
  T.cta = (it, lt) => {
    const k = Object.assign({}, C.tokens.cta || {}, it);
    const lead = Object.assign({ font: 'body', size: 30, case: 'none', color: 'text' }, (C.tokens.cta || {}).lead, it.leadStyle);
    const after = Object.assign({ font: 'hand', size: 34, color: 'text' }, (C.tokens.cta || {}).after, it.afterStyle);
    const kw = `${font(k.font || 'sans')}font-weight:${num(k.weight, 800)};font-size:${P(k.size || 84)};letter-spacing:${num(k.tracking, -0.03)}em;color:${col(k.color || 'accent')};line-height:1;${k.italic ? 'font-style:italic;' : ''}`;
    const inner = `<div style="${font(lead.font)}font-size:${P(lead.size)};color:${col(lead.color)};">${esc(cased(String(it.lead || 'Comment'), lead.case))}</div>
      <div style="${kw}">${esc(cased(String(it.keyword), k.case || 'upper'))}</div>
      ${it.after ? `<div style="${font(after.font)}font-size:${P(after.size)};color:${col(after.color)};margin-top:${P(6)};">${md(it.after)}</div>` : ''}`;
    return block({ y: 14, ...it }, `<div style="${ent(lt, 'pop', 0.2)}">${inner}</div>`, 'text-shadow:0 2px 14px rgba(0,0,0,.45);');
  };

  // full-frame solid card that shows one word at a time (fast montage beat)
  T.beat = (it, lt) => {
    const words = (it.words && it.words.length ? it.words : String(it.text || '').split(/\s+/)).map(String);
    const per = it.per || Math.max(0.17, (it.dur || 1.5) / Math.max(1, words.length));
    const i = clamp(Math.floor(lt / per), 0, words.length - 1);
    const em = (C.tokens.captions && C.tokens.captions.emphasis) || {};
    const w = words[i] || '';
    const isEm = Array.isArray(it.emphasis) && it.emphasis.includes(i);
    const style = isEm
      ? `${font('serif')}font-style:italic;color:${colOr(it.emColor, 'maroon')};font-size:${P(num(it.size, 150) * 1.2)};font-weight:400;`
      : `${font('sans')}font-weight:800;color:${colOr(it.ink, 'text')};font-size:${P(it.size || 150)};letter-spacing:-.05em;`;
    return `<div class="beat" style="background:${colOr(it.color, 'sage')};"><div style="position:absolute;left:50%;top:${num(it.y, 50)}%;transform:translate(-50%,-50%);width:92%;text-align:center;line-height:.95;${style}text-transform:${it.lower === false ? 'none' : 'lowercase'};">${esc(w)}</div></div>`;
  };

  T.checklist = (it, lt) => {
    const items = [].concat(it.items || []).map(String);
    const per = num(it.stagger, 0.9);
    const rows = items
      .map((s, i) => {
        const a = lt - i * per;
        if (a < 0) return '';
        const txt = typedMd([s], a, it.cps || 36)[0].html;
        return `<div style="display:flex;gap:${P(10)};margin-bottom:${P(6)};"><span style="${font('hand')}font-size:${P(it.size || 30)};color:${col(it.numColor || 'accent')};min-width:${P(26)};">${i + 1}.</span><span style="${font(it.font || 'hand')}font-size:${P(it.size || 30)};color:#fff;">${txt}</span></div>`;
      })
      .join('');
    return block({ align: 'left', x: 14, y: 14, ...it }, `<div style="text-shadow:0 1px 8px rgba(0,0,0,.4);">${rows}</div>`);
  };

  T.count = (it, lt) => {
    const from = num(it.from, 0), to = num(it.to, 0);
    const dec = it.decimals ?? Math.max(0, ...[from, to].map((n) => (String(n).split('.')[1] || '').length));
    const ramp = Math.min(num(it.count_dur, 1.1), num(it.dur, Infinity));
    const e = 1 - Math.pow(1 - clamp(lt / ramp), 3);
    const v = from + (to - from) * e;
    const s = (it.prefix || '') + v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (it.suffix || '');
    return block({ y: 22, ...it }, `<div style="${font(it.font || 'sans')}font-weight:800;font-size:${P(it.size || 120)};color:${col(it.color || 'text')};letter-spacing:-.04em;text-shadow:0 3px 20px rgba(0,0,0,.4);${ent(lt, 'pop', 0.12)}">${esc(s)}</div>`);
  };

  /* ---------- geometry (rough extents in % of frame, used for caption avoidance) ---------- */
  const frameH720 = () => (C.h * 720) / C.w; // frame height in 720-wide units
  function cardH(card) {
    if (card.h) return num(card.h, 20);
    if (card.type === 'box') return 10;
    return 12 + (card.rows ? [].concat(card.rows).length * 4.2 : 0) + (card.text ? 6 : 0) + (card.heading ? 5 : 0) + (card.image ? 30 : 0) + (card.stat ? 12 : 0);
  }
  function extent(it) {
    const y = num(it.y, 15);
    const pct = (px) => (px / frameH720()) * 100;
    switch (it.type) {
      case 'title': case 'section': {
        const b = Object.assign({}, C.tokens[it.type] || C.tokens.title, it);
        const n = (b.lines ? [].concat(b.lines).length : 1) + (b.sub ? 0.7 : 0);
        return [y, y + pct(n * num(b.size, 50) * 1.1)];
      }
      case 'hero': return [y, y + pct((it.lines || []).length * num(it.size, 120) * 1.15)];
      case 'cta': return [y, y + pct(num(it.size, 84) + 80)];
      case 'card': case 'box': { const y0 = num(it.y, it.type === 'box' ? 15 : 30); return [y0, y0 + cardH(it)]; }
      case 'checklist': return [y, y + pct([].concat(it.items || []).length * num(it.size, 30) * 1.4)];
      case 'count': return [num(it.y, 22), num(it.y, 22) + pct(num(it.size, 120) * 1.1)];
      default: return null;
    }
  }
  function covers(card, cx, cy) {
    const w = num(card.w, 78);
    const x = num(card.x, 50);
    const align = card.align || 'center';
    const x0 = align === 'left' ? x : align === 'right' ? x - w : x - w / 2;
    const y0 = num(card.y, 30);
    return cx >= x0 && cx <= x0 + w && cy >= y0 && cy <= y0 + cardH(card);
  }

  /* ---------- captions ---------- */
  const SENT_END = /[.!?…。！？]["')\]”’」』）]*$/;

  function groupWords(words, max, gap) {
    const groups = [];
    let cur = [];
    words.forEach((w, i) => {
      const prev = words[i - 1];
      const brk = prev && (w.t0 - prev.t1 > gap || SENT_END.test(prev.w) || cur.length >= max);
      if (brk && cur.length) { groups.push(cur); cur = []; }
      cur.push(w);
    });
    if (cur.length) groups.push(cur);
    groups.forEach((g) => { g.t0 = g[0].t0; g.t1 = g[g.length - 1].t1; });
    return groups;
  }

  function wordHtml(w, cap, onChip) {
    const em = (w.v && cap.emphasis2) || cap.emphasis || {};
    const txt = cap.case === 'lower' ? w.w.toLowerCase() : w.w;
    if (w.e) {
      // yellow on a white chip is unreadable: use the style's chip emphasis colour instead
      const st = `color:${onChip ? col(cap.chipEmphasis || '#9B2B35') : col(em.color || '#fff')};${font(em.font || cap.font)}${em.italic ? 'font-style:italic;' : ''}font-weight:${num(em.weight, cap.weight)};font-size:${num(em.scale, 1)}em;`;
      return `<span style="${st}">${esc(txt)}</span>`;
    }
    return esc(txt);
  }

  function activeItems(t) { return C.items.filter((it) => t >= it.at && t < it.at + it.dur); }

  function capAt(t) {
    const cap = C.tokens.captions;
    const words = C.words;
    if (!words.length) return '';
    const act = activeItems(t);
    if (act.some((it) => it.type === 'beat')) return '';
    // placement first: a style may move captions while a title/card/number occupies their lane
    let place = { x: cap.x, y: cap.y, w: cap.w, boxed: !!cap.boxed };
    if (cap.busy) {
      const lo = cap.y - 5, hi = cap.y + 5;
      const busy = act.some((it) => { const e = extent(it); return e && e[1] >= lo && e[0] <= hi; });
      if (busy) place = { x: num(cap.busy.x, cap.x), y: num(cap.busy.y, cap.y), w: num(cap.busy.w, cap.w), boxed: cap.busy.boxed ?? place.boxed };
    }
    let html = '';
    if (cap.mode === 'word') {
      let i = words.findIndex((w) => t >= w.t0 && t < w.t1);
      if (i < 0) {
        const prev = [...words].reverse().find((w) => w.t1 <= t);
        const nxt = words.find((w) => w.t0 > t);
        if (prev && nxt && nxt.t0 - prev.t1 < 0.25 && t - prev.t1 < 0.25) i = words.indexOf(prev);
      }
      if (i >= 0) html = wordHtml(words[i], cap, place.boxed);
    } else {
      const groups = C._groups || (C._groups = groupWords(words, cap.max || (cap.mode === 'phrase' ? 4 : 5), cap.gap ?? 0.55));
      // later groups win over the previous group's short hold, so changes are never late
      const g = [...groups].reverse().find((gr) => t >= gr.t0 && t < gr.t1 + 0.12);
      if (g) {
        const vis = cap.mode === 'stack' ? g.filter((w) => w.t0 <= t) : g;
        html = vis.map((w) => wordHtml(w, cap, place.boxed)).join(' ');
      }
    }
    if (!html) return '';
    const onLight = act.some((it) => it.type === 'card' && it.style !== 'dark' && covers(it, place.x, place.y));
    const colr = onLight ? '#111' : col(cap.color || 'text');
    const sh = onLight || place.boxed ? 'none' : `0 2px ${P(10)} rgba(0,0,0,${num(cap.shadow, 0.45)}),0 0 ${P(2)} rgba(0,0,0,.25)`;
    const chip = place.boxed ? `background:rgba(255,255,255,.94);color:#111;padding:${P(6)} ${P(14)};border-radius:${P(6)};display:inline-block;` : '';
    const inner = place.boxed ? `<span style="${chip}">${html}</span>` : html;
    return `<div class="cap" style="left:${place.x}%;top:${place.y}%;width:${place.w}%;text-align:${cap.align};${font(cap.font)}font-size:${P(cap.size)};font-weight:${num(cap.weight, 500)};letter-spacing:${num(cap.tracking, 0)}em;color:${colr};text-shadow:${sh};">${inner}</div>`;
  }

  /* ---------- public ---------- */
  const REQUIRED = { label: ['text'], cta: ['keyword'], image: ['src'], checklist: ['items'], hero: ['lines'] };
  const DEFAULT_DUR = { title: 5, section: 3.4, label: 3, card: 4, box: 4, sticker: 2.5, image: 3, hero: 2.6, cta: 4, beat: 1.5, checklist: 5, count: 2 };

  R.init = (cfg) => {
    C = cfg;
    // words: drop invalid, sort, enforce a one-frame minimum and no overlaps
    const MIN = 1 / 30;
    const ws = (cfg.words || [])
      .filter((w) => w && typeof w.w === 'string' && Number.isFinite(w.t0) && Number.isFinite(w.t1))
      .map((w) => ({ ...w }))
      .sort((a, b) => a.t0 - b.t0);
    ws.forEach((w, i) => {
      if (w.t1 < w.t0 + MIN) w.t1 = w.t0 + MIN;
      const nx = ws[i + 1];
      if (nx && w.t1 > nx.t0) w.t1 = Math.max(w.t0 + MIN, nx.t0);
    });
    C.words = ws;
    C._groups = null;
    // items: validate and normalise durations
    C.items = (cfg.items || []).map((it, i) => {
      if (!T[it.type]) throw new Error(`timeline[${i}]: unknown type "${it.type}". Known: ${Object.keys(T).join(', ')}, clip`);
      for (const f of REQUIRED[it.type] || []) {
        if (it[f] == null || (typeof it[f] === 'string' && !it[f].trim())) throw new Error(`timeline[${i}] (${it.type}): missing "${f}"`);
      }
      const tok = cfg.tokens && cfg.tokens[it.type];
      let d = Number(it.dur ?? (tok && tok.dur));
      if (!(d > 0)) d = DEFAULT_DUR[it.type] ?? 4;
      return { ...it, dur: d, at: num(it.at, 0) };
    });
    document.documentElement.style.setProperty('--w', cfg.w + 'px');
  };

  R.view = (t) => {
    const under = [];
    const over = [];
    C.items.forEach((it) => {
      const lt = t - it.at;
      if (lt < 0 || lt >= it.dur) return;
      (it.type === 'beat' ? under : over).push(T[it.type](it, lt));
    });
    return under.join('') + over.join('') + capAt(t);
  };

  R.render = (t) => {
    const html = R.view(t);
    document.getElementById('root').innerHTML = html;
    return html;
  };
})();
