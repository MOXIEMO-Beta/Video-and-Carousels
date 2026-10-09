# Video & Carousels

Spec-driven editorial carousels and short-form video. Write one `spec.json`, get:

- **Carousel**: `slide-01.png …` (1080×1350, 4:5) plus a single PDF for LinkedIn document posts
- **Video**: a 1080×1920 MP4 for Reels, TikTok and Shorts. The same slides are animated (word-by-word reveals, slow zoom on photos, progress bar, fade between scenes)

## Quick start

```bash
npm install
npm run carousel -- projects/example-carousel          # PNGs + PDF -> output/<project>/carousel
npm run video    -- projects/example-carousel          # MP4         -> output/<project>/video
npm run video    -- projects/example-carousel --preview  # fast half-res draft
```

To make a new piece, copy `projects/example-carousel` to `projects/<name>` and edit `spec.json`.

## Spec reference

```jsonc
{
  "handle": "@yourhandle",
  "label": "Series name",         // shown top right beside 01 / 06
  "tone": "paper",                // default tone: paper | ink | clay | sage
  "format": "carousel",           // carousel (4:5) | square | story (9:16)
  "video": { "format": "story", "fps": 30, "music": "assets/audio/track.mp3" },
  "slides": [ { "layout": "cover", "title": "Stop posting. Start *publishing.*" } ]
}
```

Text markup: `*italic accent*`, `**bold**`, `\n` for a line break.

| layout | fields |
|---|---|
| `cover` | `kicker`, `title`, `subtitle` |
| `statement` | `kicker`, `title`, `body` |
| `list` | `kicker`, `title`, `items[]` |
| `quote` | `quote`, `author` |
| `stat` | `kicker`, `stat`, `label`, `body` |
| `image` | `image` (path), `kicker`, `title`, `subtitle` (full-bleed photo) |
| `cta` | `kicker`, `title`, `body`, `button`, `button2` |

Every slide also accepts `tone`, `footer`, and (video) `duration` in seconds. If `duration` is omitted it is derived from reading time. Image paths resolve relative to the project, the repo root, then `assets/`.

## Changing the look

All style lives in `themes/editorial.json` (palette tones, fonts, grain) and `src/layouts.mjs` (layout CSS). Add a tone and use it by name. Fonts are Playfair Display and Inter, installed through npm.

## Roadmap

- Footage clips as scene backgrounds, with trims and B-roll
- Auto-captions (word-timed) from a voiceover
- More themes (bold/kinetic) and a layout for side-by-side comparisons
- Brand profiles per client (MOXIEMO, Studio SB, …)
