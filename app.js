const $=id=>document.getElementById(id);
let files=[],urls=[],currentPagePath='',urlCache=new Map();
let currentProjectId=null;

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
async function dbSetAll(arr){try{const db=await openDB();const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(arr,'projects');await new Promise(function(res){tx.oncomplete=res})}catch(e){console.warn('dbSetAll',e)}}
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
function resetPreview(){if($('frame')){$('frame').hidden=true;$('frame').srcdoc=''}if($('placeholder'))$('placeholder').hidden=false;if($('previewPath'))$('previewPath').textContent='Your website will appear here';if($('refreshBtn'))$('refreshBtn').disabled=true}
function findFile(p){p=p.replace(/^\.\//,'').replace(/^\//,'');return files.find(function(f){return f.path===p})||files.find(function(f){return f.path.endsWith('/'+p)})}
function makeUrl(blob){const u=URL.createObjectURL(blob);urls.push(u);return u}
function htmlPages(){return files.filter(function(f){return ['html','htm'].includes(ext(f.path))}).sort(function(a,b){return a.path.localeCompare(b.path)})}

/* ===== Project cards ===== */
async function renderProjectCards(){
  const all=await dbGetAll();
  const box=$('projectCards');if(!box)return;
  if($('projectCount'))$('projectCount').textContent=all.length+(all.length===1?' project':' projects');
  if(!all.length){box.innerHTML='<div class="pc-empty">No saved projects yet.<br>Import a folder, ZIP, or GitHub repo to create one.</div>';return}
  box.innerHTML=all.map(function(p){
    const initials=(p.name||'?').slice(0,2).toUpperCase();
    const active=(p.id===currentProjectId)?' active':'';
    return '<div class="project-card'+active+'" data-id="'+esc(p.id)+'">'+
      '<div class="pc-top">'+
        '<div class="pc-icon">'+esc(initials)+'</div>'+
        '<div class="pc-info">'+
          '<div class="pc-name">'+esc(p.name||'Untitled')+'</div>'+
          '<div class="pc-meta">'+p.files.length+' file'+(p.files.length===1?'':'s')+' · '+timeAgo(p.savedAt)+'</div>'+
        '</div>'+
      '</div>'+
      '<div class="pc-actions">'+
        '<button class="pc-btn primary" data-act="preview">▶ Preview</button>'+
        '<button class="pc-btn" data-act="edit" title="Edit code">✎</button>'+
        '<button class="pc-btn" data-act="changes" title="Import changes">↻</button>'+
        '<button class="pc-btn danger" data-act="delete" title="Delete">🗑</button>'+
      '</div>'+
    '</div>';
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
  files=deserializeFiles(p.files);
  return p;
}

async function cardPreview(id){
  const p=await loadProjectIntoMemory(id);if(!p)return;
  render();
  showTab('preview');
  const first=htmlPages()[0];
  if(first)openPage(first.path);
}

async function cardEdit(id){
  const p=await loadProjectIntoMemory(id);if(!p)return;
  render();
  showTab('editor');
}

async function cardChanges(id){
  const p=await loadProjectIntoMemory(id);if(!p)return;
  if($('status'))$('status').textContent='Pick the same folder to import changes into "'+p.name+'".';
  $('changesFolderInput').click();
}

async function cardDelete(id,name){
  if(!confirm('Delete project "'+name+'" permanently?'))return;
  await dbDeleteProject(id);
  if(currentProjectId===id){currentProjectId=null;files=[]}
  await renderProjectCards();
  render();
}

async function openProjectDetail(id){
  const p=await loadProjectIntoMemory(id);if(!p)return;
  if($('detailProjectName'))$('detailProjectName').textContent=p.name;
  if($('detailFileCount'))$('detailFileCount').textContent=files.length+' files';
  if($('detailStatus'))$('detailStatus').textContent='Loaded '+files.length+' files.';
  const list=$('detailFileList');
  if(list){
    list.className='filelist';
    list.innerHTML=files.slice(0,200).map(function(f){
      return '<div class="file-row"><div class="file-icon">'+esc(ext(f.path).slice(0,4).toUpperCase()||'FILE')+'</div><div class="file-meta"><div class="file-name">'+esc(base(f.path))+'</div><div class="file-path">'+esc(f.path)+'</div></div><div class="file-size">'+size(f.size||0)+'</div></div>';
    }).join('')+(files.length>200?'<div style="padding:10px;text-align:center;color:var(--muted);font-size:11px">First 200 files shown</div>':'');
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

async function processIncoming(result,name){
  result=cleanIncoming(result);
  const all=await dbGetAll();
  const existing=all.find(function(p){return p.name===name});
  if(existing){
    currentProjectId=existing.id;
    files=result;
    await dbUpsertProject({id:existing.id,name:name,files:serializeFiles(),savedAt:Date.now(),createdAt:existing.createdAt});
    if($('status'))$('status').textContent='Updated existing project "'+name+'" with '+files.length+' files.';
  }else{
    currentProjectId=Date.now().toString();
    files=result;
    await dbUpsertProject({id:currentProjectId,name:name,files:serializeFiles(),savedAt:Date.now(),createdAt:Date.now()});
    if($('status'))$('status').textContent='Created new project "'+name+'" with '+files.length+' files.';
  }
  await renderProjectCards();
  populatePages();
  render();
}

/* ===== Folder / ZIP ===== */
$('folderInput').addEventListener('change',async function(e){
  const list=[].slice.call(e.target.files);if(!list.length)return;
  const name=(list[0].webkitRelativePath||'').split('/')[0]||'Website';
  if($('status'))$('status').textContent='Reading folder…';
  const result=await Promise.all(list.map(async function(f){
    return{path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name,name:f.name,size:f.size,type:f.type,blob:f,text:textExt.has(ext(f.name))?await f.text():null};
  }));
  await processIncoming(result,name);
  e.target.value='';
});

$('changesFolderInput').addEventListener('change',async function(e){
  const list=[].slice.call(e.target.files);if(!list.length)return;
  if($('status'))$('status').textContent='Reading folder…';
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
  const name=existing?existing.name:'Project';
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

$('zipInput').addEventListener('change',async function(e){
  const f=e.target.files[0];if(!f)return;
  if(!window.JSZip){if($('status'))$('status').textContent='ZIP library did not load.';return}
  if($('status'))$('status').textContent='Reading ZIP…';
  try{
    const r=await loadZipBlob(f,f.name.replace(/\.zip$/i,''));
    await processIncoming(r.result,r.name);
  }catch(err){if($('status'))$('status').textContent='Could not read this ZIP.'}
  e.target.value='';
});

/* ===== GitHub import ===== */
async function githubImport(){
  const raw=($('githubUrl').value||'').trim();
  if(!raw){if($('githubStatus'))$('githubStatus').textContent='Paste a GitHub URL first.';return}
  const m=raw.match(/github\.com\/([^\/\s]+)\/([^\/\s#?]+?)(?:\.git)?(?:\/tree\/([^\/\s#?]+))?\/?(?:[#?].*)?$/i);
  if(!m){if($('githubStatus'))$('githubStatus').textContent='Invalid URL. Use github.com/owner/repo';return}
  const owner=m[1],repo=m[2],branch=m[3];
  const tries=branch?[branch]:['main','master'];
  if($('githubStatus'))$('githubStatus').textContent='Downloading from GitHub…';
  let ok=false;
  for(const b of tries){
    try{
      const url='https://codeload.github.com/'+owner+'/'+repo+'/zip/refs/heads/'+b;
      const res=await fetch(url);
      if(!res.ok)continue;
      const blob=await res.blob();
      if($('githubStatus'))$('githubStatus').textContent='Extracting files…';
      const r=await loadZipBlob(blob,repo);
      await processIncoming(r.result,r.name);
      if($('githubStatus'))$('githubStatus').textContent='Imported '+owner+'/'+repo+' ('+b+') — '+files.length+' files.';
      if($('githubUrl'))$('githubUrl').value='';
      ok=true;break;
    }catch(err){console.warn(err)}
  }
  if(!ok){if($('githubStatus'))$('githubStatus').textContent='Download failed. Check the URL, branch, or CORS.'}
}
$('githubImportBtn').onclick=githubImport;
$('githubUrl').addEventListener('keydown',function(e){if(e.key==='Enter')githubImport()});

/* ===== Detail view buttons ===== */
$('backToProjectsBtn').onclick=showProjectsList;
$('detailEditBtn').onclick=function(){showTab('editor')};
$('detailImportChangesBtn').onclick=function(){if(currentProjectId)$('changesFolderInput').click()};
$('detailBundleBtn').onclick=function(){showTab('bundle');render()};
$('detailDeleteBtn').onclick=async function(){
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
  const pname=$('detailProjectName')?$('detailProjectName').textContent:'';
  const fallback=currentProjectId?(pname||'Project'):'No project loaded';
  setT('homeProjectName',fallback);
  setT('homeFileCount',files.length+' files');
  setT('homeStatus',files.length?files.length+' files loaded. Open Projects to manage, Editor to modify.':'Go to Projects to import a website folder, ZIP, or GitHub repo.');
  setT('bundleProjectName',fallback);
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
  const f=findFile(path);if(!f){if($('previewPath'))$('previewPath').textContent='File not found';return}
  currentPagePath=f.path;if($('pageSelect'))$('pageSelect').value=f.path;
  if($('previewPath'))$('previewPath').textContent=f.path;
  if(f.text==null){if($('placeholder'))$('placeholder').hidden=false;return}
  if($('frame')){$('frame').srcdoc=htmlRewrite(f.text,f.path);$('frame').hidden=false}
  if($('placeholder'))$('placeholder').hidden=true;
  if($('refreshBtn'))$('refreshBtn').disabled=false;
}

function exportBundle(){
  if(!files.length)return;
  const name=($('detailProjectName')&&$('detailProjectName').textContent)||'bundle';
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
  ['home','projects','bundle','preview','editor','backups'].forEach(function(p){
    const el=$(p+'Page');if(el)el.hidden=(p!==name);
  });
  document.querySelectorAll('.bottom span').forEach(function(s){
    s.classList.toggle('selected',s.dataset.tab===name);
  });
  if(name==='projects')showProjectsList();
}

/* ===== Buttons ===== */
$('homeProjectsBtn').onclick=function(){showTab('projects')};
$('homePreviewBtn').onclick=function(){showTab('preview')};
$('homeGithubBtn').onclick=function(){showTab('projects');setTimeout(function(){if($('githubUrl'))$('githubUrl').focus()},200)};
$('homeBundleBtn').onclick=function(){exportBundle()};
$('homeOpenPreviewBtn').onclick=function(){showTab('preview');if(currentPagePath)openPage(currentPagePath)};
$('bundleBtn').onclick=exportBundle;
$('backupsBundleBtn').onclick=function(){showTab('bundle')};
$('backHomeBtn').onclick=function(){showTab('home')};
$('openPageBtn').onclick=function(){if($('pageSelect').value)openPage($('pageSelect').value)};
$('pageSelect').onchange=function(e){currentPagePath=e.target.value};
$('refreshBtn').onclick=function(){if(currentPagePath)openPage(currentPagePath)};
$('fullScreenBtn').onclick=function(){const f=$('frame');if(f.requestFullscreen)f.requestFullscreen();else if(f.webkitRequestFullscreen)f.webkitRequestFullscreen()};
$('clearBtn').onclick=async function(){
  if(files.length&&!confirm('Clear the current project from memory? (Saved projects stay under Projects tab.)'))return;
  resetPreview();files=[];urls=[];currentPagePath='';currentProjectId=null;
  render();showTab('home');
};

document.querySelectorAll('.bottom span').forEach(function(s){s.onclick=function(){showTab(s.dataset.tab)}});

/* Boot */
render();
renderProjectCards();