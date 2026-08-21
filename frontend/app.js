const API_BASE = window.PRODUCTIQ_API_BASE || "http://127.0.0.1:8000";
const state = {
  mode: "compose",
  urls: [""],
  files: [],
};

const SCHEMA_FIELDS = ["product_name","category","brand","description","key_specifications",
  "materials","dimensions","weight","certifications","use_cases","compatible_with","power_requirements"];

// ---------- backend health check ----------
async function checkHealth(){
  const dot = document.getElementById('apiDot');
  const text = document.getElementById('apiStatusText');
  try{
    const res = await fetch(`${API_BASE}/api/health`);
    const j = await res.json();
    if (j.status === 'ok'){
      dot.classList.add(j.key_configured ? 'ok' : 'down');
      text.textContent = j.key_configured ? 'Backend connected' : 'Backend up, but no API key set (.env)';
    }
  } catch(e){
    dot.classList.add('down');
    text.textContent = 'Backend unreachable — is the server running?';
  }
}

// ---------- rendering per mode ----------
function renderMain(){
  const el = document.getElementById('mainArea');
  if (state.mode === 'compose'){
    el.innerHTML = composeHTML();
    wireCompose();
  } else {
    el.innerHTML = batchHTML();
    wireBatch();
  }
}

function composeHTML(){
  return `
  <div class="panel">
    <div class="panel-title">Multi-source intake</div>
    <div class="panel-sub">Attach anything you have — text, links, PDFs, images, spreadsheets — all at once. Everything gets merged into one enriched product record.</div>

    <div class="compose-block">
      <div class="field-label">Raw text (optional)</div>
      <textarea id="rawText" placeholder="Paste catalog copy, spec text, notes…"></textarea>
      <div class="samples">
        <button class="sample-chip" data-sample="pump">Try: industrial pump</button>
        <button class="sample-chip" data-sample="bracket">Try: steel bracket</button>
      </div>
    </div>

    <div class="compose-block">
      <div class="field-label">Website URLs (optional)</div>
      <div id="urlRows"></div>
      <button class="icon-btn add" id="addUrlBtn" style="width:auto;padding:8px 14px;font-size:12.5px;">+ Add another URL</button>
    </div>

    <div class="compose-block">
      <div class="field-label">Files — PDF, image, CSV, XLSX (optional)</div>
      <div class="drop" id="dropZone">
        <div class="ic">⇪</div>
        <div class="main">Drop files here, or click to browse</div>
        <div class="sub">You can attach multiple files of different types at once</div>
      </div>
      <input type="file" id="fileInput" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xlsx,.xls">
      <div class="chips" id="fileChips"></div>
    </div>

    <div class="runbar">
      <button class="run-btn" id="runBtn">Run extraction →</button>
      <span class="status-line" id="statusLine"></span>
    </div>
  </div>

  <div class="output-panel" id="outputPanel">
    <div class="output-empty">
      <div class="ic">◎</div>
      <div class="t">Structured, validated product intelligence will appear here — with source, confidence, and evidence for every field.</div>
    </div>
  </div>
  `;
}

function batchHTML(){
  return `
  <div class="panel">
    <div class="panel-title">Batch catalog</div>
    <div class="panel-sub">Paste multiple products, one per line, to process as a catalog.</div>
    <textarea id="batchText" style="min-height:280px;" placeholder="Product A: steel valve, 2 inch, brass fittings&#10;Product B: LED panel light 40W, aluminum housing&#10;Product C: …"></textarea>
    <div class="runbar">
      <button class="run-btn" id="runBatchBtn">Process batch →</button>
      <span class="status-line" id="statusLine"></span>
    </div>
  </div>
  <div class="output-panel" id="outputPanel">
    <div class="output-empty">
      <div class="ic">◎</div>
      <div class="t">Batch results will appear here as a scorecard per product.</div>
    </div>
  </div>
  `;
}

