/* Multi Bundle Service Worker — v4 */
const CACHE='multibundle-v4';
const ASSETS=[
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/editor.js',
  '/manifest.json',
  '/logo.png'
];

/* Install: activate immediately, pre-cache shell */
self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return Promise.all(ASSETS.map(function(url){
        return c.add(url).catch(function(){});
      }));
    })
  );
});

/* Activate: delete old caches, take over open pages */
self.addEventListener('activate',function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(
        keys.filter(function(k){return k!==CACHE}).map(function(k){
          return caches.delete(k);
        })
      );
    }).then(function(){return self.clients.claim()})
  );
});

/* Fetch: network-first — always try live files, cache only as offline fallback */
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var url;
  try{url=new URL(e.request.url)}catch(err){return}
  if(url.origin!==location.origin)return;
  if(url.pathname.indexOf('/api/')===0)return;

  e.respondWith(
    fetch(e.request).then(function(res){
      if(res&&res.status===200&&res.type==='basic'){
        var copy=res.clone();
        caches.open(CACHE).then(function(c){c.put(e.request,copy)});
      }
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(r){
        if(r)return r;
        if(e.request.mode==='navigate')return caches.match('/index.html');
        return new Response('', {status:404, statusText:'Offline'});
      });
    })
  );
});

/* Allow page to trigger an immediate update */
self.addEventListener('message',function(e){
  if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting();
});