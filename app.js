const $=id=>document.getElementById(id);

/* ===== Bulletproof tab switching ===== */
document.addEventListener('click',function(e){
  const el=e.target.closest('[data-tab]');
  if(!el)return;
  const name=el.dataset.tab;
  if(!name)return;
  ['home','projects','bundle','preview','editor','backups','github'].forEach(function(p){
    const page=document.getElementById(p+'Page');
    if(page)page.hidden=(p!==name);
  });
  document.querySelectorAll('.bottom span').forEach(function(s){
    s.classList.toggle('selected',s.dataset.tab===name);
  });
  document.querySelectorAll('.drawer-nav a').forEach(function(a){
    a.classList.toggle('selected',a.dataset.tab===name);
  });
  const drawer=document.getElementById('drawer');
  const bd=document.getElementById('drawerBackdrop');
  if(drawer)drawer.classList.remove('open');
  if(bd)bd.classList.remove('open');
  if(name==='projects'&&typeof showProjectsList==='function')showProjectsList();
},true);

let files=[],urls=[],currentPagePath='',urlCache=new Map();
let currentProjectId=null;
let ghToken='';
const PROJECT_LIMIT=4;

const textExt=new Set(['html','htm','css','js','mjs','json','txt','md','xml','svg','php','py','sql','yaml','yml','toml','csv','webmanifest','ts','jsx','tsx']);
const ext=p=>(p.split('.').pop()||'').toLowerCase();
const base=p=>p.split('/').pop();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const mimeMap={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',webmanifest:'application/manifest+json',txt:'text/plain',md:'text/plain',xml:'application/xml',svg:'image/svg+xml',csv:'text/csv',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',pdf:'application/pdf'};

/* ===== IndexedDB ===== */
const DB_NAME='multibundle',DB_STORE='project';
function openDB(){return new Promise(function(res,rej){const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=function(){const db=r.result;if(!db.objectStoreNames.contains(DB_STORE))db.createObjectStore(DB_STORE)};r.onsuccess=function(){res(r.result)};r.onerror=function(){rej(r.error)}})}
async function dbGetAll(){try{const db=await openDB();const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get('projects');const d=await new Promise(function(res){req.onsuccess=function(){res(req.result)};req.onerror=function(){res(null)}});return d||[]}catch(e){return[]}}
async function dbSetAll(arr){try{const db=await openDB();const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(arr,'projects');await new Promise(function(res){tx.oncomplete=res})}catch(e){console.warn(e)}}
async function dbUpsertProject(p){const all=await dbGetAll();const i=all.findIndex(function(x){return x.id===p.id});if(i>=0)all[i]=p;else all.unshift(p);await dbSetAll(all)}
async function dbDeleteProject(id){const all=await dbGetAll();await dbSetAll(all.filter(function(x){return x.id!==id}))}

function serializeFiles(){return files.map(function(f){return{path:f.path,name:f.name,size:f.size,type:f.type,text:f.text,blob:f.blob}})}
function deserializeFiles(arr){return arr.map(function(f){return{path:f.path,name:f.name,size:f.size,type:f.type,text:f.text,blob:f.blob}})}

function timeAgo(ts){
  const s=Math.floor((Date.now()-ts)/1000);
  if(s<60)return 'just now';
  const m=Math.floor(s/60);if(m<60)return m+' min ago';
  const h=Math.floor(m/60);if(h<24)return h+' hr ago';
  const d=Math.floor(h/24);return d+' day'+(d>1?'s':'')+' ago';
}

