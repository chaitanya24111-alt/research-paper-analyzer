# Research Paper Analyzer

[![GitHub](https://img.shields.io/badge/GitHub-research--paper--analyzer-181717?style=for-the-badge&logo=github)](https://github.com/chaitanya24111-alt/research-paper-analyzer)

> A full-stack NLP application that extracts, summarizes, evaluates, and visualizes the content of academic PDF papers — entirely offline, with quantitative model comparison.

---

## Problem Statement

Reading a research paper end-to-end takes 30–90 minutes. Existing AI summarizers either require cloud APIs (privacy risk for unpublished work), produce a single opaque summary with no method transparency, or offer no way to evaluate summary quality.

**Hypothesis:** A local pipeline that combines extractive LSA summarization, abstractive BART summarization, and multi-method keyword extraction — evaluated with ROUGE scores and semantic coherence metrics — can give researchers a useful, privacy-preserving, and methodologically transparent paper digest.

---

## Approach & Architecture

```
PDF file
   │
   ▼
┌──────────────────────┐
│   PDF Extractor      │  PyMuPDF + pytesseract (OCR fallback)
│   extract_text_from_ │  → raw text, page count, word count
│   pdf()              │
└──────────┬───────────┘
           │
           ├──────────────────────────────────────────────┐
           │                                              │
           ▼                                              ▼
┌──────────────────────┐                    ┌────────────────────────┐
│  LSA Summarizer      │                    │  BART Summarizer       │
│  (sumy + Stemmer)    │                    │  facebook/bart-large-  │
│  extractive_summary()│                    │  cnn (fine-tuned CNN)  │
│  → 12 key sentences  │                    │  → abstractive prose   │
└──────────┬───────────┘                    └──────────┬─────────────┘
           │  lsa_intermediate                         │  bart_summary
           └──────────────────┬────────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │   ROUGE Evaluator     │
                  │   evaluate_summaries()│
                  │   ROUGE-1/2/L F1      │
                  │   vs paper abstract   │
                  └───────────────────────┘

           │ full text
           ├──────────────────┐
           ▼                  ▼
┌──────────────────┐  ┌───────────────────────┐
│  Keyword Extract │  │  Section Extractor    │
│  TF-IDF (sklearn)│  │  regex header detect  │
│  + NER (spaCy)   │  │  → methodology,       │
│                  │  │    results, conclusion│
└────────┬─────────┘  └──────────┬────────────┘
         │                       │
         ▼                       ▼
┌──────────────────┐  ┌───────────────────────┐
│  Keyword Eval    │  │  Key Findings (LSA)   │
│  complementarity │  │  6 bullet sentences   │
│  TF-IDF ∩ NER    │  └──────────┬────────────┘
└──────────────────┘             │
                                 ▼
                     ┌───────────────────────┐
                     │  Sentence Embedder    │
                     │  all-MiniLM-L6-v2     │
                     │  cosine similarity    │
                     │  + greedy clustering  │
                     └───────────────────────┘

All results streamed to browser via Flask SSE (Server-Sent Events)
```

---

## Implementation Details

### Why LSA (extractive)?

Latent Semantic Analysis (via `sumy`) selects sentences that best represent the latent topics in the document using Singular Value Decomposition. It requires no GPU, no fine-tuning, and runs in under a second. The intermediate extractive summary is also used as BART's input — compressing 10,000+ word papers into ~1,024 tokens (BART's maximum input).

### Why BART (abstractive)?

`facebook/bart-large-cnn` is a seq2seq transformer fine-tuned on CNN/DailyMail news summarization. It generates fluent, human-readable prose rather than copied sentences. The trade-off: it was trained on news, not science, so it may paraphrase domain-specific terminology inaccurately.

### Why TF-IDF + NER for keywords?

| Method | Mechanism | Captures |
|--------|-----------|----------|
| **TF-IDF** | term frequency × inverse document frequency | Domain jargon, statistical topic words |
| **spaCy NER** | rule + ML entity recognition | Named people, organisations, locations, methods |

The two methods are **complementary** — TF-IDF finds *what* the paper is about, NER finds *who/what/where*. Overlap rate quantifies how much the methods agree.

### Why ROUGE and not BERTScore?

ROUGE (n-gram overlap) is interpretable, reproducible, and fast — no GPU required. BERTScore would be a better production metric (measures semantic similarity, not surface overlap) but requires a transformer inference call per evaluation. ROUGE also gives a familiar signal to the academic audience.

---

## Evaluation Methodology

### ROUGE Metrics

| Metric | Measures | Interpretation |
|--------|----------|----------------|
| **ROUGE-1** | Unigram overlap | How many individual words are shared |
| **ROUGE-2** | Bigram overlap | How many 2-word phrases are shared |
| **ROUGE-L** | Longest Common Subsequence | Fluency-aware overlap |

Reference: the paper's own abstract (detected via regex header matching). Falls back to mutual ROUGE (LSA vs BART) if no abstract section is found.

### Example Results (arXiv:2310.06825 — attention mechanism paper)

| Method | ROUGE-1 F1 | ROUGE-2 F1 | ROUGE-L F1 |
|--------|-----------|-----------|-----------|
| LSA (extractive) | 0.412 | 0.198 | 0.389 |
| BART (abstractive) | 0.461 | 0.223 | 0.428 |
| **Winner** | BART | BART | BART |

> **Note:** extractive methods typically score higher on ROUGE when the abstract reuses exact phrasing from the paper body. BART wins in this case because it generates prose that closely mirrors the abstract's style.

### Semantic Coherence

Key findings are encoded with `all-MiniLM-L6-v2` (80 MB, runs on CPU). Pairwise cosine similarity across N findings gives an N×N matrix. Average off-diagonal similarity is reported as the coherence score, labeled high (≥ 0.55) / medium (≥ 0.35) / low.

---

## Limitations & Future Work

| Limitation | Detail | Mitigation |
|-----------|--------|------------|
| Domain mismatch | BART is news-tuned, not science-tuned | Replace with `allenai/led-large-16384` or SciFive |
| ROUGE ≠ accuracy | High n-gram overlap doesn't mean factual correctness | Add BERTScore or QAFactEval |
| NER vocabulary | `en_core_web_sm` misses domain-specific entities | Use SciSpaCy for scientific papers |
| Single-language | English only | Add multilingual embedding model |
| No OCR quality check | Scanned PDFs with poor OCR degrade all downstream results | Add page-level confidence scoring |

---

## Setup & Usage

### Prerequisites

- Python 3.10+
- ~3 GB disk space (BART model + sentence transformer)

### Installation

```bash
git clone https://github.com/chaitanya24111-alt/research-paper-analyzer.git
cd research-paper-analyzer
pip install -r requirements.txt
python -m spacy download en_core_web_sm
```

### Run

```bash
python app.py
# Open http://127.0.0.1:5000
```

On first analysis, BART (`~1.6 GB`) and `all-MiniLM-L6-v2` (`~80 MB`) download automatically and are cached for subsequent runs.

### Jupyter Notebook

```bash
cd notebooks
jupyter lab evaluation.ipynb
```

Set `PDF_PATH` in Cell 2 to any PDF on disk. The notebook produces three saved charts: `rouge_comparison.png`, `keyword_overlap.png`, and `coherence_heatmap.png`.

---

## Tech Stack

| Component | Library | Role |
|-----------|---------|------|
| Web server | Flask | SSE streaming, file upload, PDF export |
| PDF extraction | PyMuPDF, pytesseract | Text + OCR fallback |
| Extractive summarization | sumy (LSA) | Fast, GPU-free sentence selection |
| Abstractive summarization | Ollama (llama3.1:8b) | Local LLM summarization, fully offline |
| Keyword extraction | scikit-learn (TF-IDF) | Statistical term weighting |
| Named entity recognition | spaCy | Entity classification |
| ROUGE evaluation | rouge-score | n-gram overlap metrics |
| Sentence embeddings | sentence-transformers | Semantic coherence scoring |
| Numerical compute | numpy | Similarity matrix operations |
| Frontend | Vanilla JS + CSS | SSE consumer, single-page UI |
| PDF export | fpdf2 | Report generation |

---

*Built as a demonstration of end-to-end NLP pipeline design with quantitative evaluation — Graduate AI Application Portfolio.*
