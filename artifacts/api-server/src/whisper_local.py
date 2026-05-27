#!/usr/bin/env python3
"""
Advanced audio transcription pipeline:
  Audio Input -> VAD -> faster-whisper small (int8, beam=3) -> WhisperX Alignment -> Output

Usage:
  python3 whisper_local.py <audio_file> [--lang XX] [--json]

  --json       : Output JSON list of [{start, end, text, words}]
  --lang XX    : ISO language code (e.g. ar, en, fr, es). Omit for auto-detect.

Exit codes: 0=ok, 2=no speech
"""
import sys
import os
import re
import json
import warnings
warnings.filterwarnings("ignore")


FILLER_WORDS = {
    "uh", "um", "hmm", "hm",
}


def post_process(text: str) -> str:
    words = text.split()
    cleaned = []
    for w in words:
        stripped = w.strip(".,!?;:-").lower()
        if stripped not in FILLER_WORDS:
            cleaned.append(w)
    result = " ".join(cleaned)
    result = re.sub(r"\[.*?\]", "", result)
    result = re.sub(r"\(.*?\)", "", result)
    result = re.sub(r"\s+", " ", result)
    return result.strip()


def align_with_whisperx(segments_data: list, audio_path: str, language: str) -> list:
    """
    Run WhisperX forced alignment for more precise word-level timestamps.
    Falls back silently to faster-whisper results if WhisperX is unavailable.

    Benefits:
    - More accurate word start/end times
    - Better sentence boundary detection
    - More stable sync in long videos
    """
    try:
        import whisperx

        print("[pipeline] WhisperX alignment starting...", file=sys.stderr)
        audio = whisperx.load_audio(audio_path)

        wx_segs = [
            {
                "text":  s["text"],
                "start": s["start"],
                "end":   s["end"],
                "words": s.get("words", []),
            }
            for s in segments_data
        ]

        model_a, metadata = whisperx.load_align_model(
            language_code=language or "en",
            device="cpu",
        )
        result = whisperx.align(
            wx_segs, model_a, metadata, audio, "cpu",
            return_char_alignments=False,
        )

        aligned_segs = result.get("segments", [])
        for orig, aligned in zip(segments_data, aligned_segs):
            raw_words = aligned.get("words") or []
            good_words = [w for w in raw_words if "start" in w and "end" in w]
            if good_words:
                orig["words"] = [
                    {
                        "word":  w["word"],
                        "start": round(w["start"], 3),
                        "end":   round(w["end"],   3),
                    }
                    for w in good_words
                ]
                orig["start"] = good_words[0]["start"]
                orig["end"]   = good_words[-1]["end"]

        print(
            f"[pipeline] WhisperX alignment done ({len(aligned_segs)} segs)",
            file=sys.stderr,
        )
        return segments_data

    except ImportError:
        print("[pipeline] whisperx not installed — skipping alignment (faster-whisper timestamps used)", file=sys.stderr)
        return segments_data
    except Exception as exc:
        print(f"[pipeline] WhisperX alignment failed ({exc}) — using faster-whisper timestamps", file=sys.stderr)
        return segments_data


