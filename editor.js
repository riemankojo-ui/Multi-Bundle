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
window.__addChoice=function(){return new Promise(function(res){
  var b=document.createElement('div');
  b.style.cssText='position:fixed;inset:0;z-index:9500;background:rgba(0,0,0,.4)';
  var c=document.createElement('div');
  c.style.cssText='position:fixed;left:12px;top:120px;width:auto;min-width:160px;max-width:200px;background:#1c1d22;border:1px solid #2e2f36;border-radius:16px;padding:4px 4px 6px;box-sizing:border-box;font-family:system-ui,sans-serif;box-shadow:0 14px 40px rgba(0,0,0,.5);touch-action:none;user-select:none;-webkit-user-select:none';
  var row='display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;margin:0;border:0;border-radius:11px;background:transparent;color:#f0f0f2;font-size:14px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left;white-space:nowrap';
  c.innerHTML=
    '<div id="addDragHandle" style="padding:8px 0 4px;cursor:grab;text-align:center">'+
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
  c.addEventListener('touchstart',start,{passive:false});
  c.addEventListener('mousedown',start);
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
    refreshFileList();if(typeof render==='function')render();
    if(typeof window.saveCurrentProject==='function')await window.saveCurrentProject();
    try{var all=await dbGetAll();var p=all.find(function(x){return x.id===currentProjectId});var lg=detectProjectLogo(files);if(p&&lg&&lg!==p.logo){p.logo=lg;await dbSetAll(all);if(typeof renderProjectCards==='function')renderProjectCards()}}catch(e0){}
    if(typeof window.logHistory==='function')window.logHistory({type:'new',path:list[0].name,note:'Imported '+added+' file'+(added===1?'':'s')+' from phone'});
    toast('Imported '+added+' file'+(added===1?'':'s'),'success');
  };
  inp.click();
};
const confirmFn=window.showConfirm||function(){return Promise.resolve(false)};

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
function refreshHighlight(){
  if(!hl)return;
  const v=ta.value;
  hl.innerHTML=highlightAll(v)+(v.endsWith('\n')?' ':'');
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
  undoStack.push(v);if(undoStack.length>200)undoStack.shift();
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
  ta.value=ta.value.slice(0,s)+ta.value.slice(e);
  edited();runSearch();
  const k=matches.findIndex(function(p){return p>=s});
  if(matches.length){matchIndex=k<0?0:k;selectMatch()}
  toast('Cut '+piece.length+' characters','success');
}
if($('editorCutBtn'))$('editorCutBtn').onclick=cutMatch;
if($('editorReplaceOne'))$('editorReplaceOne').onclick=replaceOne;
if($('editorReplaceAll'))$('editorReplaceAll').onclick=replaceAll;
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

function updateCursor(){
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
    toast('No changes to save');
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
  if(!currentPath)return;
  const loader=$('editorPreviewLoader');
  if(loader)loader.classList.add('show');
  previewFrame.onload=function(){if(loader)loader.classList.remove('show');previewFrame.onload=null};clearTimeout(window.__pvLT);window.__pvLT=setTimeout(function(){if(loader)loader.classList.remove('show')},2500);
  previewFrame.srcdoc=(typeof htmlRewrite==='function')?htmlRewrite(ta.value,currentPath):ta.value;
}
$('editorPreviewRefresh').onclick=renderPreview;
$('editorPreviewBtn').onclick=function(){renderPreview();$('editorPreviewPane').classList.add('open')};
$('editorPreviewClose').onclick=function(){$('editorPreviewPane').classList.remove('open')};
ta.addEventListener('input',function(){
  if(/\.html?$/i.test(currentPath)){
    clearTimeout(window.__pvT);
    // Wait 1.5 seconds after you stop typing to refresh the preview
    window.__pvT=setTimeout(function(){
       // Only refresh if the editor is actually visible to save battery
       if (!$('editorPage').hidden) renderPreview();
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
window.__restoreEditor = function() {
  if (typeof refreshFileList === 'function') refreshFileList();
};
})();