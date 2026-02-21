"""Orchestrator: runs all NLP steps and yields progress updates."""

from __future__ import annotations

import json
import traceback
from typing import Generator

import spacy

from .extractor import extract_text_from_pdf
from .summarizer import (
    generate_summary,
    extractive_summary,
    extract_methodology,
    extract_results,
    extract_key_findings,
    generate_strengths_weaknesses,
    generate_future_scope,
)
from .keywords import extract_keywords
from .citations import parse_citations
from .evaluator import evaluate_summaries, evaluate_keywords
from .embedder import embed_findings

TOTAL_STEPS = 12

# spaCy model loaded once
_nlp = None


def _get_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


def _progress(step: int, label: str, data=None):
    """Build an SSE-compatible progress event dict."""
    payload = {
        "step": step,
        "total": TOTAL_STEPS,
        "label": label,
    }
    if data is not None:
        payload["data"] = data
    return f"data: {json.dumps(payload)}\n\n"


def analyze_paper(pdf_path: str) -> Generator[str, None, None]:
    """Run the full analysis pipeline, yielding SSE progress events.

    The final event has step == total and contains the complete results dict.
    """
    nlp = _get_nlp()
    results: dict = {}

    try:
        # Step 1: Text extraction
        yield _progress(1, "Extracting text from PDF...")
        doc_info = extract_text_from_pdf(pdf_path)
        text = doc_info["text"]
        results["doc_info"] = {
            "page_count": doc_info["page_count"],
            "word_count": doc_info["word_count"],
            "reading_time_min": doc_info["reading_time_min"],
        }

        if not text or len(text.strip()) < 50:
            yield _progress(TOTAL_STEPS, "Analysis failed", {
                "error": "Could not extract meaningful text from the PDF. "
                         "The file may be corrupted or contain only images "
                         "without OCR support."
            })
            return

        # Step 2: Section detection
        yield _progress(2, "Detecting paper sections...")
        # (section detection is implicit in summarizer, included for progress)

        # Step 3: Keyword extraction
        yield _progress(3, "Extracting keywords and entities...")
        results["keywords"] = extract_keywords(text, nlp)

        # Step 4: Summary generation (capture LSA intermediate for evaluation)
        yield _progress(4, "Generating paper summary...")
        lsa_intermediate = extractive_summary(text, sentence_count=12)
        results["summary"] = generate_summary(text)

        # Step 5: Methodology extraction
        yield _progress(5, "Analyzing methodology...")
        results["methodology"] = extract_methodology(text, nlp)

        # Step 6: Results extraction
        yield _progress(6, "Analyzing results and discussion...")
        results["results_discussion"] = extract_results(text, nlp)

        # Step 7: Key findings
        yield _progress(7, "Extracting key findings...")
        results["key_findings"] = extract_key_findings(text)

        # Step 8: Strengths & weaknesses
        yield _progress(8, "Evaluating strengths and weaknesses...")
        results["strengths_weaknesses"] = generate_strengths_weaknesses(text)

        # Step 9: Future scope
        yield _progress(9, "Identifying future research directions...")
        results["future_scope"] = generate_future_scope(text)

        # Step 10: Citation parsing
        yield _progress(10, "Parsing citations...")
        results["citations"] = parse_citations(text)

        # Step 11: Model evaluation (ROUGE + keyword comparison)
        yield _progress(11, "Evaluating model performance...")
        eval_result = evaluate_summaries(text, lsa_intermediate, results["summary"])
        kw_eval = evaluate_keywords(results.get("keywords", []))
        if isinstance(eval_result, dict):
            eval_result["keyword_eval"] = kw_eval
        results["evaluation"] = eval_result

        # Step 12: Semantic coherence of findings
        yield _progress(12, "Computing semantic coherence...")
        results["embeddings"] = embed_findings(results.get("key_findings", []))

        # Final event – complete results
        yield f"data: {json.dumps({'step': TOTAL_STEPS, 'total': TOTAL_STEPS, 'label': 'Analysis complete!', 'results': results})}\n\n"

    except Exception:
        tb = traceback.format_exc()
        yield f"data: {json.dumps({'step': TOTAL_STEPS, 'total': TOTAL_STEPS, 'label': 'Analysis failed', 'data': {'error': str(tb)}})}\n\n"
