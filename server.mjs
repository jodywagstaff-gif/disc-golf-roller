import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const publicFiles=new Set(['index.html','style.css','app.js','model.js','reel-motion.js','release.js','theme.js','score-ui.js','manifest.webmanifest','sw.js','assets/icon.svg','assets/course.svg','assets/press-start-2p.woff2']);
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.woff2':'font/woff2','.webmanifest':'application/manifest+json'};
const server=http.createServer(async(req,res)=>{try{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\//,'')||'index.html';if(!publicFiles.has(name)){res.writeHead(404);return res.end('Not found');}const content=await fs.readFile(path.join(root,name));res.writeHead(200,{'Content-Type':mime[path.extname(name)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'});res.end(content);}catch{res.writeHead(500);res.end('Unavailable');}});
server.listen(Number(process.env.PORT)||4173,'127.0.0.1',()=>console.log('Disc Roller preview: http://127.0.0.1:'+(Number(process.env.PORT)||4173)));
