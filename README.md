# Video & Carousels

An editorial carousel and short-form video kit. Add your photos and your words; get several finished, on-brand options to choose from.

## Quick start (3 steps)

```bash
npm install
```

1. **Brand:** edit `brand.json` (name, handle, tagline, accent colour).
2. **Inputs:** drop photos into `inbox/` and copy `content.example.json` to `content.json`, then write your hook, points and call to action.
3. **Create:**

```bash
npm run create -- --name my-post
```

You get four options (Cinematic, Luxe headline, Playful note, Typographic) rendered to `output/my-post/options/`, a side-by-side page at `output/my-post/options/index.html`, and a **Standards check** that flags low-res photos, overlong copy and text that had to shrink.

Pick one, which also renders the final PNGs + PDF (add `--video` for a 9:16 reel):

```bash
npm run create -- --name my-post --pick luxe --video
```

Reshuffle which photo lands on which slide with `--seed 2`. No photos yet? Add `--placeholders`. Fine-tune afterwards by editing `projects/my-post/spec.json`.

The rules behind the options are in [`docs/STYLE-GUIDE.md`](docs/STYLE-GUIDE.md). `CLAUDE.md` makes Claude Code follow the same workflow when you ask it to make a post.

---

## Under the hood
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

## Photo-first layouts (editorial / cinematic)

Built from reference carousels: full-bleed photography with type laid over it. Every slide takes `image` (path under `assets/photos/` or your project folder), optional `focus` (e.g. `"50% 20%"`), `shade` (0–1 overlay strength) and `ink` (`light` or `dark` text). They can be mixed with the layouts above in one deck. Try `npm run carousel -- projects/example-photo`.

| layout | look | fields |
|---|---|---|
| `hero` | cinematic title on translucent bars with cursor markers, tracked caps top and bottom | `label`, `title`, `footer`, `pos`, `markers` |
| `feature` | highlighted statement up top, numbered rows with hairlines below | `text`, `items[]` (`{n,title,text}`), `footer` |
| `headline` | luxe serif, roman plus italic, `==highlight==` box, script aside | `kicker`, `title` (`{{smaller line}}`), `body`, `aside`, `tag` |
| `note` | playful: heavy blush caps, handwritten kicker, taped note card, brush arrow | `script`, `title`, `tag`, `tagLine`, `card`, `arrow` |

`spec.brand` sets the bottom label. Run `node src/make-placeholders.mjs` to regenerate the stand-in backgrounds; replace them with your own photos.

## Reels (your footage)

Four reel styles distilled from 12 reference reels: Editorial serif, Kinetic gold italic, How-to typewriter and Beat cards. Give it a vertical clip and a word-timed captions file and it builds one half-resolution option per style:

```bash
npm run reel:create -- --name my-reel --video inbox/clip.mp4 --captions inbox/clip-words.json
npm run reel:create -- --name my-reel --pick tutorial        # full quality
```

No footage yet? `--sample` uses a stand-in clip (`node src/make-sample-footage.mjs` makes it). Details, the spec reference and what is not built yet are in [`docs/REEL-STYLES.md`](docs/REEL-STYLES.md).

## Styles from your Canva designs

Exact colours, sizes and spacing were read from the owner's Canva files (`themes/pop.json`). Fonts are open-source stand-ins, because Canva returns font IDs rather than names.

| layout | look | fields |
|---|---|---|
| `pop` | neon-yellow tight lowercase, script `*accent*`, tinted photo, four-dot pager | `image`, `kicker`, `title`, `body`, `look` (`bw`), `shade`, `panel`, `dots` |
| `notes` | pale-yellow headline cover, then white Notes-app cards | `image`, `kicker`, `lead`, `title`, `cards[]` (`heading`, `body` or `items`), `date` |
| `craft` | kraft paper, heavy black caps, pink marker highlight, dashed arrows | `tag`, `title`, `body`, `deco` |
| `quiet` | off-white page, condensed serif, Share / Save footer | `title`, `body` |

**Video:** `notes` slides animate as a Notes app: each card slides up, the heading highlight wipes in, the body types word by word, then the → arrow taps and fills. Two cards stagger 1.5 s apart. Try `npm run video -- projects/example-notes-video --preview`.

`npm run create` now builds eight options: Cinematic, Luxe, Playful, Neon pop, Founder notes, Craft paper, Quiet minimal and Typographic. Choose a subset with `--styles pop,craft`.

## Changing the look

Photo layouts take colours and fonts from `themes/photo.json`. Typographic layouts use `themes/editorial.json`. All style lives in those files (palette tones, fonts, grain) and `src/layouts.mjs` (layout CSS). Add a tone and use it by name. Fonts are Playfair Display and Inter, installed through npm.

## Roadmap

- Footage clips as scene backgrounds, with trims and B-roll
- Auto-captions (word-timed) from a voiceover
- More themes (bold/kinetic) and a layout for side-by-side comparisons
- Brand profiles per client (MOXIEMO, Studio SB, …)
