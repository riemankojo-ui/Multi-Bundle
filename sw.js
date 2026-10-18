/* Multi Bundle Service Worker — v8 */
const CACHE='multibundle-v102';
const ASSETS=['/','/index.html','/style.css','/app.js','/editor.js','/settings.js','/publish.js','/sync.js','/backups.js','/edtools.js','/manifest.json','/logo.png'];

self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(function(c){return Promise.all(ASSETS.map(function(url){return c.add(url).catch(function(){})}))}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(keys){return Promise.all(keys.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}))}).then(function(){return self.clients.claim()}));
});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var url;try{url=new URL(e.request.url)}catch(err){return}
  if(url.origin!==location.origin)return;
  if(url.pathname.indexOf('/api/')===0)return;
  e.respondWith(fetch(e.request).then(function(res){
    if(res&&res.status===200&&res.type==='basic'){var copy=res.clone();caches.open(CACHE).then(function(c){c.put(e.request,copy)})}
    return res;
  }).catch(function(){
    return caches.match(e.request).then(function(r){return r||(e.request.mode==='navigate'?caches.match('/index.html'):new Response('',{status:404,statusText:'Offline'}))});
  }));
});
self.addEventListener('message',function(e){if(e.data&&e.data.type==='SKIP_WAITING')self.skipWaiting()});