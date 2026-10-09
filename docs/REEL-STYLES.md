# Reel styles

Four editing styles, distilled from 12 reference reels (720x1280, 30 fps, 52-172 s). A first pass described each reel from frame sheets and cut detection; a second pass tried to refute every claim. Where the second pass disagreed, the corrected version is what is written here.

## What every reel shares (the signature)

- **One speaker, one take.** Talking head, handheld or tripod, in a lived-in room, usually holding a mic prop. The edit comes from overlays, not camera work.
- **Word-timed captions the whole way through.** One word (or a short phrase) at a time, hard swap, on a fixed lane, with a soft shadow and no box. Transcript punctuation is kept. Pauses are trimmed (almost no silence over 0.4 s).
- **Hard pops, not fades.** Cards, stickers and labels appear and disappear in one frame. Typewriter reveal (30-45 characters per second) is the standard text entrance.
- **Layout contract.** Titles in the top band (about 11-28% down), captions mid-frame (about 40-60%), proof cards in the lower band (about 55-88%). Captions are always the top layer.
- **Serif + sans + handwriting.** White text as the base, one or two accent hues (butter or lemon yellow most often, pink or lavender in a few).
- **Proof early.** Numbers, profile cards or screenshots within the first 6-8 s, then again as evidence.
- **No end card, logo or progress bar.** Endings are a hard stop, often after a "Comment KEYWORD" call to action.
- **Natural phone grade.** Warm, soft, low-to-mid contrast, no LUT. The speaker's clothing is the main colour block.

## The four families

| id | name | members | best for |
|---|---|---|---|
| `editorial` | Editorial serif + proof cards | 4 reels, 98-172 s | Results stories, launch breakdowns, myth-busting, case studies |
| `kinetic` | Bold sans + gold italic emphasis | 3 reels, 64-104 s | Story-plus-framework reels: claim hook, three steps, keyword CTA |
| `tutorial` | How-to with typewriter titles | 3 reels, 64-82 s | "How I do X" walkthroughs and numbered tips |
| `beatcards` | Fast montage + beat cards | 2 reels, 52-55 s | Punchy listicles with lots of b-roll. **Low confidence**: the two source reels share little |

Exact tokens (fonts, colours, sizes, caption anchors, zoom cadence) are in `styles/reel/<id>.json`.

### Corrections found by the second pass (so you don't re-learn them)

- Punch-ins exist: one editorial reel snaps to ~1.16x for 1.4-2 s every 6-9 s. Others are locked off.
- Titles are not always typed. Editorial hook titles are fully visible on frame 0; only sub-lines and chapter headers type.
- Caption emphasis exists: ~25% of words in the kinetic reels are gold italic serif; one editorial reel tints ~1/3 of words cream.
- Captions are not strictly one word. The kinetic family builds cumulative stacks that clear; the beatcards family uses 1-5 word phrases.
- White captions become illegible over white cards in the originals. The engine flips captions to dark whenever a light card covers the caption anchor.
- Undetected jump cuts and pose resets are common on static footage, so a low scene-cut count does not mean "no cuts".
- Back halves are quieter: 13-19 s caption-only stretches. Graphics are front- and mid-loaded.

## Building a reel

```bash
npm run reel:create -- --name my-reel --video inbox/clip.mp4 --captions inbox/clip-words.json
```

This reads `content.json` (hook, intro, points, cta), trims pauses, finds each point in the transcript (or spaces them evenly; add `"at": seconds` to pin), builds one half-resolution option per style and a comparison page at `output/my-reel/reel-options/index.html`. Finalise with `--pick <style>`, which renders full quality and writes `projects/my-reel/reel/spec.json` to edit by hand (`npm run reel -- projects/my-reel/reel`).

Captions: any of `words.json` (`[{w,t0,t1}]`), `.srt`, `.vtt`. To transcribe locally: `pip install faster-whisper && npm run transcribe -- inbox/clip.mp4` (downloads a speech model from huggingface.co on first use).

## Spec

```jsonc
{
  "style": "tutorial",                      // editorial | kinetic | tutorial | beatcards
  "footage": { "src": "inbox/clip.mp4",
               "trim": [0, 80], "cuts": [[14.0, 14.6]],      // SOURCE seconds
               "zooms": "auto",                              // or [{ "at": 7, "dur": 1.6, "scale": 1.16 }] / { "kind": "push", "from": 1, "to": 1.2 }
               "focus": [0.5, 0.38] },                       // zoom centre
  "captions": { "src": "inbox/clip-words.json", "numbers": true, "auto": true,
                "words": ["launch"], "style": { "mode": "stack" } },
  "timeline": [ { "type": "title", "at": 0, "dur": 6, "lines": ["how I got my first", "10K followers"], "sub": "in under 3 months" } ]
}
```

All times are source time. Cuts and zooms are applied to the footage; every overlay and caption is mapped through the edit list.

| type | what it is | main fields |
|---|---|---|
| `title` | Hook title in the top band, typed or static, optional per-line highlight boxes | `lines`, `sub`, `entrance` (`type`/`none`/`fade`), `boxes`, `y` |
| `section` | Numbered section header ("01. credibility hook") | `num`, `lines` |
| `label` | Free text, handwriting by default | `text`, `x`, `y`, `font`, `size`, `rotate`, `boxes` |
| `card` | White document / proof card | `heading`, `rows`, `text`, `image`, `style` (`dark`), `x`, `y`, `w` |
| `box` | Small label box with a bold lead-in | `lead`, `text`, `x`, `y`, `w` |
| `sticker` | Emoji sticker | `emoji`, `x`, `y`, `size`, `rotate` |
| `image` | Screenshot or meme, optionally tilted | `src`, `x`, `y`, `w`, `rotate` |
| `hero` | Huge stacked words, accent line in gold italic | `lines`, `size`, `y` |
| `cta` | "Comment KEYWORD" lock-up | `lead`, `keyword`, `after` |
| `beat` | Full-frame colour card showing one word at a time | `words`, `per`, `color`, `emphasis` |
| `checklist` | Items typed in one after another | `items`, `stagger` |
| `count` | Number counting up | `from`, `to`, `prefix`, `suffix` |
| `clip` | Second video (screen recording, b-roll) composited on top | `src`, `x`, `y`, `w`, `start`, `dur` |

## Not built (yet)

- **Person-matte compositing** (text behind the head, keyed host over a mosaic). The reference reels use it; it needs a segmentation model that the sandbox cannot download.
- **Auto-captions out of the box.** Needs the speech model host allowed (see above), or your own captions file.
- **Rounded or masked `clip` insets**, and keyed circular cut-outs.
