import {createRequire} from 'node:module';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');const base=process.env.TEST_URL||'http://127.0.0.1:4175';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});const c=await browser.newContext({viewport:{width:320,height:568},isMobile:true,hasTouch:true,colorScheme:'dark'});const p=await c.newPage();const report={base,checks:[],contrast:[],errors:[]};p.on('pageerror',e=>report.errors.push(e.message));
const state=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('disc-roller.league.v1')));
try{
 await p.goto(base+'/#play');assert.equal(await p.locator('html').getAttribute('data-theme'),'night');
 await p.evaluate(async()=>{const m=await import('./model.js');let s=m.freshState();for(let i=0;i<24;i++)s=m.applyCommand(s,'player.add',{name:i===0?'Alex with a long player name':'Player '+(i+1)});s=m.applyCommand(s,'round.start',{holeCount:18});localStorage.setItem(m.STORAGE_KEY,JSON.stringify(s));});await p.reload();
 for(const theme of ['day','night']){
  if(await p.locator('html').getAttribute('data-theme')!==theme)await p.locator('#rollerScreen [data-theme-toggle]').tap();
  const ratios=await p.evaluate(()=>{
   const vars=getComputedStyle(document.documentElement);const lum=hex=>hex.trim().replace('#','').replace(/^([a-f0-9])([a-f0-9])([a-f0-9])$/i,(_,a,b,c)=>a+a+b+b+c+c).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
   return [['text','panel'],['muted','panel'],['muted','surface'],['lime','display'],['locked-text','locked'],['button-text','button'],['closed-text','closed'],['purple','panel'],['orange','display']].map(([text,bg])=>{const a=lum(vars.getPropertyValue('--'+text));const b=lum(vars.getPropertyValue('--'+bg));return{text,bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};});
  });
  for(const pair of ratios)assert.ok(pair.ratio>=4.5,JSON.stringify({theme,...pair}));report.contrast.push({theme,ratios});
  await p.locator('#openScores').tap();assert.equal(await p.locator('#scoreGrid tbody tr').count(),24);assert.equal(await p.locator('#scoreGrid thead button').count(),18);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#scoresDialog').scrollWidth<=document.querySelector('#scoresDialog').clientWidth));
  await p.getByRole('button',{name:'Enter scores for hole 18',exact:true}).tap();await p.waitForFunction(()=>document.querySelector('#holeDialog').open);const before=JSON.stringify(await state());
  const wheel=p.locator('.stroke-wheel').first();await wheel.scrollIntoViewIfNeeded();const box=await wheel.boundingBox();const session=await c.newCDPSession(p);
  const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height-20);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let delta=10;delta<=110;delta+=10){await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-delta}]});await p.waitForTimeout(30);}await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(700);await session.detach();
  const value=Number(await wheel.getAttribute('data-value'));assert.ok(value>0&&value<=99,'Touch scroll changes wheel selection');assert.equal(JSON.stringify(await state()),before,'Touch scroll must not save');
  await p.locator('#holeDialog .close-button').tap();await p.waitForFunction(()=>document.querySelector('#scoresDialog').open);assert.equal(JSON.stringify(await state()),before);
  await p.getByRole('button',{name:'Enter scores for hole 18',exact:true}).tap();await p.waitForFunction(()=>document.querySelector('#holeDialog').open);await p.locator('.stroke-wheel').first().evaluate(e=>{e.scrollTop=99*48;e.dispatchEvent(new Event('scroll'));});await p.locator('#saveHole').tap();await p.waitForFunction(()=>document.querySelector('#scoresDialog').open);assert.equal((await state()).rounds.at(-1).scores[0].strokes,99);
  await p.getByRole('button',{name:'Enter scores for hole 18',exact:true}).tap();await p.waitForFunction(()=>document.querySelector('#holeDialog').open);await p.locator('.stroke-wheel').first().evaluate(e=>{e.scrollTop=0;e.dispatchEvent(new Event('scroll'));});await p.locator('#saveHole').tap();await p.waitForFunction(()=>document.querySelector('#scoresDialog').open);assert.equal((await state()).rounds.at(-1).scores.length,0);
  await p.locator('#scoresDialog .close-button').tap();await p.waitForFunction(()=>!document.querySelector('dialog[open]'));
 }
 await p.emulateMedia({colorScheme:'light'});assert.equal(await p.locator('html').getAttribute('data-theme'),'night');
 report.checks.push('Both skins: functional text pairs meet 4.5:1 contrast','24 players / 18 holes fit 320px with horizontal scroll confined to grid','Real emulated touch gesture scrolls/snaps wheel without saving; Cancel preserves scores','Save 99 and clear to Unplayed work on hole 18','System default and explicit persisted skin override work');assert.deepEqual(report.errors,[]);report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;throw e;}finally{await fs.writeFile('review/scorecard-results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
