(function(){
const $=id=>document.getElementById(id);
const ta=$('editorTextarea'),gutter=$('editorGutter'),hl=$('editorHighlight'),
      fileSelect=$('editorFileSelect'),status=$('editorStatus'),cursorInfo=$('editorCursor'),
      undoBtn=$('editorUndoBtn'),redoBtn=$('editorRedoBtn'),
      searchBar=$('editorSearchBar'),searchInput=$('editorSearchInput'),
      searchCount=$('editorSearchCount'),
      previewFrame=$('editorPreviewFrame'),shell=$('editorShell'),
      editorPage=$('editorPage');
let currentPath='',dirty=false,undoStack=[],redoStack=[],lastPush=0,fileHistories={},
    matches=[],matchLens=[],matchIndex=-1,originalText='';

const toast=window.showToast||function(){};
const promptFn=window.showPrompt||function(){return Promise.resolve(null)};
function smoothDrag(b,c){
  var id=null,sx=0,sy=0,bx=0,by=0,tx=0,ty=0,minX=0,maxX=0,minY=0,maxY=0,moving=false,pending=false;
  c.style.touchAction='none';c.style.willChange='transform';
  function apply(){pending=false;c.style.transform='translate3d('+tx+'px,'+ty+'px,0)'}
  c.addEventListener('pointerdown',function(e){
    if(id!==null)return;
    id=e.pointerId;sx=e.clientX;sy=e.clientY;bx=tx;by=ty;moving=false;
    var r=c.getBoundingClientRect();
    minX=tx-r.left;maxX=tx+(window.innerWidth-r.right);
    minY=ty-r.top;maxY=ty+(window.innerHeight-r.bottom);
  });
  c.addEventListener('pointermove',function(e){
    if(e.pointerId!==id)return;
    var dx=e.clientX-sx,dy=e.clientY-sy;
    if(!moving){
      if(Math.abs(dx)+Math.abs(dy)<6)return;
      moving=true;c.__moved=true;
      try{c.setPointerCapture(e.pointerId)}catch(_){}
    }
    tx=Math.max(minX,Math.min(maxX,bx+dx));
    ty=Math.max(minY,Math.min(maxY,by+dy));
    if(!pending){pending=true;requestAnimationFrame(apply)}
    e.preventDefault();
  });
  function end(e){
    if(e.pointerId!==id)return;
    id=null;moving=false;
    setTimeout(function(){c.__moved=false},60);
  }
  c.addEventListener('pointerup',end);
  c.addEventListener('pointercancel',end);
  c.addEventListener('click',function(e){if(c.__moved){e.stopPropagation();e.preventDefault()}},true);
}
window.__addChoice=function(){return new Promise(function(res){
  var b=document.createElement('div');
  b.style.cssText='position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.4)';
  var c=document.createElement('div');
  c.style.cssText='position:fixed;left:12px;top:120px;width:auto;min-width:160px;max-width:200px;background:#1c1d22;border:1px solid #2e2f36;border-radius:16px;padding:4px 4px 6px;box-sizing:border-box;font-family:system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.5);touch-action:none;user-select:none;-webkit-user-select:none';
  var row='display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;margin:0;border:0;border-radius:11px;background:transparent;color:#f0f0f2;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left;white-space:nowrap';
  c.innerHTML=
    '<div id="addDragHandle" style="padding:14px 0 10px;cursor:grab;text-align:center">'+
      '<div style="width:32px;height:4px;border-radius:4px;background:#55565f;margin:0 auto"></div>'+
    '</div>'+
    '<button data-c="create" style="'+row+'">'+
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#ff6b75" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>'+
      '<span>Create file</span></button>'+
    '<button data-c="folder" style="'+row+'">'+
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#7ec8ff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'+
      '<span>New folder</span></button>'+
    '<button data-c="import" style="'+row+'">'+
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#7dd68e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>'+
      '<span>Import</span></button>'+
    '<div style="height:1px;background:#2a2b32;margin:2px 8px"></div>'+
    '<button data-c="x" style="'+row+';color:#a2a3ad;justify-content:center;padding:9px 12px">Cancel</button>';
  b.appendChild(c);document.body.appendChild(b);

  // Strong finger drag — grab handle or any empty part of card
  var dragging=false, moved=false, ox=0, oy=0, sx=0, sy=0;
  function getPoint(e){return e.touches&&e.touches[0]?e.touches[0]:e.changedTouches&&e.changedTouches[0]?e.changedTouches[0]:e}
  function start(e){
    if(e.target.closest&&e.target.closest('button'))return;
    var t=getPoint(e);
    dragging=true; moved=false;
    sx=t.clientX; sy=t.clientY;
    var r=c.getBoundingClientRect();
    ox=r.left; oy=r.top;
    c.style.left=ox+'px';
    c.style.top=oy+'px';
    c.style.transform='none';
    c.style.transition='none';
    e.preventDefault();
    e.stopPropagation();
  }
  function move(e){
    if(!dragging)return;
    var t=getPoint(e);
    var dx=t.clientX-sx, dy=t.clientY-sy;
    if(Math.abs(dx)>4||Math.abs(dy)>4)moved=true;
    var nx=ox+dx, ny=oy+dy;
    // keep card on screen
    var maxX=window.innerWidth-c.offsetWidth;
    var maxY=window.innerHeight-c.offsetHeight;
    if(nx<0)nx=0; if(ny<0)ny=0;
    if(nx>maxX)nx=maxX; if(ny>maxY)ny=maxY;
    c.style.left=nx+'px';
    c.style.top=ny+'px';
    e.preventDefault();
  }
  function end(e){
    if(!dragging)return;
    dragging=false;
  }
  // Touch + mouse on card and handle
  smoothDrag(b,c);
  /* old mouse drag removed, smoothDrag handles it */
  window.addEventListener('touchmove',move,{passive:false});
  window.addEventListener('mousemove',move);
  window.addEventListener('touchend',end);
  window.addEventListener('mouseup',end);
  window.addEventListener('touchcancel',end);

  function done(v){
    window.removeEventListener('touchmove',move);
    window.removeEventListener('mousemove',move);
    window.removeEventListener('touchend',end);
    window.removeEventListener('mouseup',end);
    window.removeEventListener('touchcancel',end);
    b.remove();
    res(v);
  }
  b.onclick=function(e){if(e.target===b)done('x')};
  c.querySelectorAll('button').forEach(function(btn){
    btn.addEventListener('click',function(e){
      if(moved){e.preventDefault();e.stopPropagation();return}
      done(btn.dataset.c);
    });
  });
})};
window.__newFolderApp=async function(){
  if(typeof dirty!=='undefined'&&dirty){var okd=await confirmFn('You have unsaved changes. Discard them?',{title:'Unsaved changes',confirmText:'Discard',cancelText:'Keep editing'});if(!okd)return}
  var name=await promptFn('New folder','',{message:'Name your app folder. It becomes a new project in the Projects tab.'});
  if(!name||!name.trim())return;name=name.trim();
  var all=await dbGetAll();
  if(all.find(function(p){return p.name===name})){toast('A project named "'+name+'" already exists','error');return}
  if(all.length>=PROJECT_LIMIT){toast('Project limit reached. Delete one first.','error');return}
  if(typeof window.saveCurrentProject==='function'&&currentProjectId)await window.saveCurrentProject();
  var safe=name.replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]});
  function mk(p,t,ty){return {path:p,name:p,size:t.length,type:ty,blob:null,text:t}}
  files=[
    mk('index.html','<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n<title>'+safe+'</title>\n<link rel="stylesheet" href="style.css">\n</head>\n<body>\n<h1>'+safe+'</h1>\n<p>Start building your app here.</p>\n<script src="app.js"><\/script>\n</body>\n</html>\n','text/html'),
    mk('style.css','body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#0d0e12;color:#fff}\nh1{color:#f01424}\n','text/css'),
    mk('app.js','console.log("App ready");\n','text/javascript')
  ];
  currentProjectId=Date.now().toString();setCurrentProjectName(name);
  await dbUpsertProject({id:currentProjectId,name:name,files:serializeFiles(),savedAt:Date.now(),createdAt:Date.now(),history:[]});
  try{localStorage.setItem('mb_active_project',currentProjectId)}catch(e0){}
  refreshFileList();loadFile('index.html');
  if(typeof populatePages==='function')populatePages();
  if(typeof render==='function')render();
  if(typeof renderProjectCards==='function')renderProjectCards();
  toast('Created "'+name+'"','success');
};
window.__importFromPhone=function(){
  if(typeof currentProjectId==='undefined'||!currentProjectId){toast('Open a project first','error');return}
  var inp=document.createElement('input');inp.type='file';inp.multiple=true;
  inp.onchange=async function(){
    var list=[].slice.call(inp.files||[]);if(!list.length)return;
    var dup=list.filter(function(f){return files.find(function(x){return x.path===f.name})});
    if(dup.length){var ok=await confirmFn(dup.length+' file'+(dup.length===1?'':'s')+' already exist: '+dup.map(function(f){return f.name}).join(', ')+'. Replace them?',{title:'Replace files?',confirmText:'Replace',cancelText:'Skip those'});if(!ok)list=list.filter(function(f){return dup.indexOf(f)===-1})}
    var added=0;
    for(var i=0;i<list.length;i++){
      var f=list[i];var t=textExt.has(ext(f.name))?await f.text():null;
      var nf={path:f.name,name:f.name,size:f.size,type:f.type||'application/octet-stream',blob:f,text:t};
      var idx=files.findIndex(function(x){return x.path===nf.path});
      if(idx>-1)files[idx]=nf;else files.push(nf);added++;
    }
    if(!added)return;
    files.sort(function(a,b){return a.path.localeCompare(b.path)});
    var __op=(list.find(function(f){return textExt.has(ext(f.name))})||{}).name;
    refreshFileList();if(__op&&typeof window.__edOpenFile==='function')window.__edOpenFile(__op);if(typeof render==='function')render();
    if(typeof window.saveCurrentProject==='function')await window.saveCurrentProject();
    try{var all=await dbGetAll();var p=all.find(function(x){return x.id===currentProjectId});var lg=detectProjectLogo(files);if(p&&lg&&lg!==p.logo){p.logo=lg;await dbSetAll(all);if(typeof renderProjectCards==='function')renderProjectCards()}}catch(e0){}
    if(typeof window.logHistory==='function')window.logHistory({type:'new',path:list[0].name,note:'Imported '+added+' file'+(added===1?'':'s')+' from phone'});
    toast('Imported '+added+' file'+(added===1?'':'s'),'success');
  };
  inp.click();
};
const confirmFn=window.showConfirm||function(){return Promise.resolve(false)};
async function __doDelete(paths){
  if(!paths.length)return false;
  const pid=(typeof currentProjectId!=='undefined')?currentProjectId:null;
  if(!pid){toast('Open a project first','error');return false}
  try{
    const all0=await dbGetAll();const p0=all0.find(function(x){return x.id===pid});
    if(p0){
      p0.snapshots=p0.snapshots||[];
      p0.snapshots.unshift({ts:Date.now(),label:'Before delete',files:files.map(function(f){return{path:f.path,name:f.name,size:f.size,type:f.type,text:f.text,blob:f.blob}})});
      p0.deletedPaths=(p0.deletedPaths||[]).filter(function(x){return paths.indexOf(x)===-1}).concat(paths);
      if(p0.snapshots.length>20)p0.snapshots.length=20;
      await dbSetAll(all0);
    }
  }catch(e0){}
  const cur=currentPath;
  paths.forEach(function(path){
    for(let i=files.length-1;i>=0;i--){if(files[i].path===path)files.splice(i,1)}
    try{localStorage.removeItem('mb_draft_'+pid+'_'+path)}catch(e1){}
    delete fileHistories[path];
  });
  if(paths.indexOf(cur)>-1){currentPath='';dirty=false;originalText=''}
  refreshFileList();
  if(!files.some(function(f){return f.text!=null})){
    ta.value='';currentPath='';dirty=false;originalText='';
    updateGutter();refreshHighlight();status.textContent='No file open';
  }
  if(typeof render==='function')render();
  if(typeof window.saveCurrentProject==='function')await window.saveCurrentProject();
  try{
    const all1=await dbGetAll();const p1=all1.find(function(x){return x.id===pid});
    const lg=(typeof detectProjectLogo==='function')?detectProjectLogo(files):null;
    if(p1&&(lg||null)!==(p1.logo||null)){p1.logo=lg||null;await dbSetAll(all1);if(typeof renderProjectCards==='function')renderProjectCards()}
  }catch(e2){}
  if(typeof window.logHistory==='function')window.logHistory({type:'delete',path:paths[0],note:'Deleted '+paths.length+' file'+(paths.length===1?'':'s')});
  return true;
}
async function __doRename(oldPath,raw){
  const np=String(raw||'').trim().replace(/\\/g,'/').replace(/\/{2,}/g,'/').replace(/^\/+/,'').replace(/\/+$/,'');
  if(!np){toast('Type a new name','error');return false}
  if(np===oldPath){toast('That is already the name','error');return false}
  if(/(^|\/)\.\.?(\/|$)/.test(np)||/[\u0000-\u001f<>:"|?*\\]/.test(np)){toast('That name is not allowed','error');return false}
  if(files.some(function(x){return x.path.toLowerCase()===np.toLowerCase()&&x.path!==oldPath})){toast('A file with that name already exists','error');return false}
  const f=files.find(function(x){return x.path===oldPath});
  if(!f){toast('File not found','error');return false}
  const pid=(typeof currentProjectId!=='undefined')?currentProjectId:null;
  if(!pid){toast('Open a project first','error');return false}
  if(oldPath===currentPath&&f.text!=null&&ta.value!==f.text){f.text=ta.value;f.size=f.text.length;dirty=false;originalText=f.text}
  try{
    const all0=await dbGetAll();const p0=all0.find(function(x){return x.id===pid});
    if(p0){
      p0.snapshots=p0.snapshots||[];
      p0.snapshots.unshift({ts:Date.now(),label:'Before rename',files:files.map(function(x){return{path:x.path,name:x.name,size:x.size,type:x.type,text:x.text,blob:x.blob}})});
      p0.deletedPaths=(p0.deletedPaths||[]).filter(function(x){return x!==oldPath}).concat([oldPath]);
      if(p0.snapshots.length>20)p0.snapshots.length=20;
      await dbSetAll(all0);
    }
  }catch(e0){}
  const esc=oldPath.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const src='(?<![\\w.\\-])'+esc+'(?![\\w\\-.])';
  const rt=new RegExp(src),rg=new RegExp(src,'g');
  const hits=files.filter(function(x){return x!==f&&x.text!=null&&rt.test(x.text)});
  f.path=np;f.name=np.split('/').pop();
  if(hits.length){
    const yes=await confirmFn(hits.length+' other file'+(hits.length===1?'':'s')+' mention "'+oldPath+'" (like a link or script tag). Update '+(hits.length===1?'it':'them')+' to "'+np+'"?',{title:'Update links?',confirmText:'Update',cancelText:'Keep as is'});
    if(yes)hits.forEach(function(x){x.text=x.text.replace(rg,function(){return np});x.size=x.text.length});
  }
  if(oldPath===currentPath)currentPath=np;
  if(fileHistories[oldPath]){fileHistories[np]=fileHistories[oldPath];delete fileHistories[oldPath]}
  if(typeof currentPagePath!=='undefined'&&currentPagePath===oldPath)currentPagePath=np;
  try{localStorage.removeItem('mb_draft_'+pid+'_'+oldPath)}catch(e1){}
  try{const sf=JSON.parse(localStorage.getItem('mb_file')||'null');if(sf&&sf.pid===pid&&sf.path===oldPath){sf.path=np;localStorage.setItem('mb_file',JSON.stringify(sf))}}catch(e2){}
  refreshFileList();
  if(typeof populatePages==='function')populatePages();
  if(typeof render==='function')render();
  if(typeof window.saveCurrentProject==='function')await window.saveCurrentProject();
  try{
    const all1=await dbGetAll();const p1=all1.find(function(x){return x.id===pid});
    const lg=(typeof detectProjectLogo==='function')?detectProjectLogo(files):null;
    if(p1&&(lg||null)!==(p1.logo||null)){p1.logo=lg||null;await dbSetAll(all1);if(typeof renderProjectCards==='function')renderProjectCards()}
  }catch(e3){}
  if(typeof window.logHistory==='function')window.logHistory({type:'edit',path:np,note:'Renamed from '+oldPath,text:(f.text!=null&&f.text.length<300000)?f.text:undefined});
  return true;
}
window.__renameCurrentFile=async function(){
  if(!currentPath){toast('Open a file first','error');return}
  const old=currentPath;
  const nn=await promptFn('Rename this file',old,{message:'Type the new name. A folder path like pages/about.html moves it.',confirmText:'Rename'});
  if(nn==null)return;
  if(await __doRename(old,nn))toast('Renamed to '+String(nn).trim(),'success');
};
window.__openRenameFiles=function(){
  if(typeof currentProjectId==='undefined'||!currentProjectId||!files.length){toast('Open a project with files first','error');return}
  const list=files.map(function(f){return f.path}).sort(function(a,b){return a.localeCompare(b)});
  const bk=document.createElement('div');
  bk.style.cssText='position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;justify-content:center';
  const c=document.createElement('div');
  c.style.cssText='width:100%;max-width:560px;max-height:85vh;overflow-y:auto;background:#15161a;border:1px solid #2a2b32;border-radius:18px 18px 0 0;padding:16px 16px 24px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff';
  bk.appendChild(c);document.body.appendChild(bk);
  function close(){bk.remove()}
  bk.onclick=function(e){if(e.target===bk)close()};
  c.innerHTML='<div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#f01424">RENAME FILE</div>'+
    '<div style="font-size:18px;font-weight:800;margin:4px 0 4px">Tap the file to rename</div>'+
    '<div style="font-size:12px;color:#a2a3ad;margin-bottom:10px">Pick one file, then type its new name.</div>'+
    '<div style="border:1px solid #25262c;border-radius:12px;background:#101115;overflow:hidden">'+list.map(function(p,i){
      return '<button data-i="'+i+'" style="display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:13px 12px;border:0;border-bottom:1px solid #1d1e24;background:transparent;color:#fff;font-family:inherit;font-size:13px;cursor:pointer"><span style="flex:1;overflow-wrap:anywhere">'+escHtml(p)+'</span>'+(p===currentPath?'<span style="font-size:10px;color:#a2a3ad">open now</span>':'')+'</button>';
    }).join('')+'</div>'+
    '<button id="rfX" style="display:block;width:100%;margin-top:10px;padding:14px;border-radius:12px;font-size:14px;font-weight:800;font-family:inherit;cursor:pointer;border:1px solid #303139;background:transparent;color:#a2a3ad">Cancel</button>';
  $('rfX').onclick=close;
  c.querySelectorAll('button[data-i]').forEach(function(b){
    b.onclick=async function(){
      const old=list[+b.dataset.i];
      const nn=await promptFn('Rename file',old,{message:'Type the new name. A folder path like pages/about.html moves it.',confirmText:'Rename'});
      if(nn==null)return;
      if(await __doRename(old,nn)){close();toast('Renamed to '+String(nn).trim(),'success')}
    };
  });
};
window.__deleteCurrentFile=async function(){
  if(!currentPath){toast('Open a file first','error');return}
  const name=currentPath;
  const ok=await confirmFn('Delete '+name+' from this project? A backup snapshot is saved first, so you can bring it back from Backups.',{title:'Delete this file?',confirmText:'Delete',cancelText:'Cancel'});
  if(!ok)return;
  if(await __doDelete([name]))toast('Deleted '+name,'success');
};
window.__openDeleteFiles=function(){
  if(typeof currentProjectId==='undefined'||!currentProjectId||!files.length){toast('Open a project with files first','error');return}
  const list=files.map(function(f){return f.path}).sort(function(a,b){return a.localeCompare(b)});
  const sel={};
  const bk=document.createElement('div');
  bk.style.cssText='position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;justify-content:center';
  const c=document.createElement('div');
  c.style.cssText='width:100%;max-width:560px;max-height:85vh;overflow-y:auto;background:#15161a;border:1px solid #2a2b32;border-radius:18px 18px 0 0;padding:16px 16px 24px;box-sizing:border-box;font-family:system-ui,sans-serif;color:#fff';
  bk.appendChild(c);document.body.appendChild(bk);
  function close(){bk.remove()}
  bk.onclick=function(e){if(e.target===bk)close()};
  const bs='display:block;width:100%;margin-top:10px;padding:14px;border-radius:12px;font-size:14px;font-weight:800;font-family:inherit;cursor:pointer;border:1px solid #303139;background:#20222a;color:#fff';
  const sm='background:#20222a;color:#cfd0d8;border:1px solid #303139;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;font-family:inherit;cursor:pointer';
  c.innerHTML='<div style="display:flex;align-items:center;gap:10px"><div style="font-size:11px;font-weight:800;letter-spacing:2px;color:#f01424;flex:1">DELETE FILES</div><button id="dfAll" style="'+sm+'">Select all</button></div>'+
    '<div style="font-size:18px;font-weight:800;margin:4px 0 4px">Select files to delete</div>'+
    '<div style="font-size:12px;color:#a2a3ad;margin-bottom:10px">Tap the files you want to remove from this project.</div>'+
    '<div style="border:1px solid #25262c;border-radius:12px;background:#101115;overflow:hidden">'+list.map(function(p,i){
      return '<label style="display:flex;align-items:center;gap:10px;padding:11px 12px;border-bottom:1px solid #1d1e24;cursor:pointer"><input type="checkbox" data-i="'+i+'" style="width:18px;height:18px;accent-color:#ff2d46;flex-shrink:0"><span style="flex:1;font-size:13px;overflow-wrap:anywhere">'+escHtml(p)+'</span>'+(p===currentPath?'<span style="font-size:10px;color:#a2a3ad">open now</span>':'')+'</label>';
    }).join('')+'</div>'+
    '<button id="dfGo" style="'+bs+';background:#f01424;border:0"></button>'+
    '<button id="dfX" style="'+bs+';background:transparent;color:#a2a3ad">Cancel</button>';
  function count(){return Object.keys(sel).filter(function(k){return sel[k]}).length}
  function refresh(){
    const n=count();
    const go=$('dfGo');go.textContent='Delete '+n+' file'+(n===1?'':'s');
    go.disabled=!n;go.style.opacity=n?'1':'.4';
    $('dfAll').textContent=(n===list.length)?'Select none':'Select all';
  }
  c.querySelectorAll('input[type=checkbox]').forEach(function(cb){cb.onchange=function(){sel[cb.dataset.i]=cb.checked;refresh()}});
  $('dfAll').onclick=function(){
    const on=count()!==list.length;
    c.querySelectorAll('input[type=checkbox]').forEach(function(cb){cb.checked=on;sel[cb.dataset.i]=on});
    refresh();
  };
  $('dfX').onclick=close;
  $('dfGo').onclick=async function(){
    const chosen=list.filter(function(p,i){return sel[i]});
    if(!chosen.length)return;
    const ok=await confirmFn('Delete '+chosen.length+' file'+(chosen.length===1?'':'s')+' from this project? A backup snapshot is saved first, so you can bring them back from Backups.',{title:'Delete files?',confirmText:'Delete',cancelText:'Cancel'});
    if(!ok)return;
    if(await __doDelete(chosen)){close();toast('Deleted '+chosen.length+' file'+(chosen.length===1?'':'s'),'success')}
  };
  refresh();
};

function escHtml(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}

function highlightJS(code){
  const re=/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(function|const|let|var|if|else|for|while|return|class|new|this|true|false|null|undefined|async|await|import|export|from|of|in|try|catch|finally|throw|typeof|instanceof|delete|void|yield|switch|case|break|continue|default|do|extends|super|static|get|set)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)(?=\s*\()/g;
  let out='',last=0,m;
  while((m=re.exec(code))!==null){
    out+=escHtml(code.slice(last,m.index));
    const t=m[0]
    if(m[1])out+='<span class="tk-cmt">'+escHtml(t)+'</span>';
    else if(m[2])out+='<span class="tk-str">'+escHtml(t)+'</span>';
    else if(m[3])out+='<span class="tk-kw">'+escHtml(t)+'</span>';
    else if(m[4])out+='<span class="tk-num">'+escHtml(t)+'</span>';
    else if(m[5])out+='<span class="tk-fn">'+escHtml(t)+'</span>';
    else out+=escHtml(t);
    last=m.index+t.length;
  }
  out+=escHtml(code.slice(last));
  return out;
}
function highlightCSS(code){
  const re=/(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(#[0-9a-fA-F]{3,8}\b|\b\d+(?:\.\d+)?(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?\b)|(@[A-Za-z\-]+)|([a-zA-Z\-]+)(?=\s*:)/g;
  let out='',last=0,m;
  while((m=re.exec(code))!==null){
    out+=escHtml(code.slice(last,m.index));
    const t=m[0];
    if(m[1])out+='<span class="tk-cmt">'+escHtml(t)+'</span>';
    else if(m[2])out+='<span class="tk-str">'+escHtml(t)+'</span>';
    else if(m[3])out+='<span class="tk-num">'+escHtml(t)+'</span>';
    else if(m[4])out+='<span class="tk-kw">'+escHtml(t)+'</span>';
    else if(m[5])out+='<span class="tk-attr">'+escHtml(t)+'</span>';
    else out+=escHtml(t);
    last=m.index+t.length;
  }
  out+=escHtml(code.slice(last));
  return out;
}
function highlightHTML(code){
  const re=/(<!--[\s\S]*?-->)|(<\/?[A-Za-z][\w\-]*)|([A-Za-z\-:]+)(?==)|("(?:[^"]*)")|(>)/g;
  let out='',last=0,m;
  while((m=re.exec(code))!==null){
    out+=escHtml(code.slice(last,m.index));
    const t=m[0];
    if(m[1])out+='<span class="tk-cmt">'+escHtml(t)+'</span>';
    else if(m[2])out+='<span class="tk-tag">'+escHtml(t)+'</span>';
    else if(m[3])out+='<span class="tk-attr">'+escHtml(t)+'</span>';
    else if(m[4])out+='<span class="tk-str">'+escHtml(t)+'</span>';
    else if(m[5])out+='<span class="tk-tag">'+escHtml(t)+'</span>';
    else out+=escHtml(t);
    last=m.index+t.length;
  }
  out+=escHtml(code.slice(last));
  return out;
}
function highlightAll(code){
  const e=(currentPath.split('.').pop()||'').toLowerCase();
  if(e==='css')return highlightCSS(code);
  if(e==='html'||e==='htm'||e==='svg'||e==='xml')return highlightHTML(code);
  if(['js','mjs','ts','jsx','tsx','json'].includes(e))return highlightJS(code);
  return escHtml(code);
}
var __lastHlText=null;
function __plainMode(on){
  if(on){
    if(!ta.__plain){
      ta.__plain=1;
      var c=getComputedStyle(hl).color;
      ta.style.setProperty('-webkit-text-fill-color',c,'important');
      ta.style.setProperty('color',c,'important');
      hl.style.visibility='hidden';
    }
  }else if(ta.__plain){
    ta.__plain=0;
    ta.style.removeProperty('-webkit-text-fill-color');
    ta.style.removeProperty('color');
    hl.style.visibility='';
  }
}
function refreshHighlight(){
  if(!hl)return;
  var v0=ta.value;
  if(v0!==__lastHlText){__lastHlText=v0;__refreshHighlightCore()}
  __plainMode(false);
}
function __refreshHighlightCore(){
  if(!hl)return;
  const v=ta.value;
  hl.innerHTML=(v.length>100000?escHtml(v):highlightAll(v))+(v.endsWith('\n')?' ':'');
  hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft;
}

function updateGutter(){
  const n=ta.value.split('\n').length;let s='';
  for(let i=1;i<=n;i++)s+=i+'\n';
  gutter.textContent=s;gutter.scrollTop=ta.scrollTop;
}
function syncScroll(){gutter.scrollTop=ta.scrollTop;hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft}
ta.addEventListener('scroll',syncScroll);
let highlightTimer;
let draftTimer;
let lastLineCount = 0;

ta.addEventListener('input', function() {
  // 1. FAST UPDATES (Instant, but light on the processor)
  updateCursor();
  pushHistory(); 
  markDirty();

  // 2. SMART GUTTER (Only update line numbers if we actually added/removed a line)
  const currentLines = ta.value.split('\n').length;
  if (currentLines !== lastLineCount) {
    updateGutter();
    lastLineCount = currentLines;
  }

  // 3. DELAYED HIGHLIGHT (Wait 200ms after you stop typing to color the text)
  clearTimeout(highlightTimer);
if(ta.value.length<=15000){refreshHighlight()}else{__plainMode(true)}
  highlightTimer = setTimeout(function() {
    refreshHighlight();
  }, 200);

  // 4. DELAYED SAVE (Wait a full second before writing to phone storage)
  clearTimeout(draftTimer);
  draftTimer = setTimeout(function() {
    try{
      if(typeof currentProjectId!=='undefined' && currentProjectId && currentPath){
        localStorage.setItem('mb_draft_'+currentProjectId+'_'+currentPath, ta.value);
      }
    }catch(e){}
  }, 1000);
});
ta.addEventListener('click',updateCursor);
ta.addEventListener('keyup',updateCursor);

function pushHistory(force){
  const now=Date.now();
  if(!force&&now-lastPush<300)return;lastPush=now;
  const v=ta.value;
  if(undoStack.length&&undoStack[undoStack.length-1]===v)return;
  undoStack.push(v);if(undoStack.length>60)undoStack.shift();
redoStack=[];
if(currentPath) fileHistories[currentPath] = { undo: undoStack.slice(), redo: [] };
updateBtns();
}
function updateBtns(){undoBtn.disabled=undoStack.length<2;redoBtn.disabled=!redoStack.length}
undoBtn.onclick=function(){
  if(undoStack.length<2)return;
  redoStack.push(undoStack.pop());
  ta.value=undoStack[undoStack.length-1];
  if(currentPath) fileHistories[currentPath] = { undo: undoStack.slice(), redo: redoStack.slice() };
  updateGutter();refreshHighlight();markDirty();updateBtns()
};
redoBtn.onclick=function(){
  if(!redoStack.length)return;
  const n=redoStack.pop();
  undoStack.push(n);
  ta.value=n;
  if(currentPath) fileHistories[currentPath] = { undo: undoStack.slice(), redo: redoStack.slice() };
  updateGutter();refreshHighlight();markDirty();updateBtns()
};
ta.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undoBtn.click()}
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();redoBtn.click()}
  if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();openSearch()}
  if(e.key==='Tab'){e.preventDefault();const s=ta.selectionStart,en=ta.selectionEnd;
    ta.value=ta.value.slice(0,s)+'  '+ta.value.slice(en);
    ta.selectionStart=ta.selectionEnd=s+2;updateGutter();refreshHighlight();pushHistory(true);markDirty()}
});

