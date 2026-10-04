const CACHE='disc-roller-shell-v5-1';
const SHELL=['./','./index.html','./style.css','./app.js','./model.js','./reel-motion.js','./release.js','./manifest.webmanifest','./assets/icon.svg','./assets/course.svg','./assets/press-start-2p.woff2'];
// Activate the completed shell for the NEXT navigation, even when old tabs are
// open. Never navigate/reload clients: existing JavaScript and scores stay put.
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
// Retain older shell caches for older open clients. Only public assets are here;
// league data lives separately in localStorage and is never cleared by updates.
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;event.respondWith(caches.open(CACHE).then(async cache=>{const cached=await cache.match(event.request);if(cached)return cached;if(event.request.mode==='navigate')return cache.match('./index.html');return fetch(event.request);}));});
