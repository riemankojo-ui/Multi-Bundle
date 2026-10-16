(function(){
const $=id=>document.getElementById(id);
const ta=$('editorTextarea'),gutter=$('editorGutter'),fileSelect=$('editorFileSelect'),
      status=$('editorStatus'),cursorInfo=$('editorCursor'),
      undoBtn=$('editorUndoBtn'),redoBtn=$('editorRedoBtn'),
      searchBar=$('editorSearchBar'),searchInput=$('editorSearchInput'),
      searchCount=$('editorSearchCount'),
      previewFrame=$('editorPreviewFrame'),shell=$('editorShell'),
      editorPage=$('editorPage');
let currentPath='',dirty=false,undoStack=[],redoStack=[],lastPush=0,
    matches=[],matchIndex=-1;

/* Line numbers */
function updateGutter(){
  const n=ta.value.split('\n').length;let s='';
  for(let i=1;i<=n;i++)s+=i+'\n';
  gutter.textContent=s;gutter.scrollTop=ta.scrollTop;
}
ta.addEventListener('scroll',()=>{gutter.scrollTop=ta.scrollTop});
ta.addEventListener('input',()=>{updateGutter();pushHistory();markDirty();updateCursor()});
ta.addEventListener('click',updateCursor);
ta.addEventListener('keyup',updateCursor);

/* Undo / redo */
function pushHistory(force){
  const now=Date.now();
  if(!force&&now-lastPush<300)return;lastPush=now;
  const v=ta.value;
  if(undoStack.length&&undoStack[undoStack.length-1]===v)return;
  undoStack.push(v);if(undoStack.length>200)undoStack.shift();
  redoStack=[];updateBtns();
}
function updateBtns(){undoBtn.disabled=undoStack.length<2;redoBtn.disabled=!redoStack.length}
undoBtn.onclick=()=>{if(undoStack.length<2)return;redoStack.push(undoStack.pop());ta.value=undoStack[undoStack.length-1];updateGutter();markDirty();updateBtns()};
redoBtn.onclick=()=>{if(!redoStack.length)return;const n=redoStack.pop();undoStack.push(n);ta.value=n;updateGutter();markDirty();updateBtns()};
ta.addEventListener('keydown',e=>{
  if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){e.preventDefault();undoBtn.click()}
  if((e.ctrlKey||e.metaKey)&&(e.key==='y'||(e.key==='z'&&e.shiftKey))){e.preventDefault();redoBtn.click()}
  if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();openSearch()}
  if(e.key==='Tab'){e.preventDefault();const s=ta.selectionStart,en=ta.selectionEnd;
    ta.value=ta.value.slice(0,s)+'  '+ta.value.slice(en);
    ta.selectionStart=ta.selectionEnd=s+2;updateGutter();pushHistory(true);markDirty()}
});

/* Search */
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
function selectMatch(){
  if(matchIndex<0||matchIndex>=matches.length)return;
  const s=matches[matchIndex],en=s+searchInput.value.length;
  ta.focus();ta.setSelectionRange(s,en);
  const line=ta.value.slice(0,s).split('\n').length;
  ta.scrollTop=Math.max(0,(line-4)*20);gutter.scrollTop=ta.scrollTop;
  updateSearchCount();
}
searchInput.addEventListener('input',runSearch);
searchInput.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();e.shiftKey?prevMatch():nextMatch()}
  if(e.key==='Escape')closeSearch();
});
function nextMatch(){if(!matches.length)return;matchIndex=(matchIndex+1)%matches.length;selectMatch()}
function prevMatch(){if(!matches.length)return;matchIndex=(matchIndex-1+matches.length)%matches.length;selectMatch()}
$('editorSearchNext').onclick=nextMatch;
$('editorSearchPrev').onclick=prevMatch;
$('editorSearchClose').onclick=closeSearch;
$('editorSearchBtn').onclick=()=>{searchBar.classList.contains('open')?closeSearch():openSearch()};

/* Cursor */
function updateCursor(){
  const p=ta.selectionStart,b=ta.value.slice(0,p);
  const line=b.split('\n').length,col=p-b.lastIndexOf('\n');
  cursorInfo.textContent=`Ln ${line}, Col ${col}`;
}

/* File list */
function refreshFileList(){
  if(typeof files==='undefined')return;
  const tf=files.filter(f=>f.text!=null);
  const cur=currentPath;fileSelect.innerHTML='';
  if(!tf.length){fileSelect.add(new Option('No project selected',''));return}
  tf.forEach(f=>fileSelect.add(new Option(f.path,f.path)));
  if(cur&&tf.find(f=>f.path===cur))fileSelect.value=cur;
}
function loadFile(path){
  const f=files.find(x=>x.path===path);if(!f||f.text==null)return;
  currentPath=path;ta.value=f.text;dirty=false;
  undoStack=[f.text];redoStack=[];updateBtns();
  updateGutter();updateCursor();
  status.textContent=path;fileSelect.value=path;
  renderPreview();
}
function markDirty(){dirty=true;status.textContent=currentPath+' •'}
function saveFile(){
  if(!currentPath)return;
  const f=files.find(x=>x.path===currentPath);if(!f)return;
  f.text=ta.value;f.blob=null;dirty=false;
  status.textContent=currentPath+' ✓';
  if(typeof render==='function')render();
}
fileSelect.addEventListener('change',e=>{
  if(dirty&&!confirm('Discard unsaved changes?')){fileSelect.value=currentPath;return}
  loadFile(e.target.value);
});
$('editorSaveBtn').onclick=saveFile;
$('editorNewBtn').onclick=()=>{
  const name=prompt('New file path (e.g. pages/about.html):');if(!name)return;
  if(files.find(f=>f.path===name)){alert('File already exists');return}
  files.push({path:name,name:name.split('/').pop(),size:0,type:'text/plain',blob:null,text:''});
  files.sort((a,b)=>a.path.localeCompare(b.path));
  refreshFileList();loadFile(name);
  if(typeof render==='function')render();
};

/* Preview */
function renderPreview(){
  if(!currentPath)return;
  const f=files.find(x=>x.path===currentPath);if(!f)return;
  previewFrame.srcdoc=(typeof htmlRewrite==='function')?htmlRewrite(ta.value,currentPath):ta.value;
}
$('editorPreviewRefresh').onclick=renderPreview;
ta.addEventListener('input',()=>{
  if(/\.html?$/i.test(currentPath)){clearTimeout(window.__pvT);window.__pvT=setTimeout(renderPreview,600)}
});

/* Fullscreen */
$('editorFullBtn').onclick=()=>{
  const on=shell.classList.toggle('fullscreen');
  document.body.classList.toggle('editor-full',on);
  $('editorFullBtn').textContent=on?'⤡':'⛶';
};

/* Refresh list whenever the editor tab opens */
if(editorPage){
  const obs=new MutationObserver(()=>{
    if(!editorPage.hidden){
      refreshFileList();
      if(!currentPath){/* leave empty so user picks */}
    }
  });
  obs.observe(editorPage,{attributes:true,attributeFilter:['hidden']});
}

updateGutter();refreshFileList();
})();