/* ===== File helpers ===== */
function fileBlob(f){const t=mimeMap[ext(f.path)]||f.type||'application/octet-stream';const src=f.blob||new Blob([f.text||'']);return src.type===t?src:new Blob([src],{type:t})}
function clearUrls(){urls.forEach(function(u){URL.revokeObjectURL(u)});urls=[];urlCache.clear()}
function resetPreview(){
  if($('frame')){$('frame').hidden=true;$('frame').srcdoc=''}
  if($('placeholder'))$('placeholder').hidden=false;
  if($('previewPath'))$('previewPath').textContent='Your website will appear here';
  if($('refreshBtn'))$('refreshBtn').disabled=true;
  if($('previewLoader'))$('previewLoader').classList.remove('show');
}
function findFile(p){p=p.replace(/^\.\//,'').replace(/^\//,'');return files.find(function(f){return f.path===p})||files.find(function(f){return f.path.endsWith('/'+p)})}
function makeUrl(blob){const u=URL.createObjectURL(blob);urls.push(u);return u}
function htmlPages(){return files.filter(function(f){return ['html','htm'].includes(ext(f.path))}).sort(function(a,b){return a.path.localeCompare(b.path)})}

/* ===== Current project name ===== */
function currentProjectName(){return window.__currentProjectName||'No project loaded'}
function setCurrentProjectName(n){
  window.__currentProjectName=n||'No project loaded';
  const dn=$('detailProjectName');if(dn)dn.textContent=window.__currentProjectName;
}

/* ===== Persist current project ===== */
async function saveCurrentProject(){
  if(!currentProjectId||!files.length)return;
  const all=await dbGetAll();
  const existing=all.find(function(p){return p.id===currentProjectId});
  await dbUpsertProject({
    id:currentProjectId,
    name:existing?existing.name:currentProjectName(),
    files:serializeFiles(),
    savedAt:Date.now(),
    createdAt:existing?existing.createdAt:Date.now()
  });
  await renderProjectCards();
}
window.saveCurrentProject=saveCurrentProject;

/* ===== Drawer ===== */
function openDrawer(){const d=$('drawer'),b=$('drawerBackdrop');if(d)d.classList.add('open');if(b)b.classList.add('open')}
function closeDrawer(){const d=$('drawer'),b=$('drawerBackdrop');if(d)d.classList.remove('open');if(b)b.classList.remove('open')}
if($('menuBtn'))$('menuBtn').onclick=openDrawer;
if($('drawerClose'))$('drawerClose').onclick=closeDrawer;
if($('drawerBackdrop'))$('drawerBackdrop').onclick=closeDrawer;
if($('drawerNewProject'))$('drawerNewProject').onclick=function(){closeDrawer();if($('folderInput'))$('folderInput').click()};
if($('drawerImportZip'))$('drawerImportZip').onclick=function(){closeDrawer();if($('zipInput'))$('zipInput').click()};
if($('drawerGithub'))$('drawerGithub').onclick=function(){
  closeDrawer();
  setTimeout(function(){
    ['home','projects','bundle','preview','editor','backups','github'].forEach(function(p){
      const page=document.getElementById(p+'Page');if(page)page.hidden=(p!=='github');
    });
    document.querySelectorAll('.bottom span').forEach(function(s){s.classList.remove('selected')});
  },50);
};
if($('drawerClear'))$('drawerClear').onclick=function(){closeDrawer();if($('clearBtn'))$('clearBtn').click()};

/* ===== Project cards ===== */
async function renderProjectCards(){
  const all=await dbGetAll();
  const box=$('projectCards');if(!box)return;
  if($('projectCount'))$('projectCount').textContent=all.length+' / '+PROJECT_LIMIT;
  if(!all.length){box.innerHTML='<div class="pc-empty">No saved projects yet.<br>Import a folder or ZIP to create one.</div>';return}
  box.innerHTML=all.map(function(p){
    const initials=(p.name||'?').slice(0,2).toUpperCase();
    const active=(p.id===currentProjectId)?' active':'';
    return '<div class="project-card'+active+'" data-id="'+esc(p.id)+'">'+
      '<div class="pc-top"><div class="pc-icon">'+esc(initials)+'</div>'+
      '<div class="pc-info"><div class="pc-name">'+esc(p.name||'Untitled')+'</div>'+
      '<div class="pc-meta">'+p.files.length+' file'+(p.files.length===1?'':'s')+' · '+timeAgo(p.savedAt)+'</div></div></div>'+
      '<div class="pc-actions">'+
      '<button class="pc-btn primary" data-act="preview">▶ Preview</button>'+
      '<button class="pc-btn" data-act="edit" title="Edit code">✎</button>'+
      '<button class="pc-btn" data-act="changes" title="Import changes">↻</button>'+
      '<button class="pc-btn danger" data-act="delete" title="Delete">🗑</button>'+
      '</div></div>';
  }).join('');
  box.querySelectorAll('.project-card').forEach(function(card){
    const id=card.dataset.id;
    card.querySelectorAll('.pc-btn').forEach(function(btn){
      btn.onclick=function(e){
        e.stopPropagation();
        const act=btn.dataset.act;
        if(act==='preview')cardPreview(id);
        else if(act==='edit')cardEdit(id);
        else if(act==='changes')cardChanges(id);
        else if(act==='delete')cardDelete(id,card.querySelector('.pc-name').textContent);
      };
    });
    card.onclick=function(){openProjectDetail(id)};
  });
}

async function loadProjectIntoMemory(id){
  const all=await dbGetAll();
  const p=all.find(function(x){return x.id===id});if(!p)return null;
  currentProjectId=p.id;
  setCurrentProjectName(p.name);
  files=deserializeFiles(p.files);
  return p;
}
async function cardPreview(id){const p=await loadProjectIntoMemory(id);if(!p)return;render();showTab('preview');const first=htmlPages()[0];if(first)openPage(first.path)}
async function cardEdit(id){const p=await loadProjectIntoMemory(id);if(!p)return;render();showTab('editor')}
async function cardChanges(id){const p=await loadProjectIntoMemory(id);if(!p)return;if($('changesFolderInput'))$('changesFolderInput').click()}
async function cardDelete(id,name){
  if(!confirm('Delete project "'+name+'" permanently?'))return;
  await dbDeleteProject(id);
  if(currentProjectId===id){currentProjectId=null;files=[];setCurrentProjectName('No project loaded')}
  await renderProjectCards();
  render();
}

async function openProjectDetail(id){
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
  populatePages();
  render();
  renderProjectCards();
}
function showProjectsList(){
  if($('projectsListView'))$('projectsListView').hidden=false;
  if($('projectDetailView'))$('projectDetailView').hidden=true;
  renderProjectCards();
}

/* ===== Import pipeline ===== */
function cleanIncoming(result){
  return result.filter(function(f){return f.path&&!f.path.split('/').some(function(p){return p.startsWith('.')&&p!=='.well-known'})}).sort(function(a,b){return a.path.localeCompare(b.path)});
}

async function processIncoming(result,defaultName){
  result=cleanIncoming(result);
  const name=(prompt('Project name:',defaultName||'My project')||'').trim();
  if(!name)return;

  const all=await dbGetAll();
  const existing=all.find(function(p){return p.name===name});

  if(existing){
    currentProjectId=existing.id;
    setCurrentProjectName(name);
    files=result;
    await dbUpsertProject({id:existing.id,name:name,files:serializeFiles(),savedAt:Date.now(),createdAt:existing.createdAt});
    if($('status'))$('status').textContent='Updated "'+name+'" with '+files.length+' files.';
  }else{
    if(all.length>=PROJECT_LIMIT){alert('You can only have '+PROJECT_LIMIT+' projects. Delete one first.');return}
    currentProjectId=Date.now().toString();
    setCurrentProjectName(name);
    files=result;
    await dbUpsertProject({id:currentProjectId,name:name,files:serializeFiles(),savedAt:Date.now(),createdAt:Date.now()});
    if($('status'))$('status').textContent='Created "'+name+'" with '+files.length+' files.';
  }
  await renderProjectCards();
  populatePages();
  render();
}

/* ===== Folder / ZIP ===== */
if($('folderInput'))$('folderInput').addEventListener('change',async function(e){
  const list=[].slice.call(e.target.files);if(!list.length)return;
  const name=(list[0].webkitRelativePath||'').split('/')[0]||'Website';
  const result=await Promise.all(list.map(async function(f){
    return{path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name,name:f.name,size:f.size,type:f.type,blob:f,text:textExt.has(ext(f.name))?await f.text():null};
  }));
  await processIncoming(result,name);
  e.target.value='';
});

if($('changesFolderInput'))$('changesFolderInput').addEventListener('change',async function(e){
  const list=[].slice.call(e.target.files);if(!list.length)return;
  const result=cleanIncoming(await Promise.all(list.map(async function(f){
    return{path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name,name:f.name,size:f.size,type:f.type,blob:f,text:textExt.has(ext(f.name))?await f.text():null};
  })));
  const map=new Map();result.forEach(function(f){map.set(f.path,f)});
  let updated=0,added=0;
  files.forEach(function(f){
    if(map.has(f.path)){
      const nf=map.get(f.path);
      if(nf.text!=null||nf.blob){f.text=nf.text;f.blob=nf.blob;f.size=nf.size;updated++;map.delete(f.path)}
    }
  });
  map.forEach(function(f){files.push(f);added++});
  files.sort(function(a,b){return a.path.localeCompare(b.path)});
  const existing=(await dbGetAll()).find(function(p){return p.id===currentProjectId});
  const name=existing?existing.name:currentProjectName();
  setCurrentProjectName(name);
  await dbUpsertProject({id:currentProjectId,name:name,files:serializeFiles(),savedAt:Date.now(),createdAt:existing?existing.createdAt:Date.now()});
  if($('status'))$('status').textContent='Imported changes: '+updated+' updated, '+added+' new.';
  await renderProjectCards();
  populatePages();
  render();
  e.target.value='';
});

async function loadZipBlob(blob,fallbackName){
  const z=await JSZip.loadAsync(blob);
  let result=await Promise.all(Object.values(z.files).filter(function(x){return !x.dir}).map(async function(x){
    const b=await x.async('blob');
    return{path:x.name.replace(/^\/+/,''),name:base(x.name),size:b.size,type:b.type,blob:b,text:textExt.has(ext(x.name))?await b.text():null};
  }));
  const roots=Array.from(new Set(result.map(function(x){return x.path.split('/')[0]})));
  if(roots.length===1&&result.every(function(x){return x.path.indexOf('/')!==-1})){result.forEach(function(x){x.path=x.path.slice(x.path.indexOf('/')+1)})}
  return {result:result,name:fallbackName};
}

if($('zipInput'))$('zipInput').addEventListener('change',async function(e){
  const f=e.target.files[0];if(!f)return;
  if(!window.JSZip){if($('status'))$('status').textContent='ZIP library did not load.';return}
  if($('status'))$('status').textContent='Reading ZIP…';
  try{
    const r=await loadZipBlob(f,f.name.replace(/\.zip$/i,''));
    await processIncoming(r.result,r.name);
  }catch(err){if($('status'))$('status').textContent='Could not read this ZIP.'}
  e.target.value='';
});

/* ===== GitHub ===== */
function setGhStatus(t){if($('githubStatus'))$('githubStatus').textContent=t}
function setGhPublicStatus(t){if($('ghPublicStatus'))$('ghPublicStatus').textContent=t}
function getToken(){return ghToken}

async function saveToken(t){ghToken=t;try{const db=await openDB();const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(t,'githubToken');await new Promise(function(r){tx.oncomplete=r})}catch(e){}}
async function loadToken(){try{const db=await openDB();const tx=db.transaction(DB_STORE,'readonly');const req=tx.objectStore(DB_STORE).get('githubToken');const t=await new Promise(function(r){req.onsuccess=function(){r(req.result)};req.onerror=function(){r(null)}});return t||''}catch(e){return''}}
async function clearToken(){try{const db=await openDB();const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete('githubToken');await new Promise(function(r){tx.oncomplete=r})}catch(e){}}

async function ghFetch(url){
  const t=getToken();const headers={};
  if(t)headers.Authorization='Bearer '+t;
  return fetch(url,{headers:headers});
}

async function githubLogin(){
  const t=($('githubToken').value||'').trim();
  if(!t){setGhStatus('Paste a token first.');return}
  setGhStatus('Verifying token…');
  try{
    const r=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+t}});
    if(!r.ok){setGhStatus('Token rejected. Check it has "repo" scope.');return}
    const user=await r.json();
    await saveToken(t);
    setGhStatus('Signed in as @'+user.login);
    await showGithubLoggedIn(user);
  }catch(e){setGhStatus('Network error: '+e.message)}
}
async function githubLogout(){
  await clearToken();
  if($('githubLoggedIn'))$('githubLoggedIn').hidden=true;
  if($('githubLoggedOut'))$('githubLoggedOut').hidden=false;
  if($('githubToken'))$('githubToken').value='';
  setGhStatus('Signed out.');
}
async function showGithubLoggedIn(user){
  if($('githubLoggedOut'))$('githubLoggedOut').hidden=true;
  if($('githubLoggedIn'))$('githubLoggedIn').hidden=false;
  if($('ghAvatar'))$('ghAvatar').src=user.avatar_url||'';
  if($('ghName'))$('ghName').textContent=user.name||user.login;
  if($('ghLogin'))$('ghLogin').textContent='@'+user.login;
  await loadRepoList();
}

