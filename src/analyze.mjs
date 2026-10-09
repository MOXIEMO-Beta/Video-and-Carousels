import { execFileSync } from 'node:child_process';

/** Cheap photo analysis via ffmpeg: size + brightness of top / middle / bottom bands (0..1). */
export function analyzeImage(file) {
  const probe = JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', file]).toString(),
  ).streams[0];
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-vf', 'scale=16:16:flags=area,format=gray', '-frames:v', '1', '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 20 },
  );
  const band = (from, to) => {
    let s = 0, n = 0;
    for (let y = from; y < to; y++) for (let x = 0; x < 16; x++) { s += raw[y * 16 + x]; n++; }
    return s / n / 255;
  };
  const top = band(0, 6), mid = band(5, 11), bottom = band(10, 16);
  return { width: probe.width, height: probe.height, top, mid, bottom, avg: (top + mid + bottom) / 3 };
}
