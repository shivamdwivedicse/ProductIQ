"""
main.py — FastAPI backend for ProductIQ.

Run:
    uvicorn main:app --reload --port 8000

The Gemini API key lives ONLY here (backend/.env), never sent to the browser.
"""
import os
import json
import traceback
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

import rag
import validation as validation
from models import ExtractResponse, BatchResponse, BatchItem

load_dotenv()

app = FastAPI(title="ProductIQ API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # demo/hackathon setting — restrict this in real production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "key_configured": bool(os.environ.get("GEMINI_API_KEY"))}


@app.post("/api/extract", response_model=ExtractResponse)
async def extract(
    text: str = Form(default=""),
    urls: str = Form(default=""),         # newline-separated list of URLs
    files: List[UploadFile] = File(default=[]),
):
    """
    Accepts ANY combination of: pasted text, one or more URLs (newline separated),
    and one or more uploaded files (PDF / image / CSV / XLSX) — all at once.
    Everything is merged into one combined context and sent as a single
    extraction+enrichment call.
    """
    try:
        context_blocks = []
        images = []
        sources_used = []

        if text and text.strip():
            context_blocks.append(f"[Source: pasted text]\n{text.strip()}")
            sources_used.append("text")

        url_list = [u.strip() for u in urls.split("\n") if u.strip()]
        for url in url_list:
            try:
                page_text = rag.fetch_url_text(url)
                context_blocks.append(f"[Source: URL {url}]\n{page_text}")
                sources_used.append(f"url:{url}")
            except Exception as e:
                context_blocks.append(f"[Source: URL {url}]\n(Could not fetch this URL: {e})")
                sources_used.append(f"url-failed:{url}")

        for f in files:
            raw = await f.read()
            fname = f.filename or "file"
            ext = fname.lower().split(".")[-1]
            try:
                if ext == "pdf":
                    txt = rag.extract_pdf_text(raw)
                    context_blocks.append(f"[Source: PDF {fname}]\n{txt}")
                    sources_used.append(f"pdf:{fname}")
                elif ext in ("csv", "xlsx", "xls"):
                    txt = rag.extract_spreadsheet_text(raw, fname)
                    context_blocks.append(f"[Source: Spreadsheet {fname}]\n{txt}")
                    sources_used.append(f"sheet:{fname}")
                elif ext in ("png", "jpg", "jpeg", "webp", "gif"):
                    img = rag.load_image(raw)
                    images.append(img)
                    sources_used.append(f"image:{fname}")
                else:
                    # fall back: try to decode as plain text
                    try:
                        context_blocks.append(f"[Source: {fname}]\n{raw.decode('utf-8', errors='ignore')[:8000]}")
                        sources_used.append(f"text-file:{fname}")
                    except Exception:
                        pass
            except Exception as e:
                context_blocks.append(f"[Source: {fname}]\n(Could not parse this file: {e})")

        if not context_blocks and not images:
            return JSONResponse(status_code=400, content={"error": "No usable input provided."})

        result = rag.generate_structured_record(context_blocks, images)
        data = result.get("data", {})
        meta = result.get("meta", {})
        flags = validation.validate_record(data, meta)
        score = validation.compute_quality_score(data, meta, flags)

        return {
            "data": data,
            "meta": meta,
            "flags": flags,
            "quality_score": score,
            "sources_used": sources_used,
        }

    except RuntimeError as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"{type(e).__name__}: {e}"})


@app.post("/api/extract-batch", response_model=BatchResponse)
async def extract_batch(lines: str = Form(...)):
    """lines: newline-separated list of short product descriptions."""
    items = []
    for line in [l.strip() for l in lines.split("\n") if l.strip()]:
        try:
            result = rag.generate_for_single_text(line)
            data = result.get("data", {})
            meta = result.get("meta", {})
            flags = validation.validate_record(data, meta)
            score = validation.compute_quality_score(data, meta, flags)
            items.append({
                "label": data.get("product_name") or line[:40],
                "data": data, "meta": meta, "flags": flags,
                "quality_score": score, "error": None,
            })
        except Exception as e:
            items.append({
                "label": line[:40], "data": {}, "meta": {}, "flags": {},
                "quality_score": 0, "error": str(e),
            })
    return {"items": items}


@app.post("/api/chat")
async def chat(
    question: str = Form(...),
    record: str = Form(...),      # JSON string of the {data, meta} record being discussed
    history: str = Form(default="[]"),  # JSON string: [{"role":"user"|"assistant","text":"..."}]
):
    """Ask a question grounded in a specific already-extracted product record."""
    try:
        record_obj = json.loads(record)
        history_obj = json.loads(history) if history else []
        answer = rag.answer_question_about_record(record_obj, question, history_obj)
        return {"answer": answer}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(status_code=500, content={"error": f"{type(e).__name__}: {e}"})
