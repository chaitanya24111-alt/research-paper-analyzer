"""Flask application entry point for Research Paper Analyzer."""

import os
import uuid
import tempfile
import subprocess
import sys

from flask import (
    Flask,
    render_template,
    request,
    jsonify,
    Response,
    send_file,
    stream_with_context,
)
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 25 * 1024 * 1024  # 25 MB

EXPORT_DIR = os.path.join(os.path.dirname(__file__), "exports")
os.makedirs(EXPORT_DIR, exist_ok=True)

# In-memory store for the latest analysis results (single-user, one at a time)
_current_results: dict | None = None
_current_pdf_path: str | None = None


# ---------------------------------------------------------------------------
# Model auto-download on first run
# ---------------------------------------------------------------------------

def ensure_models():
    """Check for required NLP models and download if missing."""
    # spaCy
    try:
        import spacy
        spacy.load("en_core_web_sm")
        print("[models] spaCy en_core_web_sm: ready")
    except OSError:
        print("[models] Downloading spaCy en_core_web_sm...")
        subprocess.check_call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
        print("[models] spaCy model downloaded.")

    # NLTK
    import nltk
    try:
        nltk.data.find("tokenizers/punkt_tab")
        print("[models] NLTK punkt_tab: ready")
    except LookupError:
        print("[models] Downloading NLTK punkt_tab...")
        nltk.download("punkt_tab", quiet=True)

    try:
        nltk.data.find("corpora/stopwords")
        print("[models] NLTK stopwords: ready")
    except LookupError:
        print("[models] Downloading NLTK stopwords...")
        nltk.download("stopwords", quiet=True)

    # BART – just log whether it's cached; actual download happens on first use
    from transformers import AutoTokenizer
    try:
        AutoTokenizer.from_pretrained("facebook/bart-large-cnn", local_files_only=True)
        print("[models] BART (facebook/bart-large-cnn): cached")
    except Exception:
        print("[models] BART model will be downloaded on first analysis (~1.6 GB).")

    print("[models] All checks complete.\n")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/upload", methods=["POST"])
def upload():
    global _current_pdf_path

    if "file" not in request.files:
        return jsonify({"error": "No file provided."}), 400

    file = request.files["file"]
    if not file.filename:
        return jsonify({"error": "Empty filename."}), 400
    if not file.filename.lower().endswith(".pdf"):
        return jsonify({"error": "Only PDF files are accepted."}), 400

    # Save to a temp file
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
    file.save(tmp.name)
    tmp.close()
    _current_pdf_path = tmp.name

    return jsonify({
        "message": "File uploaded successfully.",
        "filename": file.filename,
    })


@app.route("/api/analyze", methods=["POST"])
def analyze():
    global _current_results

    if not _current_pdf_path or not os.path.exists(_current_pdf_path):
        return jsonify({"error": "No PDF uploaded. Please upload a file first."}), 400

    from nlp.analyzer import analyze_paper

    def generate():
        global _current_results
        import json
        for event in analyze_paper(_current_pdf_path):
            # Capture the final results
            try:
                payload = json.loads(event.replace("data: ", "", 1).strip())
                if "results" in payload:
                    _current_results = payload["results"]
            except (json.JSONDecodeError, ValueError):
                pass
            yield event

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/export", methods=["POST"])
def export_pdf():
    global _current_results
    if not _current_results:
        return jsonify({"error": "No analysis results available."}), 400

    data = request.get_json() or {}
    sections = data.get("sections", [])
    if not sections:
        return jsonify({"error": "No sections selected for export."}), 400

    export_id = str(uuid.uuid4())
    export_path = os.path.join(EXPORT_DIR, f"{export_id}.pdf")

    try:
        _build_export_pdf(_current_results, sections, export_path)
    except Exception as e:
        return jsonify({"error": f"PDF generation failed: {e}"}), 500

    return jsonify({"export_id": export_id})


@app.route("/api/export/download/<export_id>")
def download_export(export_id):
    # Sanitize export_id to prevent path traversal
    safe_id = os.path.basename(export_id)
    path = os.path.join(EXPORT_DIR, f"{safe_id}.pdf")
    if not os.path.exists(path):
        return jsonify({"error": "Export not found."}), 404
    return send_file(path, as_attachment=True, download_name="analysis-report.pdf")


# ---------------------------------------------------------------------------
# Export PDF builder (fpdf2)
# ---------------------------------------------------------------------------

SECTION_TITLES = {
    "summary": "Summary",
    "methodology": "Methodology",
    "results_discussion": "Results & Discussion",
    "key_findings": "Key Findings",
    "evaluation": "Model Evaluation",
    "keywords": "Keywords & Entities",
    "strengths_weaknesses": "Strengths & Weaknesses",
    "future_scope": "Future Research Directions",
    "citations": "Citations / References",
}