// ---------- compose mode wiring ----------
function wireCompose(){
  renderUrlRows();
  document.getElementById('addUrlBtn').addEventListener('click', ()=>{
    state.urls.push("");
    renderUrlRows();
  });

  const dz = document.getElementById('dropZone');
  const fi = document.getElementById('fileInput');
  dz.addEventListener('click', ()=>fi.click());
  dz.addEventListener('dragover', e=>{e.preventDefault(); dz.classList.add('drag');});
  dz.addEventListener('dragleave', ()=>dz.classList.remove('drag'));
  dz.addEventListener('drop', e=>{
    e.preventDefault(); dz.classList.remove('drag');
    addFiles(e.dataTransfer.files);
  });
  fi.addEventListener('change', e=>{ addFiles(e.target.files); fi.value=""; });

  document.querySelectorAll('.sample-chip').forEach(b=>{
    b.addEventListener('click', ()=>{
      const samples = {
        pump: "XR-450 Centrifugal Pump. Used in water treatment plants. Stainless steel body. Flow rate up to 450 L/min. Made by HydroTech Industries.",
        bracket: "heavy duty L bracket, galvanized steel, for mounting shelving units, sold in packs of 10, approx 4x4 inch"
      };
      document.getElementById('rawText').value = samples[b.dataset.sample];
    });
  });

  renderFileChips();
  document.getElementById('runBtn').addEventListener('click', runCompose);
}

function renderUrlRows(){
  const wrap = document.getElementById('urlRows');
  wrap.innerHTML = state.urls.map((u,i)=>`
    <div class="url-row">
      <input type="url" data-i="${i}" class="url-input" placeholder="https://example.com/product-page" value="${u.replace(/"/g,'&quot;')}">
      ${state.urls.length > 1 ? `<button class="icon-btn rmUrl" data-i="${i}">✕</button>` : ''}
    </div>`).join('');
  wrap.querySelectorAll('.url-input').forEach(inp=>{
    inp.addEventListener('input', ()=>{ state.urls[+inp.dataset.i] = inp.value; });
  });
  wrap.querySelectorAll('.rmUrl').forEach(b=>{
    b.addEventListener('click', ()=>{ state.urls.splice(+b.dataset.i,1); renderUrlRows(); });
  });
}

function addFiles(fileListObj){
  state.files.push(...Array.from(fileListObj));
  renderFileChips();
}

function fileTypeLabel(name){
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (['png','jpg','jpeg','webp','gif'].includes(ext)) return 'IMG';
  if (['csv','xlsx','xls'].includes(ext)) return 'SHEET';
  return 'FILE';
}

function renderFileChips(){
  const el = document.getElementById('fileChips');
  if (!el) return;
  el.innerHTML = state.files.map((f,i)=>`
    <div class="chip">
      <span class="ctype">${fileTypeLabel(f.name)}</span>
      <span class="cname">${f.name}</span>
      <button class="crm" data-i="${i}">✕</button>
    </div>`).join('');
  el.querySelectorAll('.crm').forEach(b=>{
    b.addEventListener('click', ()=>{ state.files.splice(+b.dataset.i,1); renderFileChips(); });
  });
}

// ---------- validation & scoring (mirrors backend, used only for graceful client display if needed) ----------
function fieldLabel(f){ return f.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()); }

// ---------- run extraction (compose) ----------
async function runCompose(){
  const statusEl = document.getElementById('statusLine');
  const runBtn = document.getElementById('runBtn');
  statusEl.textContent = ''; statusEl.classList.remove('err');

  const rawText = document.getElementById('rawText').value.trim();
  const urls = state.urls.map(u=>u.trim()).filter(Boolean);

  if (!rawText && urls.length === 0 && state.files.length === 0){
    statusEl.textContent = 'Attach at least one source — text, URL, or file.';
    statusEl.classList.add('err');
    return;
  }

  const fd = new FormData();
  fd.append('text', rawText);
  fd.append('urls', urls.join('\n'));
  state.files.forEach(f => fd.append('files', f));

  runBtn.disabled = true;
  showLoading();
  statusEl.textContent = 'Uploading and extracting…';

  try{
    const res = await fetch(`${API_BASE}/api/extract`, { method:'POST', body: fd });
    const json = await res.json();
    if (!res.ok){
      throw new Error(json.error || `Server error ${res.status}`);
    }
    renderOutput(json);
    statusEl.textContent = 'Done.';
  } catch(err){
    statusEl.classList.add('err');
    statusEl.textContent = err.message || 'Something went wrong.';
    document.getElementById('outputPanel').innerHTML = emptyOutputHTML();
  } finally {
    runBtn.disabled = false;
  }
}

function emptyOutputHTML(){
  return `<div class="output-empty"><div class="ic">◎</div><div class="t">Structured, validated product intelligence will appear here — with source, confidence, and evidence for every field.</div></div>`;
}

