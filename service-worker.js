const CACHE='clinical-spa-secure-v10';
const CORE=['/','/index.html','/client.html','/assets/style.css','/assets/admin.js','/assets/clients.js','/assets/finance.js','/assets/cosmetics.js','/assets/client-details.js','/assets/supabase-client.js','/assets/logo.svg','/assets/botanical.svg','/manifest.webmanifest','/assets/icons/icon-v3-192.png','/assets/icons/icon-v3-512.png','/assets/icons/maskable-v3-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request,{ignoreSearch:true}).then(hit=>hit||(event.request.mode==='navigate'?caches.match('/index.html'):Response.error()))));
});
