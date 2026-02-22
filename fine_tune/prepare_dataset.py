"""Prepare arXiv dataset for fine-tuning llama3.1:8b on CS/AI papers.

Input:  arxiv-metadata-oai-snapshot.json  (newline-delimited JSON, ~4M entries)
        Download from: https://www.kaggle.com/datasets/Cornell-University/arxiv

Output: fine_tune/train.jsonl  (8 000 samples)
        fine_tune/val.jsonl    (1 000 samples — changed from 1000 to match README)

Usage:
    python fine_tune/prepare_dataset.py [path/to/arxiv-metadata-oai-snapshot.json]
"""

from __future__ import annotations

import json
import os
import random
import re
import sys

# ── Config ──────────────────────────────────────────────────────────────────
SNAPSHOT_PATH = (
    sys.argv[1]
    if len(sys.argv) > 1
    else "arxiv-metadata-oai-snapshot.json"
)
OUT_DIR = os.path.join(os.path.dirname(__file__))
TRAIN_PATH = os.path.join(OUT_DIR, "train.jsonl")
VAL_PATH = os.path.join(OUT_DIR, "val.jsonl")

TARGET_CATEGORIES = ("cs.", "stat.ML")
MIN_ABSTRACT_CHARS = 100
MAX_SAMPLES = 10_000
TRAIN_SIZE = 9_000
RANDOM_SEED = 42


def _clean(text: str) -> str:
    """Normalize whitespace and remove LaTeX line-break artifacts."""
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _is_target(entry: dict) -> bool:
    cats = entry.get("categories", "")
    return any(t in cats for t in TARGET_CATEGORIES)


def _build_sample(entry: dict) -> dict:
    title = _clean(entry.get("title", ""))
    abstract = _clean(entry.get("abstract", ""))
    prompt = (
        "Analyze this research paper abstract and explain it clearly:\n\n"
        + abstract
    )
    response = f"{title} - {abstract}"
    return {"prompt": prompt, "response": response}


def main() -> None:
    if not os.path.exists(SNAPSHOT_PATH):
        print(f"[ERROR] Snapshot not found: {SNAPSHOT_PATH}")
        print("  Download from https://www.kaggle.com/datasets/Cornell-University/arxiv")
        sys.exit(1)

    print(f"[1/4] Scanning {SNAPSHOT_PATH} …")
    candidates: list[dict] = []
    total_lines = 0

    with open(SNAPSHOT_PATH, "r", encoding="utf-8") as fh:
        for line in fh:
            total_lines += 1
            if total_lines % 500_000 == 0:
                print(f"      … {total_lines:,} lines scanned, {len(candidates):,} candidates so far")
            line = line.strip()
            if not line:
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue

            if not _is_target(entry):
                continue
            abstract = _clean(entry.get("abstract", ""))
            if len(abstract) < MIN_ABSTRACT_CHARS:
                continue
            candidates.append(entry)

    print(f"[2/4] Found {len(candidates):,} candidate papers from {total_lines:,} total lines.")

    print(f"[3/4] Sampling up to {MAX_SAMPLES:,} entries …")
    random.seed(RANDOM_SEED)
    random.shuffle(candidates)
    selected = candidates[:MAX_SAMPLES]
    samples = [_build_sample(e) for e in selected]

    train_samples = samples[:TRAIN_SIZE]
    val_samples = samples[TRAIN_SIZE:]

    print(f"[4/4] Writing output files …")
    with open(TRAIN_PATH, "w", encoding="utf-8") as fh:
        for s in train_samples:
            fh.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"      train → {TRAIN_PATH}  ({len(train_samples):,} lines)")

    with open(VAL_PATH, "w", encoding="utf-8") as fh:
        for s in val_samples:
            fh.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"      val   → {VAL_PATH}  ({len(val_samples):,} lines)")

    print("\nDone. Next step: python fine_tune/finetune.py")


if __name__ == "__main__":
    main()
