const $=id=>document.getElementById(id);
let files=[], urls=[], currentPagePath='', dataCache=new Map();
const textExt=new Set(['html','htm','css','js','mjs','json','txt','md','xml','svg','php','py','sql','yaml','yml','toml','csv','webmanifest','ts','jsx','tsx']);
const imgExt=new Set(['png','jpg','jpeg','gif','webp','avif','bmp','ico']);
const ext=p=>(p.split('.').pop()||'').toLowerCase();
const base=p=>p.split('/').pop();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
const mimeMap={html:'text/html',htm:'text/html',css:'text/css',js:'text/javascript',mjs:'text/javascript',json:'application/json',webmanifest:'application/manifest+json',txt:'text/plain',md:'text/plain',xml:'application/xml',svg:'image/svg+xml',csv:'text/csv',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',ico:'image/x-icon',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',mp4:'video/mp4',webm:'video/webm',pdf:'application/pdf'};
function fileBlob(f){const t=mimeMap[ext(f.path)]||f.type||'application/octet-stream';const src=f.blob||new Blob([f.text||'']);return src.type===t?src:new Blob([src],{type:t})}
function clearUrls(){urls.forEach(u=>URL.revokeObjectURL(u));urls=[];dataCache.clear()}
function resetPreview(){clearUrls();$('frame').hidden=true;$('frame').srcdoc='';$('placeholder').hidden=false;$('previewPath').textContent='Your website will appear here';$('refreshBtn').disabled=true}
function findFile(p){p=p.replace(/^\.\//,'').replace(/^\//,'');return files.find(f=>f.path===p)||files.find(f=>f.path.endsWith('/'+p))}
function makeUrl(blob){const u=URL.createObjectURL(blob);urls.push(u);return u}
function render(){
 const pages=htmlPages();$('fileCount').textContent=files.length+' files';$('bundleBtn').disabled=!files.length;$('projectsPreviewBtn').disabled=!pages.length;$('projectsBundleBtn').disabled=!files.length;$('homeBundleBtn').disabled=!files.length;$('homeOpenPreviewBtn').disabled=!pages.length;$('homeProjectName').textContent=$('projectName').textContent;$('homeFileCount').textContent=files.length+' files';$('homeStatus').textContent=files.length?`${files.length} files loaded. Open Projects to manage files, Preview to test pages, or Bundle to export.`:'Go to Projects to import a website folder or ZIP.';$('bundleProjectName').textContent=$('projectName').textContent;$('bundleFileCount').textContent=files.length+' files';$('bundleStatus').textContent=files.length?'Ready to export '+files.length+' files from this project.':'Import a project first from the Projects tab.';if($('pageSelect')){populatePages();}
 if(!files.length){$('fileList').className='filelist empty';$('fileList').innerHTML='<b>Your files will appear here</b><small>Look for index.html to start.</small>';return}
 $('fileList').className='filelist';$('fileList').innerHTML=files.slice(0,500).map(f=>`<div class="file-row"><div class="file-icon">${esc(ext(f.path).slice(0,4).toUpperCase()||'FILE')}</div><div class="file-meta"><div class="file-name">${esc(base(f.path))}</div><div class="file-path">${esc(f.path)}</div></div><div class="file-size">${size(f.size||0)}</div></div>`).join('')+(files.length>500?'<div>First 500 files shown.</div>':'')
}
function loadFiles(newFiles,name){resetPreview();currentPagePath='';files=newFiles.filter(f=>f.path&&!f.path.split('/').some(p=>p.startsWith('.')&&p!=='.well-known')).sort((a,b)=>a.path.localeCompare(b.path));$('projectName').textContent=name||'Imported website';$('status').textContent=`Loaded ${files.length} files. Open the Preview tab to choose an HTML page.`;populatePages();render()} 
function htmlPages(){return files.filter(f=>['html','htm'].includes(ext(f.path))).sort((a,b)=>a.path.localeCompare(b.path))}
function populatePages(){const sel=$('pageSelect');if(!sel)return;const pages=htmlPages();sel.innerHTML='';if(!pages.length){sel.add(new Option('No HTML pages found',''));sel.disabled=true;$('openPageBtn').disabled=true;currentPagePath='';return}pages.forEach(f=>sel.add(new Option(f.path,f.path)));const start=pages.find(f=>f.path===currentPagePath)||pages.find(f=>f.path.toLowerCase()==='index.html')||pages.find(f=>base(f.path).toLowerCase()==='index.html')||pages[0];sel.value=start.path;sel.disabled=false;$('openPageBtn').disabled=false;currentPagePath=start.path}
$('folderInput').addEventListener('change',async e=>{const list=[...e.target.files];if(!list.length)return;const name=list[0].webkitRelativePath?.split('/')[0]||'Website';const result=await Promise.all(list.map(async f=>({path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name,name:f.name,size:f.size,type:f.type,blob:f,text:textExt.has(ext(f.name))?await f.text():null})));loadFiles(result,name);e.target.value=''});
$('zipInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;if(!window.JSZip){$('status').textContent='ZIP library did not load. Connect to the internet and reload, or import a folder.';return}$('status').textContent='Reading ZIP…';try{const z=await JSZip.loadAsync(f);let result=await Promise.all(Object.values(z.files).filter(x=>!x.dir).map(async x=>{const blob=await x.async('blob');return {path:x.name.replace(/^\/+/,''),name:base(x.name),size:blob.size,type:blob.type,blob,text:textExt.has(ext(x.name))?await blob.text():null}}));const roots=[...new Set(result.map(x=>x.path.split('/')[0]))];if(roots.length===1&&result.every(x=>x.path.includes('/')))result.forEach(x=>x.path=x.path.slice(x.path.indexOf('/')+1));loadFiles(result,f.name.replace(/\.zip$/i,''))}catch(err){$('status').textContent='Could not read this ZIP. Make sure it is a valid ZIP archive.'}e.target.value=''});
function relative(from,ref){if(!ref||/^(data:|blob:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref))return null;let p=ref.split('#')[0].split('?')[0];try{p=decodeURIComponent(p)}catch{}if(p.startsWith('/'))p=p.slice(1);else p=(from.includes('/')?from.slice(0,from.lastIndexOf('/')+1):'')+p;const stack=[];for(const part of p.split('/')){if(part==='..')stack.pop();else if(part&&part!=='.')stack.push(part)}return findFile(stack.join('/'))}
async function replaceAsync(str,re,fn){const m=[...str.matchAll(re)];const r=await Promise.all(m.map(x=>fn(...x)));let i=0;return str.replace(re,()=>r[i++])}
// Files are inlined as data: URLs because the sandboxed preview frame is not allowed to load blob: URLs
function dataUrl(f){if(dataCache.has(f.path))return dataCache.get(f.path);const blob=fileBlob(f);const p=new Promise(res=>{if(blob.size>3e6){res(makeUrl(blob));return}const r=new FileReader();r.onload=()=>res(r.result);r.onerror=()=>res(makeUrl(blob));r.readAsDataURL(blob)});dataCache.set(f.path,p);return p}
async function assetUrl(from,ref){if(!ref||/^(data:|blob:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref.trim()))return ref;const f=relative(from,ref);if(!f||['html','htm'].includes(ext(f.path)))return ref;return dataUrl(f)}
async function cssRewrite(css,path,depth=0){
 css=await replaceAsync(css,/@import\s+(?:url\(\s*(['"]?)(.*?)\1\s*\)|(['"])(.*?)\3)\s*([^;]*);/gi,async(m,q1,u1,q2,u2,media)=>{const f=depth<5?relative(path,u1||u2):null;if(!f||f.text==null)return m;const inner=await cssRewrite(f.text,f.path,depth+1);return media.trim()?`@media ${media.trim()}{${inner}}`:inner});
 return replaceAsync(css,/url\(\s*(['"]?)(.*?)\1\s*\)/gi,async(m,q,u)=>`url("${await assetUrl(path,u)}")`)
}
// Runs inside the preview frame: lets links between pages and fetch() of local files work
const BRIDGE=`<script>(function(){var P=parent,n=0,w={};function send(m){try{P.postMessage(m,'*')}catch(e){}}
document.addEventListener('click',function(e){if(e.defaultPrevented||e.button||e.metaKey||e.ctrlKey||e.shiftKey)return;var a=e.target&&e.target.closest&&e.target.closest('a[href]');if(!a)return;var h=a.getAttribute('href');if(!h||/^(https?:|\\/\\/|mailto:|tel:|#|javascript:|data:|blob:)/i.test(h))return;e.preventDefault();send({mbNav:h})},true);
window.addEventListener('message',function(e){var d=e.data;if(e.source!==P||!d||!d.mbRes||!w[d.mbRes])return;var c=w[d.mbRes];delete w[d.mbRes];c(d.blob)});
var of=window.fetch;window.fetch=function(u){if(typeof u!=='string'&&!(u instanceof URL))return of.apply(this,arguments);var s=String(u);if(/^([a-z][a-z0-9+.-]*:|\\/\\/)/i.test(s))return of.apply(this,arguments);return new Promise(function(ok){var id=++n;w[id]=function(b){ok(b?new Response(b,{status:200,headers:{'Content-Type':b.type||'application/octet-stream'}}):new Response('Not found',{status:404}))};send({mbFetch:id,url:s})})}})();<\/script>`;
async function preview(entry){
 resetPreview();currentPagePath=entry.path;if($('pageSelect'))$('pageSelect').value=entry.path;let html=entry.text??await entry.blob.text();const from=entry.path;
 const stash=[],deferred=[];const hold=x=>{stash.push(x);return '\u0000MB'+(stash.length-1)+'\u0000'};
 const attr=(tag,n)=>{const m=tag.match(new RegExp('\\b'+n+'\\s*=\\s*([\'"])(.*?)\\1','i'));return m?m[2]:null};
 // 1. local scripts are inlined (defer scripts move to the end of body so they still run after the page is parsed)
 html=await replaceAsync(html,/<script\b([^>]*?)\bsrc\s*=\s*(['"])(.*?)\2([^>]*)>\s*<\/script>/gi,async(m,a1,q,ref,a2)=>{
  const f=/^(data:|blob:|https?:|\/\/)/i.test(ref.trim())?null:relative(from,ref);
  if(!f||f.text==null)return hold(m);
  const at=(a1+' '+a2).replace(/\b(defer|async|integrity|crossorigin|nomodule)\b(\s*=\s*(['"]).*?\3)?/gi,'').replace(/\s+/g,' ').trimEnd();
  const code=f.text.replace(/<\/script/gi,'<\\/script');
  if(/\bdefer\b/i.test(a1+a2)&&!/type\s*=\s*['"]module['"]/i.test(a1+a2)){deferred.push(`<script${at}>${code}</script>`);return ''}
  return hold(`<script${at}>${code}</script>`)});
 html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,m=>hold(m));
 // 2. <style> blocks, then <link> tags (stylesheets become inline <style>)
 html=await replaceAsync(html,/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,async(m,a,c)=>hold(`<style${a}>${await cssRewrite(c,from)}</style>`));
 html=await replaceAsync(html,/<link\b[^>]*>/gi,async tag=>{
  const href=attr(tag,'href');if(href===null)return tag;
  if(/stylesheet/i.test(tag)){const f=/^(data:|blob:|https?:|\/\/)/i.test(href.trim())?null:relative(from,href);if(!f||f.text==null)return tag;const media=attr(tag,'media');return hold(`<style${media?` media="${media}"`:''}>${await cssRewrite(f.text,f.path)}</style>`)}
  const f=relative(from,href);if(f&&imgExt.has(ext(f.path))){const d=await dataUrl(f);return tag.replace(/(\bhref\s*=\s*)(['"])(.*?)\2/i,(mm,pre)=>`${pre}"${d}"`)}
  return tag});
 // 3. src / poster / srcset on images, audio, video, etc.
 html=await replaceAsync(html,/\b(src|poster)\s*=\s*(['"])(.*?)\2/gi,async(m,a,q,v)=>`${a}="${await assetUrl(from,v)}"`);
 html=await replaceAsync(html,/\bsrcset\s*=\s*(['"])(.*?)\1/gi,async(m,q,v)=>`srcset="${(await Promise.all(v.split(',').map(async part=>{const b=part.trim().split(/\s+/);b[0]=await assetUrl(from,b[0]);return b.join(' ')}))).join(', ')}"`);
 html=html.replace(/\u0000MB(\d+)\u0000/g,(m,i)=>stash[i]);
 if(deferred.length){const d=deferred.join('\n');html=/<\/body>/i.test(html)?html.replace(/<\/body>(?![\s\S]*<\/body>)/i,()=>d+'</body>'):html+d}
 if(/<head\b[^>]*>/i.test(html))html=html.replace(/<head\b[^>]*>/i,m=>m+'<base target="_self">'+BRIDGE);else html='<base target="_self">'+BRIDGE+html;
 $('frame').hidden=false;$('placeholder').hidden=true;$('frame').srcdoc=html;$('previewPath').textContent=from;$('refreshBtn').disabled=false;$('status').textContent='Previewing '+from+'. Some advanced site features may not work in this prototype.';showTab('preview');
}
$('projectsPreviewBtn').addEventListener('click',async()=>{const pages=htmlPages();const chosen=pages.find(f=>f.path===$('pageSelect')?.value)||pages.find(x=>base(x.path).toLowerCase()==='index.html')||pages[0];if(!chosen){$('status').textContent='No HTML files found in this project.';return}try{await preview(chosen)}catch(e){$('status').textContent='Could not preview this page. Try a static HTML site.'}});
$('openPageBtn').addEventListener('click',async()=>{const f=files.find(x=>x.path===$('pageSelect').value);if(!f)return;try{await preview(f)}catch(e){$('status').textContent='Could not preview this page.'}});
$('pageSelect').addEventListener('change',()=>{currentPagePath=$('pageSelect').value;});
$('refreshBtn').addEventListener('click',()=>{const f=files.find(x=>x.path===currentPagePath)||files.find(x=>x.path===$('previewPath').textContent);if(f)preview(f)});
$('bundleBtn').addEventListener('click',()=>{const body=files.map(f=>`===== FILE: ${f.path} =====\n${f.text!==null&&f.text!==undefined?f.text:'[Binary file omitted from TXT bundle]'}\n`).join('\n');const blob=new Blob([`MULTI BUNDLE BACKUP\nProject: ${$('projectName').textContent}\nFiles: ${files.length}\n\n${body}`],{type:'text/plain;charset=utf-8'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=($('projectName').textContent||'website').replace(/[^\w.-]+/g,'_')+'_bundle.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)});
$('clearBtn').addEventListener('click',()=>{files=[];resetPreview();$('projectName').textContent='No project loaded';$('status').textContent='Project cleared. Choose a folder or ZIP to get started.';render()});
function showTab(tab){
 document.querySelectorAll('.tab-page').forEach(page=>page.hidden=page.id!==tab+'Page');
 document.querySelectorAll('.bottom span').forEach(el=>el.classList.toggle('selected',el.dataset.tab===tab));
 if(tab==='preview')populatePages();
 window.scrollTo({top:0,behavior:'smooth'});
}
document.querySelectorAll('.bottom span[data-tab]').forEach(el=>el.addEventListener('click',()=>showTab(el.dataset.tab)));
$('navBundle')?.addEventListener('click',()=>showTab('bundle'));
$('homeProjectsBtn').onclick=()=>showTab('projects');
$('homePreviewBtn').onclick=()=>showTab('preview');
$('homeOpenPreviewBtn').onclick=async()=>{const pages=htmlPages();const chosen=pages.find(f=>f.path===currentPagePath)||pages.find(x=>base(x.path).toLowerCase()==='index.html')||pages[0];if(chosen)try{await preview(chosen)}catch(e){showTab('preview')}};
$('homeBundleBtn').onclick=()=>showTab('bundle');
$('projectsPreviewBtn').onclick=()=>showTab('preview');
$('projectsBundleBtn').onclick=()=>showTab('bundle');
$('backupsBundleBtn').onclick=()=>showTab('bundle');
$('settingsHomeBtn').onclick=()=>showTab('home');
$('backHomeBtn').onclick=()=>showTab('home');
$('fullScreenBtn').onclick=async()=>{try{if(!document.fullscreenElement)await $('frame').requestFullscreen();else await document.exitFullscreen()}catch(e){$('frame').scrollIntoView({behavior:'smooth',block:'start'})}};
window.addEventListener('message',async ev=>{
 if(ev.source!==$('frame').contentWindow)return;const d=ev.data||{};
 if(d.mbNav){const t=relative(currentPagePath,d.mbNav);if(t&&['html','htm'].includes(ext(t.path))){try{await preview(t)}catch(e){$('status').textContent='Could not open '+t.path}}else $('status').textContent='Linked page not found in project: '+d.mbNav}
 else if(d.mbFetch){const f=relative(currentPagePath,d.url);ev.source.postMessage({mbRes:d.mbFetch,blob:f?fileBlob(f):null},'*')}
});
