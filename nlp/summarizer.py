"""Summarization: extractive (sumy LSA) + abstractive (Ollama llama3.1:8b)."""

from __future__ import annotations

import re
from typing import Optional

from sumy.parsers.plaintext import PlaintextParser
from sumy.nlp.tokenizers import Tokenizer
from sumy.summarizers.lsa import LsaSummarizer
from sumy.nlp.stemmers import Stemmer
from sumy.utils import get_stop_words

import ollama

# Switch to fine-tuned model if available
# Change to "research-analyzer-finetuned" after running fine_tune/
OLLAMA_MODEL = "research-analyzer"  # or "research-analyzer-finetuned"

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


def _ollama_summarize(text: str, system_prompt: str, user_prompt: str) -> str:
    """Call Ollama chat API with the given system and user prompts."""
    words = text.split()
    truncated = " ".join(words[:3000])
    try:
        response = ollama.chat(
            model=OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt.format(text=truncated)},
            ],
            options={"temperature": 0.3, "top_p": 0.9, "num_predict": 600},
        )
        return response["message"]["content"].strip()
    except Exception as e:
        return (
            f"[Ollama error: {e}. "
            "Ensure Ollama is running (ollama serve) and "
            "llama3.1:8b is pulled (ollama pull llama3.1:8b).]"
        )


def extractive_summary(text: str, sentence_count: int = 10) -> str:
    """Sumy LSA extractive summary."""
    parser = PlaintextParser.from_string(text, Tokenizer(LANG))
    stemmer = Stemmer(LANG)
    summarizer = LsaSummarizer(stemmer)
    summarizer.stop_words = get_stop_words(LANG)
    sentences = summarizer(parser.document, sentence_count)
    return " ".join(str(s) for s in sentences)


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
    """Main paper summary via Ollama (llama3.1:8b)."""
    system = (
        "You are a research assistant writing clear summaries for CS students. "
        "Write in complete sentences, never bullet points."
    )
    user = (
        "Write a 5-6 sentence summary covering: the problem being solved, "
        "the proposed solution, the key innovation, and the main result "
        "with numbers if available. Use plain English and briefly explain "
        "any technical terms.\n\nPaper:\n{text}"
    )
    return _ollama_summarize(text, system, user)


def extract_methodology(text: str, nlp) -> str:
    """Extract and summarize methodology section via Ollama."""
    sections = _detect_sections(text)
    # Try explicit methodology section first
    source = ""
    for key in ("methodology", "methods", "method", "experimental", "experiments"):
        if key in sections and len(sections[key]) > 100:
            source = sections[key]
            break
    # Fallback: keyword-based sentence extraction
    if not source:
        relevant = _filter_sentences(text, METHOD_KEYWORDS, nlp, top_n=20)
        if len(relevant) > 100:
            source = relevant
    if not source:
        return "Methodology section could not be identified in this paper."

    system = (
        "You are a research assistant explaining technical methodologies clearly. "
        "Make the method understandable, not just restate it."
    )
    user = (
        "Explain the METHODOLOGY in 5-7 sentences. Include: the algorithm or "
        "technique designed, how it works conceptually (use an analogy if helpful), "
        "dataset used, and training setup (model size, GPU, batch size) if mentioned. "
        "Write like you are explaining to a student, simplify complex ideas.\n\nPaper:\n{text}"
    )
    return _ollama_summarize(source, system, user)


def extract_results(text: str, nlp) -> str:
    """Extract and summarize results & discussion via Ollama."""
    sections = _detect_sections(text)
    combined = ""
    for key in ("results", "result", "discussion"):
        if key in sections:
            combined += " " + sections[key]
    if len(combined.strip()) > 100:
        source = combined.strip()
    else:
        relevant = _filter_sentences(text, RESULTS_KEYWORDS, nlp)
        if len(relevant) > 100:
            source = relevant
        else:
            return "Results/Discussion section could not be identified in this paper."

    system = (
        "You are a research assistant summarizing results accurately. "
        "Always include specific numbers when available."
    )
    user = (
        "Summarize the RESULTS in 4-5 sentences. Include: what the method achieved, "
        "specific numbers or percentages, comparison to baselines, and any limitations "
        "mentioned.\n\nPaper:\n{text}"
    )
    return _ollama_summarize(source, system, user)


def extract_key_findings(text: str) -> list[str]:
    """Top findings as a numbered list via Ollama, with LSA fallback."""
    system = (
        "You are a research assistant extracting key findings and explaining why they matter."
    )
    user = (
        "Extract exactly 5 KEY FINDINGS. For each: write 2-3 sentences, "
        "explain what was found AND why it matters, use plain language, "
        "do not copy sentences from the paper. Format as:\n"
        "1. [finding]\n2. [finding]\n3. [finding]\n4. [finding]\n5. [finding]\n\n"
        "Paper:\n{text}"
    )
    raw = _ollama_summarize(text, system, user)

    # Parse numbered lines
    findings = []
    for line in raw.splitlines():
        line = line.strip()
        m = re.match(r'^[1-5][.)]\s+(.+)', line)
        if m:
            findings.append(m.group(1).strip())

    if len(findings) >= 2:
        return findings

    # Fallback: LSA extractive sentences
    parser = PlaintextParser.from_string(text, Tokenizer(LANG))
    stemmer = Stemmer(LANG)
    summarizer = LsaSummarizer(stemmer)
    summarizer.stop_words = get_stop_words(LANG)
    sentences = summarizer(parser.document, 6)
    return [str(s).strip() for s in sentences if len(str(s).strip()) > 20]


def generate_strengths_weaknesses(text: str) -> dict[str, str]:
    """Ollama-generated strengths & weaknesses (with disclaimer)."""
    system = "You are a critical but fair research reviewer."
    user = (
        "Write STRENGTHS (2-3 sentences): what is novel or impressive. "
        "Then WEAKNESSES (2-3 sentences): limitations and unanswered questions. "
        "Be specific.\n\nPaper:\n{text}"
    )
    return {
        "analysis": _ollama_summarize(text, system, user),
        "disclaimer": (
            "Generated by local LLM (llama3.1:8b). "
            "Use as a starting point for your own assessment."
        ),
    }


def generate_future_scope(text: str) -> dict[str, str]:
    """Ollama-generated future research directions (with disclaimer)."""
    sections = _detect_sections(text)
    source = ""
    for key in ("conclusion", "conclusions", "summary", "future work", "discussion"):
        if key in sections:
            source += " " + sections[key]
    if len(source.strip()) < 100:
        source = text[-3000:]  # use end of paper as fallback

    system = (
        "You are a research assistant identifying future research directions "
        "from paper conclusions."
    )
    user = (
        "Suggest 3-4 future research directions in 4-5 sentences. "
        "For each explain what could be explored and why it is valuable. "
        "Write in plain English.\n\nPaper:\n{text}"
    )
    return {
        "analysis": _ollama_summarize(source, system, user),
        "disclaimer": (
            "Generated by local LLM (llama3.1:8b). "
            "These directions should be validated against the actual paper content "
            "and domain expertise."
        ),
    }
