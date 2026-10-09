# Working in this repo

This is a spec-driven carousel and video kit. Read `README.md` for commands and `docs/STYLE-GUIDE.md` for the standard.

## When asked to make a carousel or video
1. Check `brand.json` (name, handle, colours). If it still says "Your Studio", ask for the real brand before finishing.
2. Look in `inbox/` for photos. Put the user's words in `content.json` (copy `content.example.json`): `topic`, `hook`, `intro`, `points[]`, `cta`.
3. Run `npm run create -- --name <slug>`. This builds every style option, prints a Standards check and writes `output/<slug>/options/index.html` to compare.
4. Show the user the options (read a few PNGs from `output/<slug>/options/<style>/`). Fix every warning before presenting: shorten copy, don't shrink text.
5. When they choose: `npm run create -- --name <slug> --pick <style>` (add `--video` for a 9:16 reel). Further edits go in `projects/<slug>/spec.json`, then `npm run carousel -- projects/<slug>` or `npm run video -- projects/<slug>`.

## When asked to make a reel (video from footage)
1. Footage goes in `inbox/` (vertical .mp4). Captions: a word-timed `words.json`, `.srt` or `.vtt` next to it (`--captions`). If they have none, tell them the options (export from their editor, or `npm run transcribe` once the speech-model host is allowed). Never invent a transcript.
2. `content.json` as for carousels, plus optional `points[].proof` (card rows), `points[].at` (seconds) and `cta.keyword`.
3. `npm run reel:create -- --name <slug> --video inbox/<clip>.mp4`. Read the Standards check, look at the option posters/frames, then `--pick <style>`.
4. Style rules and the spec reference live in `docs/REEL-STYLES.md`. Tokens are in `styles/reel/*.json`; change those, not per-reel values.

## Rules
- Follow the style guide. Don't invent new colours or fonts per post; change `brand.json` or `themes/*.json`.
- Never publish or commit a user's photos unless asked. `inbox/` is git-ignored on purpose.
- Use `--preview` while iterating on video; render full quality only at the end.
- New layouts go in `src/layouts.mjs` (typographic) or `src/photo.mjs` (photo-first) and must be added to the README table.
