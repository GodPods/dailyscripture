// =======================
// Daily Proverbs & Psalms — API.Bible via chapters (USFM) + UTC-safe
// =======================

const PROXY_BASE = "https://wispy-dawn-9d94.jrusso440.workers.dev"; // <-- your Worker URL
const DEBUG_LOG = true;

// ---------- Elements ----------
const dateInput     = document.getElementById('dateInput');
const todayBtn      = document.getElementById('todayBtn');
const loadBtn       = document.getElementById('loadBtn');
const versionSelect = document.getElementById('versionSelect');

const provRef     = document.getElementById('provRef');
const psRef       = document.getElementById('psRef');
const provText    = document.getElementById('provText');
const psText      = document.getElementById('psText');
const provStatus  = document.getElementById('provStatus');
const psStatus    = document.getElementById('psStatus');
const provGateway = document.getElementById('provGateway');
const psGateway   = document.getElementById('psGateway');

const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// ---------- Helpers (no UTC parsing) ----------
const pad = n => String(n).padStart(2,'0');
function todayYMD(){ const n=new Date(); return {y:n.getFullYear(), m:n.getMonth()+1, d:n.getDate()}; }
function readInputYMD(){ if(!dateInput?.value) return todayYMD(); const [y,m,d]=dateInput.value.split('-').map(Number); return {y,m,d}; }
function computeRefsFromParts(m,d){ const proverbChapter=d; let psalmChapter=(m*d)%150; if(psalmChapter===0) psalmChapter=150; return {proverbChapter, psalmChapter}; }
function bgUrl(book,chapter){ return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(`${book} ${chapter}`)}`; }
function setLoading(which,on){ (which==='prov'?provStatus:psStatus).textContent = on ? 'Loading…' : ''; }
function setTodayInput(){ const {y,m,d}=todayYMD(); dateInput.value = `${y}-${pad(m)}-${pad(d)}`; }

// ---------- API wrapper (absolute/relative base safe) ----------
async function apiBible(path, params = {}) {
  const baseRaw = (PROXY_BASE || '').trim();
  if (!baseRaw) throw new Error('Proxy not configured');
  const base = baseRaw.endsWith('/') ? baseRaw.slice(0,-1) : baseRaw;
  const p = path.startsWith('/') ? path : `/${path}`;

  let url;
  try { url = new URL(base + p); }
  catch { url = new URL(base + p, location.origin); }

  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  if (DEBUG_LOG) console.log('[apiBible] GET', url.toString());

  const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  const text = await r.text();
  if (!r.ok) {
    if (DEBUG_LOG) console.error('[apiBible] HTTP', r.status, text);
    throw new Error(`API ${r.status}`);
  }
  try { return JSON.parse(text); } catch { return { data: null }; }
}

// Try a tiny probe request to confirm a version works (fetch Proverbs 1 as text)
async function isVersionUsable(bibleId) {
  try {
    const resp = await apiBible(`/v1/bibles/${bibleId}/chapters/PRO.1`, {
      'content-type': 'text',
      'include-verse-numbers': 'false',
      'include-titles': 'false',
      'include-notes': 'false'
    });
    // If there's any text content, we consider this version usable
    const content = resp?.data?.content || resp?.data?.passages?.[0]?.content || '';
    return !!String(content).trim();
  } catch {
    return false;
  }
}

// ---------- Versions (populates, then prunes unusable entries) ----------
async function loadVersions() {
  versionSelect.innerHTML = '<option>Loading…</option>';
  try {
    const data = await apiBible('/v1/bibles', { language: 'eng' });
    const list = (data?.data || []).filter(b => b?.id && (b.abbreviation || b.name));

    // Fill the dropdown first
    versionSelect.innerHTML = '';
    for (const b of list) {
      const opt = document.createElement('option');
      opt.value = b.id;
      opt.textContent = b.abbreviation ? `${b.abbreviation} — ${b.name}` : b.name;
      versionSelect.appendChild(opt);
    }

    // Now verify top-down and remove any that fail the chapter probe
    let selectedSet = false;
    for (const opt of Array.from(versionSelect.options)) {
      const ok = await isVersionUsable(opt.value);
      if (ok && !selectedSet) {
        versionSelect.value = opt.value;     // pick the first usable one
        selectedSet = true;
      }
      if (!ok) {
        // Remove unusable option from the list
        opt.remove();
      }
    }

    if (!selectedSet) {
      versionSelect.innerHTML = '<option>No working versions for this API key</option>';
    }

  } catch (e) {
    console.error(e);
    versionSelect.innerHTML = '<option>Error loading versions (check proxy/key)</option>';
  }
}


// ---------- Chapter fetch via USFM (no reference=) ----------
const USFM = { Proverbs: 'PRO', Proverb: 'PRO', Psalms: 'PSA', Psalm: 'PSA' };

async function fetchChapter(bibleId, bookName, chapterNum){
  const usfm = USFM[bookName];
  if (!usfm) throw new Error(`Unknown book: ${bookName}`);
  const chapterId = `${usfm}.${chapterNum}`;

  const resp = await apiBible(`/v1/bibles/${bibleId}/chapters/${chapterId}`, {
    'content-type': 'text',
    'include-verse-numbers': 'true',
    'include-titles': 'false',
    'include-notes': 'false'
  });

  const content =
    resp?.data?.content ||
    resp?.data?.passages?.[0]?.content ||
    '';

  const out = (content || '').trim();
  if (!out) throw new Error(`Empty content for ${chapterId}`);
  return out;
}

// ---------- Main loader (month/day only) ----------
async function loadForMD(m, d){
  if (!m || !d) return;

  let bibleId = versionSelect?.value;
  if (!bibleId) {
    await loadVersions();
    bibleId = versionSelect?.value;
    if (!bibleId) {
      const msg='No versions available (check proxy/key).';
      provText.textContent=msg; psText.textContent=msg; return;
    }
  }

  const { proverbChapter, psalmChapter } = computeRefsFromParts(m, d);

  provRef.textContent = proverbChapter;
  psRef.textContent   = psalmChapter;
  provGateway.href = bgUrl('Proverbs', proverbChapter);
  psGateway.href   = bgUrl('Psalm',    psalmChapter);

  provText.textContent=''; psText.textContent='';
  setLoading('prov', true); setLoading('ps', true);

  try{
    // ✅ Fetch by chapter ID (no reference=)
    const [prov, ps] = await Promise.all([
      fetchChapter(bibleId, 'Proverbs', proverbChapter),
      fetchChapter(bibleId, 'Psalm',    psalmChapter)  // USFM handles Psalm(s)
    ]);

    provText.textContent = `Proverbs ${proverbChapter}\n\n${prov}`;
    psText.textContent   = `Psalm ${psalmChapter}\n\n${ps}`;
  }catch(err){
    console.error(err);
    const msg='Could not load chapter (check version & proxy). Use BibleGateway link above.';
    if (!provText.textContent) provText.textContent = msg;
    if (!psText.textContent)   psText.textContent   = msg;
  }finally{
    setLoading('prov', false); setLoading('ps', false);
  }
}

// ---------- Events ----------
todayBtn.addEventListener('click', () => {
  setTodayInput();
  const { m, d } = readInputYMD();
  loadForMD(m, d);
});

loadBtn.addEventListener('click', () => {
  if (!dateInput.value) setTodayInput();
  const { m, d } = readInputYMD();
  loadForMD(m, d);
});

versionSelect.addEventListener('change', () => {
  const { m, d } = readInputYMD();
  if (m && d) loadForMD(m, d);
});

dateInput.addEventListener('change', () => {
  const { m, d } = readInputYMD();
  if (m && d) loadForMD(m, d);
});

// ---------- Boot ----------
(async function init(){
  setTodayInput();
  await loadVersions();
  const { m, d } = readInputYMD();
  loadForMD(m, d);
})();
