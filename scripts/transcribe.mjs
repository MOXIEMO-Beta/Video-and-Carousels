#!/usr/bin/env node
/**
 * Word-timed transcript for a video, offline. Writes <video>-words.json ([{w,t0,t1}]) for the reel templates.
 *
 *   npm run transcribe:setup                      one-time: fetch the model + runtime (see below)
 *   npm run transcribe -- inbox/clip.mp4          -> inbox/clip-words.json
 *   npm run transcribe -- inbox/clip.mp4 --model whisper-base
 *
 * Runs Whisper through @huggingface/transformers with a LOCAL model folder and remote models switched off,
 * so it never reaches for huggingface.co. Models live in models/asr/Xenova/<name>/.
 *
 * Where the model comes from (setup): the public Xenova/whisper-* ONNX conversions, republished on npm as
 * "sts-whisper-<size>" (a third-party mirror, Apache-2.0; no install scripts, data files only). If you can reach
 * huggingface.co you may prefer the original: put Xenova/whisper-<size> into models/asr/ yourself.
 * Sizes: tiny (fastest, roughest), base, small (default; best of the three for accents and fast speech).
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT } from '../src/core.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const MODELS = path.join(ROOT, 'models/asr');

// ---------- setup ----------
if (argv[0] === 'setup') {
  const size = opt('--model', 'small').replace(/^whisper-/, '');
  const pkg = `sts-whisper-${size}`;
  const info = await (await fetch(`https://registry.npmjs.org/${pkg}/latest`)).json();
  if (!info.dist?.tarball) throw new Error(`Package ${pkg} not found on npm.`);
  if (info.scripts && Object.keys(info.scripts).length) throw new Error(`${pkg} declares install scripts; refusing.`);
  console.log(`Fetching ${pkg}@${info.version} (${Math.round(info.dist.unpackedSize / 1e6)} MB unpacked)...`);
  const tmp = fs.mkdtempSync(path.join(ROOT, 'models', '.dl-')) ;
  const tgz = path.join(tmp, 'm.tgz');
  fs.writeFileSync(tgz, Buffer.from(await (await fetch(info.dist.tarball)).arrayBuffer()));
  fs.mkdirSync(MODELS, { recursive: true });
  const r = spawnSync('tar', ['-xzf', tgz, '-C', MODELS, '--strip-components=2', 'package/models'], { stdio: 'inherit' });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.status) process.exit(r.status);
  console.log(`✓ model in models/asr/Xenova/whisper-${size}`);
  console.log('Runtime: run  npm install --no-save @huggingface/transformers  if you have not already.');
  process.exit(0);
}

// ---------- transcribe ----------
const video = argv.find((a) => !a.startsWith('--') && a !== opt('--model') && a !== opt('--out'));
if (!video) { console.error('Usage: npm run transcribe -- <video> [--model small|base|tiny] [--out words.json]'); process.exit(1); }
const size = opt('--model', 'small').replace(/^whisper-/, '');
const modelDir = path.join(MODELS, 'Xenova', `whisper-${size}`);
if (!fs.existsSync(path.join(modelDir, 'onnx'))) {
  console.error(`Model not found: models/asr/Xenova/whisper-${size}\nRun:  npm run transcribe:setup -- --model ${size}`);
  process.exit(1);
}
let transformers;
try { transformers = await import('@huggingface/transformers'); }
catch { console.error('Runtime missing. Run:  npm install --no-save @huggingface/transformers'); process.exit(1); }
const { pipeline, env } = transformers;
env.allowRemoteModels = false; // offline: never reach for the network
env.localModelPath = MODELS;

const pcm = spawnSync('ffmpeg', ['-v', 'error', '-i', path.resolve(video), '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
if (pcm.status) { console.error(pcm.stderr.toString()); process.exit(1); }
const audio = new Float32Array(pcm.stdout.buffer.slice(pcm.stdout.byteOffset, pcm.stdout.byteOffset + pcm.stdout.byteLength));
console.error(`audio: ${(audio.length / 16000).toFixed(1)} s, model: whisper-${size} (CPU, this takes a few minutes)`);

const asr = await pipeline('automatic-speech-recognition', `Xenova/whisper-${size}`, { dtype: 'q8', device: 'cpu' });
const out = await asr(audio, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5, language: opt('--language', 'english'), task: 'transcribe' });

const words = (out.chunks || [])
  .map((c) => ({ w: String(c.text).trim(), t0: +(c.timestamp[0] ?? 0).toFixed(3), t1: +(c.timestamp[1] ?? c.timestamp[0] ?? 0).toFixed(3) }))
  .filter((w) => w.w);
// whisper leaves the last word open-ended: give it a sensible length
words.forEach((w, i) => { if (!(w.t1 > w.t0)) w.t1 = +(Math.min(w.t0 + 0.4, words[i + 1]?.t0 ?? w.t0 + 0.4)).toFixed(3); });
const dest = opt('--out', video.replace(/\.[^.]+$/, '') + '-words.json');
fs.writeFileSync(dest, JSON.stringify(words, null, 1));
console.log(`✓ ${words.length} words → ${dest}`);
console.log('Check it: Whisper can mishear names and jargon. Fix any wrong words in the JSON before rendering.');