let ghRepos=[];
async function loadRepoList(){
  const list=$('ghRepoList');if(!list)return;
  list.innerHTML='<div style="padding:16px;color:var(--muted);font-size:12px;text-align:center">Loading repos…</div>';
  try{
    let all=[],page=1;
    while(page<=3){
      const r=await ghFetch('https://api.github.com/user/repos?per_page=100&sort=updated&page='+page);
      if(!r.ok)break;
      const arr=await r.json();
      if(!Array.isArray(arr)||!arr.length)break;
      all=all.concat(arr);
      if(arr.length<100)break;
      page++;
    }
    ghRepos=all;
    renderRepoList();
  }catch(e){
    list.innerHTML='<div style="padding:16px;color:#ff8a8a;font-size:12px">Could not load repos.</div>';
  }
}
function renderRepoList(){
  const list=$('ghRepoList');if(!list)return;
  const q=($('ghRepoSearch').value||'').toLowerCase();
  const filtered=q?ghRepos.filter(function(r){return r.full_name.toLowerCase().indexOf(q)!==-1}):ghRepos;
  if(!filtered.length){list.innerHTML='<div style="padding:16px;color:var(--muted);font-size:12px;text-align:center">No repos found.</div>';return}
  list.innerHTML=filtered.map(function(r){
    return '<div class="gh-repo" data-full="'+esc(r.full_name)+'" data-branch="'+esc(r.default_branch||'main')+'">'+
      '<div class="gh-repo-info"><div class="gh-repo-name">'+esc(r.name)+'</div><div class="gh-repo-meta">'+esc(r.owner.login)+' · '+(r.language||'—')+' · ⭐ '+r.stargazers_count+'</div></div>'+
      (r.private?'<span class="gh-badge private">Private</span>':'<span class="gh-badge">Public</span>')+
    '</div>';
  }).join('');
  list.querySelectorAll('.gh-repo').forEach(function(el){el.onclick=function(){importRepo(el.dataset.full,el.dataset.branch)}});
}

