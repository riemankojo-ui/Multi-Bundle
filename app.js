const $=id=>document.getElementById(id);

document.addEventListener('click',function(e){
  const el=e.target.closest('[data-tab]');
  if(!el)return;
  const name=el.dataset.tab;
  if(!name)return;
  ['home','projects','bundle','preview','editor','backups','github','updates'].forEach(function(p){
    const page=document.getElementById(p+'Page');
    if(page)page.hidden=(p!==name);
  });
  document.querySelectorAll('.bottom span').forEach(function(s){s.classList.toggle('selected',s.dataset.tab===name)});
  document.querySelectorAll('.drawer-nav a').forEach(function(a){a.classList.toggle('selected',a.dataset.tab===name)});
  const drawer=document.getElementById('drawer');
  const bd=document.getElementById('drawerBackdrop');
  if(drawer)drawer.classList.remove('open');
  if(bd)bd.classList.remove('open');
   try{localStorage.setItem('mb_nav',JSON.stringify({tab:name,pid:currentProjectId}))}catch(e){}
  if(name==='projects'&&typeof showProjectsList==='function')showProjectsList();
  if(name==='updates'&&typeof setUpdatesTab==='function')setUpdatesTab(window.__updatesMode||'github');
},true);

let files=[],urls=[],currentPagePath='',urlCache=new Map();
let currentProjectId=null;
let ghToken='';
const PROJECT_LIMIT=10;

const textExt=new Set(['html','htm','css','js','mjs','json','txt','md','xml','svg','php','py','sql','yaml','yml','toml','csv','webmanifest','ts','jsx','tsx']);
const ext=p=>(p.split('.').pop()||'').toLowerCase();
const base=p=>p.split('/').pop();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const mimeMap={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',webmanifest:'application/manifest+json',txt:'text/plain',md:'text/plain',xml:'application/xml',svg:'image/svg+xml',csv:'text/csv',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',pdf:'application/pdf'};

function showToast(msg,type){
  const root=$('toastRoot');if(!root)return;
  const t=document.createElement('div');
  t.className='toast'+(type?' '+type:'');
  t.textContent=msg;
  root.appendChild(t);
  setTimeout(function(){t.style.transition='opacity .2s,transform .2s';t.style.opacity='0';t.style.transform='translateY(-10px)';setTimeout(function(){t.remove()},220)},2400);
}
window.showToast=showToast;

function showModal(opts){
  return new Promise(function(resolve){
    const root=$('modalRoot');const icon=$('modalIcon'),title=$('modalTitle'),msg=$('modalMessage'),inp=$('modalInput'),ok=$('modalConfirmBtn'),cancel=$('modalCancelBtn');
    icon.textContent=opts.icon||'?';title.textContent=opts.title||'';msg.textContent=opts.message||'';
    if(opts.input){inp.hidden=false;inp.value=opts.inputValue||'';inp.placeholder=opts.inputPlaceholder||''}else inp.hidden=true;
    ok.textContent=opts.confirmText||'OK';cancel.textContent=opts.cancelText||'Cancel';cancel.hidden=!!opts.hideCancel;
    root.hidden=false;setTimeout(function(){if(opts.input)inp.focus()},80);
    function done(val){root.hidden=true;ok.onclick=null;cancel.onclick=null;document.removeEventListener('keydown',onKey);resolve(val)}
    function onKey(e){if(e.key==='Enter'&&opts.input){e.preventDefault();done(inp.value)}else if(e.key==='Escape')done(null)}
    ok.onclick=function(){done(opts.input?inp.value:true)};cancel.onclick=function(){done(null)};document.addEventListener('keydown',onKey);
  });
}
function showConfirm(message,opts){opts=opts||{};return showModal({icon:opts.icon||'!',title:opts.title||'Confirm',message:message,confirmText:opts.confirmText||'OK',cancelText:opts.cancelText||'Cancel'}).then(function(r){return r!==null})}
function showPrompt(title,defaultValue,opts){opts=opts||{};return showModal({icon:opts.icon||'?',title:title,message:opts.message||'',input:true,inputValue:defaultValue||'',inputPlaceholder:opts.placeholder||'',confirmText:opts.confirmText||'OK',cancelText:opts.cancelText||'Cancel'})}
function showInfo(title,message){return showModal({icon:'i',title:title,message:message,hideCancel:true,confirmText:'Got it'})}
window.showConfirm=showConfirm;window.showPrompt=showPrompt;window.showInfo=showInfo;

const DB_NAME='multibundle',DB_STORE='project';
let __dbp=null;
function openDB(){if(!__dbp){__dbp=openDBRaw();__dbp.catch(function(){__dbp=null})}return __dbp}
function openDBRaw(){return new Promise(function(res,rej){const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=function(){const db=r.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE)};r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}})}
let __projCache=null;
async function dbGetAll(){if(__projCache)return __projCache;const r=await dbGetAllRaw();__projCache=r;return r}
async function dbGetAllRaw(){try{const db=await openDB();const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get('projects');const d=await new Promise(function(res){req.onsuccess=function(){res(req.result)};req.onerror=function(){res(null)}});return d||[]}catch(e){return[]}}
let __saveTimer=null;
function __flushProjects(){clearTimeout(__saveTimer);__saveTimer=null;if(__projCache)return dbSetAllNow(__projCache);return Promise.resolve()}
async function dbSetAll(arr){__projCache=arr;clearTimeout(__saveTimer);__saveTimer=setTimeout(__flushProjects,500)}
window.addEventListener('pagehide',function(){if(__saveTimer)__flushProjects()});
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='hidden'&&__saveTimer)__flushProjects()});
async function dbSetAllNow(arr){try{const db=await openDB();const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(arr,'projects');await new Promise(function(res){tx.oncomplete=res})}catch(e){console.warn(e)}}
async function dbUpsertProject(p){const all=await dbGetAll();const i=all.findIndex(function(x){return x.id===p.id});if(i>=0)all[i]=p;else all.unshift(p);await dbSetAll(all)}
async function dbDeleteProject(id){const all=await dbGetAll();await dbSetAll(all.filter(function(x){return x.id!==id}))}

function serializeFiles(){return files.map(function(f){return{path:f.path,name:f.name,size:f.size,type:f.type,text:f.text,blob:f.blob}})}
function deserializeFiles(arr){return arr.map(function(f){return{path:f.path,name:f.name,size:f.size,type:f.type,text:f.text,blob:f.blob}})}

function timeAgo(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return 'just now';const m=Math.floor(s/60);if(m<60)return m+' min ago';const h=Math.floor(m/60);if(h<24)return h+' hr ago';const d=Math.floor(h/24);return d+' day'+(d>1?'s':'')+' ago'}
function timeAgoLong(ts){const s=Math.floor((Date.now()-ts)/1000);if(s<60)return 'just now';const m=Math.floor(s/60);if(m<60)return m+' min ago';const h=Math.floor(m/60);if(h<24)return h+' hr ago';const d=Math.floor(h/24);if(d<30)return d+' day'+(d>1?'s':'')+' ago';return new Date(ts).toLocaleDateString()}

