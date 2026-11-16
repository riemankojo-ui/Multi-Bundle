/* Multi Bundle live server */
var C='mb-live',P='/__live/';
self.addEventListener('install',function(){self.skipWaiting()});
self.addEventListener('activate',function(e){e.waitUntil(self.clients.claim())});
self.addEventListener('fetch',function(e){
  var r=e.request;
  if(r.method!=='GET'&&r.method!=='HEAD')return;
  var u=new URL(r.url);
  if(u.origin!==location.origin)return;
  e.respondWith(serve(r,u));
});
async function find(c,p){
  var list=[p];
  if(/\/$/.test(p))list=[p+'index.html'];
  else if(!/\.[a-z0-9]+$/i.test(p))list=[p,p+'.html',p+'/index.html'];
  for(var i=0;i<list.length;i++){var m=await c.match(list[i]);if(m)return m}
  return null;
}
async function serve(r,u){
  var c=await caches.open(C),p=u.pathname;
  if(p.indexOf(P)!==0)p=P+p.replace(/^\//,'');
  var hit=await find(c,p);
  if(!hit&&r.mode==='navigate'&&!/\.[a-z0-9]+$/i.test(p))hit=await find(c,P+'index.html');
  if(!hit)return new Response('404 Not found: '+p.slice(P.length-1),{status:404,headers:{'Content-Type':'text/plain'}});
  var rg=r.headers.get('range'),m=rg&&/bytes=(\d*)-(\d*)/.exec(rg);
  if(m){
    var b=await hit.blob(),s,en;
    if(m[1]===''&&m[2]!==''){s=Math.max(0,b.size-(+m[2]));en=b.size-1}
    else{s=+m[1]||0;en=m[2]?Math.min(+m[2],b.size-1):b.size-1}
    return new Response(b.slice(s,en+1),{status:206,headers:{'Content-Type':b.type||'application/octet-stream','Content-Range':'bytes '+s+'-'+en+'/'+b.size,'Content-Length':String(en-s+1),'Accept-Ranges':'bytes'}});
  }
  return hit;
}