async function importRepo(fullName,branch,isPublic){
  const parts=fullName.split('/');
  const owner=parts[0],repo=parts[1];
  const bn=branch||'main';
  const statusFn=isPublic?setGhPublicStatus:setGhStatus;
  statusFn('Fetching '+fullName+' ('+bn+')…');
  try{
    const r=await ghFetch('https://api.github.com/repos/'+owner+'/'+repo+'/git/trees/'+bn+'?recursive=1');
    if(!r.ok){statusFn('Could not list files.');return}
    const tree=await r.json();
    const blobs=(tree.tree||[]).filter(function(x){return x.type==='blob'});
    if(!blobs.length){statusFn('Repo has no files.');return}
    statusFn('Downloading '+blobs.length+' files…');
    let done=0;
    const result=await Promise.all(blobs.map(async function(node){
      const path=node.path;
      const isText=textExt.has(ext(path));
      try{
        const cr=await ghFetch('https://api.github.com/repos/'+owner+'/'+repo+'/contents/'+encodeURIComponent(path).replace(/%2F/g,'/')+'?ref='+encodeURIComponent(bn));
        if(!cr.ok)return null;
        const data=await cr.json();
        let blob;
        if(data.encoding==='base64'&&data.content){
          const bin=atob(data.content.replace(/\n/g,''));
          const bytes=new Uint8Array(bin.length);
          for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
          blob=new Blob([bytes],{type:'application/octet-stream'});
        }else if(data.download_url){
          const dr=await fetch(data.download_url);
          blob=await dr.blob();
        }else return null;
        done++;
        if(done%10===0)statusFn('Downloading… '+done+'/'+blobs.length);
        return {path:path,name:base(path),size:blob.size,type:blob.type,blob:blob,text:isText?await blob.text():null};
      }catch(e){return null}
    }));
    const clean=result.filter(function(x){return x});
    await processIncoming(clean,repo);
    statusFn('Imported '+fullName+' — '+clean.length+' files.');
  }catch(e){statusFn('Import failed: '+e.message)}
}

