# Fine-Tuning the Research Analyzer Model

## Why fine-tune?

The base `llama3.1:8b` model is a general-purpose assistant. Fine-tuning it on arXiv CS/AI papers teaches it:

- **Academic vocabulary** — terms like "latent space", "ablation study", "few-shot prompting"
- **Paper structure** — abstracts, methodology, results, limitations
- **Explanation style** — translating dense technical prose into clear plain English
- **Domain context** — what constitutes a "contribution" in ML vs. systems vs. theory papers

After fine-tuning, the model produces noticeably cleaner, more accurate summaries for research papers.

---

## Prerequisites

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| Disk space | 30 GB | 50 GB |
| RAM | 16 GB | 32 GB |
| GPU VRAM | 16 GB (local) | T4 16 GB via Kaggle (free) |
| Python | 3.9+ | 3.10+ |
| Ollama | 0.3+ | latest |

---

## Option A — Local (if you have a GPU)

### 1. Install dependencies

```bash
pip install unsloth trl transformers datasets accelerate bitsandbytes
```

### 2. Download the arXiv dataset

Go to https://www.kaggle.com/datasets/Cornell-University/arxiv and download
`arxiv-metadata-oai-snapshot.json` (~4 GB compressed, ~12 GB unzipped).

Place it at the repo root or pass its path as an argument.

### 3. Prepare the dataset

```bash
python fine_tune/prepare_dataset.py path/to/arxiv-metadata-oai-snapshot.json
```

Expected output:
```
[1/4] Scanning arxiv-metadata-oai-snapshot.json …
[2/4] Found 850,000+ candidate papers from 2,300,000 total lines.
[3/4] Sampling up to 10,000 entries …
[4/4] Writing output files …
      train → fine_tune/train.jsonl  (9,000 lines)
      val   → fine_tune/val.jsonl    (1,000 lines)
```

### 4. Run fine-tuning

```bash
python fine_tune/finetune.py
```

Training takes ~2–4 hours on a single T4 GPU. Watch `fine_tune/training_log.txt`
for loss — it should drop from ~2.x to ~1.x over 3 epochs.

### 5. Convert & register with Ollama

```bash
# Clone llama.cpp at the repo root level (one-time)
git clone https://github.com/ggerganov/llama.cpp

python fine_tune/convert_to_ollama.py
```

---

## Option B — Kaggle (recommended, free GPU)

Kaggle provides free T4 GPU sessions (~30 hours/week). This is the easiest path
if you don't have a local GPU.

### 1. Set up Kaggle API credentials

1. Go to https://www.kaggle.com/settings → API → Create New Token
2. Download `kaggle.json`
3. Place it at `~/.kaggle/kaggle.json` (Linux/Mac) or `%USERPROFILE%\.kaggle\kaggle.json` (Windows)
4. On Kaggle Notebook UI: Add Secrets `KAGGLE_USERNAME` and `KAGGLE_KEY`

### 2. Upload the notebook

1. Go to https://www.kaggle.com/notebooks
2. Click **New Notebook**
3. Click **File → Import Notebook** and upload `fine_tune/kaggle_notebook.ipynb`

### 3. Enable GPU

In the notebook editor:
- Click the three-dot menu (⋮) → **Notebook Settings**
- Set **Accelerator** → **GPU T4 x2**
- Save

### 4. Run the notebook

Click **Run All** (or run cells 1–5 in order). Total runtime: ~2–3 hours.

- Cell 1 installs dependencies and downloads the dataset
- Cell 2 filters and prepares `train.jsonl` / `val.jsonl`
- Cell 3 fine-tunes with Unsloth + LoRA (watch the output for loss values)
- Cell 4 copies the model to the Kaggle output panel
- Cell 5 runs a quick inference test

### 5. Download the fine-tuned model

1. In the Kaggle notebook UI, click the **Output** tab (right side panel)
2. Download `finetuned_model/` — it will be a ZIP of the HuggingFace checkpoint
3. Extract to `fine_tune/output/` in your local repo

### 6. Convert & register locally

After downloading and extracting to `fine_tune/output/`:

```bash
# Clone llama.cpp at the repo root level (one-time)
git clone https://github.com/ggerganov/llama.cpp

# Make sure Ollama is running
ollama serve &

python fine_tune/convert_to_ollama.py
```

---

## Verify the model is registered

```bash
ollama list
# Should show: research-analyzer-finetuned
```

Quick test:
```bash
ollama run research-analyzer-finetuned "Explain attention mechanisms in transformers"
```

---

## Update the Flask app

Open `nlp/summarizer.py` and change line 14:

```python
# Before:
OLLAMA_MODEL = "research-analyzer"

# After:
OLLAMA_MODEL = "research-analyzer-finetuned"
```

Restart Flask:
```bash
python app.py
```

Upload a test PDF and verify the summaries are coming from the fine-tuned model.
You can confirm by checking Ollama logs: `ollama logs research-analyzer-finetuned`.

---

## Files in this directory

| File | Purpose |
|------|---------|
| `prepare_dataset.py` | Filter arXiv snapshot, build JSONL training pairs |
| `finetune.py` | LoRA fine-tuning with Unsloth + SFTTrainer |
| `convert_to_ollama.py` | GGUF conversion + Ollama model registration |
| `kaggle_notebook.ipynb` | All-in-one Kaggle notebook (free GPU) |
| `train.jsonl` | Generated — 9,000 training samples |
| `val.jsonl` | Generated — 1,000 validation samples |
| `output/` | Generated — fine-tuned HuggingFace checkpoint |
| `training_log.txt` | Generated — step/loss CSV |
| `Modelfile.finetuned` | Generated — Ollama Modelfile |
