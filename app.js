const $=id=>document.getElementById(id);
let files=[], urls=[], currentPagePath='';
const textExt=new Set(['html','htm','css','js','mjs','json','txt','md','xml','svg','php','py','sql','yaml','yml','toml','csv','webmanifest','ts','jsx','tsx']);
const imgExt=new Set(['png','jpg','jpeg','gif','webp','avif','bmp','ico']);
const ext=p=>(p.split('.').pop()||'').toLowerCase();
const base=p=>p.split('/').pop();
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const size=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(1)+' MB';
function clearUrls(){urls.forEach(URL.revokeObjectURL);urls=[]}
function resetPreview(){clearUrls();$('frame').hidden=true;$('frame').srcdoc='';$('placeholder').hidden=false;$('previewPath').textContent='Your website will appear here';$('refreshBtn').disabled=true}
function findFile(p){p=p.replace(/^\.\//,'').replace(/^\//,'');return files.find(f=>f.path===p)||files.find(f=>f.path.endsWith('/'+p))}
function makeUrl(blob){const u=URL.createObjectURL(blob);urls.push(u);return u}
function render(){
 const pages=htmlPages();$('fileCount').textContent=files.length+' files';$('bundleBtn').disabled=!files.length;$('projectsPreviewBtn').disabled=!pages.length;$('projectsBundleBtn').disabled=!files.length;$('homeBundleBtn').disabled=!files.length;$('homeOpenPreviewBtn').disabled=!pages.length;$('homeProjectName').textContent=$('projectName').textContent;$('homeFileCount').textContent=files.length+' files';$('homeStatus').textContent=files.length?`${files.length} files loaded. Open Projects to manage files, Preview to test pages, or Bundle to export.`:'Go to Projects to import a website folder or ZIP.';$('bundleProjectName').textContent=$('projectName').textContent;$('bundleFileCount').textContent=files.length+' files';$('bundleStatus').textContent=files.length?'Ready to export '+files.length+' files from this project.':'Import a project first from the Projects tab.';if($('pageSelect')){populatePages();}
 if(!files.length){$('fileList').className='filelist empty';$('fileList').innerHTML='<b>Your files will appear here</b><small>Look for index.html to start.</small>';return}
 $('fileList').className='filelist';$('fileList').innerHTML=files.slice(0,500).map(f=>`<div class="file-row"><div class="file-icon">${esc(ext(f.path).slice(0,4).toUpperCase()||'FILE')}</div><div class="file-meta"><div class="file-name">${esc(base(f.path))}</div><div class="file-path">${esc(f.path)}</div></div><div class="file-size">${size(f.size||0)}</div></div>`).join('')+(files.length>500?'<div>First 500 files shown.</div>':'')
}
function loadFiles(newFiles,name){resetPreview();files=newFiles.filter(f=>f.path&&!f.path.split('/').some(p=>p.startsWith('.')&&p!=='.well-known')).sort((a,b)=>a.path.localeCompare(b.path));$('projectName').textContent=name||'Imported website';$('status').textContent=`Loaded ${files.length} files. Open the Preview tab to choose an HTML page.`;populatePages();render()} 
function htmlPages(){return files.filter(f=>['html','htm'].includes(ext(f.path))).sort((a,b)=>a.path.localeCompare(b.path))}
function populatePages(){const sel=$('pageSelect');if(!sel)return;const pages=htmlPages();sel.innerHTML='';if(!pages.length){sel.add(new Option('No HTML pages found',''));sel.disabled=true;$('openPageBtn').disabled=true;return}pages.forEach(f=>sel.add(new Option(f.path,f.path)));const start=pages.find(f=>f.path.toLowerCase()==='index.html')||pages.find(f=>base(f.path).toLowerCase()==='index.html')||pages[0];sel.value=start.path;sel.disabled=false;$('openPageBtn').disabled=false;currentPagePath=start.path}
$('folderInput').addEventListener('change',async e=>{const list=[...e.target.files];if(!list.length)return;const name=list[0].webkitRelativePath?.split('/')[0]||'Website';const result=await Promise.all(list.map(async f=>({path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name,name:f.name,size:f.size,type:f.type,blob:f,text:textExt.has(ext(f.name))?await f.text():null})));loadFiles(result,name);e.target.value=''});
$('zipInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;if(!window.JSZip){$('status').textContent='ZIP library did not load. Connect to the internet and reload, or import a folder.';return}$('status').textContent='Reading ZIP…';try{const z=await JSZip.loadAsync(f);let result=await Promise.all(Object.values(z.files).filter(x=>!x.dir).map(async x=>{const blob=await x.async('blob');return {path:x.name.replace(/^\/+/,''),name:base(x.name),size:blob.size,type:blob.type,blob,text:textExt.has(ext(x.name))?await blob.text():null}}));const roots=[...new Set(result.map(x=>x.path.split('/')[0]))];if(roots.length===1&&result.every(x=>x.path.includes('/')))result.forEach(x=>x.path=x.path.slice(x.path.indexOf('/')+1));loadFiles(result,f.name.replace(/\.zip$/i,''))}catch(err){$('status').textContent='Could not read this ZIP. Make sure it is a valid ZIP archive.'}e.target.value=''});
function relative(from,ref){if(!ref||/^(data:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref))return null;let p=ref.split('#')[0].split('?')[0];try{p=decodeURIComponent(p)}catch{}if(p.startsWith('/'))p=p.slice(1);else p=(from.includes('/')?from.slice(0,from.lastIndexOf('/')+1):'')+p;const stack=[];for(const part of p.split('/')){if(part==='..')stack.pop();else if(part&&part!=='.')stack.push(part)}return findFile(stack.join('/'))}
function assetUrl(from,ref){if(!ref||/^(data:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref.trim()))return ref;const f=relative(from,ref);if(!f)return ref;const blob=f.blob||new Blob([f.text||''],{type:f.type||'text/plain'});return makeUrl(blob)}
function cssRewrite(css,path){return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(m,q,u)=>`url("${assetUrl(path,u)}")`)}
async function preview(entry){
 resetPreview();currentPagePath=entry.path;if($('pageSelect'))$('pageSelect').value=entry.path;let html=entry.text??await entry.blob.text();const from=entry.path;
 const tags=html.match(/<link\b[^>]*>/gi)||[];
 for(const tag of tags){if(!/stylesheet/i.test(tag))continue;const m=tag.match(/\bhref\s*=\s*(['"])(.*?)\1/i);if(!m)continue;const f=relative(from,m[2]);if(f&&f.text!==null){const u=makeUrl(new Blob([cssRewrite(f.text,f.path)],{type:'text/css'}));html=html.replace(tag,tag.replace(m[0],`href="${u}"`))}else html=html.replace(tag,tag.replace(m[0],`href="${assetUrl(from,m[2])}"`))}
 html=html.replace(/\b(src|poster)\s*=\s*(['"])(.*?)\2/gi,(m,a,q,v)=>`${a}="${assetUrl(from,v)}"`);
 html=html.replace(/\bsrcset\s*=\s*(['"])(.*?)\1/gi,(m,q,v)=>`srcset="${v.split(',').map(part=>{const b=part.trim().split(/\s+/);b[0]=assetUrl(from,b[0]);return b.join(' ')}).join(', ')}"`);
 html=html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,(m,a,c)=>`<style${a}>${cssRewrite(c,from)}</style>`);
 if(/<head\b[^>]*>/i.test(html))html=html.replace(/<head\b[^>]*>/i,m=>m+'<base target="_self">');else html='<base target="_self">'+html;
 $('frame').hidden=false;$('placeholder').hidden=true;$('frame').srcdoc=html;$('previewPath').textContent=from;$('refreshBtn').disabled=false;$('status').textContent='Previewing '+from+'. Some advanced site features may not work in this prototype.';showTab('preview');
 $('frame').onload=()=>{try{$('frame').contentDocument.addEventListener('click',async ev=>{const a=ev.target.closest('a[href]');if(!a)return;const href=a.getAttribute('href');if(!href||/^(https?:|mailto:|tel:|#|javascript:)/i.test(href))return;const target=relative(from,href);if(target&&['html','htm'].includes(ext(target.path))){ev.preventDefault();await preview(target)}})}catch(e){}}
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