async function logHistory(entry){
  if(!currentProjectId)return;
  const all=await dbGetAll();const p=all.find(function(x){return x.id===currentProjectId});if(!p)return;
   p.history=p.history||[];p.history.unshift(Object.assign({ts:Date.now()},entry));p.history.forEach(function(h,i){if(i>=20)delete h.text}); if(p.history.length>200)p.history.length=200;await dbSetAll(all);
}
window.logHistory=logHistory;

async function markGithubSource(repo,branch){
  if(!currentProjectId)return;
  const all=await dbGetAll();const p=all.find(function(x){return x.id===currentProjectId});if(!p)return;
  p.source='github';p.githubRepo=repo;p.githubBranch=branch;p.lastImport=Date.now();p.githubShas=window.__ghShas||null;await dbSetAll(all);
}
window.markGithubSource=markGithubSource;

function detectProjectLogo(files){
  const candidates=['logo.png','logo.svg','logo.jpg','logo.jpeg','logo.webp','favicon.ico','favicon.png','favicon.svg','icon.png','icon.svg','icon.jpg','assets/logo.png','assets/logo.svg','assets/icon.png','img/logo.png','img/logo.svg','img/icon.png','images/logo.png','images/icon.png','public/logo.png','public/favicon.ico','public/icon.png','static/logo.png','static/icon.png','src/assets/logo.png','src/assets/icon.png'];
  for(const c of candidates){const match=files.find(function(f){return f.path.toLowerCase()===c.toLowerCase()});if(match)return match.path}
  return null;
}

