(function(){
var row=document.querySelector('.et-file-row'),sel=document.getElementById('editorFileSelect');
if(!row||!sel||document.getElementById('editorProjectsBtn'))return;
[].slice.call(row.querySelectorAll('button')).forEach(function(x){if(/bundle/i.test(x.id||''))x.remove()});
var st=document.createElement('style');
st.textContent='#editorProjectsBtn{height:42px;min-width:42px;flex-shrink:0}#mbProjSheetBd{display:none;position:fixed;left:0;right:0;top:0;bottom:0;z-index:10000;background:rgba(0,0,0,.55)}#mbProjSheetBd.open{display:flex;align-items:stretch;justify-content:center;padding:0;background:#17181c;top:0!important;bottom:0!important;left:0!important;right:0!important;height:100%!important;z-index:10002!important}#mbProjSheet{height:100%!important}#mbProjSheet{width:100%;max-width:none;height:100%;overflow-y:auto;background:#17181c;border:0;border-radius:0;box-shadow:none;padding:0 12px 16px;box-sizing:border-box}#mbProjSheet button:last-child{border-bottom:0}#mbProjSheet .mbp-grip{position:sticky;top:0;z-index:1;display:flex;justify-content:center;padding:10px 0 8px;background:#17181c;touch-action:none;cursor:grab}#mbProjSheet .mbp-grip i{display:block;width:40px;height:4px;border-radius:2px;background:#3a3b44}#mbProjSheet button{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;padding:10px 14px;font-size:13px;font-weight:600;color:#e6e6e8;background:transparent;border:0;border-bottom:1px solid #25262c;border-radius:0;font-family:inherit}#mbProjSheet button small{font-size:11px;color:#8b8c96;flex-shrink:0}#mbProjSheet .mbp-empty{padding:16px 14px;font-size:13px;color:#8b8c96}body:has(#mbProjSheetBd.open) .app-head,body:has(#mbProjSheetBd.open) .editor-toolbar,body:has(#mbProjSheetBd.open) .bottom{display:none!important}#mbProjSheetBd.open{top:0!important;bottom:0!important;left:0!important;right:0!important;height:100%!important}';
document.head.appendChild(st);
var b=document.createElement('button');
b.type='button';b.id='editorProjectsBtn';b.className='editor-btn small';b.title='Projects';b.setAttribute('aria-label','Projects');
b.innerHTML='<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11C20 3 8 1 3 9"/><path d="M3 3v6h6"/><path d="M3 13C4 21 16 23 21 15"/><path d="M21 21v-6h-6"/></svg>';
sel.insertAdjacentElement('afterend',b);
var bd=document.createElement('div');bd.id='mbProjSheetBd';
bd.addEventListener('click',function(e){if(e.target===bd)close()});
var dx=0,dy=0;
bd.addEventListener('pointerdown',function(e){
  var g=e.target.closest('.mbp-grip');if(!g)return;
  var sx=e.clientX-dx,sy=e.clientY-dy;
  try{g.setPointerCapture(e.pointerId)}catch(e0){}
  function mv(ev){dx=ev.clientX-sx;dy=ev.clientY-sy;sh.style.transform='translate('+dx+'px,'+dy+'px)'}
  function up(){g.removeEventListener('pointermove',mv);g.removeEventListener('pointerup',up);g.removeEventListener('pointercancel',up)}
  g.addEventListener('pointermove',mv);g.addEventListener('pointerup',up);g.addEventListener('pointercancel',up);
});
var sh=document.createElement('div');sh.id='mbProjSheet';
bd.appendChild(sh);document.body.appendChild(bd);
function close(){bd.classList.remove('open')}
async function pick(p,cur){
  close();
  if(p.id===cur)return;
  var ps=document.createElement('div');ps.style.cssText='position:fixed;left:0;right:0;top:0;bottom:0;z-index:10001;background:#0d0e12;display:flex;align-items:center;justify-content:center';ps.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';document.body.appendChild(ps);window.__mbPs=ps;setTimeout(function(){ps.remove()},8000);
  var sv=document.getElementById('editorSaveBtn');
  try{if(sv&&!sv.disabled){sv.click();await new Promise(function(r){setTimeout(r,300)})}}catch(e){}
  try{if(typeof window.saveCurrentProject==='function')await window.saveCurrentProject()}catch(e){}
  if(typeof cardEdit==='function')await cardEdit(p.id);
  if(typeof files!=='undefined'&&!files.some(function(f){return f.text!=null})){
    if(typeof window.__edClear==='function')window.__edClear();
  }else if(typeof window.__edReloadCurrent==='function')window.__edReloadCurrent([]);
  setTimeout(function(){if(window.__mbPs){window.__mbPs.remove();window.__mbPs=null}},350);
}
async function open(){
  var tc0=document.getElementById('editorThemeCard');if(tc0)tc0.classList.remove('open');
  var fs=document.getElementById('mbFileSheetBd');if(fs)fs.classList.remove('open');
  var all=[];try{all=await window.dbGetAll()}catch(e){}
  all.sort(function(x,y){return (y.savedAt||0)-(x.savedAt||0)});
  var cur=(typeof currentProjectId!=='undefined')?currentProjectId:null;
  sh.innerHTML='';
  if(!all.length){sh.innerHTML='<div class="mbp-empty">No projects yet</div>'}
  dx=0;dy=0;sh.style.transform='';
  var gr=document.createElement('div');gr.style.cssText='position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 12px) 0 10px;background:#17181c';gr.innerHTML='<div style="width:40px;height:40px;display:grid;place-items:center;border:1px solid #303139;border-radius:12px;background:#20222a;color:#fff;font-size:22px;line-height:1;cursor:pointer">&#8249;</div><b style="font-size:16px;color:#fff">Projects</b>';gr.firstChild.onclick=function(){var sp2=document.createElement('div');sp2.style.cssText='position:absolute;left:0;right:0;top:0;bottom:0;z-index:3;display:flex;align-items:center;justify-content:center;background:#17181c';sp2.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';bd.appendChild(sp2);setTimeout(function(){close();setTimeout(function(){sp2.remove()},200)},300)};sh.insertBefore(gr,sh.firstChild);
  all.forEach(function(p){
    var r=document.createElement('div');r.style.cssText='display:flex;flex-direction:column;gap:4px;margin:10px 0 0;padding:14px;background:#0f1013;border:1px solid #26272e;border-radius:12px;cursor:pointer';
    var n=document.createElement('span');n.style.cssText='font-size:16px;font-weight:700;color:#fff';n.textContent=p.name||'Untitled';r.appendChild(n);
    var c=document.createElement('small');c.style.cssText='font-size:12px;color:#8f919b';c.textContent=(p.files||[]).length+' files';r.appendChild(c);
    if(p.id===cur){r.setAttribute('data-on','1');r.style.borderColor='#5b8def';var a=document.createElement('small');a.textContent='Already open';a.style.marginLeft='10px';n.appendChild(a)}
    r.onclick=function(){pick(p,cur)};
    sh.appendChild(r);
  });
  var tbr=document.querySelector('.editor-toolbar'),nv=document.querySelector('.bottom');
  var tt=tbr?tbr.getBoundingClientRect().bottom:0;
  var nb=(nv&&nv.offsetHeight)?nv.getBoundingClientRect().top:window.innerHeight;
  bd.style.top='0px';bd.style.bottom='0px';sh.style.visibility='hidden';
  bd.classList.add('open');
  var sp=document.createElement('div');sp.style.cssText='position:absolute;left:0;right:0;top:0;bottom:0;z-index:3;display:flex;align-items:center;justify-content:center;background:#17181c';sp.innerHTML='<div style="width:30px;height:30px;border:3px solid #2a2c34;border-top-color:var(--red);border-radius:50%;animation:mb-spin .8s linear infinite"></div>';bd.appendChild(sp);
  setTimeout(function(){sh.style.visibility='';sp.remove()},450);
  var on=sh.querySelector('[data-on]');
  if(on)sh.scrollTop=on.offsetTop-sh.clientHeight/2+on.offsetHeight/2;
var ta0=document.getElementById('editorTextarea');if(ta0)ta0.blur();window.__edSkipRestore=Date.now()+1500;
}
b.addEventListener('click',function(e){e.stopPropagation();if(bd.classList.contains('open'))close();else open()});
var __st=window.showTab;
if(typeof __st==='function'&&!__st.__mbp){
  window.showTab=function(){
    close();
    var fs=document.getElementById('mbFileSheetBd');if(fs)fs.classList.remove('open');
    return __st.apply(this,arguments);
  };
  window.showTab.__mbp=1;
}
var tbEl=document.querySelector('.editor-toolbar');
if(tbEl)tbEl.addEventListener('click',function(e){if(!b.contains(e.target))close()});
})();