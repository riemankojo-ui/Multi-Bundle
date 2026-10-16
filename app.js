const $=id=>document.getElementById(id);
let files=[], urls=[];
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
 $('fileCount').textContent=files.length+' files';$('previewBtn').disabled=!files.some(f=>['html','htm'].includes(ext(f.path)));$('bundleBtn').disabled=!files.length;
 if(!files.length){$('fileList').className='filelist empty';$('fileList').innerHTML='<b>Your files will appear here</b><small>Look for index.html to start.</small>';return}
 $('fileList').className='filelist';$('fileList').innerHTML=files.slice(0,500).map(f=>`<div class="file-row"><div class="file-icon">${esc(ext(f.path).slice(0,4).toUpperCase()||'FILE')}</div><div class="file-meta"><div class="file-name">${esc(base(f.path))}</div><div class="file-path">${esc(f.path)}</div></div><div class="file-size">${size(f.size||0)}</div></div>`).join('')+(files.length>500?'<div>First 500 files shown.</div>':'')
}
function loadFiles(newFiles,name){resetPreview();files=newFiles.filter(f=>f.path&&!f.path.split('/').some(p=>p.startsWith('.')&&p!=='.well-known')).sort((a,b)=>a.path.localeCompare(b.path));$('projectName').textContent=name||'Imported website';$('status').textContent=`Loaded ${files.length} files. Find index.html, then tap Preview website.`;render()}
$('folderInput').addEventListener('change',async e=>{const list=[...e.target.files];if(!list.length)return;const name=list[0].webkitRelativePath?.split('/')[0]||'Website';const result=await Promise.all(list.map(async f=>({path:(f.webkitRelativePath||f.name).split('/').slice(1).join('/')||f.name,name:f.name,size:f.size,type:f.type,blob:f,text:textExt.has(ext(f.name))?await f.text():null})));loadFiles(result,name);e.target.value=''});
$('zipInput').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;if(!window.JSZip){$('status').textContent='ZIP library did not load. Connect to the internet and reload, or import a folder.';return}$('status').textContent='Reading ZIP…';try{const z=await JSZip.loadAsync(f);let result=await Promise.all(Object.values(z.files).filter(x=>!x.dir).map(async x=>{const blob=await x.async('blob');return {path:x.name.replace(/^\/+/,''),name:base(x.name),size:blob.size,type:blob.type,blob,text:textExt.has(ext(x.name))?await blob.text():null}}));const roots=[...new Set(result.map(x=>x.path.split('/')[0]))];if(roots.length===1&&result.every(x=>x.path.includes('/')))result.forEach(x=>x.path=x.path.slice(x.path.indexOf('/')+1));loadFiles(result,f.name.replace(/\.zip$/i,''))}catch(err){$('status').textContent='Could not read this ZIP. Make sure it is a valid ZIP archive.'}e.target.value=''});
function relative(from,ref){if(!ref||/^(data:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref))return null;let p=ref.split('#')[0].split('?')[0];try{p=decodeURIComponent(p)}catch{}if(p.startsWith('/'))p=p.slice(1);else p=(from.includes('/')?from.slice(0,from.lastIndexOf('/')+1):'')+p;const stack=[];for(const part of p.split('/')){if(part==='..')stack.pop();else if(part&&part!=='.')stack.push(part)}return findFile(stack.join('/'))}
function assetUrl(from,ref){if(!ref||/^(data:|https?:|\/\/|#|mailto:|tel:|javascript:)/i.test(ref.trim()))return ref;const f=relative(from,ref);if(!f)return ref;const blob=f.blob||new Blob([f.text||''],{type:f.type||'text/plain'});return makeUrl(blob)}
function cssRewrite(css,path){return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi,(m,q,u)=>`url("${assetUrl(path,u)}")`)}
async function preview(entry){
 resetPreview();let html=entry.text??await entry.blob.text();const from=entry.path;
 const tags=html.match(/<link\b[^>]*>/gi)||[];
 for(const tag of tags){if(!/stylesheet/i.test(tag))continue;const m=tag.match(/\bhref\s*=\s*(['"])(.*?)\1/i);if(!m)continue;const f=relative(from,m[2]);if(f&&f.text!==null){const u=makeUrl(new Blob([cssRewrite(f.text,f.path)],{type:'text/css'}));html=html.replace(tag,tag.replace(m[0],`href="${u}"`))}else html=html.replace(tag,tag.replace(m[0],`href="${assetUrl(from,m[2])}"`))}
 html=html.replace(/\b(src|poster)\s*=\s*(['"])(.*?)\2/gi,(m,a,q,v)=>`${a}="${assetUrl(from,v)}"`);
 html=html.replace(/\bsrcset\s*=\s*(['"])(.*?)\1/gi,(m,q,v)=>`srcset="${v.split(',').map(part=>{const b=part.trim().split(/\s+/);b[0]=assetUrl(from,b[0]);return b.join(' ')}).join(', ')}"`);
 html=html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi,(m,a,c)=>`<style${a}>${cssRewrite(c,from)}</style>`);
 if(/<head\b[^>]*>/i.test(html))html=html.replace(/<head\b[^>]*>/i,m=>m+'<base target="_self">');else html='<base target="_self">'+html;
 $('frame').hidden=false;$('placeholder').hidden=true;$('frame').srcdoc=html;$('previewPath').textContent=from;$('refreshBtn').disabled=false;$('status').textContent='Previewing '+from+'. Some advanced site features may not work in this prototype.'
}
$('previewBtn').addEventListener('click',async()=>{const f=files.find(x=>base(x.path).toLowerCase()==='index.html')||files.find(x=>['html','htm'].includes(ext(x.path)));if(!f){$('status').textContent='No HTML file found.';return}try{await preview(f)}catch(e){$('status').textContent='Could not preview this page. Try a static HTML site.'}});
$('refreshBtn').addEventListener('click',()=>{const f=files.find(x=>x.path===$('previewPath').textContent);if(f)preview(f)});
$('bundleBtn').addEventListener('click',()=>{const body=files.map(f=>`===== FILE: ${f.path} =====\n${f.text!==null&&f.text!==undefined?f.text:'[Binary file omitted from TXT bundle]'}\n`).join('\n');const blob=new Blob([`MULTI BUNDLE BACKUP\nProject: ${$('projectName').textContent}\nFiles: ${files.length}\n\n${body}`],{type:'text/plain;charset=utf-8'});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=($('projectName').textContent||'website').replace(/[^\w.-]+/g,'_')+'_bundle.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)});
$('clearBtn').addEventListener('click',()=>{files=[];resetPreview();$('projectName').textContent='No project loaded';$('status').textContent='Project cleared. Choose a folder or ZIP to get started.';render()});
$('navBundle').onclick=()=>$('bundleBtn').scrollIntoView({behavior:'smooth',block:'center'});$('navProjects').onclick=()=>$('fileList').scrollIntoView({behavior:'smooth',block:'center'});$('navBackups').onclick=()=>alert('For now, export the TXT bundle and save it safely. Backup history can be added next.');$('navSettings').onclick=()=>alert('Settings can be added next.');