function openSearch(){searchBar.classList.add('open');searchInput.focus();searchInput.select()}
function closeSearch(){searchBar.classList.remove('open');matches=[];matchIndex=-1;updateSearchCount();paintMatches()}
function runSearch(){
  const q=searchInput.value;matches=[];matchLens=[];matchIndex=-1;
  const gl=q.match(/^:(\d+)$/);if(gl){goToLine(parseInt(gl[1],10));searchCount.textContent='line '+gl[1];return}
  if(q){const t=ta.value.toLowerCase(),n=q.toLowerCase();let i=0;
    while((i=t.indexOf(n,i))!==-1){matches.push(i);matchLens.push(n.length);i+=n.length}
    if(!matches.length&&/\s/.test(q.trim())){
      try{const re=new RegExp(q.trim().split(/\s+/).map(function(w){return w.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}).join('\\s+'),'gi');let m;
        while((m=re.exec(ta.value))!==null){matches.push(m.index);matchLens.push(m[0].length);if(m[0].length===0)re.lastIndex++}}catch(e){}
    }}
  updateSearchCount();
  if(matches.length){matchIndex=0;selectMatch()}else paintMatches();
}
function updateSearchCount(){searchCount.textContent=matches.length?(matchIndex+1)+'/'+matches.length:'0/0'}
function paintMatches(){
  if(!(window.CSS&&CSS.highlights&&window.Highlight))return;
  try{
    CSS.highlights.delete('srch-all');CSS.highlights.delete('srch');
    if(!matches.length)return;
    const nodes=[];let acc=0;const w=document.createTreeWalker(hl,NodeFilter.SHOW_TEXT);let nd;
    while((nd=w.nextNode())){nodes.push({n:nd,a:acc});acc+=nd.nodeValue.length}
    function loc(p,end){for(let i=0;i<nodes.length;i++){const o=nodes[i],L=o.n.nodeValue.length;if(end?p<=o.a+L:p<o.a+L)return [o.n,p-o.a]}return null}
    const all=[];let cur=null;
    matches.forEach(function(s,i){
      if(i>300&&i!==matchIndex)return;
      const a=loc(s,false),b=loc(s+(matchLens[i]||0),true);if(!a||!b)return;
      const r=new Range();r.setStart(a[0],a[1]);r.setEnd(b[0],b[1]);
      if(i===matchIndex)cur=r;else all.push(r);
    });
    if(all.length)CSS.highlights.set('srch-all',new Highlight(...all));
    if(cur)CSS.highlights.set('srch',new Highlight(cur));
  }catch(e){}
}
function goToLine(n){
  const lines=ta.value.split('\n');n=Math.max(1,Math.min(n,lines.length));
  let pos=0;for(let i=0;i<n-1;i++)pos+=lines[i].length+1;
  ta.setSelectionRange(pos,pos+lines[n-1].length);scrollToPosition(pos);updateCursor();
}
function focusSel(){const s=ta.selectionStart,e=ta.selectionEnd;ta.focus({preventScroll:true});ta.setSelectionRange(s,e)}
function edited(){ta.dispatchEvent(new Event('input'));pushHistory(true)}
function replaceOne(){
  if(!matches.length||matchIndex<0){toast('No match to replace','error');return}
  const rv=$('editorReplaceInput').value,s=matches[matchIndex],e=s+(matchLens[matchIndex]||0);
  ta.value=ta.value.slice(0,s)+rv+ta.value.slice(e);
  edited();runSearch();
  const k=matches.findIndex(function(p){return p>=s+rv.length});
  if(matches.length){matchIndex=k<0?0:k;selectMatch();focusSel()}
}
function replaceAll(){
  if(!matches.length){toast('No match to replace','error');return}
  const rv=$('editorReplaceInput').value;let v=ta.value;const n=matches.length;
  for(let i=matches.length-1;i>=0;i--){v=v.slice(0,matches[i])+rv+v.slice(matches[i]+(matchLens[i]||0))}
  ta.value=v;edited();runSearch();toast('Replaced '+n,'success');
}
async function cutMatch(){
  const g=searchInput.value.match(/^:(\d+)$/);
  let s,e;
  if(g){
    const lines=ta.value.split('\n');const n=Math.max(1,Math.min(parseInt(g[1],10),lines.length));
    s=0;for(let i=0;i<n-1;i++)s+=lines[i].length+1;
    e=s+lines[n-1].length+(n<lines.length?1:0);
  }else{
    if(!matches.length||matchIndex<0){toast('Search first, then tap Cut','error');return}
    s=matches[matchIndex];e=s+(matchLens[matchIndex]||0);
  }
  const piece=ta.value.slice(s,e);
  try{
    if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(piece);
    else{const t=document.createElement('textarea');t.value=piece;t.style.cssText='position:fixed;opacity:0';document.body.appendChild(t);t.select();document.execCommand('copy');document.body.removeChild(t)}
  }catch(err){}
  window.__edSkipRestore=Date.now()+1500;
  ta.value=ta.value.slice(0,s)+ta.value.slice(e);
  edited();runSearch();
  const k=matches.findIndex(function(p){return p>=s});
  if(matches.length){matchIndex=k<0?0:k;selectMatch()}
  toast('Cut '+piece.length+' characters','success');
}
if($('editorCutBtn'))$('editorCutBtn').onclick=cutMatch;
if($('editorReplaceOne'))$('editorReplaceOne').onclick=replaceOne;
if($('editorReplaceAll'))$('editorReplaceAll').onclick=replaceAll;
function __quiet(pos){
  try{if(window.__edSetCaret)window.__edSetCaret(pos)}catch(_){}
  function go(){
    try{CSS.highlights.delete('srch-all');CSS.highlights.delete('srch')}catch(_){}
    try{ta.setSelectionRange(pos,pos)}catch(_){}
  }
  go();requestAnimationFrame(go);setTimeout(go,80);
}
function replaceOne(){
  if(!matches.length||matchIndex<0){toast('No match to replace','error');return}
  const rv=$('editorReplaceInput').value,s=matches[matchIndex],e=s+(matchLens[matchIndex]||0);
  const st=ta.scrollTop,sl=ta.scrollLeft;
  ta.value=ta.value.slice(0,s)+rv+ta.value.slice(e);
  edited();runSearch();
  const end=s+rv.length;
  let k=matches.findIndex(function(p){return p>=end});
  if(k<0)k=matches.findIndex(function(p){return p<s});
  matchIndex=k;
  ta.scrollTop=st;ta.scrollLeft=sl;syncScroll();
  updateSearchCount();
  __quiet(end);
}
function replaceAll(){
  if(!matches.length){toast('No match to replace','error');return}
  const rv=$('editorReplaceInput').value;let v=ta.value;const n=matches.length;
  const st=ta.scrollTop,sl=ta.scrollLeft;
  for(let i=matches.length-1;i>=0;i--){v=v.slice(0,matches[i])+rv+v.slice(matches[i]+(matchLens[i]||0))}
  ta.value=v;edited();
  matches=[];matchLens=[];matchIndex=-1;updateSearchCount();
  ta.scrollTop=st;ta.scrollLeft=sl;syncScroll();
  __quiet(0);
  toast('Replaced '+n,'success');
}
function scrollToPosition(pos){
  const cs=getComputedStyle(ta);
  const lh=parseFloat(cs.lineHeight)||(parseFloat(cs.fontSize)*1.55)||20;
  const before=ta.value.slice(0,pos);
  const lineNum=before.split('\n').length;
  ta.scrollTop=Math.max(0,(lineNum-3)*lh);
  const col=pos-before.lastIndexOf('\n')-1;
  ta.scrollLeft=Math.max(0,col*(parseFloat(cs.fontSize)||13)*0.6-ta.clientWidth/3);
  syncScroll();
}
function selectMatch(){
  if(matchIndex<0||matchIndex>=matches.length)return;
   const s=matches[matchIndex],en=s+(matchLens[matchIndex]||searchInput.value.length);
  ta.setSelectionRange(s,en);
   scrollToPosition(s);paintMatches();
  updateSearchCount();
}
searchInput.addEventListener('input',runSearch);
searchInput.addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();e.shiftKey?prevMatch():nextMatch()}
  if(e.key==='Escape')closeSearch();
});
function nextMatch(){const g=searchInput.value.match(/^:(\d+)$/);if(g){goToLine(parseInt(g[1],10));return}if(!matches.length)return;matchIndex=(matchIndex+1)%matches.length;selectMatch()}
function prevMatch(){if(!matches.length)return;matchIndex=(matchIndex-1+matches.length)%matches.length;selectMatch()}
$('editorSearchNext').onclick=function(){nextMatch();focusSel()};
$('editorSearchPrev').onclick=function(){prevMatch();focusSel()};
$('editorSearchClose').onclick=closeSearch;
$('editorSearchBtn').onclick=function(){searchBar.classList.contains('open')?closeSearch():openSearch()};