function fileBlob(f){const t=mimeMap[ext(f.path)]||f.type||'application/octet-stream';const src=f.blob||new Blob([f.text||'']);return src.type===t?src:new Blob([src],{type:t})}
function clearUrls(){urls.forEach(function(u){URL.revokeObjectURL(u)});urls=[];urlCache.clear()}
function resetPreview(){if($('frame')){$('frame').hidden=true;$('frame').srcdoc=''}if($('placeholder'))$('placeholder').hidden=false;if($('previewPath'))$('previewPath').textContent='Your website will appear here';if($('refreshBtn'))$('refreshBtn').disabled=true;if($('previewLoader'))$('previewLoader').classList.remove('show')}
function findFile(p){p=p.replace(/^\.\//,'').replace(/^\//,'');return files.find(function(f){return f.path===p})||files.find(function(f){return f.path.endsWith('/'+p)})}
function makeUrl(blob){const u=URL.createObjectURL(blob);urls.push(u);return u}
function htmlPages(){return files.filter(function(f){return ['html','htm'].includes(ext(f.path))}).sort(function(a,b){return a.path.localeCompare(b.path)})}

function currentProjectName(){return window.__currentProjectName||'No project loaded'}
function setCurrentProjectName(n){window.__currentProjectName=n||'No project loaded';const dn=$('detailProjectName');if(dn)dn.textContent=window.__currentProjectName}

async function saveCurrentProject(){
  if(!currentProjectId||!files.length)return;
  const all=await dbGetAll();const existing=all.find(function(p){return p.id===currentProjectId});
  await dbUpsertProject(Object.assign({},existing,{id:currentProjectId,name:existing?existing.name:currentProjectName(),files:serializeFiles(),savedAt:Date.now(),createdAt:existing?existing.createdAt:Date.now()}));
  await renderProjectCards();
}
window.saveCurrentProject=saveCurrentProject;

function openDrawer(){const d=$('drawer'),b=$('drawerBackdrop');if(d)d.classList.add('open');if(b)b.classList.add('open')}
function closeDrawer(){const d=$('drawer'),b=$('drawerBackdrop');if(d)d.classList.remove('open');if(b)b.classList.remove('open')}
if($('menuBtn'))$('menuBtn').onclick=openDrawer;
if($('drawerClose'))$('drawerClose').onclick=closeDrawer;
if($('drawerBackdrop'))$('drawerBackdrop').onclick=closeDrawer;
if($('drawerNewProject'))$('drawerNewProject').onclick=function(){closeDrawer();if($('folderInput'))$('folderInput').click()};
if($('drawerImportZip'))$('drawerImportZip').onclick=function(){closeDrawer();if($('zipInput'))$('zipInput').click()};
if($('drawerGithub'))$('drawerGithub').onclick=function(){closeDrawer();setTimeout(function(){showTab('github')},50)};
if($('drawerClear'))$('drawerClear').onclick=function(){closeDrawer();if($('clearBtn'))$('clearBtn').click()};

async function renderProjectCards(){
  const pg=$('projectsPage');if(pg&&pg.hidden){dbGetAll();return}
  const all=await dbGetAll();const box=$('projectCards');if(!box)return;
  if($('projectCount'))$('projectCount').textContent=all.length+' / '+PROJECT_LIMIT;
  if(!all.length){box.innerHTML='<div class="pc-empty">No saved projects yet.<br>Import a folder or ZIP to create one.</div>';return}
  box.innerHTML=all.map(function(p){
    const active=(p.id===currentProjectId)?' active':'';
    let iconHtml;
    if(p.logo&&p.files){
      const lf=p.files.find(function(f){return f.path===p.logo});
      if(lf){try{const b=fileBlob(lf);const u=URL.createObjectURL(b);urls.push(u);iconHtml='<div class="pc-icon pc-logo"><img src="'+u+'" alt=""></div>'}catch(e){iconHtml='<div class="pc-icon">'+esc((p.name||'?').slice(0,2).toUpperCase())+'</div>'}}
      else{iconHtml='<div class="pc-icon">'+esc((p.name||'?').slice(0,2).toUpperCase())+'</div>'}
    }else{iconHtml='<div class="pc-icon">'+esc((p.name||'?').slice(0,2).toUpperCase())+'</div>'}
    return '<div class="project-card'+active+'" data-id="'+esc(p.id)+'">'+
      '<div class="pc-top">'+iconHtml+
      '<div class="pc-info"><div class="pc-name">'+esc(p.name||'Untitled')+'</div>'+
      '<div class="pc-meta">'+p.files.length+' file'+(p.files.length===1?'':'s')+' · '+timeAgo(p.savedAt)+'</div></div></div>'+
      '<div class="pc-actions">'+
      '<button class="pc-btn primary" data-act="preview">Preview</button>'+
      '<button class="pc-btn" data-act="edit" title="Edit code">Edit</button>'+
      '<button class="pc-btn" data-act="changes" title="Import changes">Sync</button>'+
      '<button class="pc-btn danger" data-act="delete" title="Delete">×</button>'+
      '</div></div>';
  }).join('');
  box.querySelectorAll('.project-card').forEach(function(card){
    const id=card.dataset.id;
    card.querySelectorAll('.pc-btn').forEach(function(btn){
      btn.onclick=function(e){
        e.stopPropagation();const act=btn.dataset.act;
        if(act==='preview')cardPreview(id);else if(act==='edit')cardEdit(id);
        else if(act==='changes')cardChanges(id);else if(act==='delete')cardDelete(id,card.querySelector('.pc-name').textContent);
      };
    });
    card.onclick=function(){openProjectDetail(id)};
  });
}

async function loadProjectIntoMemory(id){
  const all=await dbGetAll();const p=all.find(function(x){return x.id===id});if(!p)return null;
  currentProjectId=p.id;setCurrentProjectName(p.name);files=deserializeFiles(p.files);return p;
}
async function cardPreview(id){const p=await loadProjectIntoMemory(id);if(!p)return;render();showTab('preview');const first=htmlPages()[0];if(first)openPage(first.path)}
async function cardEdit(id){const p=await loadProjectIntoMemory(id);if(!p)return;render();showTab('editor')}
async function cardChanges(id){const p=await loadProjectIntoMemory(id);if(!p)return;if($('changesFolderInput'))$('changesFolderInput').click()}
async function cardDelete(id,name){
  const ok=await showConfirm('Delete "'+name+'" permanently? This cannot be undone.',{title:'Delete project',confirmText:'Delete',cancelText:'Keep'});
  if(!ok)return;await dbDeleteProject(id);
  if(currentProjectId===id){currentProjectId=null;files=[];setCurrentProjectName('No project loaded')}
  await renderProjectCards();render();showToast('Project deleted');
}

async function openProjectDetail(id){
  if($('projectsListView'))$('projectsListView').hidden=true;
  if($('projectDetailView'))$('projectDetailView').hidden=false;
  if($('detailStatus'))$('detailStatus').textContent='Opening…';
  const p=await loadProjectIntoMemory(id);if(!p)return;
  if($('detailFileCount'))$('detailFileCount').textContent=files.length+' files';
  if($('detailStatus'))$('detailStatus').textContent='Loaded '+files.length+' files.';
  const list=$('detailFileList');
  if(list){
    list.className='filelist';
    list.innerHTML=files.slice(0,200).map(function(f){
      return '<div class="file-row"><div class="file-icon">'+esc(ext(f.path).slice(0,4).toUpperCase()||'FILE')+'</div><div class="file-meta"><div class="file-name">'+esc(base(f.path))+'</div><div class="file-path">'+esc(f.path)+'</div></div><div class="file-size">'+size(f.size||0)+'</div></div>';
    }).join('');
  }
  if($('projectsListView'))$('projectsListView').hidden=true;
  if($('projectDetailView'))$('projectDetailView').hidden=false;
  populatePages();render();
(async function restoreNav(){
  try{
    const nav=JSON.parse(localStorage.getItem('mb_nav')||'null');if(!nav||!nav.tab||nav.tab==='home')return;
    let loaded=false;
    if(nav.pid){const p=await loadProjectIntoMemory(nav.pid);if(p){render();loaded=true}}
    if((nav.tab==='editor'||nav.tab==='preview')&&!loaded)return;
    showTab(nav.tab);
    if(nav.tab==='preview'){const first=htmlPages()[0];if(first)openPage(first.path)}
  }catch(e){}
})();
}
function showProjectsList(){if($('projectsListView'))$('projectsListView').hidden=false;if($('projectDetailView'))$('projectDetailView').hidden=true;renderProjectCards()}

function cleanIncoming(result){return result.filter(function(f){return f.path&&!f.path.split('/').some(function(p){return p.startsWith('.')&&p!=='.well-known'})}).sort(function(a,b){return a.path.localeCompare(b.path)})}

async function processIncoming(result,defaultName){
  result=cleanIncoming(result);if(!result.length){showToast('No files found','error');return}
  const name=await showPrompt('Name this project',defaultName||'My project',{message:'Give your project a name. If a project with this name exists, it will be updated.',icon:'+'});
  if(!name||!name.trim())return;
  const trimmed=name.trim();const logo=detectProjectLogo(result);
  const all=await dbGetAll();const existing=all.find(function(p){return p.name===trimmed});
  if(existing){
    currentProjectId=existing.id;setCurrentProjectName(trimmed);files=result;
    await dbUpsertProject(Object.assign({},existing,{files:serializeFiles(),savedAt:Date.now(),logo:logo||existing.logo}));
    showToast('Updated "'+trimmed+'"','success');
  }else{
    if(all.length>=PROJECT_LIMIT){showInfo('Project limit reached','You can only have '+PROJECT_LIMIT+' projects. Delete one to make room.');return}
    currentProjectId=Date.now().toString();setCurrentProjectName(trimmed);files=result;
    await dbUpsertProject({id:currentProjectId,name:trimmed,files:serializeFiles(),savedAt:Date.now(),createdAt:Date.now(),history:[],logo:logo});
    showToast('Created "'+trimmed+'"','success');
  }
  await logHistory({type:'import',fileCount:files.length,note:'Imported '+files.length+' files'});
  await renderProjectCards();populatePages();render();
}

if($('folderInput'))$('folderInput').addEventListener('change',async function(e){
  const list=[].slice.call(e.target.files);if(!list.length)return;
  const name=(list[0].webkitRelativePath||'').split('/')[0]||'Website';
  const result=await Promise.all(list.map(async function(f){return{path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name,name:f.name,size:f.size,type:f.type,blob:f,text:textExt.has(ext(f.name))?await f.text():null}}));
  await processIncoming(result,name);e.target.value='';
});

if($('changesFolderInput'))$('changesFolderInput').addEventListener('change',async function(e){
  const list=[].slice.call(e.target.files);if(!list.length)return;
  const result=cleanIncoming(await Promise.all(list.map(async function(f){return{path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name,name:f.name,size:f.size,type:f.type,blob:f,text:textExt.has(ext(f.name))?await f.text():null}})));
  const map=new Map();result.forEach(function(f){map.set(f.path,f)});
  let updated=0,added=0;
  files.forEach(function(f){if(map.has(f.path)){const nf=map.get(f.path);if(nf.text!=null||nf.blob){f.text=nf.text;f.blob=nf.blob;f.size=nf.size;updated++;map.delete(f.path)}}});
  map.forEach(function(f){files.push(f);added++});files.sort(function(a,b){return a.path.localeCompare(b.path)});
  const existing=(await dbGetAll()).find(function(p){return p.id===currentProjectId});
  const name=existing?existing.name:currentProjectName();const logo=detectProjectLogo(files);
  setCurrentProjectName(name);
  await dbUpsertProject(Object.assign({},existing,{id:currentProjectId,name:name,files:serializeFiles(),savedAt:Date.now(),logo:logo||(existing&&existing.logo)}));
  showToast('Synced: '+updated+' updated, '+added+' new','success');
  await logHistory({type:'import',note:updated+' updated, '+added+' new'});
  await renderProjectCards();populatePages();render();e.target.value='';
});

async function loadZipBlob(blob,fallbackName){
  const z=await JSZip.loadAsync(blob);
  let result=await Promise.all(Object.values(z.files).filter(function(x){return !x.dir}).map(async function(x){const b=await x.async('blob');return{path:x.name.replace(/^\/+/,''),name:base(x.name),size:b.size,type:b.type,blob:b,text:textExt.has(ext(x.name))?await b.text():null}}));
  const roots=Array.from(new Set(result.map(function(x){return x.path.split('/')[0]})));
  if(roots.length===1&&result.every(function(x){return x.path.indexOf('/')!==-1})){result.forEach(function(x){x.path=x.path.slice(x.path.indexOf('/')+1)})}
  return {result:result,name:fallbackName};
}

if($('zipInput'))$('zipInput').addEventListener('change',async function(e){
  const f=e.target.files[0];if(!f)return;
  if(!window.JSZip){showToast('ZIP library did not load','error');return}
  showToast('Reading ZIP…');
  try{const r=await loadZipBlob(f,f.name.replace(/\.zip$/i,''));await processIncoming(r.result,r.name)}catch(err){showToast('Could not read this ZIP','error')}
  e.target.value='';
});

function setGhStatus(t){if($('githubStatus'))$('githubStatus').textContent=t}
function setGhPublicStatus(t){if($('ghPublicStatus'))$('ghPublicStatus').textContent=t}
function getToken(){return ghToken}

async function saveToken(t){ghToken=t;try{const db=await openDB();const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(t,'githubToken');await new Promise(function(r){tx.oncomplete=r})}catch(e){}}
async function loadToken(){try{const db=await openDB();const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get('githubToken');const t=await new Promise(function(r){req.onsuccess=function(){r(req.result)};req.onerror=function(){r(null)}});return t||''}catch(e){return''}}
async function clearToken(){try{const db=await openDB();const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete('githubToken');await new Promise(function(r){tx.oncomplete=r})}catch(e){}}

async function ghFetch(url){const t=getToken();const headers={};if(t)headers.Authorization='Bearer '+t;return fetch(url,{headers:headers})}

async function githubLogin(){
  const t=($('githubToken').value||'').trim();if(!t){setGhStatus('Paste a token first.');return}
  setGhStatus('Verifying token…');
  try{
    const r=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+t}});
    if(!r.ok){setGhStatus('Token rejected. Check it has "repo" scope.');return}
    const user=await r.json();await saveToken(t);setGhStatus('Signed in as @'+user.login);await showGithubLoggedIn(user);showToast('Signed in as @'+user.login,'success');
  }catch(e){setGhStatus('Network error: '+e.message)}
}
async function githubLogout(){
  await clearToken();if($('githubLoggedIn'))$('githubLoggedIn').hidden=true;if($('githubLoggedOut'))$('githubLoggedOut').hidden=false;
  if($('githubToken'))$('githubToken').value='';setGhStatus('Signed out.');showToast('Signed out');
}
async function showGithubLoggedIn(user){
  if($('githubLoggedOut'))$('githubLoggedOut').hidden=true;if($('githubLoggedIn'))$('githubLoggedIn').hidden=false;
  if($('ghAvatar'))$('ghAvatar').src=user.avatar_url||'';if($('ghName'))$('ghName').textContent=user.name||user.login;
  if($('ghLogin'))$('ghLogin').textContent='@'+user.login;await loadRepoList();
}

