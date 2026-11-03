(function(){
if(window.mbBar)return;
var el=null,w=0,timer=null,fin=null,doneT=null;
function mk(){
  if(el&&el.parentNode)return el;
  el=document.createElement('div');el.id='mbBar';
  el.style.cssText='position:fixed;left:0;top:env(safe-area-inset-top,0px);height:3px;width:0;background:linear-gradient(90deg,#8f919b,#eceef3);box-shadow:0 0 8px rgba(236,238,243,.45);z-index:2147483647;opacity:0;pointer-events:none;transition:width .25s ease,opacity .3s ease';
  (document.body||document.documentElement).appendChild(el);
  return el;
}
function start(from){
  mk();clearTimeout(fin);clearTimeout(doneT);clearInterval(timer);
  var show=el.style.opacity==='1';
  if(!show){el.style.transition='none';el.style.width='0';void el.offsetWidth;el.style.transition='width .25s ease,opacity .3s ease'}
  el.style.opacity='1';
  w=Math.max(show?w:0,from||12);el.style.width=w+'%';
  timer=setInterval(function(){w+=(90-w)*.08;el.style.width=w+'%'},200);
}
function done(){
  if(!el)return;
  clearInterval(timer);clearTimeout(doneT);
  el.style.width='100%';
  fin=setTimeout(function(){el.style.opacity='0';setTimeout(function(){if(el)el.style.width='0';w=0},320)},260);
}
window.mbBar={start:start,done:done};
document.addEventListener('click',function(e){
  var t=e.target&&e.target.closest?e.target.closest('a[href],button,[onclick],[role=button],label,summary'):null;
  if(!t||t.disabled)return;
  var a=t.closest('a[href]');
  var href=a?(a.getAttribute('href')||''):'';
  var nav=a&&a.target!=='_blank'&&!a.hasAttribute('download')&&!/^(#|javascript:|mailto:|tel:)/i.test(href);
  start(15);
  if(nav){try{sessionStorage.setItem('mbNav','1')}catch(x){}}
  else{clearTimeout(doneT);doneT=setTimeout(done,700)}
},true);
window.addEventListener('beforeunload',function(){
  try{sessionStorage.setItem('mbNav','1')}catch(x){}
  clearTimeout(doneT);start(60);
});
window.addEventListener('pageshow',function(){clearTimeout(doneT);done()});
window.addEventListener('load',function(){done()});
try{if(sessionStorage.getItem('mbNav')){sessionStorage.removeItem('mbNav');start(50)}}catch(x){}
})();
