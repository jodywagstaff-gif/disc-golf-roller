import {STORAGE_KEY,LocalRepository,freshState,applyCommand,activeRound,strokeSummary,poolFor,normalizeIndex,levelName,wildcardOptions} from './model.js';
import {spinPlan,spinPosition,centeredIndex,SETTLE_DURATION,canQuickStop} from './reel-motion.js';
import {BUILD_ID} from './release.js';
import './theme.js';
const $=id=>document.getElementById(id);
const dialogs={scores:'scoresDialog',players:'playersDialog',help:'helpDialog','new-round':'newNightDialog','hole-entry':'holeDialog'};
const views=new Set(['start','play',...Object.keys(dialogs)]);
let repo,state,blocked=false,rolling=false,index=0,timer=null,saveQueue=Promise.resolve(),busyAction=false;
let settleTimer=null,settling=false,motionGeneration=0,spinOrdinal=0,paintedPosition=0,lastReducedPaint=0;
let spinAnchor=0,spinOffset=0,windowWasOpen=false;
const spinElapsed=()=>Math.max(spinOffset+performance.now()-spinAnchor,Date.now()-(state.draft?.spin?.startedAt??Date.now()));
function renderSpinAction(){
 const d=state.draft;const quick=rolling&&canQuickStop(spinElapsed());
 $('mainAction').hidden=!!d?.wildcard;$('mainAction').disabled=blocked||busyAction||settling||(rolling&&!quick);
 $('mainAction').classList.toggle('is-rolling',quick);
 $('actionLabel').textContent=settling?'LOCKED':!d?'ROLL':d.stage==='complete'?'ROLL AGAIN':rolling?(quick?'QUICK STOP':'LET IT SPIN'):'RESUME';
 $('mainAction').setAttribute('aria-label',rolling?(quick?'Quick stop: catch it now':'Quick stop closed. Reel will stop automatically.'):$('actionLabel').textContent);
 $('actionIcon').textContent=settling?'✓':rolling?'◆':'▶';
 if(rolling&&!quick&&windowWasOpen)announce('Quick stop closed. Let it spin.');windowWasOpen=quick;
}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let currentView='start',baseView='start',scoreHoleId=null,lastMessage='',navigatingBack=false;
const focusReturns=new Map();
let updateRegistration=null,updateAvailable=false,updateReady=false,checkingUpdate=false,updateMessage='Updates keep your saved scores.';
function renderUpdate(){
 const unsafe=!!inProgress()||rolling||settling||busyAction;
 for(const id of ['splashUpdate','applyUpdate']){$(id).hidden=!updateAvailable;$(id).disabled=!updateReady||unsafe;}
 $('openHelp').classList.toggle('has-update',updateAvailable);
 $('updateStatus').textContent=updateAvailable?(unsafe?'Update available. Finish the current challenge, then reload here.':updateReady?'Update ready. Reload to use it; your saved scores stay on this device.':'Downloading update. Keep this tab open.'):updateMessage;
 $('checkUpdate').disabled=checkingUpdate;
}
async function checkUpdate(manual=false){
 if(checkingUpdate)return;checkingUpdate=true;renderUpdate();
 try{
  if(manual&&updateRegistration)await updateRegistration.update();
  const response=await fetch('./version.json',{cache:'no-store'});if(!response.ok)throw new Error('Version unavailable');
  const latest=(await response.json()).commit;if(typeof latest!=='string')throw new Error('Invalid version');
  updateAvailable=latest!==BUILD_ID;
  // Read through the active worker to ensure the next navigation has this release.
  const shell=await fetch('./release.js',{cache:'no-store'});
  updateReady=shell.ok&&(await shell.text()).includes(JSON.stringify(latest));
  updateMessage='You have the latest version ('+BUILD_ID.slice(0,7)+').';
 }catch{updateMessage='Could not check for updates. Try again when online.';}
 finally{checkingUpdate=false;renderUpdate();}
}
async function applyUpdate(){
 if(!updateAvailable||!updateReady||inProgress()||rolling||settling||busyAction)return;
 document.activeElement?.blur();
 try{await saveQueue;}catch{notice('A change was not saved. Export a backup from Scores before reloading.');return;}
 if(inProgress()||rolling||settling||busyAction)return;
 location.reload();
}
const announce=text=>{$('announcer').textContent=text;};
function notice(text){lastMessage=text;$('notice').textContent=text;$('notice').hidden=!text||!!document.querySelector('dialog[open]');for(const dialog of document.querySelectorAll('dialog')){let note=dialog.querySelector('.sheet-notice');if(!note){note=document.createElement('p');note.className='sheet-notice';note.setAttribute('role','alert');dialog.querySelector('.sheet-body').prepend(note);}note.textContent=text;note.hidden=!text;}}
try{repo=new LocalRepository(localStorage);state=repo.load()??freshState();}catch{state=freshState();blocked=true;notice('Saved data could not be opened. Export a backup from Scores before troubleshooting. Existing data has not been replaced.');}
const inProgress=()=>state.draft&&state.draft.stage!=='complete';
const activePlayer=()=>state.players.find(p=>p.id===state.activePlayerId);
const hole=()=>activeRound(state).holes.find(h=>h.id===state.activeHoleId);
function commit(type,payload={}){
 saveQueue=saveQueue.catch(()=>{}).then(async()=>{
  if(blocked)throw new Error('Export your saved data from Scores and reload before making changes.');
  const write=()=>{const next=applyCommand(state,type,payload);repo.save(next,state.revision);state=next;return next;};
  try{const next=navigator.locks?await navigator.locks.request('disc-roller-write',write):write();$('saveStatus').textContent='Saved on this device · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});return next;}
  catch(error){stopTimer();notice(error.message.includes('another tab')?error.message:'Could not save this change. Previous saved data is intact. Export a backup, check storage, then reload.');$('saveStatus').textContent='Change not saved';throw error;}
 });return saveQueue;
}
function stopTimer(){cancelAnimationFrame(timer);clearTimeout(settleTimer);timer=null;settleTimer=null;rolling=false;settling=false;motionGeneration++;}
function paintReel(position){
 if(!inProgress()||state.draft.wildcard)return;
 const pool=poolFor(state.draft.stage,state.preferences.experience);paintedPosition=position;index=centeredIndex(position,pool.length);
 $('reelText').textContent=pool[index]==='WILDCARD'?'WILD CARD':pool[index];
 $('reelWindow').hidden=reducedMotion.matches;$('reelText').classList.toggle('sr-only',!reducedMotion.matches);
 const track=$('reelTrack');while(track.children.length<7){const row=document.createElement('div');row.className='reel-row';track.append(row);}
 const base=Math.floor(position);for(let i=0;i<7;i++){const item=pool[normalizeIndex(base+i-3,pool.length)];const row=track.children[i];row.textContent=item==='WILDCARD'?'WILD CARD':item;row.classList.toggle('centered',base+i-3===Math.round(position));}
 const height=track.firstElementChild.getBoundingClientRect().height||80;
 track.style.transform=`translateY(${-(position-base+3.5)*height}px)`;
 $('reelWindow').dataset.position=String(position);$('reelWindow').dataset.center=pool[index];
}
function drawReel(){if(!inProgress()||state.draft.wildcard)return;index=normalizeIndex(index,poolFor(state.draft.stage,state.preferences.experience).length);paintReel(rolling||settling?paintedPosition:index);}
function finishSpin(automatic=false){
 if(!rolling||busyAction||blocked||currentView!=='play'||document.hidden)return;
 // Input-time guard: a delayed frame or synthetic/keyboard click cannot bypass it.
 if(!automatic&&!canQuickStop(spinElapsed())){renderSpinAction();return;}
 // Catch exactly the nearest item in the last painted frame, not a later clock
 // sample. Hold it centered before accepting so the result is easy to see.
 const selectedIndex=centeredIndex(paintedPosition,poolFor(state.draft.stage,state.preferences.experience).length);
 const value=poolFor(state.draft.stage,state.preferences.experience)[selectedIndex];const draftId=state.draft.id;const stage=state.draft.stage;
 stopTimer();index=selectedIndex;paintedPosition=selectedIndex;settling=true;renderMachine();
 const generation=motionGeneration;
 settleTimer=setTimeout(()=>{settleTimer=null;if(generation!==motionGeneration||currentView!=='play'||document.hidden||state.draft?.id!==draftId||state.draft.stage!==stage)return;settling=false;choose(value);},SETTLE_DURATION);
}
async function startTimer(){
 stopTimer();if(currentView!=='play'||document.hidden)return;
 const generation=motionGeneration;
 if(!state.draft.spin)await commit('challenge.spin',{start:index,ordinal:spinOrdinal++});
 if(generation!==motionGeneration||currentView!=='play'||document.hidden)return;
 const saved=state.draft.spin;const plan=spinPlan(saved.start,saved.ordinal);
 spinOffset=Math.max(0,Date.now()-saved.startedAt);spinAnchor=performance.now();rolling=true;lastReducedPaint=0;
 paintReel(spinPosition(plan,spinOffset));renderSpinAction();
 const frame=time=>{if(generation!==motionGeneration||!rolling)return;if(document.hidden||currentView!=='play'){stopTimer();renderMachine();return;}const elapsed=spinElapsed();const position=spinPosition(plan,elapsed);
  if(!reducedMotion.matches||time-lastReducedPaint>=250||elapsed>=plan.duration){paintReel(reducedMotion.matches?Math.round(position):position);lastReducedPaint=time;}
  renderSpinAction();if(elapsed>=plan.duration){finishSpin(true);return;}timer=requestAnimationFrame(frame);
 };timer=requestAnimationFrame(frame);
}
reducedMotion.addEventListener('change',()=>{if(inProgress()&&!state.draft.wildcard)drawReel();});

// URL/history state controls screens only, not league data. Back, Escape and
// Close share the same path; native dialogs provide modal focus containment.
function syncView(){
 navigatingBack=false;
 const previous=currentView;const requested=location.hash.slice(1);currentView=views.has(requested)?requested:'start';
 baseView=dialogs[currentView]?(history.state?.rollerUI?history.state.base:'play'):currentView;
 if(currentView!=='play')stopTimer();
 for(const [view,id] of Object.entries(dialogs))if(view!==currentView&&$(id).open)$(id).close();
 $('splashScreen').hidden=baseView!=='start';$('rollerScreen').hidden=baseView!=='play';
 renderMachine();
 const dialog=dialogs[currentView]?$(dialogs[currentView]):null;
 if(dialog&&!dialog.open){dialog.showModal();dialog.scrollTop=0;dialog.querySelector('.close-button').focus({preventScroll:true});}
 if(!dialog&&previous!==currentView){const target=dialogs[previous]&&focusReturns.get(previous)?$(focusReturns.get(previous)):currentView==='play'?$('mainAction'):$('startButton');(target&&target.getClientRects().length&&!target.disabled?target:currentView==='play'?$('mainAction'):$('startButton')).focus({preventScroll:true});}
 if(currentView==='hole-entry'&&previous!==currentView){scoreHoleId=history.state?.scoreHoleId||scoreHoleId;renderHoleWheels();}notice(lastMessage);window.scrollTo(0,0);
}
function navigate(view,{replace=false}={}){
 if(currentView===view)return;
 if(dialogs[view]){focusReturns.set(view,document.activeElement?.id||null);if(view==='scores')scoreHoleId=state.activeHoleId;render();}
 const nextBase=dialogs[view]?baseView:view;
 const depth=replace?(history.state?.depth??0):(history.state?.rollerUI?history.state.depth:0)+1;
 history[replace?'replaceState':'pushState']({rollerUI:true,base:nextBase,depth,scoreHoleId},'', '#'+view);syncView();
}
function back(){if(navigatingBack)return;navigatingBack=true;if(history.state?.rollerUI&&history.state.depth>0)history.back();else navigate(baseView,{replace:true});}
window.addEventListener('popstate',syncView);window.addEventListener('hashchange',()=>{if(location.hash.slice(1)!==currentView)syncView();});
for(const dialog of document.querySelectorAll('dialog')){dialog.addEventListener('cancel',event=>{event.preventDefault();back();});for(const close of dialog.querySelectorAll('[data-close]'))close.addEventListener('click',back);}
$('startButton').addEventListener('click',()=>navigate('play'));
$('homeButton').addEventListener('click',()=>navigate('start'));
$('splashHelp').addEventListener('click',()=>navigate('help'));
for(const [id,view] of [['openScores','scores'],['openPlayers','players'],['playerContext','players'],['openHelp','help']])$(id).addEventListener('click',()=>navigate(view));

function renderMachine(){
 renderUpdate();
 const d=state.draft;const current=activePlayer();const round=activeRound(state);const busy=!!inProgress();
 $('currentPlayerLabel').textContent=current?.name??'Free play';$('currentPlayerLabel').title=current?.name??'Free play';$('holeLabel').textContent=current?'Hole '+hole().number:levelName(state.preferences.experience).toLowerCase();
 $('idleDisplay').hidden=!!d;$('reelDisplay').hidden=!busy||!!d?.wildcard;$('wildDisplay').hidden=!d?.wildcard;$('completeDisplay').hidden=d?.stage!=='complete';
 $('rollerScreen').classList.toggle('wildcard',!!d?.wildcard);$('rollerScreen').classList.toggle('complete',d?.stage==='complete');
 for(const stage of ['disc','stability','shot']){$('result-'+stage).textContent=d?.[stage]??'—';$('slot-'+stage).classList.toggle('active',d?.stage===stage);$('slot-'+stage).classList.toggle('locked',!!d?.[stage]);}
 if(busy&&!d.wildcard){$('reelStage').textContent=({disc:'01 / DISC TYPE',stability:'02 / STABILITY',shot:'03 / SHOT TYPE'})[d.stage];drawReel();}
 if(d?.wildcard){$('wildTitle').textContent=({disc:'Pick your disc.',stability:'Pick stability.',shot:'Pick your shot.'})[d.stage];$('wildOptions').replaceChildren(...wildcardOptions(d.stage).map(value=>{const button=document.createElement('button');button.type='button';button.textContent=value;button.disabled=blocked||busyAction;button.addEventListener('click',()=>choose(value));return button;}));}
 if(d?.stage==='complete'){$('completePlayer').textContent=current?current.name+' · Hole '+hole().number:'Go throw it.';$('finalChallenge').replaceChildren(...['disc','stability','shot'].map(stage=>{const row=document.createElement('div');const label=document.createElement('span');label.textContent=stage.toUpperCase();const value=document.createElement('strong');value.textContent=d[stage];row.append(label,value);return row;}));}
 renderSpinAction();
 $('startButton').firstChild.textContent=d?'CONTINUE ':'START ';
 $('activeHole').replaceChildren(...round.holes.map(h=>option(h.id,'Hole '+h.number)));$('activeHole').value=state.activeHoleId;$('activeHole').disabled=busy||blocked||busyAction;
 $('difficulty').value=state.preferences.experience;$('difficultyName').textContent=levelName(state.preferences.experience);$('difficulty').disabled=blocked||busyAction;
 $('setupHint').textContent=busy?'Finish the current challenge before switching players or rounds. You can change difficulty now.':'Optional: add players for scores, or just keep rolling.';
 $('newNightButton').disabled=busy||blocked||busyAction;
}
function option(value,text){const o=document.createElement('option');o.value=value;o.textContent=text;return o;}
function renderPlayers(){
 const round=activeRound(state);const players=state.players.filter(p=>round.playerIds.includes(p.id));$('emptyPlayers').hidden=players.length>0;
 $('playerList').replaceChildren(...players.map((p,i)=>{const button=document.createElement('button');button.className='player-row'+(p.id===state.activePlayerId?' selected':'');button.type='button';button.setAttribute('aria-pressed',String(p.id===state.activePlayerId));button.disabled=!!inProgress()||blocked||busyAction;const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=String(i+1).padStart(2,'0');avatar.setAttribute('aria-hidden','true');const info=document.createElement('span');info.className='player-info';const name=document.createElement('span');name.className='player-name';name.textContent=p.name;const meta=document.createElement('span');meta.className='player-meta';const summary=strokeSummary(round,p.id);meta.textContent=summary.played?`${summary.total} strokes · ${summary.played}/${summary.holes} holes`:'Ready to play';info.append(name,meta);button.append(avatar,info);if(p.id===state.activePlayerId){const turn=document.createElement('span');turn.className='player-turn';turn.textContent='UP';button.append(turn);}button.addEventListener('click',async()=>{try{await commit('player.select',{playerId:p.id});render();back();}catch{}});return button;}));
 $('playerName').disabled=!!inProgress()||blocked||busyAction;$('playerForm').querySelector('button').disabled=!!inProgress()||blocked||busyAction;
}
function selectedScore(){const round=activeRound(state);if(!round.holes.some(h=>h.id===scoreHoleId))scoreHoleId=state.activeHoleId;return round.holes.find(h=>h.id===scoreHoleId);}
function openHole(holeId,playerId){
 scoreHoleId=holeId;renderScores();navigate('hole-entry');renderHoleWheels();
 if(playerId){const wheel=[...document.querySelectorAll('.stroke-wheel')].find(e=>e.dataset.player===playerId);wheel?.focus();}
}
function renderOverview(){
 const round=activeRound(state);const selected=selectedScore();const grid=$('scoreGrid');const scroll=grid.parentElement.scrollLeft;
 const head=document.createElement('thead');const row=document.createElement('tr');const label=document.createElement('th');label.scope='col';label.textContent='PLAYER';row.append(label);
 for(const hole of round.holes){const th=document.createElement('th');th.scope='col';const button=document.createElement('button');button.textContent=hole.number;button.setAttribute('aria-label','Enter scores for hole '+hole.number);button.classList.toggle('selected-hole',hole.id===selected.id);button.addEventListener('click',()=>openHole(hole.id));th.append(button);row.append(th);}head.append(row);
 const body=document.createElement('tbody');const totals=[];
 for(const id of round.playerIds){const player=state.players.find(p=>p.id===id);const tr=document.createElement('tr');const name=document.createElement('th');name.scope='row';name.textContent=player.name;tr.append(name);
  for(const hole of round.holes){const td=document.createElement('td');const value=round.scores.find(s=>s.playerId===id&&s.holeId===hole.id)?.strokes;const button=document.createElement('button');button.textContent=value??'—';button.classList.toggle('recorded',value!==undefined);button.setAttribute('aria-label',`${player.name}, hole ${hole.number}: ${value??'unplayed'}. Edit score`);button.addEventListener('click',()=>openHole(hole.id,id));td.append(button);tr.append(td);}body.append(tr);
  const summary=strokeSummary(round,id);const card=document.createElement('div');const who=document.createElement('strong');who.textContent=player.name;const total=document.createElement('b');total.textContent=summary.total??'—';const status=document.createElement('small');status.textContent=`${summary.played}/${summary.holes} holes${summary.complete?' · complete':summary.played?' · partial':''}`;card.append(who,total,status);totals.push(card);
 }
 grid.replaceChildren(head,body);grid.parentElement.scrollLeft=scroll;$('roundTotals').replaceChildren(...totals);
 const complete=round.holes.filter(h=>round.playerIds.length&&round.playerIds.every(id=>round.scores.some(s=>s.playerId===id&&s.holeId===h.id))).length;
 $('roundProgress').textContent=`${complete} / ${round.holes.length} holes complete`;$('roundOverview').hidden=!round.playerIds.length;$('editCurrentHole').hidden=!round.playerIds.length;
 $('editCurrentHole').textContent='Hole '+selected.number+' · Open stroke wheels';
}
function renderHoleWheels(){
 const round=activeRound(state);const selected=selectedScore();$('holeTitle').textContent='Hole '+selected.number;$('holeWheels').replaceChildren();
 for(const id of round.playerIds){
  const player=state.players.find(p=>p.id===id);const card=document.createElement('section');card.className='wheel-card';const name=document.createElement('h3');name.textContent=player.name;
  const wheel=document.createElement('div');wheel.className='stroke-wheel';wheel.tabIndex=0;wheel.dataset.player=id;wheel.setAttribute('role','listbox');wheel.setAttribute('aria-label',player.name+', hole '+selected.number+', strokes');
  for(let value=0;value<=99;value++){const item=document.createElement('div');item.className='wheel-option';item.id='wheel-'+id+'-'+value;item.setAttribute('role','option');item.textContent=value||'Unplayed';item.addEventListener('click',()=>{wheel.scrollTop=value*48;sync();});wheel.append(item);}
  function sync(){const value=Math.max(0,Math.min(99,Math.round(wheel.scrollTop/48)));wheel.dataset.value=String(value);wheel.setAttribute('aria-activedescendant','wheel-'+id+'-'+value);for(let i=0;i<wheel.children.length;i++)wheel.children[i].setAttribute('aria-selected',String(i===value));}
  wheel.addEventListener('scroll',sync,{passive:true});wheel.addEventListener('keydown',event=>{const current=Number(wheel.dataset.value);let value;if(event.key==='ArrowDown')value=current+1;else if(event.key==='ArrowUp')value=current-1;else if(event.key==='Home')value=0;else if(event.key==='End')value=99;else if(event.key==='PageDown')value=current+10;else if(event.key==='PageUp')value=current-10;else return;event.preventDefault();wheel.scrollTop=Math.max(0,Math.min(99,value))*48;sync();});
  const frame=document.createElement('div');frame.className='wheel-frame';frame.append(wheel);card.append(name,frame);$('holeWheels').append(card);
  wheel.scrollTop=(round.scores.find(s=>s.playerId===id&&s.holeId===selected.id)?.strokes??0)*48;sync();
 }
 $('saveHole').disabled=blocked||!round.playerIds.length;
}
$('editCurrentHole').addEventListener('click',()=>openHole(selectedScore().id));
$('saveHole').addEventListener('click',async()=>{
 if(busyAction||blocked)return;busyAction=true;$('saveHole').disabled=true;
 const scores=[...document.querySelectorAll('.stroke-wheel')].map(w=>({playerId:w.dataset.player,strokes:Math.max(0,Math.min(99,Math.round(w.scrollTop/48)))||null}));
 try{await commit('score.hole.set',{holeId:scoreHoleId,scores});notice('');render();back();announce('Hole scores saved.');}catch{}finally{busyAction=false;$('saveHole').disabled=blocked;}
});
function renderScores(){
 renderOverview();
 const round=activeRound(state);const scoring=selectedScore();$('scoreDescription').textContent=`Round ${state.rounds.indexOf(round)+1} · ${round.holes.length} holes · Strokes`;$('scoreEmpty').hidden=round.playerIds.length>0;
 $('scoreHole').replaceChildren(...round.holes.map(h=>option(h.id,'Hole '+h.number)));$('scoreHole').value=scoring.id;$('previousScoreHole').disabled=scoring.number===1;$('nextScoreHole').disabled=scoring.number===round.holes.length;
 $('scoreCards').replaceChildren(...round.playerIds.map(playerId=>{
  const player=state.players.find(p=>p.id===playerId);const card=document.createElement('div');card.className='score-card';const header=document.createElement('div');header.className='score-card-header';const name=document.createElement('strong');name.textContent=player.name;const total=document.createElement('span');total.className='score-total';total.dataset.total=playerId;header.append(name,total);
  const stepper=document.createElement('div');stepper.className='score-stepper';const minus=document.createElement('button');minus.textContent='−';minus.setAttribute('aria-label','Decrease strokes for '+player.name);const plus=document.createElement('button');plus.textContent='+';plus.setAttribute('aria-label','Increase strokes for '+player.name);const input=document.createElement('input');input.type='number';input.inputMode='numeric';input.min='1';input.max='99';input.step='1';input.placeholder='—';input.setAttribute('aria-label',`${player.name}, hole ${scoring.number}, strokes`);input.dataset.player=playerId;input.dataset.hole=scoring.id;
  const saved=()=>activeRound(state).scores.find(s=>s.playerId===playerId&&s.holeId===scoring.id)?.strokes??null;
  const sync=()=>{input.value=saved()??'';input.disabled=blocked;minus.disabled=blocked||saved()===null;plus.disabled=blocked||saved()===99;};sync();
  async function save(strokes){if(strokes!==null&&(!Number.isInteger(strokes)||strokes<1||strokes>99)){input.classList.add('invalid');input.setAttribute('aria-invalid','true');notice('Enter whole strokes from 1 to 99, or clear the field for an unplayed hole.');return;}minus.disabled=plus.disabled=true;try{await commit('score.set',{playerId,holeId:scoring.id,strokes});input.classList.remove('invalid');input.removeAttribute('aria-invalid');notice('');updateTotals();renderPlayers();announce(`${player.name}, hole ${scoring.number}: ${strokes===null?'score cleared':strokes+' strokes'}.`);}catch{}finally{sync();}}
  input.addEventListener('change',()=>{if(input.validity.badInput){notice('Enter a whole number of strokes.');return;}save(input.value.trim()===''?null:Number(input.value));});
  minus.addEventListener('click',()=>save(saved()===1?null:Math.max(1,(saved()??1)-1)));plus.addEventListener('click',()=>save(Math.min(99,(saved()??0)+1)));
  stepper.append(minus,input,plus);card.append(header,stepper);return card;
 }));updateTotals();
}
function updateTotals(){renderOverview();for(const cell of document.querySelectorAll('[data-total]')){const summary=strokeSummary(activeRound(state),cell.dataset.total);const b=document.createElement('b');b.textContent=summary.total??'—';const small=document.createElement('small');small.textContent=`${summary.played}/${summary.holes} holes`+(summary.played&&!summary.complete?' · partial':'');cell.replaceChildren(b,document.createTextNode(' total'),small);}}
function renderHistory(){const round=activeRound(state);const entries=round.challenges.slice().reverse();$('historyEmpty').hidden=!!entries.length;$('historyList').replaceChildren(...entries.slice(0,30).map(entry=>{const li=document.createElement('li');li.className='history-item';const who=document.createElement('span');who.className='history-person';who.textContent=state.players.find(p=>p.id===entry.playerId)?.name??'Free play';const detail=document.createElement('small');detail.textContent='Hole '+round.holes.find(h=>h.id===entry.holeId).number+' · '+levelName(entry.experience).toLowerCase();who.append(detail);const chips=document.createElement('span');chips.className='history-challenge';for(const value of [entry.disc,entry.stability,entry.shot]){const chip=document.createElement('span');chip.className='challenge-chip';chip.textContent=value;chips.append(chip);}li.append(who,chips);return li;}));}
function render(){renderMachine();renderPlayers();renderScores();renderHistory();$('roundPicker').replaceChildren(...state.rounds.map((r,i)=>option(r.id,'Round '+(i+1)+' · '+r.holes.length+' holes')));$('roundPicker').value=state.activeRoundId;$('roundPicker').disabled=!!inProgress()||blocked||busyAction;}
async function choose(value){if(!inProgress()||busyAction||blocked)return;stopTimer();busyAction=true;renderMachine();try{await commit('challenge.choose',{value});index=0;if(inProgress()&&!state.draft.wildcard&&currentView==='play')await startTimer();const d=state.draft;if(d.stage==='complete'){announce(`Challenge locked: ${d.disc}, ${d.stability}, ${d.shot}.`);$('gameDisplay').classList.add('celebrate');setTimeout(()=>$('gameDisplay').classList.remove('celebrate'),550);}else announce(d.wildcard?'Wild card. Choose your '+d.stage+'.':value+' locked. Stop the '+d.stage+' reel next.');}catch{}finally{busyAction=false;render();if(currentView==='play')(state.draft?.wildcard?$('wildOptions').querySelector('button'):$('mainAction'))?.focus({preventScroll:true});}}
$('mainAction').addEventListener('click',async()=>{if(blocked||busyAction||settling)return;if(rolling){finishSpin();return;}if(inProgress()){busyAction=true;try{await startTimer();}catch{}finally{busyAction=false;renderMachine();}return;}busyAction=true;renderMachine();try{await commit('challenge.start');index=0;await startTimer();announce('Disc reel started. Quick stop is available for the first third.');}catch{}finally{busyAction=false;render();}});
$('difficulty').addEventListener('input',()=>{$('difficultyName').textContent=levelName(Number($('difficulty').value));});
$('difficulty').addEventListener('change',async()=>{const experience=Number($('difficulty').value);stopTimer();busyAction=true;try{await commit('difficulty.set',{experience});if(inProgress()&&!state.draft.wildcard)index=normalizeIndex(index,poolFor(state.draft.stage,experience).length);}catch{}finally{busyAction=false;renderMachine();}});
$('playerForm').addEventListener('submit',async event=>{event.preventDefault();const name=$('playerName').value;$('playerError').hidden=true;try{applyCommand(state,'player.add',{name});await commit('player.add',{name});$('playerName').value='';render();$('playerName').focus();announce(name.trim()+' added.');}catch(error){$('playerError').textContent=error.message;$('playerError').hidden=false;}});
$('activeHole').addEventListener('change',async()=>{try{await commit('hole.select',{holeId:$('activeHole').value});scoreHoleId=state.activeHoleId;render();}catch{renderMachine();}});
$('roundPicker').addEventListener('change',async()=>{try{await commit('round.select',{roundId:$('roundPicker').value});scoreHoleId=state.activeHoleId;render();}catch{render();}});
$('scoreHole').addEventListener('change',()=>{scoreHoleId=$('scoreHole').value;renderScores();});
for(const [id,offset] of [['previousScoreHole',-1],['nextScoreHole',1]])$(id).addEventListener('click',()=>{const selected=selectedScore();scoreHoleId=activeRound(state).holes[selected.number-1+offset].id;renderScores();});
$('newNightButton').addEventListener('click',()=>navigate('new-round'));
$('confirmNight').addEventListener('click',async()=>{if(busyAction)return;busyAction=true;$('confirmNight').disabled=true;try{await commit('round.start',{holeCount:Number($('newRoundHoles').value)});scoreHoleId=state.activeHoleId;announce('New round ready.');back();}catch{}finally{busyAction=false;$('confirmNight').disabled=false;render();}});
$('exportButton').addEventListener('click',()=>{let content;try{content=blocked?(repo?.raw()??'No readable stored data'):JSON.stringify({format:'disc-roller-backup',exportedAt:new Date().toISOString(),state},null,2);}catch{notice('Browser storage could not be read for export.');return;}const url=URL.createObjectURL(new Blob([content],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='disc-roller-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
function connection(){$('connectionStatus').textContent=navigator.onLine?'LOCAL':'OFFLINE';}window.addEventListener('online',connection);window.addEventListener('offline',connection);
window.addEventListener('storage',event=>{if(event.key!==STORAGE_KEY)return;stopTimer();blocked=true;notice('This round changed in another tab. Reload to continue with the latest scores.');render();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(rolling||settling)){stopTimer();renderMachine();}});
window.addEventListener('pagehide',stopTimer);
$('checkUpdate').addEventListener('click',()=>checkUpdate(true));
for(const id of ['splashUpdate','applyUpdate'])$(id).addEventListener('click',applyUpdate);
window.addEventListener('online',()=>checkUpdate(true));
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkUpdate(true);});
if(!history.state?.rollerUI){const requested=location.hash.slice(1);const view=views.has(requested)?requested:'start';history.replaceState({rollerUI:true,base:dialogs[view]?'play':view,depth:0},'','#'+view);}
render();connection();syncView();
if('serviceWorker' in navigator){
 navigator.serviceWorker.addEventListener('controllerchange',()=>{checkUpdate();});
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(registration=>{
  updateRegistration=registration;
  const watch=()=>{const worker=registration.installing;if(worker)worker.addEventListener('statechange',()=>{if(worker.state==='activated')checkUpdate();});};
  registration.addEventListener('updatefound',watch);watch();
  navigator.serviceWorker.ready.then(()=>{$('offlineStatus').textContent='Ready for offline play';checkUpdate();});
  checkUpdate();
 }).catch(()=>{$('offlineStatus').textContent='Offline setup unavailable · keep this tab open';checkUpdate();});
}else{$('offlineStatus').textContent='Offline setup unavailable in this browser';checkUpdate();}