let ghRepos=[];
async function loadRepoList(){
  const list=$('ghRepoList');if(!list)return;
  list.innerHTML='<div style="padding:16px;color:var(--muted);font-size:12px;text-align:center">Loading repos…</div>';
  try{
    let all=[],page=1;
    while(page<=3){
      const r=await ghFetch('https://api.github.com/user/repos?per_page=100&sort=updated&page='+page);
      if(!r.ok)break;const arr=await r.json();if(!Array.isArray(arr)||!arr.length)break;
      all=all.concat(arr);if(arr.length<100)break;page++;
    }
    ghRepos=all;renderRepoList();
  }catch(e){list.innerHTML='<div style="padding:16px;color:#ff8a8a;font-size:12px">Could not load repos.</div>'}
}
function renderRepoList(){
  const list=$('ghRepoList');if(!list)return;
  const q=($('ghRepoSearch').value||'').toLowerCase();const filtered=q?ghRepos.filter(function(r){return r.full_name.toLowerCase().indexOf(q)!==-1}):ghRepos;
  if(!filtered.length){list.innerHTML='<div style="padding:16px;color:var(--muted);font-size:12px;text-align:center">No repos found.</div>';return}
  list.innerHTML=filtered.map(function(r){
    return '<div class="gh-repo" data-full="'+esc(r.full_name)+'" data-branch="'+esc(r.default_branch||'main')+'">'+
      '<div class="gh-repo-info"><div class="gh-repo-name">'+esc(r.name)+'</div><div class="gh-repo-meta">'+esc(r.owner.login)+' · '+(r.language||'—')+' · '+r.stargazers_count+' stars</div></div>'+
      (r.private?'<span class="gh-badge private">Private</span>':'<span class="gh-badge">Public</span>')+
    '</div>';
  }).join('');
  list.querySelectorAll('.gh-repo').forEach(function(el){el.onclick=function(){importRepo(el.dataset.full,el.dataset.branch)}});
}

async function importRepo(fullName,branch,isPublic){
  const parts=fullName.split('/');const owner=parts[0],repo=parts[1];const bn=branch||'main';
  const statusFn=isPublic?setGhPublicStatus:setGhStatus;statusFn('Fetching '+fullName+' ('+bn+')…');
  try{
    const r=await ghFetch('https://api.github.com/repos/'+owner+'/'+repo+'/git/trees/'+bn+'?recursive=1');
    if(!r.ok){statusFn('Could not list files.');return}
    const tree=await r.json();const blobs=(tree.tree||[]).filter(function(x){return x.type==='blob'});window.__ghShas={};blobs.forEach(function(n){window.__ghShas[n.path]=n.sha});
    if(!blobs.length){statusFn('Repo has no files.');return}
    statusFn('Downloading '+blobs.length+' files…');let done=0;
    const result=await Promise.all(blobs.map(async function(node){
      const path=node.path;const isText=textExt.has(ext(path));
      try{
        const cr=await ghFetch('https://api.github.com/repos/'+owner+'/'+repo+'/contents/'+encodeURIComponent(path).replace(/%2F/g,'/')+'?ref='+encodeURIComponent(bn));
        if(!cr.ok)return null;const data=await cr.json();let blob;
        if(data.encoding==='base64'&&data.content){
          const bin=atob(data.content.replace(/\n/g,''));const bytes=new Uint8Array(bin.length);
          for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);blob=new Blob([bytes],{type:'application/octet-stream'});
        }else if(data.download_url){const dr=await fetch(data.download_url);blob=await dr.blob()}else return null;
        done++;if(done%10===0)statusFn('Downloading… '+done+'/'+blobs.length);
        return {path:path,name:base(path),size:blob.size,type:blob.type,blob:blob,text:isText?await blob.text():null};
      }catch(e){return null}
    }));
    const clean=result.filter(function(x){return x});
    await processIncoming(clean,window.__ghPullName||repo);window.__ghPullName=null;await markGithubSource(fullName,bn);
    statusFn('Imported '+fullName+' — '+clean.length+' files.');showToast('Imported '+repo,'success');
  }catch(e){statusFn('Import failed: '+e.message)}
}

