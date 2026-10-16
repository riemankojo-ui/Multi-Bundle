(function(){
const $=id=>document.getElementById(id);
const ta=$('editorTextarea'),gutter=$('editorGutter'),hl=$('editorHighlight'),
      fileSelect=$('editorFileSelect'),status=$('editorStatus'),cursorInfo=$('editorCursor'),
      undoBtn=$('editorUndoBtn'),redoBtn=$('editorRedoBtn'),
      searchBar=$('editorSearchBar'),searchInput=$('editorSearchInput'),
      searchCount=$('editorSearchCount'),
      previewFrame=$('editorPreviewFrame'),shell=$('editorShell'),
      editorPage=$('editorPage');
let currentPath='',dirty=false,undoStack=[],redoStack=[],lastPush=0,
    matches=[],matchIndex=-1;

const toast=window.showToast||function(){};
const promptFn=window.showPrompt||function(){return Promise.resolve(null)};
const confirmFn=window.showConfirm||function(){return Promise.resolve(false)};

/* ===== Syntax highlight ===== */
function escHtml(s){return String(s).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]})}

function highlightJS(code){
  const re=/(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(function|const|let|var|if|else|for|while|return|class|new|this|true|false|null|undefined|async|await|import|export|from|of|in|try|catch|finally|throw|typeof|instanceof|delete|void|yield|switch|case|break|continue|default|do|extends|super|static|get|set)\b|\b(\d+(?:\.\d+)?)\b|\b([A-Za-z_$][\w$]*)(?=\s*\()/g;
  let out='',last=0,m;
  while((m=re.exec(code))!==null){
    out+=escHtml(code.slice(last,m.index));
    const t=m[0];
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
  hl.scrollTop=ta.scrollTop;
  hl.scrollLeft=ta.scrollLeft;
}

/* ===== Line numbers ===== */
function updateGutter(){
  const n=ta.value.split('\n').length;let s='';
  for(let i=1;i<=n;i++)s+=i+'\n';
  gutter.textContent=s;gutter.scrollTop=ta.scrollTop;
}
function syncScroll(){gutter.scrollTop=ta.scrollTop;hl.scrollTop=ta.scrollTop;hl.scrollLeft=ta.scrollLeft}
ta.addEventListener('scroll',syncScroll);
ta.addEventListener('input',function(){updateGutter();refreshHighlight();pushHistory();markDirty();updateCursor()});
ta.addEventListener('click',updateCursor);
ta.addEventListener('keyup',updateCursor);

/* ===== Undo / redo ===== */
function pushHistory(force){
  const now=Date.now();
  if(!force&&now-lastPush<300)return;lastPush=now;
  const v=ta.value;
  if(undoStack.length&&undoStack[undoStack.length-1]===v)return;
  undoStack.push(v);if(undoStack.length>200)undoStack.shift();
  redoStack=[];updateBtns();
}
function updateBtns(){undoBtn.disabled=undoStack.length<2;redoBtn.disabled=!redoStack.length}
undoBtn.onclick=function(){if(undoStack.length<2)return;redoStack.push(undoStack.pop());ta.value=undoStack[undoStack.length-1];updateGutter();refreshHighlight();markDirty();updateBtns()};
redoBtn.onclick=function(){if(!redoStack.length)return;const n=redoStack.pop();undoStack.push(n);ta.value=n;updateGutter();refreshHighlight();markDirty();updateBtns()};
ta.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undoBtn.click()}
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();redoBtn.click()}
  if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();openSearch()}
  if(e.key==='Tab'){e.preventDefault();const s=ta.selectionStart,en=ta.selectionEnd;
    ta.value=ta.value.slice(0,s)+'  '+ta.value.slice(en);
    ta.selectionStart=ta.selectionEnd=s+2;updateGutter();refreshHighlight();pushHistory(true);markDirty()}
});

