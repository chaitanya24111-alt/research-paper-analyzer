"""Model evaluation: ROUGE scores (LSA vs BART) + keyword method comparison."""

from __future__ import annotations

import re
from typing import Optional


# ── Abstract extraction ──────────────────────────────────────────────────────

def _extract_abstract(text: str) -> Optional[str]:
    """Try to pull the abstract paragraph from raw paper text."""
    # Match section headers: "Abstract", "Summary", "ABSTRACT", etc.
    pattern = re.compile(
        r"^\s*(?:\d+\.?\s*)?(?:abstract|summary)\s*\n+([\s\S]{80,1200}?)(?=\n\s*\n\s*(?:\d+\.?\s*)?\w|\Z)",
        re.IGNORECASE | re.MULTILINE,
    )
    match = pattern.search(text)
    if match:
        abstract = match.group(1).strip()
        # Minimum sanity: at least 5 words
        if len(abstract.split()) >= 5:
            return abstract
    return None


# ── ROUGE evaluation ─────────────────────────────────────────────────────────

def evaluate_summaries(text: str, lsa_summary: str, bart_summary: str) -> dict:
    """Compute ROUGE-1/2/L for LSA and BART against the paper abstract.

    Falls back to mutual ROUGE (LSA vs BART) if no abstract is detected.
    Returns a graceful error dict if rouge-score is not installed.
    """
    try:
        from rouge_score import rouge_scorer  # type: ignore
    except ImportError:
        return {
            "available": False,
            "error": "rouge-score package not installed. Run: pip install rouge-score",
        }

    def _word_count(s: str) -> int:
        return len(s.split())

    # Need at least 10 words in both candidates
    if _word_count(lsa_summary) < 10 or _word_count(bart_summary) < 10:
        return {
            "available": False,
            "error": "Summaries too short to evaluate reliably.",
        }

    abstract = _extract_abstract(text)
    if abstract and _word_count(abstract) >= 10:
        reference = abstract
        reference_source = "abstract"
    else:
        # Mutual ROUGE: use each summary as reference for the other
        reference = None
        reference_source = "mutual"

    scorer = rouge_scorer.RougeScorer(
        ["rouge1", "rouge2", "rougeL"], use_stemmer=True
    )

    def _score(candidate: str, ref: str) -> dict:
        scores = scorer.score(ref, candidate)
        return {
            metric: {
                "precision": round(scores[metric].precision, 3),
                "recall":    round(scores[metric].recall,    3),
                "fmeasure":  round(scores[metric].fmeasure,  3),
            }
            for metric in ["rouge1", "rouge2", "rougeL"]
        }

    if reference_source == "abstract":
        lsa_scores  = _score(lsa_summary,  reference)
        bart_scores = _score(bart_summary, reference)
    else:
        # Cross-score: BART is the "reference" for LSA and vice-versa
        lsa_scores  = _score(lsa_summary,  bart_summary)
        bart_scores = _score(bart_summary, lsa_summary)

    # Winner by ROUGE-1 F1
    lsa_f1  = lsa_scores["rouge1"]["fmeasure"]
    bart_f1 = bart_scores["rouge1"]["fmeasure"]

    if bart_f1 > lsa_f1:
        winner = "bart"
        delta = round(bart_f1 - lsa_f1, 3)
        interp = (
            f"BART achieves higher ROUGE-1 F1 ({bart_f1:.3f} vs {lsa_f1:.3f}, "
            f"+{delta:.3f}), suggesting its abstractive output aligns more "
            f"closely with the {'abstract' if reference_source == 'abstract' else 'extractive baseline'}. "
            f"This is expected: BART generates fluent prose rather than verbatim "
            f"sentences, which tends to overlap more with human-written abstracts."
        )
    elif lsa_f1 > bart_f1:
        winner = "lsa"
        delta = round(lsa_f1 - bart_f1, 3)
        interp = (
            f"LSA (extractive) achieves higher ROUGE-1 F1 ({lsa_f1:.3f} vs {bart_f1:.3f}, "
            f"+{delta:.3f}). This can happen when the paper abstract reuses exact "
            f"phrasing from the body — extractive methods score well on ROUGE "
            f"because they copy sentences verbatim. BART may still produce a more "
            f"readable, coherent summary despite lower n-gram overlap."
        )
    else:
        winner = "tie"
        interp = (
            "LSA and BART achieve identical ROUGE-1 F1. Both methods capture "
            "similar information from different angles."
        )

    if reference_source == "mutual":
        interp += (
            " Note: no clear abstract section was detected, so scores reflect "
            "how much the two methods agree with each other (mutual ROUGE), "
            "not against a gold reference."
        )

    return {
        "available": True,
        "reference_source": reference_source,
        "lsa_scores":  lsa_scores,
        "bart_scores": bart_scores,
        "winner":       winner,
        "interpretation": interp,
    }


# ── Keyword method comparison ─────────────────────────────────────────────────

def evaluate_keywords(keywords: list[dict]) -> dict:
    """Analyse complementarity between TF-IDF and NER keyword methods."""
    tfidf_terms = {kw["keyword"].lower() for kw in keywords if kw.get("type") == "tfidf"}
    ner_terms   = {kw["keyword"].lower() for kw in keywords if kw.get("type") == "entity"}

    tfidf_count = len(tfidf_terms)
    ner_count   = len(ner_terms)
    total       = tfidf_count + ner_count

    if total == 0:
        return {
            "tfidf_count": 0,
            "ner_count": 0,
            "overlap_rate": 0.0,
            "complementarity": 0.0,
            "interpretation": "No keywords available to evaluate.",
        }

    overlap  = tfidf_terms & ner_terms
    overlap_rate     = round(len(overlap) / total, 3)
    complementarity  = round(1.0 - overlap_rate, 3)

    if complementarity >= 0.85:
        interp = (
            f"TF-IDF ({tfidf_count} terms) and NER ({ner_count} entities) are "
            f"highly complementary (overlap rate {overlap_rate:.1%}). "
            f"TF-IDF captures domain-specific technical vocabulary weighted by "
            f"document frequency, while NER extracts named entities (people, "
            f"organisations, locations, methods). Using both methods together "
            f"provides broader, richer keyword coverage than either alone."
        )
    elif complementarity >= 0.60:
        interp = (
            f"TF-IDF ({tfidf_count} terms) and NER ({ner_count} entities) show "
            f"moderate complementarity (overlap rate {overlap_rate:.1%}). "
            f"Some concepts are surface-level enough to be found by both methods; "
            f"together they still offer more complete coverage."
        )
    else:
        interp = (
            f"TF-IDF and NER show significant overlap ({overlap_rate:.1%}), "
            f"suggesting this paper's key entities are also statistically prominent. "
            f"This often occurs in highly focused, single-topic papers."
        )

    return {
        "tfidf_count":    tfidf_count,
        "ner_count":      ner_count,
        "overlap_rate":   overlap_rate,
        "complementarity": complementarity,
        "overlapping_terms": sorted(overlap)[:5],  # sample, not full list
        "interpretation": interp,
    }