if($('githubLoginBtn'))$('githubLoginBtn').onclick=githubLogin;
if($('githubLogoutBtn'))$('githubLogoutBtn').onclick=githubLogout;
if($('githubToken'))$('githubToken').addEventListener('keydown',function(e){if(e.key==='Enter')githubLogin()});
if($('ghRepoSearch'))$('ghRepoSearch').addEventListener('input',renderRepoList);

function handlePublicUrl(){
  const raw=($('ghPublicUrl').value||'').trim();if(!raw){setGhPublicStatus('Paste a URL.');return}
  const m=raw.match(/github\.com\/([^\/\s]+)\/([^\/\s#?]+?)(?:\.git)?(?:\/(?:tree|commit)\/([^\/\s#?]+))?\/?(?:[#?].*)?$/i);
  if(!m){setGhPublicStatus('Invalid URL.');return}
  importRepo(m[1]+'/'+m[2].replace(/\.git$/,''),m[3]||'main',true);
}
if($('ghPublicBtn'))$('ghPublicBtn').onclick=handlePublicUrl;
if($('ghPublicUrl'))$('ghPublicUrl').addEventListener('keydown',function(e){if(e.key==='Enter')handlePublicUrl()});

(async function(){
  const t=await loadToken();
  if(t){ghToken=t;try{const r=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+t}});if(r.ok){const u=await r.json();await showGithubLoggedIn(u)}}catch(e){}}
})();

if($('backToProjectsBtn'))$('backToProjectsBtn').onclick=showProjectsList;
if($('detailEditBtn'))$('detailEditBtn').onclick=function(){showTab('editor')};
if($('detailImportChangesBtn'))$('detailImportChangesBtn').onclick=function(){if(currentProjectId)$('changesFolderInput').click()};
if($('detailBundleBtn'))$('detailBundleBtn').onclick=function(){showTab('bundle');render()};
if($('detailDeleteBtn'))$('detailDeleteBtn').onclick=async function(){
  if(!currentProjectId)return;
  const p=(await dbGetAll()).find(function(x){return x.id===currentProjectId});
  await cardDelete(currentProjectId,p?p.name:'this project');showProjectsList();
};

function render(){
  const pages=htmlPages();
  const setT=function(id,v){const el=$(id);if(el)el.textContent=v};
  const setD=function(id,v){const el=$(id);if(el)el.disabled=v};
  const name=currentProjectName();
  setT('homeProjectName',name);setT('homeFileCount',files.length+' files');
  setT('homeStatus',files.length?files.length+' files loaded. Open Projects to manage, Editor to modify.':'Go to Projects to import a website folder or ZIP.');
  setT('bundleProjectName',name);setT('bundleFileCount',files.length+' files');
  setT('bundleStatus',files.length?'Ready to export '+files.length+' files.':'Import a project first.');
  setD('homeBundleBtn',!files.length);setD('homeOpenPreviewBtn',!pages.length);setD('bundleBtn',!files.length);
  populatePages();
}

function populatePages(){
  const sel=$('pageSelect');if(!sel)return;
  const pages=htmlPages();sel.innerHTML='';
  if(!pages.length){sel.add(new Option('No HTML pages found',''));sel.disabled=true;if($('openPageBtn'))$('openPageBtn').disabled=true;currentPagePath='';return}
  pages.forEach(function(f){sel.add(new Option(f.path,f.path))});
  const start=pages.find(function(f){return f.path===currentPagePath})||pages.find(function(f){return f.path.toLowerCase()==='index.html'})||pages.find(function(f){return base(f.path).toLowerCase()==='index.html'})||pages[0];
  sel.value=start.path;sel.disabled=false;if($('openPageBtn'))$('openPageBtn').disabled=false;currentPagePath=start.path;
}

function relative(from,ref){
  if(!ref||/^(data:|blob:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref))return null;
  let p=ref.split('#')[0].split('?')[0];try{p=decodeURIComponent(p)}catch(e){}
  if(p.startsWith('/'))p=p.slice(1);else p=(from.includes('/')?from.slice(0,from.lastIndexOf('/')+1):'')+p;
  const stack=[];for(const part of p.split('/')){if(part==='..')stack.pop();else if(part&&part!=='.')stack.push(part)}
  return findFile(stack.join('/'));
}
function assetUrl(from,ref){
  if(!ref||/^(data:|blob:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref.trim()))return ref;
  const f=relative(from,ref);if(!f)return ref;
  if(urlCache.has(f.path))return urlCache.get(f.path);
  const u=makeUrl(fileBlob(f));urlCache.set(f.path,u);return u;
}
function cssRewrite(css,path,depth){
  depth=depth||0;
  css=css.replace(/@import\s+(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)\s*([^;]*);/gi,function(m,q1,u1,q2,u2,media){
    const f=depth<5?relative(path,u1||u2):null;if(!f||f.text==null)return m;
    const inner=cssRewrite(f.text,f.path,depth+1);
    return media.trim()?('@media '+media.trim()+'{'+inner+'}'):inner;
  });
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,function(m,q,u){return 'url("'+assetUrl(path,u)+'")'});
}

const LINK_INTERCEPTOR='(function(){'+
  'function intercept(e){'+
    'var t=e.target;'+
    'while(t&&t.tagName!=="A")t=t.parentElement;'+
    'if(!t)return;'+
    'var href=t.getAttribute("href");'+
    'if(!href)return;'+
    'if(href.charAt(0)==="#"||href.indexOf("javascript:")===0||href.indexOf("mailto:")===0||href.indexOf("tel:")===0)return;'+
    'if(/^(https?:)?\\/\\//i.test(href)||href.indexOf("data:")===0||href.indexOf("blob:")===0){'+
      't.setAttribute("target","_blank");t.setAttribute("rel","noopener");return;'+
    '}'+
    'e.preventDefault();e.stopPropagation();'+
    'try{parent.postMessage({type:"mb-nav",href:href},"*")}catch(err){}'+
  '}'+
  'document.addEventListener("click",intercept,true);'+
'})();';

