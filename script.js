// Daily Proverbs & Psalms — API.Bible Version Dropdown
const PROXY_BASE = "https://wispy-dawn-9d94.jrusso440.workers.dev"; // Set to your proxy (Cloudflare Worker / Netlify Function)

const dateInput=document.getElementById('dateInput');
const todayBtn=document.getElementById('todayBtn');
const loadBtn=document.getElementById('loadBtn');
const versionSelect=document.getElementById('versionSelect');
const provRef=document.getElementById('provRef');
const psRef=document.getElementById('psRef');
const provText=document.getElementById('provText');
const psText=document.getElementById('psText');
const provStatus=document.getElementById('provStatus');
const psStatus=document.getElementById('psStatus');
const provGateway=document.getElementById('provGateway');
const psGateway=document.getElementById('psGateway');
document.getElementById('year').textContent=new Date().getFullYear();

const pad=n=>String(n).padStart(2,'0');
function todayYMD(){const n=new Date();return{y:n.getFullYear(),m:n.getMonth()+1,d:n.getDate()};}
function readInputYMD(){if(!dateInput.value)return todayYMD();const[y,m,d]=dateInput.value.split('-').map(Number);return{y,m,d};}
function computeRefsFromParts(m,d){const proverbChapter=d;let psalmChapter=(m*d)%150;if(psalmChapter===0)psalmChapter=150;return{proverbChapter,psalmChapter};}
function bgUrl(book,chapter){const q=encodeURIComponent(`${book} ${chapter}`);return`https://www.biblegateway.com/passage/?search=${q}`;}
function setLoading(which,on){(which==='prov'?provStatus:psStatus).textContent=on?'Loading…':'';}

// Accepts either absolute (https://...workers.dev) or relative (/.netlify/functions/...) PROXY_BASE
async function apiBible(path, params = {}) {
  const baseRaw = (PROXY_BASE || '').trim();
  if (!baseRaw) throw new Error('Proxy not configured. Set PROXY_BASE.');

  // normalize base and path
  const base = baseRaw.endsWith('/') ? baseRaw.slice(0, -1) : baseRaw;
  const p = path.startsWith('/') ? path : `/${path}`;

  // If base is absolute, use it directly; if it's relative, resolve against current origin
  let url;
  try {
    // Try as absolute first
    url = new URL(base + p);
  } catch {
    // Fallback: treat base as relative to current origin
    url = new URL(base + p, window.location.origin);
  }

  // add query params
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`API ${r.status}`);
  return r.json();
}

async function loadVersions(){
  versionSelect.innerHTML='<option>Loading…</option>';
  try{
    const data=await apiBible('/v1/bibles',{language:'eng'});
    const list=data?.data||[];
    if(!list.length)throw new Error('No versions found');
    versionSelect.innerHTML='';
    for(const b of list){
      const opt=document.createElement('option');
      opt.value=b.id;
      opt.textContent=b.abbreviation?`${b.abbreviation} — ${b.name}`:b.name;
      versionSelect.appendChild(opt);
    }
  }catch(e){
    console.error(e);
    versionSelect.innerHTML='<option>Error loading versions</option>';
  }
}

// Robust passage fetch: try common reference spellings, then fall back via /search
async function fetchPassage(bibleId, reference) {
  // helper to call /passages once
  async function getPass(refStr) {
    const resp = await apiBible(`/v1/bibles/${bibleId}/passages`, {
      reference: refStr,
      'content-type': 'text',
      'include-verse-numbers': 'true',
      'include-titles': 'false',
      'include-notes': 'false'
    });
    const content = resp?.data?.content || resp?.data?.passages?.[0]?.content || '';
    return (content || '').trim();
  }

  // 1) try as-is
  let content = await getPass(reference);
  if (content) return content;

  // 2) Psalm/Psalms toggle (and Proverb/Proverbs just in case)
  const swaps = {
    'Psalm ': 'Psalms ',
    'Psalms ': 'Psalm ',
    'Proverb ': 'Proverbs ',
    'Proverbs ': 'Proverb '
  };
  for (const [a, b] of Object.entries(swaps)) {
    if (reference.startsWith(a)) {
      content = await getPass(reference.replace(a, b));
      if (content) return content;
    }
  }

  // 3) Fallback via /search → reuse first hit's reference back into /passages
  //    This helps when the API wants a slightly different canonical ref.
  const search = await apiBible(`/v1/bibles/${bibleId}/search`, {
    query: reference,
    limit: 1
  });
  const ref = search?.data?.verses?.[0]?.reference;
  if (ref) {
    content = await getPass(ref);
    if (content) return content;
  }

  return '(No content returned for this reference.)';
}


