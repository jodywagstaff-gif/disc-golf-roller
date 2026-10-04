// Optional integration suite. Set PLAYWRIGHT_MODULE and CHROME_PATH to use an
// existing installation, or install Playwright locally for development.
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.env.TEST_URL||'http://127.0.0.1:4173';
const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
const output={browser:browser.version(),base,checks:[],errors:[],externalRequests:[]};
await fs.mkdir('review',{recursive:true});
async function run(){
 const ctx=await browser.newContext({viewport:{width:1440,height:1100},reducedMotion:'reduce'});
 const p=await ctx.newPage();
 p.on('pageerror',e=>output.errors.push(e.message));p.on('request',r=>{if(!r.url().startsWith(base))output.externalRequests.push(r.url())});
 await p.goto(base);await p.evaluate(()=>document.fonts.ready);
 await p.getByLabel('Player name',{exact:true}).fill('Alex');await p.getByRole('button',{name:'Add player',exact:true}).click();await p.locator('.player-row').filter({hasText:'Alex'}).waitFor();
 await p.getByLabel('Player name',{exact:true}).fill('Taylor');await p.getByRole('button',{name:'Add player',exact:true}).click();await p.locator('.player-row').filter({hasText:'Taylor'}).waitFor();
 const score=p.getByRole('spinbutton',{name:'Alex, hole 1, strokes',exact:true});await score.fill('4');await score.press('Tab');await p.waitForFunction(()=>document.querySelector('[data-total]')?.textContent.startsWith('4'));
 await score.fill('3');await score.press('Tab');await p.waitForFunction(()=>document.querySelector('[data-total]')?.textContent.startsWith('3'));
 await p.getByRole('spinbutton',{name:'Taylor, hole 1, strokes',exact:true}).fill('4');await p.getByRole('spinbutton',{name:'Taylor, hole 1, strokes',exact:true}).press('Tab');
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('disc-roller.league.v1')).rounds[0].scores.length===2);
 output.checks.push('Player setup, stroke entry, correction, partial totals');
 await p.locator('#mainAction').click();
 for(let i=0;i<6;i++){if(await p.locator('#completeDisplay').isVisible())break;if(await p.locator('#wildDisplay').isVisible())await p.locator('#wildOptions button').first().click();else await p.locator('#mainAction').click();await p.waitForTimeout(100);}
 assert.ok(await p.locator('#completeDisplay').isVisible());assert.equal(await p.locator('.history-item').count(),1);
 output.checks.push('Timing reel, optional wildcard, challenge completion and history');
 await p.screenshot({path:'review/desktop.png',fullPage:true});
 for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});await p.evaluate(()=>window.scrollTo(0,0));const dimensions=await p.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));assert.ok(dimensions.scroll<=dimensions.width,JSON.stringify(dimensions));if(width===390){await p.screenshot({path:'review/mobile.png',fullPage:true});await p.screenshot({path:'review/mobile-top.png'});}}
 output.checks.push('No page overflow at 320, 390, 768, 1440 px');
 await p.reload();assert.equal(await p.getByRole('spinbutton',{name:'Alex, hole 1, strokes',exact:true}).inputValue(),'3');assert.ok(await p.locator('#completeDisplay').isVisible());
 output.checks.push('Players, corrected scores and challenge survive reload');
 await p.locator('#mainAction').click();await p.waitForFunction(()=>document.querySelector('#actionLabel').textContent==='STOP THE REEL');await p.reload();assert.equal(await p.locator('#actionLabel').innerText(),'RESUME REEL');await p.locator('#mainAction').click();
 for(let i=0;i<6;i++){if(await p.locator('#completeDisplay').isVisible())break;if(await p.locator('#wildDisplay').isVisible())await p.locator('#wildOptions button').first().click();else await p.locator('#mainAction').click();await p.waitForTimeout(100);}
 output.checks.push('Unfinished challenge resumes safely after refresh');
 await p.waitForFunction(()=>navigator.serviceWorker.controller!==null);await ctx.setOffline(true);await p.reload();assert.equal(await p.getByRole('spinbutton',{name:'Alex, hole 1, strokes',exact:true}).inputValue(),'3');await p.getByRole('spinbutton',{name:'Alex, hole 2, strokes',exact:true}).fill('5');await p.getByRole('spinbutton',{name:'Alex, hole 2, strokes',exact:true}).press('Tab');await p.waitForFunction(()=>JSON.parse(localStorage.getItem('disc-roller.league.v1')).rounds[0].scores.some(s=>s.strokes===5));await p.reload();assert.equal(await p.getByRole('spinbutton',{name:'Alex, hole 2, strokes',exact:true}).inputValue(),'5');await ctx.setOffline(false);output.checks.push('Offline reload and score edits persist offline');
 await p.getByRole('spinbutton',{name:'Alex, hole 2, strokes',exact:true}).fill('');await p.getByRole('spinbutton',{name:'Alex, hole 2, strokes',exact:true}).press('Tab');await p.waitForFunction(()=>!JSON.parse(localStorage.getItem('disc-roller.league.v1')).rounds[0].scores.some(s=>s.strokes===5));output.checks.push('Clearing a score restores missing, not zero');
 await p.locator('#newNightButton').click();await p.locator('#newRoundHoles').selectOption('18');await p.locator('#confirmNight').click();await p.waitForFunction(()=>document.querySelector('#scoreDescription').textContent.startsWith('18'));await p.locator('#roundPicker').selectOption({index:0});await p.waitForFunction(()=>document.querySelector('#scoreDescription').textContent.startsWith('9'));assert.equal(await p.getByRole('spinbutton',{name:'Alex, hole 1, strokes',exact:true}).inputValue(),'3');output.checks.push('18-hole new round and archived 9-hole scorecard retrieval');
 await p.getByLabel('Player name',{exact:true}).fill('<img src=x onerror=alert(1)>');await p.getByRole('button',{name:'Add player',exact:true}).click();await p.locator('.player-name').filter({hasText:'<img src=x onerror=alert(1)>'}).waitFor();assert.equal(await p.locator('.player-list img').count(),0);output.checks.push('HTML-like player name renders as plain text');
 const p2=await ctx.newPage();await p2.goto(base);await p2.getByRole('spinbutton',{name:'Alex, hole 1, strokes',exact:true}).fill('6');await p2.getByRole('spinbutton',{name:'Alex, hole 1, strokes',exact:true}).press('Tab');await p.waitForFunction(()=>document.querySelector('#notice').textContent.includes('another tab'));assert.ok(await p.locator('#mainAction').isDisabled());output.checks.push('Other-tab changes stop stale editing');await ctx.close();
 const broken=await browser.newContext();await broken.addInitScript(()=>localStorage.setItem('disc-roller.league.v1','corrupted-test-data'));const bp=await broken.newPage();await bp.goto(base);assert.ok(await bp.locator('#mainAction').isDisabled());assert.equal(await bp.evaluate(()=>localStorage.getItem('disc-roller.league.v1')),'corrupted-test-data');output.checks.push('Corrupt data preserved; mutations blocked');await broken.close();
 const full=await browser.newContext();await full.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Test quota','QuotaExceededError')}});const fp=await full.newPage();await fp.goto(base);await fp.getByLabel('Player name',{exact:true}).fill('Morgan');await fp.getByRole('button',{name:'Add player',exact:true}).click();await fp.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Could not save'));assert.equal(await fp.locator('.player-row').count(),0);output.checks.push('Storage failure is visible and does not claim a save');await full.close();
 assert.deepEqual(output.errors,[]);assert.deepEqual(output.externalRequests,[]);
}
try{await run();output.passed=true;}catch(error){output.passed=false;output.failure=error.stack;throw error;}finally{await fs.writeFile('review/browser-results.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));await browser.close();}
