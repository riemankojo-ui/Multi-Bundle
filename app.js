const $=id=>document.getElementById(id);
let files=[],urls=[],currentPagePath='',urlCache=new Map();

const textExt=new Set(['html','htm','css','js','mjs','json','txt','md','xml','svg','php','py','sql','yaml','yml','toml','csv','webmanifest','ts','jsx','tsx']);
const imgExt=new Set(['png','jpg','jpeg','gif','webp','avif','bmp','ico']);
const ext=p=>(p.split('.').pop()||'').toLowerCase();
const base=p=>p.split('/').pop();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const mimeMap={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',webmanifest:'application/manifest+json',txt:'text/plain',md:'text/plain',xml:'application/xml',svg:'image/svg+xml',csv:'text/csv',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',pdf:'application/pdf'};

function fileBlob(f){const t=mimeMap[ext(f.path)]||f.type||'application/octet-stream';const src=f.blob||new Blob([f.text||'']);return src.type===t?src:new Blob([src],{type:t})}
function clearUrls(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[];urlCache.clear()}
function resetPreview(){clearUrls();$('frame').hidden=true;$('frame').srcdoc='';$('placeholder').hidden=false;$('previewPath').textContent='Your website will appear here';$('refreshBtn').disabled=true}
function findFile(p){p=p.replace(/^\.\//,'').replace(/^\//,'');return files.find(f=>f.path===p)||files.find(f=>f.path.endsWith('/'+p))}
function makeUrl(blob){const u=URL.createObjectURL(blob);urls.push(u);return u}

function render(){
  const pages=htmlPages();
  $('fileCount').textContent=files.length+' files';
  $('bundleBtn').disabled=!files.length;
  $('projectsPreviewBtn').disabled=!pages.length;
  $('projectsBundleBtn').disabled=!files.length;
  $('homeBundleBtn').disabled=!files.length;
  $('homeOpenPreviewBtn').disabled=!pages.length;
  $('homeProjectName').textContent=$('projectName').textContent;
  $('homeFileCount').textContent=files.length+' files';
  $('homeStatus').textContent=files.length?`${files.length} files loaded. Open Projects to manage files, Preview to test pages, or Bundle to export.`:'Go to Projects to import a website folder or ZIP.';
  $('bundleProjectName').textContent=$('projectName').textContent;
  $('bundleFileCount').textContent=files.length+' files';
  $('bundleStatus').textContent=files.length?'Ready to export '+files.length+' files from this project.':'Import a project first from the Projects tab.';
  populatePages();
  if(!files.length){
    $('fileList').className='filelist empty';
    $('fileList').innerHTML='<b>Your files will appear here</b><small>Look for index.html to start.</small>';
    return;
  }
  $('fileList').className='filelist';
  $('fileList').innerHTML=files.slice(0,500).map(f=>`<div class="file-row"><div class="file-icon">${esc(ext(f.path).slice(0,4).toUpperCase()||'FILE')}</div><div class="file-meta"><div class="file-name">${esc(base(f.path))}</div><div class="file-path">${esc(f.path)}</div></div><div class="file-size">${size(f.size||0)}</div></div>`).join('')+(files.length>500?'<div>First 500 files shown.</div>':'');
}

function loadFiles(newFiles,name){
  resetPreview();
  currentPagePath='';
  files=newFiles.filter(f=>f.path&&!f.path.split('/').some(p=>p.startsWith('.')&&p!=='.well-known')).sort((a,b)=>a.path.localeCompare(b.path));
  $('projectName').textContent=name||'Imported website';
  $('status').textContent=`Loaded ${files.length} files. Open the Preview tab to choose an HTML page.`;
  populatePages();
  render();
}

function htmlPages(){return files.filter(f=>['html','htm'].includes(ext(f.path))).sort((a,b)=>a.path.localeCompare(b.path))}

function populatePages(){
  const sel=$('pageSelect');
  if(!sel)return;
  const pages=htmlPages();
  sel.innerHTML='';
  if(!pages.length){
    sel.add(new Option('No HTML pages found',''));
    sel.disabled=true;
    $('openPageBtn').disabled=true;
    currentPagePath='';
    return;
  }
  pages.forEach(f=>sel.add(new Option(f.path,f.path)));
  const start=pages.find(f=>f.path===currentPagePath)||pages.find(f=>f.path.toLowerCase()==='index.html')||pages.find(f=>base(f.path).toLowerCase()==='index.html')||pages[0];
  sel.value=start.path;
  sel.disabled=false;
  $('openPageBtn').disabled=false;
  currentPagePath=start.path;
}

function relative(from,ref){
  if(!ref||/^(data:|blob:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref))return null;
  let p=ref.split('#')[0].split('?')[0];
  try{p=decodeURIComponent(p)}catch{}
  if(p.startsWith('/'))p=p.slice(1);
  else p=(from.includes('/')?from.slice(0,from.lastIndexOf('/')+1):'')+p;
  const stack=[];
  for(const part of p.split('/')){
    if(part==='..')stack.pop();
    else if(part&&part!=='.')stack.push(part);
  }
  return findFile(stack.join('/'));
}

function assetUrl(from,ref){
  if(!ref||/^(data:|blob:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref.trim()))return ref;
  const f=relative(from,ref);
  if(!f)return ref;
  if(urlCache.has(f.path))return urlCache.get(f.path);
  const u=makeUrl(fileBlob(f));
  urlCache.set(f.path,u);
  return u;
}

function cssRewrite(css,path,depth=0){
  css=css.replace(/@import\s+(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)\s*([^;]*);/gi,(m,q1,u1,q2,u2,media)=>{
    const f=depth<5?relative(path,u1||u2):null;
    if(!f||f.text==null)return m;
    const inner=cssRewrite(f.text,f.path,depth+1);
    return media.trim()?`@media ${media.trim()}{${inner}}`:inner;
  });
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(m,q,u)=>`url("${assetUrl(path,u)}")`);
}

function htmlRewrite(html,path){
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('link[href]').forEach(el=>{
    const rel=(el.getAttribute('rel')||'').toLowerCase();
    if(!rel.includes('stylesheet'))return;
    const href=el.getAttribute('href');
    const f=relative(path,href);
    if(f&&f.text!=null){
      const style=doc.createElement('style');
      style.textContent=cssRewrite(f.text,f.path);
      el.replaceWith(style);
    }else{
      el.setAttribute('href',assetUrl(path,href));
    }
  });
  doc.querySelectorAll('script[src]').forEach(el=>{
    const src=el.getAttribute('src');
    const f=relative(path,src);
    if(f&&f.text!=null){
      const s=doc.createElement('script');
      const t=el.getAttribute('type');
      if(t)s.setAttribute('type',t);
      s.textContent=f.text;
      el.replaceWith(s);
    }else{
      el.setAttribute('src',assetUrl(path,src));
    }
  });
  doc.querySelectorAll('style').forEach(el=>{
    if(el.textContent)el.textContent=cssRewrite(el.textContent,path);
  });
  doc.querySelectorAll('[style]').forEach(el=>{
    const s=el.getAttribute('style');
    if(s&&s.includes('url('))el.setAttribute('style',s.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(m,q,u)=>`url("${assetUrl(path,u)}")`));
  });
  const attrMap={img:['src','srcset'],source:['src','srcset'],video:['src','poster'],audio:['src'],track:['src'],embed:['src'],object:['data']};
  for(const [tag,attrs] of Object.entries(attrMap)){
    doc.querySelectorAll(tag).forEach(el=>{
      attrs.forEach(a=>{
        const v=el.getAttribute(a);
        if(!v)return;
        if(a==='srcset'){
          el.setAttribute(a,v.split(',').map(part=>{
            const m=part.trim().match(/^(\S+)(\s+.+)?$/);
            return m?assetUrl(path,m[1])+(m[2]||''):part;
          }).join(', '));
        }else{
          el.setAttribute(a,assetUrl(path,v));
        }
      });
    });
  }
  return '<!doctype html>'+doc.documentElement.outerHTML;
}