if($('githubLoginBtn'))$('githubLoginBtn').onclick=githubLogin;
if($('githubLogoutBtn'))$('githubLogoutBtn').onclick=githubLogout;
if($('githubToken'))$('githubToken').addEventListener('keydown',function(e){if(e.key==='Enter')githubLogin()});
if($('ghRepoSearch'))$('ghRepoSearch').addEventListener('input',renderRepoList);

function handlePublicUrl(){
  const raw=($('ghPublicUrl').value||'').trim();
  if(!raw){setGhPublicStatus('Paste a URL.');return}
  const m=raw.match(/github\.com\/([^\/\s]+)\/([^\/\s#?]+?)(?:\.git)?(?:\/tree\/([^\/\s#?]+))?\/?(?:[#?].*)?$/i);
  if(!m){setGhPublicStatus('Invalid URL.');return}
  importRepo(m[1]+'/'+m[2].replace(/\.git$/,''),m[3]||'main',true);
}
if($('ghPublicBtn'))$('ghPublicBtn').onclick=handlePublicUrl;
if($('ghPublicUrl'))$('ghPublicUrl').addEventListener('keydown',function(e){if(e.key==='Enter')handlePublicUrl()});

(async function(){
  const t=await loadToken();
  if(t){
    ghToken=t;
    try{
      const r=await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+t}});
      if(r.ok){const u=await r.json();await showGithubLoggedIn(u)}
    }catch(e){}
  }
})();

