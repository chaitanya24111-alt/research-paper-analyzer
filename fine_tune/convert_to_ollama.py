"""Convert the fine-tuned LoRA model to GGUF and register it with Ollama.

Prerequisites:
  1. Training complete — fine_tune/output/ must exist
  2. llama.cpp cloned alongside this repo:
       git clone https://github.com/ggerganov/llama.cpp  (at repo root level)
  3. Ollama installed and running (ollama serve)

Usage:
    python fine_tune/convert_to_ollama.py
"""

from __future__ import annotations

import os
import subprocess
import sys

# ── Config ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SCRIPT_DIR)

OUTPUT_DIR = os.path.join(SCRIPT_DIR, "output")
GGUF_PATH = os.path.join(OUTPUT_DIR, "model.gguf")
MODELFILE_PATH = os.path.join(SCRIPT_DIR, "Modelfile.finetuned")
OLLAMA_MODEL_NAME = "research-analyzer-finetuned"

# Path to llama.cpp repo (cloned at repo root level)
LLAMA_CPP_DIR = os.path.join(REPO_ROOT, "llama.cpp")
CONVERT_SCRIPT = os.path.join(LLAMA_CPP_DIR, "convert_hf_to_gguf.py")

MODELFILE_CONTENT = """\
FROM {gguf_path}

SYSTEM \"\"\"You are an expert academic research assistant specializing in computer science \\
and AI papers. You help researchers understand complex papers clearly and concisely. \\
When given an abstract or paper excerpt, you:
- Explain the core contribution in plain English
- Identify the methodology used
- Highlight key findings and their significance
- Note limitations when apparent\"\"\"

PARAMETER temperature 0.3
PARAMETER top_p 0.9
PARAMETER num_ctx 4096
PARAMETER stop "<|end_of_text|>"
PARAMETER stop "<|eot_id|>"
"""


def _check_prerequisites() -> None:
    errors = []

    if not os.path.isdir(OUTPUT_DIR):
        errors.append(
            f"  ✗ Output dir not found: {OUTPUT_DIR}\n"
            "    Run python fine_tune/finetune.py first."
        )
    if not os.path.isdir(LLAMA_CPP_DIR):
        errors.append(
            f"  ✗ llama.cpp not found at: {LLAMA_CPP_DIR}\n"
            "    Run: git clone https://github.com/ggerganov/llama.cpp"
        )
    elif not os.path.isfile(CONVERT_SCRIPT):
        errors.append(
            f"  ✗ convert_hf_to_gguf.py not found in {LLAMA_CPP_DIR}\n"
            "    Make sure llama.cpp is up to date."
        )

    if errors:
        print("[ERROR] Prerequisites not met:\n")
        for e in errors:
            print(e)
        sys.exit(1)


def _convert_to_gguf() -> None:
    print(f"[1/3] Converting HuggingFace model to GGUF (q4_k_m) …")
    print(f"      Input : {OUTPUT_DIR}")
    print(f"      Output: {GGUF_PATH}")
    cmd = [
        sys.executable,
        CONVERT_SCRIPT,
        OUTPUT_DIR,
        "--outfile", GGUF_PATH,
        "--outtype", "q4_k_m",
    ]
    result = subprocess.run(cmd, capture_output=False)
    if result.returncode != 0:
        print("[ERROR] GGUF conversion failed.")
        sys.exit(result.returncode)
    print("      Conversion successful.")


def _write_modelfile() -> None:
    print(f"[2/3] Writing Modelfile → {MODELFILE_PATH}")
    content = MODELFILE_CONTENT.format(gguf_path=GGUF_PATH.replace("\\", "/"))
    with open(MODELFILE_PATH, "w", encoding="utf-8") as fh:
        fh.write(content)


def _register_with_ollama() -> None:
    print(f"[3/3] Registering '{OLLAMA_MODEL_NAME}' with Ollama …")
    cmd = ["ollama", "create", OLLAMA_MODEL_NAME, "-f", MODELFILE_PATH]
    result = subprocess.run(cmd, capture_output=False)
    if result.returncode != 0:
        print("[ERROR] 'ollama create' failed. Is Ollama running? (ollama serve)")
        sys.exit(result.returncode)


def main() -> None:
    _check_prerequisites()
    _convert_to_gguf()
    _write_modelfile()
    _register_with_ollama()

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║  Success! Model registered as: {OLLAMA_MODEL_NAME:<28} ║
╚══════════════════════════════════════════════════════════════╝

Next steps:
  1. Verify registration:
       ollama list

  2. Test the model:
       ollama run {OLLAMA_MODEL_NAME}

  3. Update the Flask app — open nlp/summarizer.py and change:
       OLLAMA_MODEL = "research-analyzer-finetuned"

  4. Restart Flask:
       python app.py
""")


if __name__ == "__main__":
    main()