var __ucT=0;
function updateCursor(){
  if(__ucT)return;
  __ucT=requestAnimationFrame(function(){__ucT=0;updateCursorNow()});
}
function updateCursorNow(){
  const p=ta.selectionStart,b=ta.value.slice(0,p);
  const line=b.split('\n').length,col=p-b.lastIndexOf('\n');
  cursorInfo.textContent='Ln '+line+', Col '+col;
}

function refreshFileList(){
  if(typeof files==='undefined')return;
  const tf=files.filter(function(f){return f.text!=null});
  const cur=currentPath;fileSelect.innerHTML='';
  if(!tf.length){fileSelect.add(new Option('No project selected',''));return}
  tf.forEach(function(f){fileSelect.add(new Option(f.path,f.path))});
  const pid=(typeof currentProjectId!=='undefined')?currentProjectId:'';
  const cf=cur?tf.find(function(f){return f.path===cur}):null;
  if(cf&&pid===window.__edPid){fileSelect.value=cur;if(!dirty&&cf.text!==originalText)loadFile(cur);return}
  window.__edPid=pid;
  let want='';try{const sf=JSON.parse(localStorage.getItem('mb_file')||'null');if(sf&&sf.pid===pid)want=sf.path}catch(e){}
  const pick=tf.find(function(f){return f.path===want})||tf[0];
  if(pick)loadFile(pick.path);
}
function loadFile(path){
  const f=files.find(function(x){return x.path===path});if(!f||f.text==null)return;
  currentPath=path;
  
  let savedText = f.text;
  try{
    const draft = localStorage.getItem('mb_draft_'+(typeof currentProjectId!=='undefined'?currentProjectId:'')+'_'+path);
    if(draft !== null && draft !== undefined) savedText = draft;
  }catch(e){}

  ta.value=savedText;originalText=f.text;dirty=(savedText !== f.text);

// RESTORE UNDO/REDO HISTORY FOR THIS FILE
if(!fileHistories[path]) fileHistories[path] = { undo: [savedText], redo: [] };
undoStack = fileHistories[path].undo.slice();
redoStack = fileHistories[path].redo.slice();
updateBtns();
  updateGutter();updateCursor();refreshHighlight();
  status.textContent=path;fileSelect.value=path;
  try{localStorage.setItem('mb_file',JSON.stringify({pid:(typeof currentProjectId!=='undefined'?currentProjectId:''),path:path}))}catch(e){}
  renderPreview();
}
function markDirty(){dirty=true;status.textContent=currentPath+' •'}

