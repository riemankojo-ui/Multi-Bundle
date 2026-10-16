const CACHE='multibundle-v2';
const ASSETS=['/','/index.html','/style.css','/app.js','/editor.js','/manifest.json','/logo.png'];

self.addEventListener('install',function(e){
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function(c){return c.addAll(ASSETS).catch(function(){})})
  );
});

self.addEventListener('activate',function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){return k!==CACHE}).map(function(k){return caches.delete(k)}));
    }).then(function(){return self.clients.claim()})
  );
});

self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var url=new URL(e.request.url);
  if(url.origin!==location.origin)return;

  /* Network-first: always try to get fresh files.
     Only fall back to cache if the network fails (offline). */
  e.respondWith(
    fetch(e.request).then(function(res){
      var copy=res.clone();
      caches.open(CACHE).then(function(c){c.put(e.request,copy)});
      return res;
    }).catch(function(){
      return caches.match(e.request).then(function(r){
        return r||caches.match('/index.html');
      });
    })
  );
});