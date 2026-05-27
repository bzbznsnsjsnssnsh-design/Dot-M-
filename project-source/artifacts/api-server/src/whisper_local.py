#!/usr/bin/env python3
"""
Advanced audio transcription pipeline:
  Audio Input -> VAD -> faster-whisper -> Post-processing -> Output

Usage:
  python3 whisper_local.py <audio_file> [model_size]          # plain text output
  python3 whisper_local.py <audio_file> [model_size] --json   # JSON [{start,end,text}]

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


def transcribe(audio_path: str, model_size: str = "small", return_json: bool = False):
    from faster_whisper import WhisperModel

    file_size = os.path.getsize(audio_path)
    print(f"[pipeline] start model={model_size} size={file_size}B", file=sys.stderr)

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
            beam_size=5,
            best_of=5,
            language=None,  # auto-detect language
            condition_on_previous_text=True,
            word_timestamps=True,
            no_speech_threshold=0.7,
            log_prob_threshold=-1.2,
            compression_ratio_threshold=2.8,
            vad_filter=use_vad,
            vad_parameters={
                "min_silence_duration_ms": 200,
                "speech_pad_ms": 400,
                "threshold": threshold,
            } if use_vad else {},
        )
        return list(segs), inf

    # First attempt: VAD enabled with lower threshold (catches quiet speech)
    segments_list, info = run_transcription(use_vad=True, threshold=0.20)

    # Fallback 1: even lower threshold if too few results
    if len(segments_list) == 0:
        print("[pipeline] retry with threshold=0.10", file=sys.stderr)
        segments_list, info = run_transcription(use_vad=True, threshold=0.10)

    # Fallback 2: no VAD at all
    if len(segments_list) == 0:
        print("[pipeline] retry without VAD", file=sys.stderr)
        segments_list, info = run_transcription(use_vad=False)

    print(
        f"[pipeline] lang={info.language} prob={info.language_probability:.2f}",
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
                    "word": w.word.strip(),
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                })

        sentences.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": cleaned,
            "words": words_list,
        })
        all_texts.append(cleaned)

    print(
        f"[pipeline] done segs={len(sentences)} words={total_words}",
        file=sys.stderr,
    )

    if return_json:
        return sentences

    result = " ".join(all_texts)
    result = re.sub(r"\s+", " ", result).strip()
    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: whisper_local.py <audio_file> [model_size] [--json]", file=sys.stderr)
        sys.exit(1)

    audio_file = sys.argv[1]
    model_size = "small"
    use_json = False

    for arg in sys.argv[2:]:
        if arg == "--json":
            use_json = True
        elif not arg.startswith("-"):
            model_size = arg

    if not os.path.exists(audio_file):
        print(f"File not found: {audio_file}", file=sys.stderr)
        sys.exit(1)

    result = transcribe(audio_file, model_size, return_json=use_json)

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