async function saveFile(){
  if(!currentPath)return;
  const f=files.find(function(x){return x.path===currentPath});
  if(!f)return;

  const changed=(ta.value!==originalText);
  if(!changed){
    dirty=false;
    status.textContent=currentPath;
    toast('No changes');
    return;
  }

  f.text=ta.value;f.blob=null;dirty=false;
originalText=ta.value;

try{
  if(typeof currentProjectId!=='undefined' && currentProjectId){
    localStorage.removeItem('mb_draft_'+currentProjectId+'_'+currentPath);
  }
}catch(e){}
status.textContent=currentPath+' •';
  if(typeof window.saveCurrentProject==='function'){
    try{
      toast('Saved','success');status.textContent=currentPath+' Saved';await window.saveCurrentProject();
      if(typeof window.logHistory==='function'){
        window.logHistory({type:'edit',path:currentPath,note:'Edited file',text:f.text.length<300000?f.text:undefined});
      }
      status.textContent=currentPath+' Saved';
      void 0;
      setTimeout(function(){status.textContent=currentPath},1500);
    }catch(e){toast('Save failed: '+((e&&e.message)||e),'error')}
  }
  if(typeof render==='function')render();
}
fileSelect.addEventListener('change',async function(e){
  if(dirty){
    const ok=await confirmFn('You have unsaved changes. Discard them?',{title:'Unsaved changes',confirmText:'Discard',cancelText:'Keep editing'});
    if(!ok){fileSelect.value=currentPath;return}
  }
  loadFile(e.target.value);
});
$('editorSaveBtn').onclick=saveFile;
$('editorNewBtn').onclick=async function(){const choice=window.__addChoice?await window.__addChoice():'create';if(choice==='folder'){window.__newFolderApp();return}if(choice==='import'){window.__importFromPhone();return}if(choice!=='create')return;
  const name=await promptFn('New file','',{message:'Enter a file path, e.g. pages/about.html'});
  if(!name||!name.trim())return;
  const p=name.trim();
  if(files.find(function(f){return f.path===p})){toast('File already exists','error');return}
  files.push({path:p,name:p.split('/').pop(),size:0,type:'text/plain',blob:null,text:''});
  files.sort(function(a,b){return a.path.localeCompare(b.path)});
  refreshFileList();loadFile(p);
  if(typeof render==='function')render();
  if(typeof window.saveCurrentProject==='function')window.saveCurrentProject();
  if(typeof window.logHistory==='function')window.logHistory({type:'new',path:p,note:'Created file'});
  toast('Created '+p,'success');
};

