"""Citation / reference parsing with style detection."""

from __future__ import annotations

import re

# ---------- Section detection ----------

_REF_HEADER = re.compile(
    r"(?:^|\n)\s*(?:\d+\.\s*)?(?:references|bibliography|works cited)\s*\n",
    re.IGNORECASE,
)

# ---------- Citation style patterns ----------

# APA:  Author, A. B. (Year). Title. Journal, Volume(Issue), Pages.
_APA = re.compile(
    r"(?P<author>[A-Z][A-Za-z\-'\u00C0-\u024F]+(?:,?\s+[A-Z]\.(?:\s?[A-Z]\.)*)"
    r"(?:,?\s*(?:&|and)\s+[A-Z][A-Za-z\-'\u00C0-\u024F]+(?:,?\s+[A-Z]\.(?:\s?[A-Z]\.)*))*)?"
    r"\s*\((?P<year>\d{4})\)\.\s*"
    r"(?P<title>[^.]+)\.\s*"
    r"(?P<journal>[^,]+)?",
)

# IEEE:  [1] A. Author, "Title," Journal, vol. X, pp. Y-Z, Year.
_IEEE = re.compile(
    r"\[(?P<num>\d+)\]\s*"
    r"(?P<author>[A-Z][\w.\-'\u00C0-\u024F ]+?),"
    r'\s*["\u201c](?P<title>[^"\u201d]+)["\u201d]'
    r"(?:,\s*(?P<journal>[^,]+))?"
    r".*?(?P<year>\d{4})",
)

# Generic fallback: lines starting with [number] or a hanging indent
_GENERIC = re.compile(
    r"(?:^|\n)\s*(?:\[\d+\]|\(\d+\)|\d+\.)\s+"
    r"(?P<text>.+?)(?=\n\s*(?:\[\d+\]|\(\d+\)|\d+\.)\s+|\Z)",
    re.DOTALL,
)


def parse_citations(text: str) -> list[dict]:
    """Parse the references section and return structured citations.

    Each citation: {author, title, year, journal, style, raw}
    """
    ref_section = _extract_references_section(text)
    if not ref_section:
        return []

    citations: list[dict] = []

    # Try IEEE first (numbered)
    for m in _IEEE.finditer(ref_section):
        citations.append({
            "author": m.group("author").strip(),
            "title": m.group("title").strip(),
            "year": m.group("year"),
            "journal": (m.group("journal") or "").strip() or None,
            "style": "IEEE",
            "raw": m.group(0).strip(),
        })

    if citations:
        return citations

    # Try APA
    for m in _APA.finditer(ref_section):
        citations.append({
            "author": (m.group("author") or "").strip() or None,
            "title": m.group("title").strip(),
            "year": m.group("year"),
            "journal": (m.group("journal") or "").strip() or None,
            "style": "APA",
            "raw": m.group(0).strip(),
        })

    if citations:
        return citations

    # Generic fallback – split by numbered entries
    for m in _GENERIC.finditer(ref_section):
        raw = m.group("text").strip()
        year_match = re.search(r"\b(19|20)\d{2}\b", raw)
        citations.append({
            "author": None,
            "title": raw[:120],
            "year": year_match.group(0) if year_match else None,
            "journal": None,
            "style": "Unknown",
            "raw": raw,
        })

    return citations


def _extract_references_section(text: str) -> str | None:
    """Return the text of the References / Bibliography section."""
    match = _REF_HEADER.search(text)
    if not match:
        return None
    return text[match.end():]