def transcribe(audio_path: str, model_size: str = "small", language: str | None = None, return_json: bool = False):
    from faster_whisper import WhisperModel

    file_size = os.path.getsize(audio_path)
    lang_label = language if language else "auto-detect"
    print(f"[pipeline] start model={model_size} lang={lang_label} size={file_size}B", file=sys.stderr)

    model = WhisperModel(
        model_size,
        device="cpu",
        compute_type="int8",
        download_root=os.path.expanduser("~/.cache/whisper"),
    )

    print("[pipeline] model loaded — VAD + transcribing...", file=sys.stderr)

    def run_transcription(use_vad: bool, threshold: float = 0.20):
        segs, inf = model.transcribe(
            audio_path,
            # ── Core settings per spec ──────────────────────────────────
            beam_size=3,                         # was 5 — reduced for speed + less hallucination
            condition_on_previous_text=False,    # was True  — reduces context-based hallucinations
            word_timestamps=True,
            language=language,                   # None = auto-detect; else use provided lang code
            # ── Quality thresholds ────────────────────────────────────
            no_speech_threshold=0.7,
            log_prob_threshold=-1.2,
            compression_ratio_threshold=2.8,
            # ── VAD: removes silence & noise before transcription ─────
            vad_filter=use_vad,
            vad_parameters={
                "min_silence_duration_ms": 200,
                "speech_pad_ms": 400,
                "threshold": threshold,
            } if use_vad else {},
        )
        return list(segs), inf

    # First attempt: VAD enabled (removes silence & noise)
    segments_list, info = run_transcription(use_vad=True, threshold=0.20)

    # Fallback 1: lower VAD threshold if too few results (quiet speech)
    if len(segments_list) == 0:
        print("[pipeline] retry with VAD threshold=0.10", file=sys.stderr)
        segments_list, info = run_transcription(use_vad=True, threshold=0.10)

    # Fallback 2: no VAD at all
    if len(segments_list) == 0:
        print("[pipeline] retry without VAD", file=sys.stderr)
        segments_list, info = run_transcription(use_vad=False)

    detected_lang = info.language
    print(
        f"[pipeline] detected lang={detected_lang} prob={info.language_probability:.2f}",
        file=sys.stderr,
    )

    sentences = []
    all_texts = []
    total_words = 0

    for seg in segments_list:
        raw = seg.text.strip()
        if not raw:
            continue

        cleaned = post_process(raw)
        if not cleaned:
            continue

        word_count = len(seg.words) if seg.words else 0
        total_words += word_count
        print(
            f"[pipeline] [{seg.start:.1f}-{seg.end:.1f}] words={word_count} | {cleaned[:60]}",
            file=sys.stderr,
        )

        words_list = []
        if seg.words:
            for w in seg.words:
                words_list.append({
                    "word":  w.word.strip(),
                    "start": round(w.start, 3),
                    "end":   round(w.end,   3),
                })

        sentences.append({
            "start": round(seg.start, 3),
            "end":   round(seg.end,   3),
            "text":  cleaned,
            "words": words_list,
        })
        all_texts.append(cleaned)

    print(
        f"[pipeline] faster-whisper done segs={len(sentences)} words={total_words}",
        file=sys.stderr,
    )

    # ── WhisperX Alignment ────────────────────────────────────────────────────
    # Improves word/sentence timestamps after faster-whisper.
    # If whisperx is not installed or fails, original timestamps are kept.
    if sentences and return_json:
        sentences = align_with_whisperx(sentences, audio_path, detected_lang)

    if return_json:
        return sentences

    result = " ".join(all_texts)
    result = re.sub(r"\s+", " ", result).strip()
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: whisper_local.py <audio_file> [--lang XX] [--json]", file=sys.stderr)
        sys.exit(1)

    audio_file = sys.argv[1]
    model_size = "small"
    use_json   = False
    language   = None

    args = sys.argv[2:]
    i = 0
    while i < len(args):
        arg = args[i]
        if arg == "--json":
            use_json = True
        elif arg == "--lang" and i + 1 < len(args):
            language = args[i + 1]
            i += 1
        elif not arg.startswith("-"):
            model_size = arg
        i += 1

    if not os.path.exists(audio_file):
        print(f"File not found: {audio_file}", file=sys.stderr)
        sys.exit(1)

    result = transcribe(audio_file, model_size, language=language, return_json=use_json)

    if use_json:
        if result:
            print(json.dumps(result, ensure_ascii=False), end="")
        else:
            print("[]", end="")
            sys.exit(2)
    else:
        if result:
            print(result, end="")
        else:
            print("[no speech detected]", end="")
            sys.exit(2)
