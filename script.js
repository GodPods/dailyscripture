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

async function apiBible(path,params={}){
  if(!PROXY_BASE)throw new Error('Proxy not configured.');
  const url=new URL(PROXY_BASE.replace(/\/$/,'')+path);
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v));
  const r=await fetch(url.toString(),{headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error(`API ${r.status}`);
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

async function fetchPassage(bibleId,reference){
  const resp=await apiBible(`/v1/bibles/${bibleId}/passages`,{
    reference,
    'content-type':'text',
    'include-verse-numbers':'true',
    'include-titles':'false',
    'include-notes':'false'
  });
  const content=resp?.data?.content||resp?.data?.passages?.[0]?.content||'';
  return content||'(No content returned)';
}

async function loadForMD(m,d){
  const bibleId=versionSelect?.value;
  if(!bibleId)return;
  const{proverbChapter,psalmChapter}=computeRefsFromParts(m,d);
  provRef.textContent=proverbChapter;
  psRef.textContent=psalmChapter;
  provGateway.href=bgUrl('Proverbs',proverbChapter);
  psGateway.href=bgUrl('Psalm',psalmChapter);
  provText.textContent='';psText.textContent='';setLoading('prov',true);setLoading('ps',true);
  try{
    const[prov,ps]=await Promise.all([
      fetchPassage(bibleId,`Proverbs ${proverbChapter}`),
      fetchPassage(bibleId,`Psalm ${psalmChapter}`)
    ]);
    provText.textContent=`Proverbs ${proverbChapter}\n\n${prov}`;
    psText.textContent=`Psalm ${psalmChapter}\n\n${ps}`;
  }catch(e){
    console.error(e);
    const msg='Could not load from API.Bible (check proxy/key). Use BibleGateway link above.';
    provText.textContent=msg;psText.textContent=msg;
  }finally{
    setLoading('prov',false);setLoading('ps',false);
  }
}

function setTodayInput(){const{y,m,d}=todayYMD();dateInput.value=`${y}-${pad(m)}-${pad(d)}`;}
todayBtn.addEventListener('click',()=>{setTodayInput();const{m,d}=readInputYMD();loadForMD(m,d);});
loadBtn.addEventListener('click',()=>{if(!dateInput.value)setTodayInput();const{m,d}=readInputYMD();loadForMD(m,d);});
versionSelect.addEventListener('change',()=>{const{m,d}=readInputYMD();if(m&&d)loadForMD(m,d);});

(async function init(){setTodayInput();await loadVersions();const{m,d}=readInputYMD();loadForMD(m,d);})();
