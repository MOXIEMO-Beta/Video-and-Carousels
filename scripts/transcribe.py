#!/usr/bin/env python3
"""Word-timed transcript for a video, written as words.json ([{w,t0,t1}]) for the reel templates.

    pip install faster-whisper
    python3 scripts/transcribe.py inbox/clip.mp4            -> inbox/clip-words.json
    python3 scripts/transcribe.py inbox/clip.mp4 --model small.en

The first run downloads the speech model from huggingface.co (a few hundred MB for `small`).
If that host is blocked, either allow it, or pass --model <local folder> with a model you downloaded elsewhere,
or skip this step and supply words.json / .srt / .vtt exported from CapCut, Descript, Premiere etc.
"""
import argparse, json, os, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("--model", default="small.en", help="model name or a local model folder")
    ap.add_argument("--out")
    ap.add_argument("--language", default="en")
    a = ap.parse_args()
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        sys.exit("faster-whisper is not installed. Run: pip install faster-whisper")
    try:
        model = WhisperModel(a.model, device="cpu", compute_type="int8")
    except Exception as e:  # network / model-host errors land here
        sys.exit(
            "Could not load the speech model '%s'.\n  %s\n"
            "If huggingface.co is blocked, allow it in the environment's network settings, or download a model "
            "elsewhere and pass --model <folder>. You can also export captions (.srt/.vtt/.json) from your editor."
            % (a.model, str(e).splitlines()[0][:200])
        )
    segs, _ = model.transcribe(a.video, word_timestamps=True, language=a.language, vad_filter=True)
    words = []
    for s in segs:
        for w in s.words or []:
            words.append({"w": w.word.strip(), "t0": round(w.start, 3), "t1": round(w.end, 3)})
    out = a.out or os.path.splitext(a.video)[0] + "-words.json"
    json.dump(words, open(out, "w"), indent=1)
    print("wrote %s (%d words)" % (out, len(words)))


if __name__ == "__main__":
    main()