function htmlRewrite(html,path){
  const doc=new DOMParser().parseFromString(html,'text/html');
  if(!doc.head){const h=doc.createElement('head');doc.documentElement.insertBefore(h,doc.documentElement.firstChild)}
  const meta=doc.createElement('meta');meta.setAttribute('name','color-scheme');meta.setAttribute('content','dark');doc.head.insertBefore(meta,doc.head.firstChild);
  const base=doc.createElement('style');base.textContent='html{background:#0d0e12}body{background:#0d0e12;color:#f7f7f8;margin:0}';doc.head.insertBefore(base,doc.head.firstChild);
  doc.querySelectorAll('link[href]').forEach(function(el){
    const rel=(el.getAttribute('rel')||'').toLowerCase();if(rel.indexOf('stylesheet')===-1)return;
    const href=el.getAttribute('href');const f=relative(path,href);
    if(f&&f.text!=null){const s=doc.createElement('style');s.textContent=cssRewrite(f.text,f.path);el.replaceWith(s)}
    else el.setAttribute('href',assetUrl(path,href));
  });
  doc.querySelectorAll('script[src]').forEach(function(el){
    const src=el.getAttribute('src');const f=relative(path,src);
    if(f&&f.text!=null){const s=doc.createElement('script');const t=el.getAttribute('type');if(t)s.setAttribute('type',t);s.textContent=f.text;el.replaceWith(s)}
    else el.setAttribute('src',assetUrl(path,src));
  });
  doc.querySelectorAll('style').forEach(function(el){if(el.textContent)el.textContent=cssRewrite(el.textContent,path)});
  doc.querySelectorAll('[style]').forEach(function(el){
    const s=el.getAttribute('style');
    if(s&&s.indexOf('url(')!==-1)el.setAttribute('style',s.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,function(m,q,u){return 'url("'+assetUrl(path,u)+'")'}));
  });
  const attrMap={img:['src','srcset'],source:['src','srcset'],video:['src','poster'],audio:['src'],track:['src'],embed:['src'],object:['data']};
  for(const tag in attrMap){if(!Object.prototype.hasOwnProperty.call(attrMap,tag))continue;
    doc.querySelectorAll(tag).forEach(function(el){
      attrMap[tag].forEach(function(a){
        const v=el.getAttribute(a);if(!v)return;
        if(a==='srcset'){el.setAttribute(a,v.split(',').map(function(part){const m=part.trim().match(/^(\S+)(\s+.+)?$/);return m?assetUrl(path,m[1])+(m[2]||''):part}).join(', '))}
        else el.setAttribute(a,assetUrl(path,v));
      });
    });
  }
  const s=doc.createElement('script');s.textContent=LINK_INTERCEPTOR;if(doc.body)doc.body.appendChild(s);else doc.documentElement.appendChild(s);
  return '<!doctype html>'+doc.documentElement.outerHTML;
}
window.htmlRewrite=htmlRewrite;

window.addEventListener('message',function(e){
  if(!e.data||e.data.type!=='mb-nav')return;
  const href=e.data.href;if(!href||href==='form-submit')return;
  const target=relative(currentPagePath,href);
  if(target){openPage(target.path)}else{showToast('Page not found: '+href,'error')}
});

function openPage(path){
  resetPreview();const f=findFile(path);
  if(!f){if($('previewPath'))$('previewPath').textContent='File not found';return}
  currentPagePath=f.path;if($('pageSelect'))$('pageSelect').value=f.path;
  if($('previewPath'))$('previewPath').textContent=f.path;
  if(f.text==null){if($('placeholder'))$('placeholder').hidden=false;return}
  const frame=$('frame'),loader=$('previewLoader');if(loader)loader.classList.add('show');if($('placeholder'))$('placeholder').hidden=true;
  frame.hidden=false;frame.onload=function(){if(loader)loader.classList.remove('show');frame.onload=null};setTimeout(function(){if(loader)loader.classList.remove('show')},2500);
  frame.srcdoc=htmlRewrite(f.text,f.path);if($('refreshBtn'))$('refreshBtn').disabled=false;
}

function exportBundle(){
  if(!files.length)return;
  const name=currentProjectName();const tf=files.filter(function(f){return f.text!=null});const bf=files.filter(function(f){return f.text==null});
  let out='Multi Bundle Export\nProject: '+name+'\nFiles: '+files.length+'\nExported: '+new Date().toISOString()+'\n'+'='.repeat(60)+'\n\n';
  tf.forEach(function(f){out+='\n'+'='.repeat(60)+'\nFILE: '+f.path+'\n'+'='.repeat(60)+'\n\n'+f.text+'\n'});
  if(bf.length){out+='\n'+'='.repeat(60)+'\nBINARY FILES (not embedded)\n'+'='.repeat(60)+'\n\n';bf.forEach(function(f){out+='- '+f.path+' ('+size(f.size||0)+')\n'})}
  const blob=new Blob([out],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=name.replace(/[^\w\-]+/g,'_')+'.txt';document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(a.href)},2000);showToast('Bundle downloaded','success');
}

function showTab(name){
  ['home','projects','bundle','preview','editor','backups','github','updates'].forEach(function(p){
    const el=$(p+'Page');if(el)el.hidden=(p!==name);
  });
  document.querySelectorAll('.bottom span').forEach(function(s){s.classList.toggle('selected',s.dataset.tab===name)});
  document.querySelectorAll('.drawer-nav a').forEach(function(a){a.classList.toggle('selected',a.dataset.tab===name)});
   try{localStorage.setItem('mb_nav',JSON.stringify({tab:name,pid:currentProjectId}))}catch(e){}
  if(name==='projects')showProjectsList();
  if(name==='updates'&&typeof setUpdatesTab==='function')setUpdatesTab(window.__updatesMode||'github');
}
window.showTab=showTab;

window.__updatesMode='github';
let __updatesCurrentProject=null;

function setUpdatesTab(mode){
  window.__updatesMode=mode;
  if($('updatesTabGithub'))$('updatesTabGithub').classList.toggle('active',mode==='github');
  if($('updatesTabLocal'))$('updatesTabLocal').classList.toggle('active',mode==='local');
  if($('updatesGithubSection'))$('updatesGithubSection').hidden=(mode!=='github');
  if($('updatesLocalSection'))$('updatesLocalSection').hidden=(mode!=='local');
  if($('updatesListView'))$('updatesListView').hidden=false;
  if($('updatesDetailView'))$('updatesDetailView').hidden=true;
  renderUpdatesList();
}
window.setUpdatesTab=setUpdatesTab;

async function renderUpdatesList(){
  const all=await dbGetAll();
  if(window.__updatesMode==='github'){
    const g=all.filter(function(p){return p.source==='github'});if($('updatesGithubCount'))$('updatesGithubCount').textContent=g.length;
    const box=$('updatesGithubList');if(!box)return;
    if(!g.length){box.innerHTML='<div class="pc-empty">No GitHub projects yet.<br>Import one from the GitHub tab.</div>';return}
    box.innerHTML=g.map(function(p){
      const edits=countDrafts(p);
      const badge=edits?'<span class="up-badge">'+edits+' draft'+(edits===1?'':'s')+'</span>':'<span class="up-badge clean">Clean</span>';
      return '<div class="updates-proj" data-id="'+esc(p.id)+'">'+
        '<div class="up-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg></div>'+
        '<div class="up-info"><div class="up-name">'+esc(p.name)+'</div><div class="up-meta">'+esc(p.githubRepo||'')+' · '+esc(p.githubBranch||'main')+'</div></div>'+badge+'</div>';
    }).join('');
    box.querySelectorAll('.updates-proj').forEach(function(el){el.onclick=function(){openUpdatesDetail(el.dataset.id,'github')}});
  }else{
    if($('updatesLocalCount'))$('updatesLocalCount').textContent=all.length;
    const box=$('updatesLocalList');if(!box)return;
    if(!all.length){box.innerHTML='<div class="pc-empty">No projects yet.</div>';return}
    box.innerHTML=all.map(function(p){
      const h=p.history||[];
      return '<div class="updates-proj" data-id="'+esc(p.id)+'">'+
        '<div class="up-icon">'+(p.source==='github'?'<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>':'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>')+'</div>'+
        '<div class="up-info"><div class="up-name">'+esc(p.name)+'</div><div class="up-meta">'+h.length+' change'+(h.length===1?'':'s')+' · '+(h[0]?timeAgoLong(h[0].ts):'no activity')+'</div></div></div>';
    }).join('');
    box.querySelectorAll('.updates-proj').forEach(function(el){el.onclick=function(){openUpdatesDetail(el.dataset.id,'local')}});
  }
}
function countDrafts(p){if(!p.history)return 0;const since=p.lastImport||0;return p.history.filter(function(h){return h.type==='edit'&&h.ts>since}).length}

