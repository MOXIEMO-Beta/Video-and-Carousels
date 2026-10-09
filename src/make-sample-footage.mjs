#!/usr/bin/env node
// Generates a stand-in "talking head" clip (moving backdrop, a head-and-shoulders shape, a tone as audio)
// plus a matching word-timed transcript, so the reel templates can be tried without your own footage.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from './core.mjs';

const out = path.join(ROOT, 'assets/footage');
fs.mkdirSync(out, { recursive: true });
const dur = 36;
const filter = [
  `color=c=0x9a8f80:s=720x1280:d=${dur}:r=30[bg]`,
  `color=c=0xb9ad9b:s=720x1280:d=${dur}:r=30,geq=lum='lum(X,Y)*(0.82+0.18*sin(2*PI*(X/720+T/9)))':cb=128:cr=128[wall]`,
  `[bg][wall]blend=all_mode=average[room]`,
  `[room]drawbox=x=170:y=720:w=380:h=560:color=0x7d4a5c@1:t=fill,drawbox=x=300:y=610:w=120:h=130:color=0xc79b82@1:t=fill[body]`,
  `[body]drawbox=x=250:y=400:w=220:h=250:color=0xd9b79c@1:t=fill,drawbox=x=250:y=360:w=220:h=90:color=0x3a2a22@1:t=fill[v]`,
].join(';');
const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-filter_complex', filter, '-f', 'lavfi', '-i', `sine=frequency=180:duration=${dur}`,
  '-map', '[v]', '-map', '0:a', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-c:a', 'aac', '-shortest', path.join(out, 'sample.mp4')], { encoding: 'utf8' });
if (r.status) { console.error(r.stderr); process.exit(1); }

const script = `so I passed ten thousand followers in under three months and here is exactly how I did it
number one build a credibility hook people trust you in the first five seconds
I made over $700,000 in just three weeks from a sixty seven dollar product
number two create unselfish content that helps the viewer first
number three make a signature series people come back for every week
if you want the full workflow comment LAUNCH and I will send it to you`;
const toks = script.split(/\s+/);
let t = 0.2;
const words = toks.map((w) => {
  const d = 0.22 + Math.min(0.28, w.length * 0.03);
  const o = { w, t0: +t.toFixed(3), t1: +(t + d).toFixed(3) };
  t += d + (/^(hook|seconds|product|first|week|you|it)$/.test(w) ? 0.22 : 0.02);
  return o;
});
fs.writeFileSync(path.join(out, 'sample-words.json'), JSON.stringify(words, null, 1));
console.log(`✓ assets/footage/sample.mp4 (${dur}s) and sample-words.json (${words.length} words, ends ${t.toFixed(1)}s)`);