def _clean(text: str) -> str:
    """Replace Unicode characters that Helvetica (Latin-1) cannot render."""
    if not text:
        return ""
    _map = {
        "\u2022": "-",    # bullet •
        "\u2023": "-",    # triangular bullet ‣
        "\u2013": "-",    # en dash –
        "\u2014": "--",   # em dash —
        "\u2015": "--",   # horizontal bar ―
        "\u2018": "'",    # left single quote '
        "\u2019": "'",    # right single quote '
        "\u201A": ",",    # single low-9 quotation ‚
        "\u201C": '"',    # left double quote "
        "\u201D": '"',    # right double quote "
        "\u201E": '"',    # double low-9 quotation „
        "\u2026": "...",  # ellipsis …
        "\u00B7": "-",    # middle dot ·
        "\u2212": "-",    # minus sign −
        "\u00D7": "x",    # multiplication ×
        "\u00F7": "/",    # division ÷
        "\u2264": "<=",   # ≤
        "\u2265": ">=",   # ≥
        "\u2248": "~=",   # ≈
        "\u00B1": "+/-",  # ±
        "\u00B2": "^2",   # superscript 2 ²
        "\u00B3": "^3",   # superscript 3 ³
        "\u2192": "->",   # →
        "\u2190": "<-",   # ←
        "\u2194": "<->",  # ↔
        "\u00A0": " ",    # non-breaking space
        "\u00AD": "-",    # soft hyphen ­
        "\u2032": "'",    # prime ′
        "\u2033": '"',    # double prime ″
        "\u03B1": "alpha",
        "\u03B2": "beta",
        "\u03B3": "gamma",
        "\u03B4": "delta",
        "\u03B5": "epsilon",
        "\u03BB": "lambda",
        "\u03BC": "mu",
        "\u03C3": "sigma",
        "\u03C9": "omega",
    }
    for char, replacement in _map.items():
        text = text.replace(char, replacement)
    # Catch any remaining non-Latin-1 characters with a safe fallback
    return text.encode("latin-1", errors="replace").decode("latin-1")


def _build_export_pdf(results: dict, sections: list[str], output_path: str):
    """Generate a PDF report using fpdf2."""
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Title
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(124, 58, 237)
    pdf.cell(0, 14, "Research Paper Analysis Report", new_x="LMARGIN", new_y="NEXT")
    pdf.set_draw_color(124, 58, 237)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(6)

    # Document info
    doc_info = results.get("doc_info", {})
    if doc_info:
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(80, 80, 80)
        info_text = (
            f"Pages: {doc_info.get('page_count', 'N/A')}  |  "
            f"Words: {doc_info.get('word_count', 'N/A')}  |  "
            f"Reading time: ~{doc_info.get('reading_time_min', 'N/A')} min"
        )
        pdf.cell(0, 8, info_text, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    for section_key in sections:
        title = SECTION_TITLES.get(section_key, section_key.replace("_", " ").title())

        # Section header
        pdf.set_font("Helvetica", "B", 14)
        pdf.set_text_color(99, 102, 241)
        pdf.ln(4)
        pdf.cell(0, 10, _clean(title), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)

        # Section body
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(30, 30, 30)

        if section_key == "summary":
            pdf.multi_cell(0, 6, _clean(results.get("summary", "N/A")))

        elif section_key == "methodology":
            pdf.multi_cell(0, 6, _clean(results.get("methodology", "N/A")))

        elif section_key == "results_discussion":
            pdf.multi_cell(0, 6, _clean(results.get("results_discussion", "N/A")))

        elif section_key == "key_findings":
            for i, finding in enumerate(results.get("key_findings", []), 1):
                pdf.multi_cell(0, 6, f"{i}. " + _clean(finding))
                pdf.ln(1)

        elif section_key == "keywords":
            kws = results.get("keywords", [])
            kw_text = ", ".join(_clean(kw["keyword"]) for kw in kws)
            pdf.multi_cell(0, 6, kw_text or "No keywords found.")

        elif section_key == "strengths_weaknesses":
            sw = results.get("strengths_weaknesses", {})
            pdf.multi_cell(0, 6, _clean(sw.get("analysis", "N/A")))
            if sw.get("disclaimer"):
                pdf.ln(3)
                pdf.set_font("Helvetica", "I", 9)
                pdf.set_text_color(120, 100, 0)
                pdf.multi_cell(0, 5, "Note: " + _clean(sw["disclaimer"]))
                pdf.set_text_color(30, 30, 30)

        elif section_key == "future_scope":
            fs = results.get("future_scope", {})
            pdf.multi_cell(0, 6, _clean(fs.get("analysis", "N/A")))
            if fs.get("disclaimer"):
                pdf.ln(3)
                pdf.set_font("Helvetica", "I", 9)
                pdf.set_text_color(120, 100, 0)
                pdf.multi_cell(0, 5, "Note: " + _clean(fs["disclaimer"]))
                pdf.set_text_color(30, 30, 30)

        elif section_key == "citations":
            cites = results.get("citations", [])
            if cites:
                pdf.set_font("Helvetica", "B", 9)
                col_w = [12, 40, 80, 20, 30]
                headers = ["#", "Author", "Title", "Year", "Style"]
                for i, h in enumerate(headers):
                    pdf.cell(col_w[i], 7, h, border=1)
                pdf.ln()
                pdf.set_font("Helvetica", "", 8)
                for idx, c in enumerate(cites, 1):
                    row = [
                        str(idx),
                        _clean((c.get("author") or "-")[:25]),
                        _clean((c.get("title") or "-")[:50]),
                        _clean(c.get("year") or "-"),
                        _clean(c.get("style") or "-"),
                    ]
                    for i, val in enumerate(row):
                        pdf.cell(col_w[i], 6, val, border=1)
                    pdf.ln()
            else:
                pdf.multi_cell(0, 6, "No citations detected.")

        pdf.ln(4)

    # Footer
    pdf.ln(10)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(150, 150, 150)
    pdf.cell(0, 6, "Generated by Research Paper Analyzer", align="C")

    pdf.output(output_path)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    ensure_models()
    print("Starting Research Paper Analyzer on http://127.0.0.1:5000\n")
    app.run(debug=True, threaded=True, port=5000)