// Load passages for a given month/day using the selected API.Bible version.
// Assumes: computeRefsFromParts, bgUrl, setLoading, fetchPassage, loadVersions,
// and the DOM refs (versionSelect, provRef, psRef, provText, psText, provGateway, psGateway) exist.
async function loadForMD(m, d) {
  // Basic guard
  if (!m || !d) return;

  // Ensure we have a selected Bible/version (populate if needed)
  let bibleId = versionSelect?.value;
  if (!bibleId) {
    await loadVersions();      // fills the dropdown from /v1/bibles
    bibleId = versionSelect?.value;
    if (!bibleId) {
      // Friendly message if versions couldn't load
      const msg = 'No Bible versions available (check proxy URL and API key).';
      if (provText) provText.textContent = msg;
      if (psText)   psText.textContent   = msg;
      return;
    }
  }

  // Compute the Proverb/Psalm for this date
  const { proverbChapter, psalmChapter } = computeRefsFromParts(m, d);

  // Update headings and outbound links
  if (provRef)     provRef.textContent = proverbChapter;
  if (psRef)       psRef.textContent   = psalmChapter;
  if (provGateway) provGateway.href    = bgUrl('Proverbs', proverbChapter);
  if (psGateway)   psGateway.href      = bgUrl('Psalm',    psalmChapter);

  // Prep UI
  if (provText) provText.textContent = '';
  if (psText)   psText.textContent   = '';
  setLoading('prov', true);
  setLoading('ps',   true);

  try {
    // Try to fetch both passages (robust fetchPassage handles Psalm/Psalms, search fallback, etc.)
    const [prov, ps] = await Promise.all([
      fetchPassage(bibleId, `Proverbs ${proverbChapter}`),
      fetchPassage(bibleId, `Psalm ${psalmChapter}`)
    ]);

    if (provText) provText.textContent = `Proverbs ${proverbChapter}\n\n${(prov || '').trim()}`;
    if (psText)   psText.textContent   = `Psalm ${psalmChapter}\n\n${(ps || '').trim()}`;
  } catch (err) {
    console.error(err);
    const msg = 'Could not load from API.Bible (check proxy URL and API key). Use the BibleGateway link above.';
    if (provText && !provText.textContent) provText.textContent = msg;
    if (psText   && !psText.textContent)   psText.textContent   = msg;
  } finally {
    setLoading('prov', false);
    setLoading('ps',   false);
  }
}

function setTodayInput(){const{y,m,d}=todayYMD();dateInput.value=`${y}-${pad(m)}-${pad(d)}`;}
todayBtn.addEventListener('click',()=>{setTodayInput();const{m,d}=readInputYMD();loadForMD(m,d);});
loadBtn.addEventListener('click',()=>{if(!dateInput.value)setTodayInput();const{m,d}=readInputYMD();loadForMD(m,d);});
//versionSelect.addEventListener('change',()=>{const{m,d}=readInputYMD();if(m&&d)loadForMD(m,d);});
versionSelect.addEventListener('change', () => {
  const { m, d } = readInputYMD();
  if (m && d) loadForMD(m, d);
});


(async function init(){setTodayInput();await loadVersions();const{m,d}=readInputYMD();loadForMD(m,d);})();
