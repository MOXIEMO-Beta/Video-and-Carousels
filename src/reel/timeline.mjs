import fs from 'node:fs';
import path from 'node:path';

const norm = (w) => w.toLowerCase().replace(/[^a-z0-9$%]/g, '');

/** Parse word-timed captions: JSON [{w,t0,t1,e?}] (also {word,start,end}), or SRT / VTT cues. */
export function parseCaptions(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const ext = path.extname(file).toLowerCase();
  if (ext === '.json') {
    const j = JSON.parse(raw);
    const arr = Array.isArray(j) ? j : j.words || j.segments?.flatMap((s) => s.words || []) || [];
    return arr.map((o) => ({ w: String(o.w ?? o.word).trim(), t0: Number(o.t0 ?? o.start), t1: Number(o.t1 ?? o.end), e: !!o.e }));
  }
  const ts = (s) => {
    const m = s.trim().replace(',', '.').match(/(?:(\d+):)?(\d+):(\d+\.?\d*)/);
    return m ? (Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3])) : NaN;
  };
  const words = [];
  let prevLines = [], prevEnd = -1;
  for (const block of raw.replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n[ \t]*\n\s*/)) {
    const lines = block.split('\n').filter((l) => l.trim());
    const li = lines.findIndex((l) => l.includes('-->'));
    if (li < 0) continue;
    const [a, b] = lines[li].split('-->');
    const t0 = ts(a), t1 = ts(b.trim().split(/\s+/)[0]);
    if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) continue;
    let body = lines.slice(li + 1).map((l) => l.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
    // rolling captions repeat the previous cue's line(s); keep only the new text
    const fresh = t0 <= prevEnd + 0.05 ? body.filter((l) => !prevLines.includes(l)) : body;
    prevLines = body; prevEnd = t1;
    const toks = fresh.join(' ').split(/\s+/).filter(Boolean);
    const total = toks.reduce((s, x) => s + x.length + 1, 0);
    let cur = t0;
    for (const w of toks) {
      const d = ((w.length + 1) / total) * (t1 - t0);
      words.push({ w, t0: cur, t1: cur + d, e: false });
      cur += d;
    }
  }
  return words;
}

/** Mark emphasis words. opts: { words:[...], numbers:true, every:n (mark every nth long word) }. */
export function markEmphasis(words, opts = {}) {
  const set = new Set((opts.words || []).map(norm));
  words.forEach((w, i) => {
    const n = norm(w.w);
    if (set.has(n)) w.e = true;
    if (opts.numbers && /[0-9]/.test(n) && /[$%0-9]{2,}/.test(n)) w.e = true;
  });
  let k = 0;
  words.forEach((w) => { if (w.e) w.v = k++ % 4 === 3 ? 1 : 0; });
  if (opts.auto) {
    // deterministic keyword picks: long words, at least 4 words apart, never function words
    const stop = new Set(['because', 'between', 'through', 'another', 'something', 'everything', 'anything', 'actually', 'probably']);
    let since = 99;
    words.forEach((w) => {
      since++;
      const n = norm(w.w);
      if (!w.e && n.length >= 7 && !stop.has(n) && since >= (opts.gap ?? 4)) { w.e = true; w.v = k++ % 4 === 3 ? 1 : 0; since = 0; }
      else if (w.e) since = 0;
    });
  }
  return words;
}

/**
 * Edit list from footage spec: { trim:[a,b], cuts:[[s,e],...], zooms:[...] }.
 * All times in specs are SOURCE time. mapT converts to OUTPUT time (null if inside a cut).
 */
export function buildEdl(footage, srcDur) {
  const a = footage.trim?.[0] ?? 0;
  const b = Math.min(footage.trim?.[1] ?? srcDur, srcDur);
  const cuts = (footage.cuts || [])
    .map(([s, e]) => [Math.max(a, s), Math.min(b, e)])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0])
    .reduce((m, c) => {
      const l = m[m.length - 1];
      if (l && c[0] <= l[1]) l[1] = Math.max(l[1], c[1]); else m.push([c[0], c[1]]);
      return m;
    }, []);
  const removed = cuts.reduce((s, [x, y]) => s + (y - x), 0);
  const outDur = b - a - removed;
  const mapT = (t) => {
    if (t < a || t > b) return null;
    let off = 0;
    for (const [s, e] of cuts) {
      if (t >= e) off += e - s;
      else if (t > s) return null;
    }
    return t - a - off;
  };
  // map a start time that falls inside a cut to the cut boundary (so overlays are not lost)
  const mapStart = (t) => {
    let off = 0;
    for (const [s, e] of cuts) {
      if (t >= e) off += e - s;
      else if (t > s) return s - a - off;
    }
    return t - a - off;
  };
  return { a, b, cuts, outDur, mapT, mapStart };
}

/** Zoom events (output time) -> ffmpeg expressions for scale factor z(t). */
export function zoomExpr(zooms) {
  if (!zooms.length) return null;
  const terms = zooms.map((z) => {
    const t0 = z.at.toFixed(3), t1 = (z.at + z.dur).toFixed(3);
    if (z.kind === 'push') {
      const f = z.from ?? 1, to = z.to ?? 1.2;
      return `if(between(t,${t0},${t1}),${(f - 1).toFixed(4)}+(${(to - f).toFixed(4)})*(t-${t0})/${(z.dur).toFixed(3)},0)`;
    }
    return `if(between(t,${t0},${t1}),${((z.scale ?? 1.16) - 1).toFixed(4)},0)`;
  });
  return '1+' + terms.join('+');
}

/** Generate automatic zoom events from style tokens over the output duration. */
export function autoZooms(tokens, outDur) {
  const z = tokens.zoom || {};
  const out = [];
  if (z.pulse) {
    for (let t = z.pulse.every; t < outDur - z.pulse.dur; t += z.pulse.every) out.push({ kind: 'pulse', at: t, dur: z.pulse.dur, scale: z.pulse.scale });
  }
  if (z.push) {
    for (let t = 0; t < outDur; t += z.push.dur * 1.6) out.push({ kind: 'push', at: t, dur: z.push.dur, from: z.push.from, to: z.push.to });
  }
  return out;
}
