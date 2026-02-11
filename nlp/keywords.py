"""Keyword extraction: TF-IDF + spaCy NER."""

from __future__ import annotations

from sklearn.feature_extraction.text import TfidfVectorizer


def extract_keywords(text: str, nlp, top_n: int = 20) -> list[dict]:
    """Return top keywords combining TF-IDF scores and named entities.

    Each item: {keyword: str, score: float, type: "tfidf"|"entity"}
    """
    keywords: dict[str, dict] = {}

    # --- TF-IDF keywords ---
    tfidf = TfidfVectorizer(
        max_features=top_n,
        stop_words="english",
        ngram_range=(1, 2),
        min_df=1,
    )
    try:
        matrix = tfidf.fit_transform([text])
        feature_names = tfidf.get_feature_names_out()
        scores = matrix.toarray()[0]
        for name, score in zip(feature_names, scores):
            if score > 0 and len(name) > 2:
                keywords[name.lower()] = {
                    "keyword": name,
                    "score": round(float(score), 4),
                    "type": "tfidf",
                }
    except ValueError:
        pass  # empty vocabulary

    # --- spaCy NER entities ---
    doc = nlp(text[:100000])  # limit for performance
    entity_counts: dict[str, int] = {}
    for ent in doc.ents:
        if ent.label_ in ("ORG", "PRODUCT", "WORK_OF_ART", "LAW", "EVENT",
                          "GPE", "PERSON", "FAC"):
            key = ent.text.strip().lower()
            if len(key) > 2 and key not in keywords:
                entity_counts[key] = entity_counts.get(key, 0) + 1

    # Take top entities by frequency
    sorted_ents = sorted(entity_counts.items(), key=lambda x: -x[1])
    for name, count in sorted_ents[:10]:
        if name not in keywords:
            keywords[name] = {
                "keyword": name.title(),
                "score": round(count / max(len(doc), 1), 4),
                "type": "entity",
            }

    # Sort by score descending, return list
    result = sorted(keywords.values(), key=lambda x: -x["score"])
    return result[:top_n]