async function gitBlobSha(bytes){
  const pre=new TextEncoder().encode('blob '+bytes.length+'\0');
  const all=new Uint8Array(pre.length+bytes.length);all.set(pre);all.set(bytes,pre.length);
  const d=await crypto.subtle.digest('SHA-1',all);
  return Array.from(new Uint8Array(d)).map(function(x){return x.toString(16).padStart(2,'0')}).join('');
}
async function checkGithubUpdates(p){
  const r=await ghFetch('https://api.github.com/repos/'+p.githubRepo+'/git/trees/'+encodeURIComponent(p.githubBranch||'main')+'?recursive=1');
  if(!r.ok)throw new Error('GitHub error '+r.status);
  const tree=await r.json();const remote={};
  (tree.tree||[]).forEach(function(n){if(n.type==='blob')remote[n.path]=n.sha});
  let base=p.githubShas;
  if(!base){
    base={};
    for(const f of p.files){
      let b=null;
      if(f.text!=null)b=new TextEncoder().encode(f.text);
      else if(f.blob)b=new Uint8Array(await f.blob.arrayBuffer());
      if(b)base[f.path]=await gitBlobSha(b);
    }
  }
  const added=[],changed=[],removed=[];
  Object.keys(remote).forEach(function(k){if(!(k in base))added.push(k);else if(base[k]!==remote[k])changed.push(k)});
  Object.keys(base).forEach(function(k){if(!(k in remote))removed.push(k)});
  return {added:added,changed:changed,removed:removed};
}
async function renderGhRemote(p,mode){
  const box=$('ghRemoteBox');if(!box)return;
  if(mode!=='github'||p.source!=='github'){box.hidden=true;return}
  box.hidden=false;box.innerHTML='<div class="status">Checking GitHub…</div>';
  try{
    const r=await checkGithubUpdates(p);
    const n=r.added.length+r.changed.length+r.removed.length;
    if(!n){box.innerHTML='<div class="status">✓ Up to date with GitHub.</div>';return}
    const names=r.changed.concat(r.added).slice(0,8).map(function(x){return '<div class="upd-path" style="font-size:12px;margin:3px 0">'+esc(x)+'</div>'}).join('');
    box.innerHTML='<div class="status" style="color:#fff;font-weight:700">'+n+' file'+(n===1?'':'s')+' changed on GitHub</div>'+names+(n>8?'<div class="status">+ '+(n-8)+' more</div>':'')+'<button id="ghPullBtn" class="btn primary" style="margin-top:10px">Pull update</button>';
    $('ghPullBtn').onclick=function(){window.__ghPullName=p.name;showTab('github');importRepo(p.githubRepo,p.githubBranch)};
  }catch(e){box.innerHTML='<div class="status">Could not check GitHub: '+esc(e.message)+'</div>'}
}

async function openUpdatesDetail(projectId,mode){
  __updatesCurrentProject=projectId;
  const all=await dbGetAll();const p=all.find(function(x){return x.id===projectId});if(!p)return;
  if($('updatesDetailName'))$('updatesDetailName').textContent=p.name;
  let rows=[];
  if(mode==='github'){
    const since=p.lastImport||0;rows=(p.history||[]).filter(function(h){return h.ts>since&&h.type==='edit'});
    if($('updatesDetailEyebrow'))$('updatesDetailEyebrow').textContent='DRAFTED CHANGES';
    if($('updatesDetailNote')){$('updatesDetailNote').textContent=rows.length?rows.length+' file'+(rows.length===1?'':'s')+' edited since last GitHub import.':'No local changes since the last GitHub import.';}
  }else{
    rows=(p.history||[]).slice(0,20);
    if($('updatesDetailEyebrow'))$('updatesDetailEyebrow').textContent='FULL HISTORY';
    if($('updatesDetailNote'))$('updatesDetailNote').textContent=(p.history||[]).length+' total change'+((p.history||[]).length===1?'':'s')+' (showing last 20).';
  }
   if($('updatesDetailCount'))$('updatesDetailCount').textContent=rows.length+' change'+(rows.length===1?'':'s');
  renderGhRemote(p,mode);
  const list=$('updatesDetailList');
  if(list){
    if(!rows.length){list.innerHTML='<div class="pc-empty">Nothing to show here.</div>';}
    else{
      list.innerHTML=rows.slice(0,20).map(function(h){
        const t=h.type||'edit';
        return '<div class="update-row">'+
          '<div class="upd-icon '+t+'"></div>'+
          '<div class="upd-info"><div class="upd-path">'+esc(h.path||h.note||'—')+'</div><div class="upd-note">'+esc(h.note||'')+'</div></div>'+
         '<div class="upd-time">'+timeAgoLong(h.ts)+'</div>'+(typeof h.text==='string'&&h.path?'<button class="upd-save" data-ts="'+h.ts+'">Save</button>':'')+'</div>';
      }).join('');
    }
  }
  if(list)list.querySelectorAll('.upd-save').forEach(function(b){b.onclick=function(){saveFileBack(p.id,Number(b.dataset.ts))}});
  renderSnapshotsSection(p);
  if($('updatesListView'))$('updatesListView').hidden=true;
  if($('updatesDetailView'))$('updatesDetailView').hidden=false;
}

async function saveFileBack(projectId,ts){
  const all=await dbGetAll();const p=all.find(function(x){return x.id===projectId});if(!p)return;
  const h=(p.history||[]).find(function(x){return x.ts===ts});
  if(!h||typeof h.text!=='string'||!h.path){showToast('This update has no saved copy','error');return}
  const ok=await showConfirm('Put this version of '+h.path+' back into the project?',{title:'Save file back',confirmText:'Save',cancelText:'Cancel'});
  if(!ok)return;
  const f=p.files.find(function(x){return x.path===h.path});
  if(f){f.text=h.text;f.blob=null;f.size=h.text.length}
  else p.files.push({path:h.path,name:h.path.split('/').pop(),size:h.text.length,type:'text/plain',blob:null,text:h.text});
  p.savedAt=Date.now();
  p.history.unshift({ts:Date.now(),type:'edit',path:h.path,note:'Saved back from update',text:h.text});
  await dbSetAll(all);
  if(currentProjectId===projectId){files=deserializeFiles(p.files)}
  await renderProjectCards();
  if(typeof populatePages==='function')populatePages();
  if(typeof render==='function')render();
  showToast('Saved '+h.path+' back to project','success');
  openUpdatesDetail(projectId,window.__updatesMode||'local');
}
window.saveFileBack=saveFileBack;

