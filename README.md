# ProductIQ v2 — AI Product Intelligence for Industrial Commerce

UniHack 2026 · Unilog Challenge · Full-stack version (FastAPI backend + HTML/CSS/JS frontend)

## What changed from v1
- **Multi-attach**: attach text + multiple URLs + multiple files (PDF/image/CSV/XLSX) in ONE request — all merged into one enriched record.
- **Spreadsheet extraction actually works** — parsed server-side with pandas/openpyxl, not left to the browser.
- **API key never touches the browser** — it lives only in `backend/.env`, read server-side.
- **Bigger output panel** — spacious, sticky, full detail per field.
- **Separate files** — `main.py` (FastAPI routes), `rag.py` (multi-source retrieval + Gemini generation), `models.py` (Pydantic schemas), `validation.py` (rule-based checks), and a plain `index.html` / `style.css` / `app.js` frontend.
- **New theme** — light "engineering blueprint" look (grid-lined paper background, blueprint blue + coral accents) instead of the old dark panel.

## Project structure
```
productiq-v2/
├── backend/
│   ├── main.py           FastAPI app + routes
│   ├── rag.py             multi-source ingestion (PDF/URL/image/sheet) + Gemini call
│   ├── models.py          Pydantic request/response schemas
│   ├── validation.py      independent rule-based validation + quality score
│   ├── requirements.txt
│   └── .env.example       copy to .env and add your key
└── frontend/
    ├── index.html      landing page (marketing/pitch page)
    ├── app.html        the actual tool (multi-attach, batch, results)
    ├── landing.js      scroll-reveal + hero animations for index.html
    ├── style.css        shared styles for both pages
    └── app.js          all tool logic: extraction, charts, chat
```

## New in this version
- **Landing page** (`index.html`) — proper hero, "how it works" pipeline, feature grid, scroll animations — instead of dropping straight into the tool.
- **Results Q&A chatbot** — after extraction, ask questions about the specific record ("what's the flow rate?", "is this certified for X?"). Answers are grounded ONLY in that record via `/api/chat`.
- **Visual charts in the output** — a source-mix donut (extracted vs AI-inferred fields) and a confidence-by-field bar chart, so the trust story is visual, not just numbers.
- Output panel got hover polish on field cards.

## Setup

### 1. Backend
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# edit .env and paste your key:
# GEMINI_API_KEY=AIzaSy...
uvicorn main:app --reload --port 8000
```
Get a free key: https://aistudio.google.com/apikey

Check it's alive: open http://127.0.0.1:8000/api/health — should show `"key_configured": true`.

### 2. Frontend
Just open `frontend/index.html` directly in a browser (double-click it) — that's the landing page.
Click "Launch ProductIQ" to get to the actual tool (`app.html`). Or serve both with any static server:
```bash
cd frontend
python3 -m http.server 5500
```
Then visit http://127.0.0.1:5500

The frontend talks to the backend at `http://127.0.0.1:8000` by default. If you deploy the backend elsewhere,
add this line to `app.html` right before `<script src="app.js">`:
```html
<script>window.PRODUCTIQ_API_BASE = "https://your-backend-url.com";</script>
```

## How multi-attach works
Pick "Multi-attach" mode → paste text and/or add URLs and/or drop files (any mix, any count) → "Run extraction".
The backend:
1. Pulls raw content out of every source (PDF text via pypdf, spreadsheet rows via pandas, page text via requests+BeautifulSoup, images stay as images for Gemini's vision).
2. Combines everything into one labeled context block.
3. Sends ONE Gemini call (text context + any images) asking it to merge everything into a single structured, enriched product record.
4. Runs the result through an independent rule-based validator (units, known certifications, category/description consistency) — this does not just trust the model's own confidence.
5. Returns data + meta (source/confidence/evidence per field) + validation flags + a composite quality score.

## Deploying for the hackathon demo
- **Backend**: Render.com, Railway, or Fly.io all have free tiers that run FastAPI directly — push this backend folder, set `GEMINI_API_KEY` as an environment variable in their dashboard.
- **Frontend**: GitHub Pages / Netlify / Vercel — drag and drop the `frontend` folder. Just remember to set `window.PRODUCTIQ_API_BASE` to your deployed backend URL.

## Tech stack
FastAPI, Pydantic, Google Gemini API (`gemini-3.6-flash`), pypdf, pandas/openpyxl, BeautifulSoup, Pillow — HTML/CSS/JS frontend, no framework, no build step.
