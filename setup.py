"""First-run setup script: downloads required NLP models."""

import subprocess
import sys


def download_spacy_model():
    print("[1/3] Downloading spaCy en_core_web_sm model...")
    subprocess.check_call([sys.executable, "-m", "spacy", "download", "en_core_web_sm"])
    print("  -> spaCy model ready.\n")


def download_nltk_data():
    print("[2/3] Downloading NLTK data (punkt_tab, stopwords)...")
    import nltk
    nltk.download("punkt_tab", quiet=False)
    nltk.download("stopwords", quiet=False)
    print("  -> NLTK data ready.\n")


def download_bart_model():
    print("[3/3] Downloading BART model (facebook/bart-large-cnn)...")
    print("  This may take a while on first run (~1.6 GB).")
    from transformers import AutoTokenizer, AutoModelForSeq2SeqLM
    AutoTokenizer.from_pretrained("facebook/bart-large-cnn")
    AutoModelForSeq2SeqLM.from_pretrained("facebook/bart-large-cnn")
    print("  -> BART model cached and ready.\n")


def main():
    print("=" * 60)
    print("  Research Paper Analyzer - Model Setup")
    print("=" * 60 + "\n")

    download_spacy_model()
    download_nltk_data()
    download_bart_model()

    print("=" * 60)
    print("  All models downloaded successfully!")
    print("  Run the app with: python app.py")
    print("=" * 60)


if __name__ == "__main__":
    main()