function renderPreview(){
  if(window.self!==window.top)return;
  var __pp=$('editorPreviewPane');if(!__pp||!__pp.classList.contains('open'))return;
  if(!currentPath)return;
  const loader=$('editorPreviewLoader');
  if(loader)loader.classList.add('show');
  previewFrame.onload=function(){if(loader)loader.classList.remove('show');previewFrame.onload=null};clearTimeout(window.__pvLT);window.__pvLT=setTimeout(function(){if(loader)loader.classList.remove('show')},2500);
  previewFrame.srcdoc=(typeof htmlRewrite==='function')?htmlRewrite(ta.value,currentPath):ta.value;
}
$('editorPreviewRefresh').onclick=renderPreview;
$('editorPreviewBtn').onclick=function(){$('editorPreviewPane').classList.add('open');ta.readOnly=true;ta.blur();renderPreview()};
(function(){
  var cb=$('editorPreviewClose'),pane=$('editorPreviewPane');
  function closePv(){
    pane.classList.remove('open');
    ta.readOnly=false;
    try{previewFrame.srcdoc=''}catch(_){}
  }
  cb.onclick=closePv;
  var tsx=0,tsy=0,tmoved=false;
cb.addEventListener('touchstart',function(e){var t=e.touches[0];tsx=t.clientX;tsy=t.clientY;tmoved=false},{passive:true});
cb.addEventListener('touchmove',function(e){var t=e.touches[0];if(Math.abs(t.clientX-tsx)+Math.abs(t.clientY-tsy)>10)tmoved=true},{passive:true});
cb.addEventListener('touchend',function(e){e.preventDefault();if(!tmoved)closePv()},{passive:false});
})();
ta.addEventListener('input',function(){
  if(/\.html?$/i.test(currentPath)){
    clearTimeout(window.__pvT);
    // Wait 1.5 seconds after you stop typing to refresh the preview
    window.__pvT=setTimeout(function(){
       // Only refresh if the editor is actually visible to save battery
       if (!$('editorPage').hidden && $('editorPreviewPane') && $('editorPreviewPane').classList.contains('open')) renderPreview();
    }, 1500); 
  }
});