/* ===== Search ===== */
function openSearch(){searchBar.classList.add('open');searchInput.focus();searchInput.select()}
function closeSearch(){searchBar.classList.remove('open');matches=[];matchIndex=-1;updateSearchCount()}
function runSearch(){
  const q=searchInput.value;matches=[];matchIndex=-1;
  if(q){const t=ta.value.toLowerCase(),n=q.toLowerCase();let i=0;
    while((i=t.indexOf(n,i))!==-1){matches.push(i);i+=n.length}}
  updateSearchCount();
  if(matches.length){matchIndex=0;selectMatch()}
}
function updateSearchCount(){searchCount.textContent=matches.length?(matchIndex+1)+'/'+matches.length:'0/0'}
function scrollToPosition(pos){
  const cs=getComputedStyle(ta);
  const lh=parseFloat(cs.lineHeight)||(parseFloat(cs.fontSize)*1.55)||20;
  const before=ta.value.slice(0,pos);
  const lineNum=before.split('\n').length;
  ta.scrollTop=Math.max(0,(lineNum-3)*lh);
  syncScroll();
}
function selectMatch(){
  if(matchIndex<0||matchIndex>=matches.length)return;
  const s=matches[matchIndex],en=s+searchInput.value.length;
  ta.setSelectionRange(s,en);
  scrollToPosition(s);
  updateSearchCount();
}
searchInput.addEventListener('input',runSearch);
searchInput.addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();e.shiftKey?prevMatch():nextMatch()}
  if(e.key==='Escape')closeSearch();
});
function nextMatch(){if(!matches.length)return;matchIndex=(matchIndex+1)%matches.length;selectMatch()}
function prevMatch(){if(!matches.length)return;matchIndex=(matchIndex-1+matches.length)%matches.length;selectMatch()}
$('editorSearchNext').onclick=nextMatch;
$('editorSearchPrev').onclick=prevMatch;
$('editorSearchClose').onclick=closeSearch;
$('editorSearchBtn').onclick=function(){searchBar.classList.contains('open')?closeSearch():openSearch()};

/* ===== Cursor ===== */
function updateCursor(){
  const p=ta.selectionStart,b=ta.value.slice(0,p);
  const line=b.split('\n').length,col=p-b.lastIndexOf('\n');
  cursorInfo.textContent='Ln '+line+', Col '+col;
}

/* ===== File list ===== */
function refreshFileList(){
  if(typeof files==='undefined')return;
  const tf=files.filter(function(f){return f.text!=null});
  const cur=currentPath;fileSelect.innerHTML='';
  if(!tf.length){fileSelect.add(new Option('No project selected',''));return}
  tf.forEach(function(f){fileSelect.add(new Option(f.path,f.path))});
  if(cur&&tf.find(function(f){return f.path===cur}))fileSelect.value=cur;
}
function loadFile(path){
  const f=files.find(function(x){return x.path===path});if(!f||f.text==null)return;
  currentPath=path;ta.value=f.text;dirty=false;
  undoStack=[f.text];redoStack=[];updateBtns();
  updateGutter();updateCursor();refreshHighlight();
  status.textContent=path;fileSelect.value=path;
  renderPreview();
}
function markDirty(){dirty=true;status.textContent=currentPath+' •'}
async function saveFile(){
  if(!currentPath)return;
  const f=files.find(function(x){return x.path===currentPath});
  if(!f)return;
  f.text=ta.value;f.blob=null;dirty=false;
  status.textContent=currentPath+' ✓';
  if(typeof window.saveCurrentProject==='function'){
    try{
      await window.saveCurrentProject();
      status.textContent=currentPath+' ✓ Saved';
      toast('Saved','success');
      setTimeout(function(){status.textContent=currentPath},1500);
    }catch(e){toast('Save failed','error')}
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
$('editorNewBtn').onclick=async function(){
  const name=await promptFn('New file', '', {message:'Enter a file path, e.g. pages/about.html',icon:'📄'});
  if(!name||!name.trim())return;
  const p=name.trim();
  if(files.find(function(f){return f.path===p})){toast('File already exists','error');return}
  files.push({path:p,name:p.split('/').pop(),size:0,type:'text/plain',blob:null,text:''});
  files.sort(function(a,b){return a.path.localeCompare(b.path)});
  refreshFileList();loadFile(p);
  if(typeof render==='function')render();
  if(typeof window.saveCurrentProject==='function')window.saveCurrentProject();
  toast('Created '+p,'success');
};

/* ===== Preview (no flash) ===== */
function renderPreview(){
  if(!currentPath)return;
  const loader=$('editorPreviewLoader');
  if(loader)loader.classList.add('show');
  previewFrame.onload=function(){
    if(loader)loader.classList.remove('show');
    previewFrame.onload=null;
  };
  previewFrame.srcdoc=(typeof htmlRewrite==='function')?htmlRewrite(ta.value,currentPath):ta.value;
}
$('editorPreviewRefresh').onclick=renderPreview;
$('editorPreviewBtn').onclick=function(){renderPreview();$('editorPreviewPane').classList.add('open')};
$('editorPreviewClose').onclick=function(){$('editorPreviewPane').classList.remove('open')};
ta.addEventListener('input',function(){
  if(/\.html?$/i.test(currentPath)){clearTimeout(window.__pvT);window.__pvT=setTimeout(renderPreview,600)}
});

/* ===== Fullscreen ===== */
$('editorFullBtn').onclick=function(){
  const on=shell.classList.toggle('fullscreen');
  document.body.classList.toggle('editor-full',on);
  $('editorFullBtn').classList.toggle('active',on);
};

if(editorPage){
  const obs=new MutationObserver(function(){if(!editorPage.hidden)refreshFileList()});
  obs.observe(editorPage,{attributes:true,attributeFilter:['hidden']});
}

updateGutter();refreshFileList();refreshHighlight();
})();