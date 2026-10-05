import {playersForHole,activeRound,strokeSummary,teeOrder,scoreResult,PLAYER_COLORS} from './model.js';
export function createScoreUI({getState,getHole,setHole,commit,navigate,back,notice,announce,isBlocked,selectHole,nextHole,refresh}){
 const $=id=>document.getElementById(id);let pending=new Map(),entryHole=null,saving=false,writes=0,settled=Promise.resolve(),failed=false;
 const round=()=>activeRound(getState());
 const selected=()=>round().holes.find(h=>h.id===getHole())||round().holes.find(h=>h.id===getState().activeHoleId);
 const totalText=summary=>summary.total===null?'—':`${summary.total} (${summary.toPar===0?'E':summary.toPar>0?'+'+summary.toPar:summary.toPar})`;
 const color=(element,player)=>element.style.setProperty('--player-color',PLAYER_COLORS[player.colorIndex]);
 const scoresFor=hole=>playersForHole(round(),hole.id).map(playerId=>({playerId,strokes:round().scores.find(s=>s.playerId===playerId&&s.holeId===hole.id)?.strokes??null}));
 function updateControls(){const h=selected();const preview={...round(),scores:round().scores.filter(score=>score.holeId!==h.id).concat([...pending].filter(([,strokes])=>strokes!==null).map(([playerId,strokes])=>({playerId,strokes,holeId:h.id})))};for(const total of document.querySelectorAll('.quick-total'))total.textContent=totalText(strokeSummary(preview,total.dataset.player));for(const row of document.querySelectorAll('.score-stepper')){const value=pending.get(row.querySelector('.stroke-value').dataset.player);row.firstElementChild.disabled=saving||isBlocked()||value===null;row.lastElementChild.disabled=saving||isBlocked()||value===99;}
 $('previousScoreHole').disabled=saving||h.number===1;$('nextScoreHole').disabled=saving||h.number===round().holes.length;$('parButton').textContent='Par '+h.par+' ✎';$('quickHoleLabel').textContent='Hole '+h.number;$('quickHoleSetup').textContent=round().holes.length+' holes';
 const honors=teeOrder(round(),h.id);$('saveStatus').textContent=failed?'Not saved — reload before editing':writes?'Saving…':!honors.ready?'Saved · hole '+honors.missingHole+' needs scores for tee order':'Saved automatically on this device';
 }
 async function flush(){while(writes)await settled;return !failed&&!isBlocked();}
 function autosave(playerId,holeId,strokes){writes++;const roundId=round().id;const write=commit('score.set',{roundId,playerId,holeId,strokes}).catch(()=>{failed=true;}).finally(()=>{writes--;if(!writes){if(failed){pending=new Map(scoresFor(selected()).map(s=>[s.playerId,s.strokes]));renderEntry({preserve:true});}renderOverview();refresh();}updateControls();});settled=Promise.all([settled,write]);}
 window.addEventListener('beforeunload',event=>{if(writes){event.preventDefault();event.returnValue='';}});

 function renderEntry({preserve=false}={}){
  const h=selected();setHole(h.id);if((!preserve&&!writes)||entryHole!==h.id){pending=new Map(scoresFor(h).map(s=>[s.playerId,s.strokes]));}entryHole=h.id;
  const list=$('holeWheels');list.replaceChildren();$('scoreEmpty').hidden=round().playerIds.length>0;
  for(const id of teeOrder(round(),h.id).order){const player=getState().players.find(p=>p.id===id);const card=document.createElement('section');card.className='quick-player';color(card,player);
   const header=document.createElement('div');header.className='quick-player-name';const name=document.createElement('strong');name.textContent=player.name;name.title=player.name;const total=document.createElement('small');const summary=strokeSummary(round(),id);total.className='quick-total';total.dataset.player=id;total.textContent=totalText(summary);header.append(name,total);
   const strip=document.createElement('div');strip.className='score-stepper';const minus=document.createElement('button'),plus=document.createElement('button');minus.textContent='−';plus.textContent='+';minus.setAttribute('aria-label','Decrease strokes for '+player.name);plus.setAttribute('aria-label','Increase strokes for '+player.name);
   const value=document.createElement('output');value.className='stroke-value';value.dataset.player=id;value.setAttribute('aria-live','polite');
   function sync(){const next=pending.get(id);value.dataset.value=String(next??0);value.textContent=next??'—';value.setAttribute('aria-label',player.name+', hole '+h.number+': '+(next===null?'unplayed':next+' strokes'));minus.disabled=saving||isBlocked()||next===null;plus.disabled=saving||isBlocked()||next===99;}
   function pick(delta){if(saving||isBlocked())return;const current=pending.get(id)??0;const next=Math.max(0,Math.min(99,current+delta))||null;if(next===pending.get(id))return;pending.set(id,next);sync();autosave(id,h.id,next);updateControls();}
   minus.addEventListener('click',()=>pick(-1));plus.addEventListener('click',()=>pick(1));strip.append(minus,value,plus);card.append(header,strip);list.append(card);sync();

  }updateControls();
 }
 function open(holeId,playerId){setHole(holeId);entryHole=null;navigate('scores');renderEntry();if(playerId){const target=[...document.querySelectorAll('.stroke-value')].find(e=>e.dataset.player===playerId);target?.scrollIntoView({block:'nearest'});}}
 function renderOverview(){
  const r=round(),grid=$('scoreGrid'),left=grid.parentElement.scrollLeft;const head=document.createElement('thead'),hr=document.createElement('tr');const name=document.createElement('th');name.scope='col';name.textContent='PLAYER';hr.append(name);
  for(const h of r.holes){const th=document.createElement('th');th.scope='col';const b=document.createElement('button');b.textContent=h.number;b.setAttribute('aria-label','Enter scores for hole '+h.number);b.addEventListener('click',()=>open(h.id));const par=document.createElement('small');par.textContent='Par '+h.par;th.append(b,par);hr.append(th);}head.append(hr);const body=document.createElement('tbody');const totals=[];
  for(const id of r.playerIds){const p=getState().players.find(p=>p.id===id),tr=document.createElement('tr'),th=document.createElement('th');th.scope='row';th.className='card-player-name';color(th,p);th.textContent=p.name;tr.append(th);
   for(const h of r.holes){const td=document.createElement('td'),b=document.createElement('button');const value=r.scores.find(s=>s.playerId===id&&s.holeId===h.id)?.strokes;const kind=scoreResult(value,h.par);b.className='score-cell '+kind;const badge=document.createElement('span');badge.textContent=value??'—';b.append(badge);b.setAttribute('aria-label',`${p.name}, hole ${h.number}: ${value??'unplayed'}, ${kind.replaceAll('-',' ')}. Edit score`);b.addEventListener('click',()=>open(h.id,id));td.append(b);tr.append(td);}body.append(tr);
   const summary=strokeSummary(r,id),tile=document.createElement('div'),who=document.createElement('strong'),total=document.createElement('b'),status=document.createElement('small');color(tile,p);who.textContent=p.name;total.textContent=totalText(summary);status.textContent=`${summary.played}/${summary.holes} holes${summary.complete?' · complete':summary.played?' · partial':''}`;tile.append(who,total,status);totals.push(tile);
  }grid.replaceChildren(head,body);grid.parentElement.scrollLeft=left;$('roundTotals').replaceChildren(...totals);$('scoreDescription').textContent=`Round ${getState().rounds.indexOf(r)+1} · ${r.holes.length} holes`;
  const count=r.holes.filter(h=>{const ids=playersForHole(r,h.id);return ids.length&&ids.every(id=>r.scores.some(s=>s.playerId===id&&s.holeId===h.id));}).length;$('roundProgress').textContent=count+' / '+r.holes.length+' holes complete';
 }
 $('previousScoreHole').addEventListener('click',async()=>{if($('previousScoreHole').disabled||!await flush())return;const previous=round().holes[selected().number-2];if(!previous)return;try{await selectHole(previous.id);setHole(previous.id);renderEntry();}catch{}});
 $('nextScoreHole').addEventListener('click',async()=>{if($('nextScoreHole').disabled||!await flush()||saving)return;saving=true;updateControls();try{await nextHole(selected().id);}catch{}finally{saving=false;updateControls();} });
 $('openScorecard').addEventListener('click',async()=>{await flush();renderOverview();navigate('scorecard');});
 $('parButton').addEventListener('click',async()=>{if(!await flush())return;const h=selected();$('parTitle').textContent='Hole '+h.number+' par';$('parOptions').replaceChildren(...Array.from({length:8},(_,i)=>{const b=document.createElement('button');b.textContent=i+2;b.setAttribute('aria-label','Set par '+(i+2));b.setAttribute('aria-pressed',String(h.par===i+2));b.addEventListener('click',async()=>{if(saving||isBlocked())return;saving=true;try{await commit('par.set',{holeId:h.id,par:i+2});renderOverview();notice('');back();}catch{}finally{saving=false;updateControls();}});return b;}));navigate('par');});
 return {flush,open,enter:renderEntry,render:()=>{renderOverview();if($('scoresDialog').open)updateControls();},leave:()=>{}};
}