/* ===== Detail view buttons ===== */
if($('backToProjectsBtn'))$('backToProjectsBtn').onclick=showProjectsList;
if($('detailEditBtn'))$('detailEditBtn').onclick=function(){showTab('editor')};
if($('detailImportChangesBtn'))$('detailImportChangesBtn').onclick=function(){if(currentProjectId)$('changesFolderInput').click()};
if($('detailBundleBtn'))$('detailBundleBtn').onclick=function(){showTab('bundle');render()};
if($('detailDeleteBtn'))$('detailDeleteBtn').onclick=async function(){
  if(!currentProjectId)return;
  const p=(await dbGetAll()).find(function(x){return x.id===currentProjectId});
  await cardDelete(currentProjectId,p?p.name:'this project');
  showProjectsList();
};

/* ===== Render ===== */
function render(){
  const pages=htmlPages();
  const setT=function(id,v){const el=$(id);if(el)el.textContent=v};
  const setD=function(id,v){const el=$(id);if(el)el.disabled=v};
  const name=currentProjectName();
  setT('homeProjectName',name);
  setT('homeFileCount',files.length+' files');
  setT('homeStatus',files.length?files.length+' files loaded. Open Projects to manage, Editor to modify.':'Go to Projects to import a website folder or ZIP.');
  setT('bundleProjectName',name);
  setT('bundleFileCount',files.length+' files');
  setT('bundleStatus',files.length?'Ready to export '+files.length+' files.':'Import a project first.');
  setD('homeBundleBtn',!files.length);
  setD('homeOpenPreviewBtn',!pages.length);
  setD('bundleBtn',!files.length);
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
  let p=ref.split('#')[0].split('?')[0];
  try{p=decodeURIComponent(p)}catch(e){}
  if(p.startsWith('/'))p=p.slice(1);
  else p=(from.includes('/')?from.slice(0,from.lastIndexOf('/')+1):'')+p;
  const stack=[];
  for(const part of p.split('/')){if(part==='..')stack.pop();else if(part&&part!=='.')stack.push(part)}
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
function htmlRewrite(html,path){
  const doc=new DOMParser().parseFromString(html,'text/html');
  /* Dark base style prevents white flash */
  const base=doc.createElement('style');
  base.textContent='html,body{background:#101114;color:#f7f7f8}';
  if(doc.head)doc.head.insertBefore(base,doc.head.firstChild);
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
  return '<!doctype html>'+doc.documentElement.outerHTML;
}

function openPage(path){
  resetPreview();
  const f=findFile(path);
  if(!f){if($('previewPath'))$('previewPath').textContent='File not found';return}
  currentPagePath=f.path;
  if($('pageSelect'))$('pageSelect').value=f.path;
  if($('previewPath'))$('previewPath').textContent=f.path;
  if(f.text==null){if($('placeholder'))$('placeholder').hidden=false;return}

  const frame=$('frame'),loader=$('previewLoader');
  if(loader)loader.classList.add('show');
  if($('placeholder'))$('placeholder').hidden=true;
  frame.hidden=false;
  frame.onload=function(){
    if(loader)loader.classList.remove('show');
    frame.onload=null;
  };
  frame.srcdoc=htmlRewrite(f.text,f.path);
  if($('refreshBtn'))$('refreshBtn').disabled=false;
}

function exportBundle(){
  if(!files.length)return;
  const name=currentProjectName();
  const tf=files.filter(function(f){return f.text!=null});
  const bf=files.filter(function(f){return f.text==null});
  let out='Multi Bundle Export\nProject: '+name+'\nFiles: '+files.length+'\nExported: '+new Date().toISOString()+'\n'+'='.repeat(60)+'\n\n';
  tf.forEach(function(f){out+='\n'+'='.repeat(60)+'\nFILE: '+f.path+'\n'+'='.repeat(60)+'\n\n'+f.text+'\n'});
  if(bf.length){out+='\n'+'='.repeat(60)+'\nBINARY FILES (not embedded)\n'+'='.repeat(60)+'\n\n';bf.forEach(function(f){out+='- '+f.path+' ('+size(f.size||0)+')\n'})}
  const blob=new Blob([out],{type:'text/plain'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download=name.replace(/[^\w\-]+/g,'_')+'.txt';
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(function(){URL.revokeObjectURL(a.href)},2000);
}

function showTab(name){
  ['home','projects','bundle','preview','editor','backups','github'].forEach(function(p){
    const el=$(p+'Page');if(el)el.hidden=(p!==name);
  });
  document.querySelectorAll('.bottom span').forEach(function(s){
    s.classList.toggle('selected',s.dataset.tab===name);
  });
  document.querySelectorAll('.drawer-nav a').forEach(function(a){
    a.classList.toggle('selected',a.dataset.tab===name);
  });
  if(name==='projects')showProjectsList();
}
window.showTab=showTab;

/* ===== Buttons ===== */
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
  if(files.length&&!confirm('Clear the current project from memory? (Saved projects stay under Projects tab.)'))return;
  resetPreview();files=[];urls=[];currentPagePath='';currentProjectId=null;
  setCurrentProjectName('No project loaded');
  render();showTab('home');
};

document.querySelectorAll('.bottom span').forEach(function(s){s.onclick=function(){showTab(s.dataset.tab)}});

/* Boot */
render();
renderProjectCards();