async function restoreSnapshot(projectId,ts){
  const all=await dbGetAll();const p=all.find(function(x){return x.id===projectId});if(!p||!p.snapshots)return;
  const snap=p.snapshots.find(function(s){return s.ts===ts});if(!snap)return;
  p.snapshots.unshift({ts:Date.now(),label:'Before restore',files:p.files.map(function(f){return{path:f.path,name:f.name,size:f.size,type:f.type,text:f.text,blob:f.blob}})});
  if(p.snapshots.length>20)p.snapshots.length=20;
  p.files=snap.files.map(function(f){return{path:f.path,name:f.name,size:f.size,type:f.type,text:f.text,blob:f.blob}});
  p.savedAt=Date.now();await dbSetAll(all);
  if(currentProjectId===projectId){files=deserializeFiles(p.files);setCurrentProjectName(p.name)}
  await renderProjectCards();populatePages();render();
  showToast('Restored from '+new Date(snap.ts).toLocaleString(),'success');
  openUpdatesDetail(projectId,window.__updatesMode||'local');
}
window.restoreSnapshot=restoreSnapshot;

async function deleteSnapshot(projectId,ts){
  const all=await dbGetAll();const p=all.find(function(x){return x.id===projectId});if(!p||!p.snapshots)return;
  p.snapshots=p.snapshots.filter(function(s){return s.ts!==ts});await dbSetAll(all);
  openUpdatesDetail(projectId,window.__updatesMode||'local');
}
window.deleteSnapshot=deleteSnapshot;

async function saveSnapshotNow(){
  if(!__updatesCurrentProject){showToast('Open a project first','error');return}
  const all=await dbGetAll();const p=all.find(function(x){return x.id===__updatesCurrentProject});if(!p){showToast('Project not found','error');return}
  let srcFiles;
  if(p.id===currentProjectId&&files.length)srcFiles=serializeFiles();else srcFiles=p.files;
  p.snapshots=p.snapshots||[];
  p.snapshots.unshift({ts:Date.now(),label:'Manual save',files:srcFiles.map(function(f){return{path:f.path,name:f.name,size:f.size,type:f.type,text:f.text,blob:f.blob}})});
  if(p.snapshots.length>20)p.snapshots.length=20;
  await dbSetAll(all);showToast('Snapshot saved','success');
  openUpdatesDetail(p.id,window.__updatesMode||'local');
}
window.saveSnapshotNow=saveSnapshotNow;

function renderSnapshotsSection(p){
  const box=$('updatesSnapshotsList');if(!box)return;
  const snaps=p.snapshots||[];
  if(!snaps.length){box.innerHTML='<div class="pc-empty">No snapshots yet.<br>Tap <b>Save</b> above to create one.</div>';return}
  box.innerHTML=snaps.slice(0,20).map(function(s){
    return '<div class="snapshot-row">'+
      '<div class="snap-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>'+
      '<div class="snap-info"><div class="snap-label">'+esc(s.label||'Snapshot')+'</div><div class="snap-meta">'+new Date(s.ts).toLocaleString()+' · '+s.files.length+' files</div></div>'+
      '<button class="snap-btn restore" data-ts="'+s.ts+'">Restore</button>'+
      '<button class="snap-btn del" data-ts="'+s.ts+'">×</button></div>';
  }).join('');
  box.querySelectorAll('.snap-btn.restore').forEach(function(b){
    b.onclick=async function(){
      const ok=await showConfirm('Restore this snapshot? Current state will be saved as a new snapshot first.',{title:'Restore snapshot',confirmText:'Restore',cancelText:'Cancel'});
      if(ok)restoreSnapshot(p.id,Number(b.dataset.ts));
    };
  });
  box.querySelectorAll('.snap-btn.del').forEach(function(b){
    b.onclick=async function(){
      const ok=await showConfirm('Delete this snapshot?',{title:'Delete snapshot',confirmText:'Delete',cancelText:'Keep'});
      if(ok)deleteSnapshot(p.id,Number(b.dataset.ts));
    };
  });
}

if($('updatesTabGithub'))$('updatesTabGithub').onclick=function(){setUpdatesTab('github')};
if($('updatesTabLocal'))$('updatesTabLocal').onclick=function(){setUpdatesTab('local')};
if($('updatesBackBtn'))$('updatesBackBtn').onclick=function(){$('updatesListView').hidden=false;$('updatesDetailView').hidden=true;renderUpdatesList()};
if($('updatesSaveNowBtn'))$('updatesSaveNowBtn').onclick=saveSnapshotNow;

if($('homeProjectsBtn'))$('homeProjectsBtn').onclick=function(){showTab('projects')};
if($('homePreviewBtn'))$('homePreviewBtn').onclick=function(){showTab('preview')};
if($('homeBundleBtn'))$('homeBundleBtn').onclick=function(){exportBundle()};
if($('homeOpenPreviewBtn'))$('homeOpenPreviewBtn').onclick=function(){showTab('preview');if(currentPagePath)openPage(currentPagePath)};
if($('bundleBtn'))$('bundleBtn').onclick=exportBundle;
if($('backupsBundleBtn'))$('backupsBundleBtn').onclick=function(){showTab('bundle')};
if($('backHomeBtn'))$('backHomeBtn').onclick=function(){showTab('home')};
if($('openPageBtn'))$('openPageBtn').onclick=function(){if($('pageSelect').value)openPage($('pageSelect').value)};
if($('pageSelect'))$('pageSelect').onchange=function(e){currentPagePath=e.target.value};
if($('refreshBtn'))$('refreshBtn').onclick=function(){if(currentPagePath)openPage(currentPagePath)};
if($('fullScreenBtn'))$('fullScreenBtn').onclick=function(){const f=$('frame');if(f.requestFullscreen)f.requestFullscreen();else if(f.webkitRequestFullscreen)f.webkitRequestFullscreen()};
if($('clearBtn'))$('clearBtn').onclick=async function(){
  if(!files.length)return;
  const ok=await showConfirm('Clear the current project from memory? Saved projects stay under Projects tab.',{title:'Clear project',confirmText:'Clear',cancelText:'Cancel'});
  if(!ok)return;
  resetPreview();files=[];urls=[];currentPagePath='';currentProjectId=null;setCurrentProjectName('No project loaded');render();showTab('home');showToast('Cleared');
};

document.querySelectorAll('.bottom span').forEach(function(s){s.onclick=function(){showTab(s.dataset.tab)}});
render();renderProjectCards();