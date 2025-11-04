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
const DEBUG_LOG = true;

// Accept absolute (https://…workers.dev) or relative (/.netlify/functions/…)
async function apiBible(path, params = {}) {
  const baseRaw = (PROXY_BASE || '').trim();
  if (!baseRaw) throw new Error('Proxy not configured. Set PROXY_BASE.');
  const base = baseRaw.endsWith('/') ? baseRaw.slice(0, -1) : baseRaw;
  const p = path.startsWith('/') ? path : `/${path}`;

  let url;
  try { url = new URL(base + p); }                // absolute (Worker)
  catch { url = new URL(base + p, location.origin); } // relative (Netlify)

  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  if (DEBUG_LOG) console.log('[apiBible] GET', url.toString());
  const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    if (DEBUG_LOG) console.error('[apiBible] HTTP', r.status, body);
    throw new Error(`API ${r.status}`);
  }
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

// Map common names to USFM book IDs
const USFM = {
  'Proverbs': 'PRO', 'Proverb': 'PRO',
  'Psalms':   'PSA', 'Psalm':   'PSA'
};

// Fetch a whole chapter via /chapters/{chapterId} (preferred), with fallbacks
async function fetchPassage(bibleId, reference) {
  // reference is like "Proverbs 3" or "Psalm 33"
  const [bookName, chapStr] = reference.split(/\s+/);
  const chapter = String(chapStr || '').trim();
  const usfmBook = USFM[bookName];

  // 1) Preferred: /chapters/USFM.CHAPTER
  if (usfmBook && chapter) {
    const chapterId = `${usfmBook}.${chapter}`;
    try {
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
      if (content && content.trim()) return content.trim();
    } catch (e) {
      // fall through to other strategies
      console.warn('[chapters] failed for', chapterId, e);
    }
  }

  // 2) Fallback: /passages?reference=... (hyphenated params, in case this bibleId accepts it)
  try {
    const pass = await apiBible(`/v1/bibles/${bibleId}/passages`, {
      reference,
      'content-type': 'text',
      'include-verse-numbers': 'true',
      'include-titles': 'false',
      'include-notes': 'false'
    });
    const content =
      pass?.data?.content ||
      pass?.data?.passages?.[0]?.content ||
      '';
    if (content && content.trim()) return content.trim();
  } catch (e) {
    console.warn('[passages] failed for', reference, e);
  }

  // 3) Last resort: /search → reuse first result’s reference back into /passages
  try {
    const search = await apiBible(`/v1/bibles/${bibleId}/search`, {
      query: reference,
      limit: '1'
    });
    const ref = search?.data?.verses?.[0]?.reference;
    if (ref) {
      const pass2 = await apiBible(`/v1/bibles/${bibleId}/passages`, {
        reference: ref,
        'content-type': 'text',
        'include-verse-numbers': 'true',
        'include-titles': 'false',
        'include-notes': 'false'
      });
      const content =
        pass2?.data?.content ||
        pass2?.data?.passages?.[0]?.content ||
        '';
      if (content && content.trim()) return content.trim();
    }
  } catch (e) {
    console.warn('[search fallback] failed for', reference, e);
  }

  return '(No content returned for this chapter.)';
}

async function loadForMD(m, d) {
  if (!m || !d) return;

  let bibleId = versionSelect?.value;
  if (!bibleId) {
    await loadVersions();
    bibleId = versionSelect?.value;
    if (!bibleId) {
      const msg = 'No Bible versions available (check proxy URL and API key).';
      provText.textContent = msg;
      psText.textContent   = msg;
      return;
    }
  }

  const { proverbChapter, psalmChapter } = computeRefsFromParts(m, d);

  provRef.textContent = proverbChapter;
  psRef.textContent   = psalmChapter;
  provGateway.href = bgUrl('Proverbs', proverbChapter);
  psGateway.href   = bgUrl('Psalm',    psalmChapter);

  provText.textContent = '';
  psText.textContent   = '';
  setLoading('prov', true);
  setLoading('ps',   true);

  try {
    const [prov, ps] = await Promise.all([
      fetchPassage(bibleId, `Proverbs ${proverbChapter}`),
      fetchPassage(bibleId, `Psalm ${psalmChapter}`)
    ]);
    provText.textContent = `Proverbs ${proverbChapter}\n\n${prov}`;
    psText.textContent   = `Psalm ${psalmChapter}\n\n${ps}`;
  } catch (err) {
    console.error(err);
    const msg = 'Could not load from API.Bible (check proxy URL and API key). Use the BibleGateway link above.';
    if (!provText.textContent) provText.textContent = msg;
    if (!psText.textContent)   psText.textContent   = msg;
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
