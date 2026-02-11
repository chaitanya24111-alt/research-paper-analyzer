"""PDF text extraction with OCR fallback."""

import fitz  # PyMuPDF
import math

# pytesseract / PIL imported lazily so the app still starts if Tesseract is not installed.

MIN_TEXT_LENGTH = 100  # characters – below this we assume scanned PDF


def extract_text_from_pdf(pdf_path: str) -> dict:
    """Return extracted text and basic document statistics.

    Returns
    -------
    dict with keys: text, page_count, word_count, reading_time_min
    """
    doc = fitz.open(pdf_path)
    page_count = len(doc)

    # --- Try native text extraction first ---
    pages_text: list[str] = []
    for page in doc:
        pages_text.append(page.get_text())

    full_text = "\n".join(pages_text).strip()

    # --- OCR fallback for scanned PDFs ---
    if len(full_text) < MIN_TEXT_LENGTH:
        full_text = _ocr_extract(doc)

    doc.close()

    word_count = len(full_text.split())
    reading_time = max(1, math.ceil(word_count / 250))

    return {
        "text": full_text,
        "page_count": page_count,
        "word_count": word_count,
        "reading_time_min": reading_time,
    }


def _ocr_extract(doc: fitz.Document) -> str:
    """Extract text via Tesseract OCR (for scanned PDFs)."""
    try:
        import pytesseract
        from PIL import Image
        import io
    except ImportError:
        return "(OCR failed – pytesseract or Pillow not installed.)"

    ocr_pages: list[str] = []
    for page in doc:
        # Render page to image at 300 DPI
        pix = page.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        text = pytesseract.image_to_string(img)
        ocr_pages.append(text)

    return "\n".join(ocr_pages).strip()
