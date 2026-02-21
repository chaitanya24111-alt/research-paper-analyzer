"""Semantic coherence of key findings via sentence-transformers embeddings."""

from __future__ import annotations

import math
from typing import Optional

# Lazy-loaded model (same pattern as BART in summarizer.py)
_model = None


def _get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer  # type: ignore
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _cosine_similarity(a, b) -> float:
    """Compute cosine similarity between two equal-length lists."""
    dot   = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(y * y for y in b))
    if mag_a == 0 or mag_b == 0:
        return 0.0
    return dot / (mag_a * mag_b)


def embed_findings(key_findings: list[str]) -> dict:
    """Embed findings, compute pairwise cosine similarity, cluster, score coherence.

    Returns a graceful fallback dict if sentence-transformers is not installed
    or if there are fewer than 2 findings.
    """
    # Filter short/empty findings
    findings = [f.strip() for f in key_findings if f and len(f.strip().split()) >= 3]

    if len(findings) < 2:
        return {
            "available": True,
            "similarity_matrix": [[1.0]] if findings else [],
            "clusters": [],
            "most_central_text": findings[0] if findings else "",
            "avg_coherence": 1.0,
            "coherence_label": "high",
            "note": "Fewer than 2 findings — coherence trivially perfect.",
        }

    try:
        model = _get_model()
    except ImportError:
        return {
            "available": False,
            "error": (
                "sentence-transformers package not installed. "
                "Run: pip install sentence-transformers"
            ),
        }
    except Exception as exc:
        return {
            "available": False,
            "error": f"Failed to load embedding model: {exc}",
        }

    # Encode
    embeddings_raw = model.encode(findings)
    # Convert to plain Python lists for JSON serialisation
    embeddings = [vec.tolist() for vec in embeddings_raw]

    n = len(findings)

    # Build N×N similarity matrix
    matrix = []
    for i in range(n):
        row = []
        for j in range(n):
            if i == j:
                row.append(1.0)
            elif j < i:
                row.append(matrix[j][i])  # symmetric
            else:
                sim = round(_cosine_similarity(embeddings[i], embeddings[j]), 3)
                row.append(sim)
        matrix.append(row)

    # Avg pairwise coherence (off-diagonal)
    off_diag = [
        matrix[i][j]
        for i in range(n)
        for j in range(n)
        if i != j
    ]
    avg_coherence = round(sum(off_diag) / len(off_diag), 3) if off_diag else 1.0

    # Coherence label
    if avg_coherence >= 0.55:
        coherence_label = "high"
    elif avg_coherence >= 0.35:
        coherence_label = "medium"
    else:
        coherence_label = "low"

    # Most central finding (highest average similarity to all others)
    centrality = []
    for i in range(n):
        avg_sim = sum(matrix[i][j] for j in range(n) if j != i) / (n - 1)
        centrality.append(round(avg_sim, 3))
    most_central_idx = centrality.index(max(centrality))
    most_central_text = findings[most_central_idx]

    # Greedy threshold clustering at 0.70
    threshold = 0.70
    visited = [False] * n
    clusters = []
    for i in range(n):
        if visited[i]:
            continue
        cluster_indices = [i]
        visited[i] = True
        for j in range(i + 1, n):
            if not visited[j] and matrix[i][j] >= threshold:
                cluster_indices.append(j)
                visited[j] = True
        clusters.append(cluster_indices)

    cluster_dicts = []
    for cid, indices in enumerate(clusters):
        cluster_dicts.append({
            "cluster_id": cid,
            "size":       len(indices),
            "texts":      [findings[idx] for idx in indices],
            "centrality_scores": [centrality[idx] for idx in indices],
        })

    return {
        "available":         True,
        "similarity_matrix": matrix,
        "clusters":          cluster_dicts,
        "most_central_text": most_central_text,
        "centrality_scores": centrality,
        "avg_coherence":     avg_coherence,
        "coherence_label":   coherence_label,
    }