function openPage(path){
  resetPreview();
  const f=findFile(path);
  if(!f){$('previewPath').textContent='File not found';return}
  currentPagePath=f.path;
  if($('pageSelect'))$('pageSelect').value=f.path;
  $('previewPath').textContent=f.path;
  if(f.text==null){$('placeholder').hidden=false;return}
  $('frame').srcdoc=htmlRewrite(f.text,f.path);
  $('frame').hidden=false;
  $('placeholder').hidden=true;
  $('refreshBtn').disabled=false;
}

function exportBundle(){
  if(!files.length)return;
  const name=$('projectName').textContent||'bundle';
  const textFiles=files.filter(f=>f.text!=null);
  const binFiles=files.filter(f=>f.text==null);
  let out=`Multi Bundle Export\nProject: ${name}\nFiles: ${files.length}\nExported: ${new Date().toISOString()}\n${'='.repeat(60)}\n\n`;
  textFiles.forEach(f=>{out+=`\n${'='.repeat(60)}\nFILE: ${f.path}\n${'='.repeat(60)}\n\n${f.text}\n`});
  if(binFiles.length){
    out+=`\n${'='.repeat(60)}\nBINARY / NON-TEXT FILES (not embedded)\n${'='.repeat(60)}\n\n`;
    binFiles.forEach(f=>{out+=`- ${f.path} (${size(f.size||0)})\n`});
  }
  const blob=new Blob([out],{type:'text/plain'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name.replace(/[^\w\-]+/g,'_')+'.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}

function showTab(name){
['home','projects','bundle','preview','editor','backups'].forEach(...)
    const el=$(p+'Page');
    if(el)el.hidden=(p!==name);
  });
  document.querySelectorAll('.bottom span').forEach(s=>{
    s.classList.toggle('selected',s.dataset.tab===name);
  });
}

$('folderInput').addEventListener('change',async e=>{
  const list=[...e.target.files];
  if(!list.length)return;
  const name=list[0].webkitRelativePath?.split('/')[0]||'Website';
  const result=await Promise.all(list.map(async f=>({
    path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name,
    name:f.name,size:f.size,type:f.type,blob:f,
    text:textExt.has(ext(f.name))?await f.text():null
  })));
  loadFiles(result,name);
  e.target.value='';
});

$('zipInput').addEventListener('change',async e=>{
  const f=e.target.files[0];
  if(!f)return;
  if(!window.JSZip){$('status').textContent='ZIP library did not load. Connect to the internet and reload, or import a folder.';return}
  $('status').textContent='Reading ZIP…';
  try{
    const z=await JSZip.loadAsync(f);
    let result=await Promise.all(Object.values(z.files).filter(x=>!x.dir).map(async x=>{
      const blob=await x.async('blob');
      return {path:x.name.replace(/^\/+/,''),name:base(x.name),size:blob.size,type:blob.type,blob,text:textExt.has(ext(x.name))?await blob.text():null};
    }));
    const roots=[...new Set(result.map(x=>x.path.split('/')[0]))];
    if(roots.length===1&&result.every(x=>x.path.includes('/')))result.forEach(x=>x.path=x.path.slice(x.path.indexOf('/')+1));
    loadFiles(result,f.name.replace(/\.zip$/i,''));
  }catch(err){
    $('status').textContent='Could not read this ZIP. Make sure it is a valid ZIP archive.';
  }
  e.target.value='';
});

$('homeProjectsBtn').onclick=()=>showTab('projects');
$('homePreviewBtn').onclick=()=>showTab('preview');
$('homeBundleBtn').onclick=()=>{exportBundle();};
$('homeOpenPreviewBtn').onclick=()=>{showTab('preview');if(currentPagePath)openPage(currentPagePath);};
$('projectsPreviewBtn').onclick=()=>{showTab('preview');if(currentPagePath)openPage(currentPagePath);};
$('projectsBundleBtn').onclick=()=>showTab('bundle');
$('bundleBtn').onclick=exportBundle;
$('backupsBundleBtn').onclick=()=>showTab('bundle');$('backHomeBtn').onclick=()=>showTab('home');
$('openPageBtn').onclick=()=>{if($('pageSelect').value)openPage($('pageSelect').value);};
$('pageSelect').onchange=e=>{currentPagePath=e.target.value;};
$('refreshBtn').onclick=()=>{if(currentPagePath)openPage(currentPagePath);};
$('fullScreenBtn').onclick=()=>{
  const f=$('frame');
  if(f.requestFullscreen)f.requestFullscreen();
  else if(f.webkitRequestFullscreen)f.webkitRequestFullscreen();
};
$('clearBtn').onclick=()=>{
  if(files.length&&!confirm('Clear the current project and start over?'))return;
  resetPreview();
  files=[];urls=[];currentPagePath='';
  $('projectName').textContent='No project loaded';
  $('status').textContent='Choose a folder or ZIP to get started.';
  render();
  showTab('home');
};

document.querySelectorAll('.bottom span').forEach(s=>{s.onclick=()=>showTab(s.dataset.tab)});

render();