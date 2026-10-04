const CACHE='disc-roller-shell-v3-1';
const SHELL=['./','./index.html','./style.css','./app.js','./model.js','./manifest.webmanifest','./assets/icon.svg','./assets/course.svg','./assets/press-start-2p.woff2'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL))));
// Do not force an update into an ongoing round. New versions activate after all
// older app tabs close. A cache contains only the public app, never player data.
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('disc-roller-shell-')&&key!==CACHE).map(key=>caches.delete(key)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(event.request);if(cached)return cached;if(event.request.mode==='navigate')return cache.match('./index.html');return fetch(event.request);}));});
