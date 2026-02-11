"""Summarization: extractive (sumy LSA) + abstractive (BART)."""

from __future__ import annotations

import re
from typing import Optional

import spacy
from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lsa import LsaSummarizer
from sumy.nlp.stemmers import Stemmer
from sumy.utils import get_stop_words

# BART model loaded lazily on first call
_bart_pipeline = None

LANG = "english"

METHOD_KEYWORDS = [
    "method", "methodology", "approach", "experiment", "experimental",
    "dataset", "data set", "participants", "sample", "procedure",
    "protocol", "technique", "algorithm", "framework", "implementation",
    "setup", "setup", "design", "measure", "instrument", "survey",
    "questionnaire", "interview", "analysis", "statistical",
]

RESULTS_KEYWORDS = [
    "result", "results", "finding", "findings", "outcome", "outcomes",
    "discussion", "significant", "significantly", "showed", "demonstrated",
    "observed", "revealed", "indicate", "indicates", "suggest", "suggests",
    "p-value", "p <", "correlation", "performance", "accuracy", "precision",
    "recall", "f1", "improvement", "comparison", "table", "figure",
]

SECTION_HEADERS = re.compile(
    r"^\s*\d*\.?\s*(abstract|introduction|background|literature review|"
    r"related work|method(?:ology|s)?|experiment(?:al|s)?|results?|"
    r"discussion|conclusion|summary|future work|references|bibliography|"
    r"acknowledgment|appendix)",
    re.IGNORECASE | re.MULTILINE,
)


def _get_bart():
    """Lazy-load BART summarization pipeline."""
    global _bart_pipeline
    if _bart_pipeline is None:
        from transformers import BartForConditionalGeneration, BartTokenizer
        
        class BartWrapper:
            def __init__(self):
                self.model = BartForConditionalGeneration.from_pretrained("facebook/bart-large-cnn")
                self.tokenizer = BartTokenizer.from_pretrained("facebook/bart-large-cnn")
                
            def __call__(self, text, max_length=300, min_length=80, do_sample=False):
                inputs = self.tokenizer(text, max_length=1024, truncation=True, return_tensors="pt")
                summary_ids = self.model.generate(
                    inputs["input_ids"],
                    max_length=max_length,
                    min_length=min_length,
                    do_sample=do_sample,
                    num_beams=4,
                    early_stopping=True
                )
                summary = self.tokenizer.decode(summary_ids[0], skip_special_tokens=True)
                return [{"summary_text": summary}]
        
        _bart_pipeline = BartWrapper()
    return _bart_pipeline


def _extractive_summary(text: str, sentence_count: int = 10) -> str:
    """Sumy LSA extractive summary."""
    parser = PlaintextParser.from_string(text, Tokenizer(LANG))
    stemmer = Stemmer(LANG)
    summarizer = LsaSummarizer(stemmer)
    summarizer.stop_words = get_stop_words(LANG)
    sentences = summarizer(parser.document, sentence_count)
    return " ".join(str(s) for s in sentences)


def _bart_summarize(text: str, max_len: int = 300, min_len: int = 80) -> str:
    """BART abstractive summarization with input truncation."""
    bart = _get_bart()
    # BART max input is 1024 tokens; roughly 4 chars/token → keep ~3500 chars
    truncated = text[:3500]
    if len(truncated.strip()) < 60:
        return text.strip()
    result = bart(truncated, max_length=max_len, min_length=min_len, do_sample=False)
    return result[0]["summary_text"]


def _detect_sections(text: str) -> dict[str, str]:
    """Heuristically split paper into sections by header detection."""
    headers = list(SECTION_HEADERS.finditer(text))
    sections: dict[str, str] = {}
    for i, match in enumerate(headers):
        name = match.group(1).strip().lower()
        start = match.end()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
        sections[name] = text[start:end].strip()
    return sections


def _filter_sentences(text: str, keywords: list[str], nlp, top_n: int = 15) -> str:
    """Return sentences that contain at least one keyword."""
    doc = nlp(text[:100000])  # limit for spaCy
    matched = []
    kw_set = {k.lower() for k in keywords}
    for sent in doc.sents:
        lower = sent.text.lower()
        if any(kw in lower for kw in kw_set):
            matched.append(sent.text.strip())
    return " ".join(matched[:top_n])


def generate_summary(text: str) -> str:
    """Main paper summary (extractive then BART abstractive)."""
    extractive = _extractive_summary(text, sentence_count=12)
    return _bart_summarize(extractive, max_len=300, min_len=100)


def extract_methodology(text: str, nlp) -> str:
    """Extract and summarize methodology section."""
    sections = _detect_sections(text)
    # Try explicit methodology section first
    for key in ("methodology", "methods", "method", "experimental", "experiments"):
        if key in sections and len(sections[key]) > 100:
            return _bart_summarize(sections[key], max_len=250, min_len=60)
    # Fallback: keyword-based sentence extraction
    relevant = _filter_sentences(text, METHOD_KEYWORDS, nlp)
    if len(relevant) > 100:
        return _bart_summarize(relevant, max_len=250, min_len=60)
    return "Methodology section could not be identified in this paper."


def extract_results(text: str, nlp) -> str:
    """Extract and summarize results & discussion."""
    sections = _detect_sections(text)
    combined = ""
    for key in ("results", "result", "discussion"):
        if key in sections:
            combined += " " + sections[key]
    if len(combined.strip()) > 100:
        return _bart_summarize(combined.strip(), max_len=300, min_len=80)
    relevant = _filter_sentences(text, RESULTS_KEYWORDS, nlp)
    if len(relevant) > 100:
        return _bart_summarize(relevant, max_len=300, min_len=80)
    return "Results/Discussion section could not be identified in this paper."


def extract_key_findings(text: str) -> list[str]:
    """Top findings as bullet points using extractive summarization."""
    parser = PlaintextParser.from_string(text, Tokenizer(LANG))
    stemmer = Stemmer(LANG)
    summarizer = LsaSummarizer(stemmer)
    summarizer.stop_words = get_stop_words(LANG)
    sentences = summarizer(parser.document, 6)
    return [str(s).strip() for s in sentences if len(str(s).strip()) > 20]


def generate_strengths_weaknesses(text: str) -> dict[str, str]:
    """BART-generated strengths & weaknesses (with disclaimer)."""
    prompt_text = (
        "Analyze the following research paper text and identify its main "
        "strengths and weaknesses:\n\n" + text[:3000]
    )
    bart = _get_bart()
    result = bart(prompt_text, max_length=250, min_length=60, do_sample=False)
    generated = result[0]["summary_text"]
    return {
        "analysis": generated,
        "disclaimer": (
            "This analysis was generated by an AI model (BART) and may not "
            "fully capture the nuances of the paper. Please use it as a "
            "starting point for your own critical assessment."
        ),
    }


def generate_future_scope(text: str) -> dict[str, str]:
    """BART-generated future research directions (with disclaimer)."""
    sections = _detect_sections(text)
    source = ""
    for key in ("conclusion", "conclusions", "summary", "future work", "discussion"):
        if key in sections:
            source += " " + sections[key]
    if len(source.strip()) < 100:
        source = text[-3000:]  # use end of paper as fallback

    bart = _get_bart()
    result = bart(source[:3500], max_length=200, min_length=50, do_sample=False)
    generated = result[0]["summary_text"]
    return {
        "analysis": generated,
        "disclaimer": (
            "These future research directions were generated by an AI model "
            "(BART) and represent potential areas of exploration. They should "
            "be validated against the actual paper content and domain expertise."
        ),
    }
