"""
rag.py — Retrieval + generation core.

"Retrieval" here = pulling raw content out of whatever the user attached
(PDF bytes, a spreadsheet, a URL, an image, or plain text) and normalizing
it into a single combined context.

"Generation" = one Gemini call that reads the combined context (+ any images)
and returns a structured, enriched, explainable product record.
"""
import os
import io
import json
import re
import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader
import pandas as pd
from PIL import Image
from google import genai
from google.genai import types

GEMINI_MODEL = "gemini-3.6-flash"

SYSTEM_PROMPT = """You are an industrial product data intelligence engine.
You will be given content gathered from one or more sources (raw text, a PDF, a
spreadsheet row, a scraped web page, and/or a product image). Treat all of it as
describing the SAME product and merge it into one structured, enriched record.

Rules:
1. Output ONLY valid JSON, no markdown fences, no preamble.
2. Use this exact schema (keys), fill "unknown" if truly not derivable:
   product_name, category, brand, description, key_specifications (object),
   materials (array), dimensions (string), weight (string), certifications (array),
   use_cases (array), compatible_with (array), power_requirements (string)
3. For EVERY field, also provide a matching field in a separate "meta" object with:
   - "source": "extracted" (directly found in the provided content) or "inferred"
     (you filled a gap using domain knowledge)
   - "confidence": a number 0-100
   - "evidence": a short quote or paraphrase (<15 words) from the content that
     supports it, or "domain knowledge" if inferred
4. Final JSON shape:
{
  "data": { ...schema fields... },
  "meta": { "<field_name>": {"source": "...", "confidence": 0, "evidence": "..."} }
}
Be accurate. Do not hallucinate certifications or specs that contradict the input.
Prefer "unknown" over guessing wildly.
"""


def _get_client():
    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set on server. Add it to backend/.env")
    return genai.Client(api_key=api_key)


# ---------------- retrieval helpers ----------------

def extract_pdf_text(file_bytes: bytes, max_pages: int = 15, max_chars: int = 12000) -> str:
    reader = PdfReader(io.BytesIO(file_bytes))
    chunks = []
    for i, page in enumerate(reader.pages[:max_pages]):
        chunks.append(page.extract_text() or "")
    text = "\n".join(chunks)
    return text[:max_chars]


def extract_spreadsheet_text(file_bytes: bytes, filename: str, max_rows: int = 25) -> str:
    ext = filename.lower().split(".")[-1]
    buf = io.BytesIO(file_bytes)
    if ext == "csv":
        df = pd.read_csv(buf)
    else:
        df = pd.read_excel(buf)
    df = df.head(max_rows)
    return df.to_csv(index=False)


def fetch_url_text(url: str, max_chars: int = 10000, timeout: int = 12) -> str:
    headers = {"User-Agent": "Mozilla/5.0 (ProductIQ ingestion bot)"}
    resp = requests.get(url, headers=headers, timeout=timeout)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header"]):
        tag.decompose()
    text = re.sub(r"\s+", " ", soup.get_text(separator=" ")).strip()
    return text[:max_chars]


def load_image(file_bytes: bytes) -> Image.Image:
    return Image.open(io.BytesIO(file_bytes)).convert("RGB")


# ---------------- generation ----------------

def _clean_json(text: str) -> dict:
    text = re.sub(r"^```json|```$", "", text.strip(), flags=re.MULTILINE).strip()
    return json.loads(text)


def generate_structured_record(context_blocks: list[str], images: list[Image.Image] | None = None) -> dict:
    """context_blocks: list of labeled text chunks from different sources.
    images: optional list of PIL images to pass to Gemini vision."""
    client = _get_client()
    combined_context = "\n\n---\n\n".join(context_blocks) if context_blocks else "(no text content provided)"
    parts: list = [SYSTEM_PROMPT + "\n\nCombined source content:\n\n" + combined_context]
    if images:
        parts.extend(images)
    resp = client.models.generate_content(
        model=GEMINI_MODEL,
        contents=parts,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    return _clean_json(resp.text)


def generate_for_single_text(text: str) -> dict:
    return generate_structured_record([f"[Source: pasted text]\n{text}"])


def answer_question_about_record(record: dict, question: str, history: list[dict] | None = None) -> str:
    """Grounded Q&A: answers questions using ONLY the extracted product record as context."""
    client = _get_client()
    history = history or []
    convo = "\n".join([f"{h['role']}: {h['text']}" for h in history[-6:]])
    prompt = f"""You are a helpful assistant answering questions about ONE specific product record
that was just extracted by ProductIQ. Only use the record below as your source of truth — if the
answer isn't in the record, say so honestly rather than guessing. Keep answers short (2-4 sentences)
and conversational.

Product record (JSON):
{json.dumps(record, indent=2)}

Recent conversation:
{convo}

User question: {question}

Answer:"""
    resp = client.models.generate_content(model=GEMINI_MODEL, contents=[prompt])
    return resp.text.strip()