function showLoading(){
  document.getElementById('outputPanel').innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      <div class="lt">retrieving sources · extracting · validating…</div>
    </div>`;
}

function buildDonutSVG(extractedCount, inferredCount){
  const total = extractedCount + inferredCount || 1;
  const circumference = 2 * Math.PI * 40;
  const extractedLen = (extractedCount/total) * circumference;
  return `
  <svg width="100" height="100" viewBox="0 0 100 100">
    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--coral-pale)" stroke-width="14"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="var(--green)" stroke-width="14"
      stroke-dasharray="${extractedLen} ${circumference}" stroke-dashoffset="0"
      transform="rotate(-90 50 50)" stroke-linecap="butt"/>
  </svg>`;
}

function buildBarChart(meta){
  const rows = SCHEMA_FIELDS.map(f => ({ f, conf: (meta[f]?.confidence ?? 0) }));
  return rows.map(r => `
    <div class="bar-row">
      <span class="bar-label">${fieldLabel(r.f)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${r.conf}%;"></div></div>
      <span class="bar-pct">${r.conf}%</span>
    </div>`).join('');
}

function renderOutput(result){
  const data = result.data || {};
  const meta = result.meta || {};
  const flags = result.flags || {};
  const score = result.quality_score ?? 0;
  const sources = result.sources_used || [];

  state.lastResult = { data, meta };
  state.chatHistory = [];

  const circumference = 2 * Math.PI * 46;
  const offset = circumference - (score/100)*circumference;
  const color = score>=75 ? 'var(--green)' : (score>=50 ? 'var(--coral)' : 'var(--red)');

  const extractedCount = SCHEMA_FIELDS.filter(f => meta[f]?.source === 'extracted').length;
  const inferredCount = SCHEMA_FIELDS.length - extractedCount;

  let html = `
  <div class="gauge-wrap">
    <div class="gauge">
      <svg width="110" height="110" viewBox="0 0 110 110">
        <circle cx="55" cy="55" r="46" fill="none" stroke="var(--line)" stroke-width="9"/>
        <circle cx="55" cy="55" r="46" fill="none" stroke="${color}" stroke-width="9"
          stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round"/>
      </svg>
      <div class="gauge-num"><div class="n">${score}</div><div class="l">/ 100</div></div>
    </div>
    <div class="gauge-info">
      <div class="gt">Data quality score</div>
      <div class="gs">Blends completeness, model confidence, and independent validation checks.</div>
    </div>
  </div>`;

  if (sources.length){
    html += `<div class="sources-strip">${sources.map(s=>`<span class="source-tag">${s}</span>`).join('')}</div>`;
  }

  html += `
  <div class="charts-row">
    <div class="chart-card">
      <div class="chart-title">Source mix</div>
      <div class="donut-wrap">
        ${buildDonutSVG(extractedCount, inferredCount)}
        <div class="donut-legend">
          <div class="legend-item"><span class="dot extracted"></span>Extracted — ${extractedCount}</div>
          <div class="legend-item"><span class="dot inferred"></span>AI-inferred — ${inferredCount}</div>
        </div>
      </div>
    </div>
    <div class="chart-card">
      <div class="chart-title">Confidence by field</div>
      <div class="bar-chart">${buildBarChart(meta)}</div>
    </div>
  </div>`;

  SCHEMA_FIELDS.forEach(f=>{
    const val = data[f] ?? 'unknown';
    const m = meta[f] || {};
    const src = m.source || 'unknown';
    const conf = m.confidence ?? 0;
    const evidence = m.evidence || '';
    const flag = flags[f];
    const isComplex = typeof val === 'object';
    const displayVal = isComplex ? JSON.stringify(val) : val;

    html += `<div class="field-card">
      <div class="field-head">
        <span class="field-name">${fieldLabel(f)}</span>
        <span class="badge ${src==='extracted'?'extracted':'inferred'}">${src==='extracted'?'extracted':'AI-inferred'}</span>
      </div>
      <div class="field-val ${isComplex?'mono':''}">${displayVal}</div>
      <div class="conf-bar-wrap">
        <div class="conf-bar"><div class="conf-fill" style="width:${conf}%;"></div></div>
        <span class="conf-pct">${conf}%</span>
      </div>
      ${evidence ? `<div class="field-evidence">↳ ${evidence}</div>` : ''}
      ${flag ? `<div class="field-flag ${flag.level}">${flag.level==='warning'?'⚠':'✓'} ${flag.msg}</div>` : ''}
    </div>`;
  });

  html += `<div class="output-actions">
    <button class="out-btn" id="dlJson">Download JSON</button>
  </div>`;

  html += `
  <div class="chat-panel">
    <div class="chat-head">💬 Ask about this product</div>
    <div class="chat-messages" id="chatMessages">
      <div class="chat-bubble bot">Ask me anything about this extracted record — e.g. "What's the flow rate?" or "Is this certified for water treatment?"</div>
    </div>
    <div class="chat-input-row">
      <input type="text" id="chatInput" placeholder="Ask a question about this result…">
      <button id="chatSend" class="chat-send-btn">Ask</button>
    </div>
  </div>`;

  document.getElementById('outputPanel').innerHTML = html;
  document.getElementById('dlJson').addEventListener('click', ()=>{
    downloadJSON(result, 'product_structured.json');
  });

  document.getElementById('chatSend').addEventListener('click', sendChatMessage);
  document.getElementById('chatInput').addEventListener('keydown', e=>{
    if (e.key === 'Enter') sendChatMessage();
  });
}

async function sendChatMessage(){
  const input = document.getElementById('chatInput');
  const question = input.value.trim();
  if (!question || !state.lastResult) return;
  input.value = '';

  const msgs = document.getElementById('chatMessages');
  msgs.innerHTML += `<div class="chat-bubble user">${question}</div>`;
  msgs.innerHTML += `<div class="chat-bubble bot typing" id="typingBubble">…</div>`;
  msgs.scrollTop = msgs.scrollHeight;

  const fd = new FormData();
  fd.append('question', question);
  fd.append('record', JSON.stringify(state.lastResult));
  fd.append('history', JSON.stringify(state.chatHistory));

  try{
    const res = await fetch(`${API_BASE}/api/chat`, { method:'POST', body: fd });
    const json = await res.json();
    const typing = document.getElementById('typingBubble');
    if (!res.ok){
      typing.textContent = json.error || 'Something went wrong.';
      typing.classList.add('err');
    } else {
      typing.textContent = json.answer;
      typing.classList.remove('typing');
      state.chatHistory.push({role:'user', text: question});
      state.chatHistory.push({role:'assistant', text: json.answer});
    }
  } catch(e){
    const typing = document.getElementById('typingBubble');
    typing.textContent = 'Could not reach the server.';
    typing.classList.add('err');
  }
  msgs.scrollTop = msgs.scrollHeight;
}

// ---------- batch mode ----------
function wireBatch(){
  document.getElementById('runBatchBtn').addEventListener('click', runBatch);
}

async function runBatch(){
  const statusEl = document.getElementById('statusLine');
  const runBtn = document.getElementById('runBatchBtn');
  const raw = document.getElementById('batchText').value.trim();
  if (!raw){
    statusEl.textContent = 'Add at least one product line.';
    statusEl.classList.add('err');
    return;
  }
  runBtn.disabled = true;
  showLoading();
  statusEl.textContent = 'Processing batch…';

  const fd = new FormData();
  fd.append('lines', raw);

  try{
    const res = await fetch(`${API_BASE}/api/extract-batch`, { method:'POST', body: fd });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `Server error ${res.status}`);
    renderBatchOutput(json.items || []);
    statusEl.textContent = `Processed ${json.items?.length || 0} products.`;
  } catch(err){
    statusEl.classList.add('err');
    statusEl.textContent = err.message || 'Something went wrong.';
    document.getElementById('outputPanel').innerHTML = emptyOutputHTML();
  } finally {
    runBtn.disabled = false;
  }
}

function renderBatchOutput(items){
  let html = items.map(r=>`
    <div class="batch-row">
      <span class="bname">${r.error ? '⚠ ' : ''}${r.label}</span>
      <span class="bscore">${r.error ? '—' : r.quality_score+'/100'}</span>
      <span class="bwarn">${r.error ? 'failed' : (Object.keys(r.flags||{}).length ? Object.keys(r.flags).length+' flags' : 'clean')}</span>
    </div>`).join('');
  html += `<div class="output-actions"><button class="out-btn" id="dlBatch">Download JSON</button></div>`;
  document.getElementById('outputPanel').innerHTML = html;
  document.getElementById('dlBatch').addEventListener('click', ()=>{
    downloadJSON(items, 'catalog_structured.json');
  });
}

function downloadJSON(obj, filename){
  const blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ---------- mode switching ----------
document.querySelectorAll('.source-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.source-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.mode = btn.dataset.src;
    state.files = [];
    state.urls = [""];
    renderMain();
  });
});

renderMain();
checkHealth();