$('editorFullBtn').onclick=function(){
  const on=shell.classList.toggle('fullscreen');
  document.body.classList.toggle('editor-full',on);
  $('editorFullBtn').classList.toggle('active',on);
};

if(editorPage){
  const obs=new MutationObserver(function(){if(!editorPage.hidden)refreshFileList()});
  obs.observe(editorPage,{attributes:true,attributeFilter:['hidden']});
}

(function(){
  if(!searchInput||$('editorSearchClear'))return;
  var wrap=document.createElement('div');wrap.className='es-wrap';
  searchInput.parentNode.insertBefore(wrap,searchInput);wrap.appendChild(searchInput);
  var b=document.createElement('button');b.id='editorSearchClear';b.type='button';b.className='es-clear';b.setAttribute('aria-label','Clear search');b.hidden=true;b.textContent='\u00d7';
  wrap.appendChild(b);
  function sync(){b.hidden=!searchInput.value}
  searchInput.addEventListener('input',sync);
  b.addEventListener('mousedown',function(e){e.preventDefault()});
  b.onclick=function(){searchInput.value='';sync();runSearch();searchInput.focus()};
  sync();
})();
(function(){
  if(!searchInput||$('editorSearchClear'))return;
  var wrap=document.createElement('div');wrap.className='es-wrap';
  searchInput.parentNode.insertBefore(wrap,searchInput);wrap.appendChild(searchInput);
  var b=document.createElement('button');b.id='editorSearchClear';b.type='button';b.className='es-clear';b.setAttribute('aria-label','Clear search');b.hidden=true;b.textContent='\u00d7';
  wrap.appendChild(b);
  function sync(){b.hidden=!searchInput.value}
  searchInput.addEventListener('input',sync);
  b.addEventListener('mousedown',function(e){e.preventDefault()});
  b.onclick=function(){searchInput.value='';sync();runSearch();searchInput.focus()};
  sync();
})();
(function(){
  if(!searchInput||$('editorSearchClear'))return;
  var wrap=document.createElement('div');wrap.className='es-wrap';
  searchInput.parentNode.insertBefore(wrap,searchInput);wrap.appendChild(searchInput);
  var b=document.createElement('button');b.id='editorSearchClear';b.type='button';b.className='es-clear';b.setAttribute('aria-label','Clear search');b.hidden=true;b.textContent='\u00d7';
  wrap.appendChild(b);
  function sync(){b.hidden=!searchInput.value}
  searchInput.addEventListener('input',sync);
  b.addEventListener('mousedown',function(e){e.preventDefault()});
  b.onclick=function(){searchInput.value='';sync();runSearch();searchInput.focus()};
  sync();
})();
(function(){
  var rin=$('editorReplaceInput');if(!rin||$('editorReplaceClear'))return;
  var wrap=document.createElement('div');wrap.className='es-wrap';
  rin.parentNode.insertBefore(wrap,rin);wrap.appendChild(rin);
  var b=document.createElement('button');b.id='editorReplaceClear';b.type='button';b.className='es-clear';b.setAttribute('aria-label','Clear replace');b.hidden=true;b.textContent='\u00d7';
  wrap.appendChild(b);
  function sync(){b.hidden=!rin.value}
  rin.addEventListener('input',sync);
  b.addEventListener('mousedown',function(e){e.preventDefault()});
  b.onclick=function(){rin.value='';sync();rin.focus()};
  sync();
})();
const themeBtn=$('editorThemeBtn'),themeCard=$('editorThemeCard');
function applyEdTheme(t){
  ['lb','pw','sb','sw'].forEach(function(k){shell.classList.remove('th-'+k)});
  if(t)shell.classList.add('th-'+t);
  if(themeCard)themeCard.querySelectorAll('[data-th]').forEach(function(b){b.classList.toggle('on',b.dataset.th===t)});
  try{localStorage.setItem('mb_edtheme',t||'')}catch(e){}
}
if(themeBtn&&themeCard){
  themeBtn.onclick=function(e){e.stopPropagation();themeCard.classList.toggle('open')};
  themeCard.onclick=function(e){e.stopPropagation()};
  themeCard.querySelectorAll('[data-th]').forEach(function(b){b.onclick=function(){applyEdTheme(b.dataset.th);themeCard.classList.remove('open')}});
  document.addEventListener('click',function(){themeCard.classList.remove('open')});
  let savedTheme='';try{savedTheme=localStorage.getItem('mb_edtheme')||''}catch(e){}
  applyEdTheme(savedTheme);
}
updateGutter();refreshFileList();refreshHighlight();
// Remember highlighted text when you leave the Editor tab
var __edSel = { start: 0, end: 0, path: '' };
function saveEdSel() {
  try {
    if (!ta) return;
    __edSel = { start: ta.selectionStart || 0, end: ta.selectionEnd || 0, path: currentPath || '' };
  } catch (e) {}
}
function restoreEdSel() {
  try {
    if (!ta || !__edSel) return;
    if (__edSel.path && currentPath && __edSel.path !== currentPath) return;
    var a = __edSel.start, b = __edSel.end;
    if (a == null || b == null) return;
    if (a > ta.value.length) a = ta.value.length;
    if (b > ta.value.length) b = ta.value.length;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(a, b);
  } catch (e) {}
}
if (ta) {
  ta.addEventListener('blur', saveEdSel);
  ta.addEventListener('select', saveEdSel);
  ta.addEventListener('keyup', saveEdSel);
  ta.addEventListener('mouseup', saveEdSel);
}
if (editorPage) {
  var __edObs = new MutationObserver(function () {
    if (!editorPage.hidden) {
      setTimeout(restoreEdSel, 30);
      setTimeout(restoreEdSel, 120);
    } else {
      saveEdSel();
    }
  });
  __edObs.observe(editorPage, { attributes: true, attributeFilter: ['hidden'] });
}
var __edSel = { start: 0, end: 0, path: '' };
function saveEdSel() {
  try {
    if (!ta) return;
    __edSel = {
      start: ta.selectionStart || 0,
      end: ta.selectionEnd || 0,
      path: currentPath || '',
      scroll: ta.scrollTop || 0
    };
  } catch (e) {}
}
function restoreEdSel() {
  try {
    if (!ta || !__edSel) return;
    if (__edSel.path && currentPath && __edSel.path !== currentPath) return;
    var a = __edSel.start, b = __edSel.end;
    if (a == null || b == null) return;
    if (a > ta.value.length) a = ta.value.length;
    if (b > ta.value.length) b = ta.value.length;
    if (window.__edSkipRestore && Date.now() < window.__edSkipRestore) return;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(a, b);
    if (__edSel.scroll != null) ta.scrollTop = __edSel.scroll;
  } catch (e) {}
}
if (ta) {
  ['blur', 'select', 'keyup', 'mouseup', 'touchend', 'input'].forEach(function (ev) {
    ta.addEventListener(ev, saveEdSel);
  });
}
// Save when you leave the app, restore when you come back
document.addEventListener('visibilitychange', function () {
  if (document.hidden) saveEdSel();
  else setTimeout(restoreEdSel, 80);
});
window.addEventListener('pageshow', function () { setTimeout(restoreEdSel, 80); });
var __edRestoring = false, __edTouching = false;
if (ta) {
  ta.addEventListener('touchstart', function () { __edTouching = true; }, { passive: true });
  ta.addEventListener('touchend', function () { setTimeout(function () { __edTouching = false; }, 350); }, { passive: true });
}
document.addEventListener('selectionchange', function () {
  if (!ta || __edRestoring) return;
  if (editorPage && editorPage.hidden) return;
  if (ta.selectionStart !== ta.selectionEnd) { saveEdSel(); return; }
  if (__edTouching) return;
  if (__edSel && __edSel.start !== __edSel.end && (!__edSel.path || __edSel.path === currentPath)) {
    __edRestoring = true;
    setTimeout(function () { restoreEdSel(); __edRestoring = false; }, 0);
  }
});
if (editorPage) {
  var __edObs = new MutationObserver(function () {
    if (editorPage.hidden) saveEdSel();
    else {
      setTimeout(restoreEdSel, 40);
      setTimeout(restoreEdSel, 150);
    }
  });
  __edObs.observe(editorPage, { attributes: true, attributeFilter: ['hidden'] });
}
window.__edSetCaret = function (pos) {
  __edSel = { start: pos, end: pos, path: currentPath || '', scroll: ta.scrollTop || 0 };
};
window.__edClear = function () {
  try {
    ta.value = ''; currentPath = ''; dirty = false; originalText = '';
    undoStack = []; redoStack = []; fileHistories = {};
    window.__edPid = '';
    try { localStorage.removeItem('mb_file'); } catch (e) {}
    updateGutter(); refreshHighlight(); updateBtns();
    status.textContent = 'No file open';
    refreshFileList();
  } catch (e) {}
};
window.__edOpenFile = function (path) {
  try {
    delete fileHistories[path];
    try { localStorage.removeItem('mb_draft_' + (typeof currentProjectId !== 'undefined' ? currentProjectId : '') + '_' + path); } catch (e) {}
    dirty = false;
    refreshFileList();
    loadFile(path);
    __edSel = { start: 0, end: 0, path: path };
  } catch (e) {}
};
window.__edReloadCurrent = function (paths) {
  try {
    paths = paths || [];
    paths.forEach(function (p) { delete fileHistories[p]; try { localStorage.removeItem('mb_draft_' + (typeof currentProjectId !== 'undefined' ? currentProjectId : '') + '_' + p); } catch (e0) {} });
    var cp = currentPath, hit = paths.indexOf(cp) > -1;
    if (hit) dirty = false;
    refreshFileList();
    if (hit) { loadFile(cp); __edSel = { start: 0, end: 0, path: cp }; }
  } catch (e) {}
};
window.__restoreEditor = function () {
  if (typeof refreshFileList === 'function') refreshFileList();
  setTimeout(restoreEdSel, 50);
  setTimeout(restoreEdSel, 200);
};
})();