import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const versions={old:'c764a9cc34d599d785bd013f36b649fd5ed454d4',slot:'649e4a51d5e5d2fc99b316982d0749f08944fb43'};
const fixtures={};
for(const [version,sha] of Object.entries(versions))for(const file of ['index.html','app.js','style.css','sw.js','model.js']){
 try{fixtures[version+'/'+file]=await fs.readFile('review/upgrade-fixtures/'+version+'-'+file);}
 catch{const r=await fetch(`https://raw.githubusercontent.com/jodywagstaff-gif/disc-golf-roller/${sha}/${file}`);assert.ok(r.ok);fixtures[version+'/'+file]=Buffer.from(await r.arrayBuffer());}
}
let phase='old';
const mime={html:'text/html',js:'text/javascript',css:'text/css',svg:'image/svg+xml',webmanifest:'application/manifest+json',woff2:'font/woff2'};
const server=http.createServer(async(req,res)=>{
 try{
  const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
  if(file.includes('..'))throw Error('Invalid path');
  let body;
  if(file==='version.json')body=JSON.stringify({commit:versions[phase]||phase});
  else if(file==='release.js')body='export const BUILD_ID='+JSON.stringify(phase)+';';
  else body=fixtures[phase+'/'+file]||await fs.readFile(file);
  if(file==='sw.js'&&phase==='next')body=body.toString().replace('v7-1','v7-2');
  res.writeHead(200,{'Content-Type':mime[file.split('.').pop()]||'application/json','Cache-Control':'no-store'});res.end(body);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const context=await browser.newContext();const report={checks:[],errors:[]};
await context.addInitScript(()=>{window.updateFetchLog=[];const original=window.fetch;window.fetch=async(...args)=>{const response=await original(...args);if(/version.json|release.js/.test(String(args[0])))response.clone().text().then(body=>window.updateFetchLog.push({url:String(args[0]),body}));return response;};});
const pendingRequests=new Set();
context.on('page',p=>{p.on('pageerror',e=>report.errors.push(e.message));p.on('request',r=>pendingRequests.add(r.url()));p.on('requestfinished',r=>pendingRequests.delete(r.url()));p.on('requestfailed',r=>pendingRequests.delete(r.url()));});
const snapshot=p=>p.evaluate(()=>localStorage.getItem('disc-roller.league.v1'));
const update=p=>p.evaluate(async()=>{await (await navigator.serviceWorker.getRegistration()).update();});
try{
 const p=await context.newPage();await p.goto(base+'/#play');
 await p.evaluate(()=>navigator.serviceWorker.ready);await p.reload();
 await p.evaluate(async()=>{const m=await import('./model.js');const repo=new m.LocalRepository(localStorage);let s=repo.load()||m.freshState();for(const [type,payload] of [['player.add',{name:'Update Test'}],['score.set',null]]){const data=payload||{playerId:s.players[0].id,holeId:s.activeHoleId,strokes:4};const n=m.applyCommand(s,type,data);repo.save(n,s.revision);s=n;}});await p.reload();
 const old=await context.newPage();await old.goto(base+'/#play');await old.locator('#mainAction').click();await old.waitForFunction(()=>document.querySelector('#actionLabel').textContent==='STOP');
 const saved=await snapshot(old);
 phase='slot';await update(p);await p.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);
 await p.reload();assert.equal(await p.locator('#reelWindow').count(),0);assert.equal(await snapshot(p),saved);
 report.checks.push('Reproduced c764 -> 649 waiting worker: two old tabs keep serving old UI after reload');
 phase='fixed';await update(p);await p.waitForFunction(async()=>{const r=await navigator.serviceWorker.getRegistration();return !r.waiting&&!r.installing&&r.active?.state==='activated'&&(await caches.keys()).includes('disc-roller-shell-v7-1');});
 // Old workers fetch unknown release.js from the network, so only a cached
 // navigation document proves that this client has switched controllers.
 await p.waitForFunction(async()=>(await (await fetch('./index.html')).text()).includes('id="reelWindow"'));
 await p.waitForFunction(async()=>(await (await fetch('./release.js')).text()).includes('fixed'));
 assert.equal(await old.locator('#reelWindow').count(),0);assert.equal(await old.locator('#actionLabel').innerText(),'STOP');assert.equal(await snapshot(old),saved);
 await p.reload();assert.equal(await p.locator('#reelWindow').count(),1);assert.equal(await snapshot(p),saved);
 assert.equal(await old.locator('#actionLabel').innerText(),'STOP');
 report.checks.push('New worker activates with old tabs open; no forced navigation or interrupted old spin; reload gets scrolling UI; scores and draft byte-identical');
 await old.close();await p.locator('#openHelp').click();
 phase='next';await p.locator('#checkUpdate').click();
 await p.waitForFunction(()=>!document.querySelector('#applyUpdate').hidden);
 await p.waitForFunction(async()=>(await (await fetch('./release.js')).text()).includes('next'));
 await p.locator('#checkUpdate').click();assert.ok(await p.locator('#applyUpdate').isDisabled());assert.equal(await snapshot(p),saved);
 report.checks.push('Update detected in existing app; reload disabled while saved challenge is unfinished');
 await p.keyboard.press('Escape');for(let i=0;i<3;i++){const previous=await p.evaluate(()=>JSON.parse(localStorage.getItem('disc-roller.league.v1')).draft.stage);await p.locator('#mainAction').click();await p.waitForFunction(previous=>JSON.parse(localStorage.getItem('disc-roller.league.v1')).draft.stage!==previous,previous,{timeout:10000});}assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('disc-roller.league.v1')).draft.stage),'complete');
 const completed=await snapshot(p);await p.locator('#openHelp').click();await p.waitForFunction(()=>!document.querySelector('#applyUpdate').disabled,null,{timeout:12000}).catch(async e=>{console.log(await p.evaluate(()=>({status:document.querySelector('#updateStatus').textContent,action:document.querySelector('#actionLabel').textContent,checkDisabled:document.querySelector('#checkUpdate').disabled,saved:JSON.parse(localStorage.getItem('disc-roller.league.v1')).draft})));throw e;});
 await Promise.all([p.waitForEvent('load'),p.locator('#applyUpdate').click()]);
 assert.equal(await snapshot(p),completed);await p.waitForFunction(()=>document.querySelector('#updateStatus').textContent.includes('latest version (next)'));
 report.checks.push('Explicit reload applies new build and preserves full names, strokes, completed challenge and command history');
 await context.setOffline(true);await p.locator('#checkUpdate').click();await p.waitForFunction(()=>document.querySelector('#updateStatus').textContent.includes('Could not check'));
 await p.reload();assert.equal(await snapshot(p),completed);assert.equal(await p.locator('#reelWindow').count(),1);
 report.checks.push('Offline update check fails safely; offline reload and saved scores still work');
 assert.deepEqual(report.errors,[]);report.passed=true;
}catch(error){report.passed=false;report.failure=error.stack;report.pending=[...pendingRequests];report.pages=await Promise.all(context.pages().map(p=>Promise.race([p.evaluate(()=>({url:location.href,ready:document.readyState,body:document.body.innerText.slice(0,800),fetches:window.updateFetchLog})),new Promise(resolve=>setTimeout(()=>resolve('Unresponsive'),2000))])));throw error;}
finally{await fs.mkdir('review',{recursive:true});await fs.writeFile('review/update-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await context.close();await browser.close();server.close();}
