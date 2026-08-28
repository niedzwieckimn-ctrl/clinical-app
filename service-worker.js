const CACHE='clinical-spa-secure-v2';
const CORE=['/admin/','/admin/index.html','/admin/client.html','/admin/assets/style.css','/admin/assets/admin.js','/admin/assets/clients.js','/admin/assets/finance.js','/admin/assets/cosmetics.js','/admin/assets/client-details.js','/admin/assets/supabase-client.js','/admin/assets/logo.svg','/admin/assets/botanical.svg','/admin/manifest.webmanifest','/admin/assets/icons/icon-v3-192.png','/admin/assets/icons/icon-v3-512.png','/admin/assets/icons/maskable-v3-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==location.origin)return;
  event.respondWith(fetch(event.request).then(response=>{const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));return response}).catch(()=>caches.match(event.request).then(hit=>hit||(event.request.mode==='navigate'?caches.match('/admin/index.html'):Response.error()))));
});
