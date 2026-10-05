import {STORAGE_KEY,LocalRepository,freshState,applyCommand,activeRound,strokeSummary,poolFor,normalizeIndex,levelName,wildcardOptions,teeOrder,remainingPlayers,PLAYER_COLORS} from './model.js';
import {spinPlan,spinPosition,centeredIndex,SETTLE_DURATION,canQuickStop} from './reel-motion.js';
import {BUILD_ID} from './release.js';
import './theme.js';
import {createScoreUI} from './score-ui.js';
const $=id=>document.getElementById(id);
const dialogs={scores:'scoresDialog',players:'playersDialog',help:'helpDialog','new-round':'newNightDialog',scorecard:'scorecardDialog',par:'parDialog'};
const views=new Set(['start','play',...Object.keys(dialogs)]);
let repo,state,blocked=false,rolling=false,index=0,timer=null,saveQueue=Promise.resolve(),busyAction=false;
let settleTimer=null,settling=false,motionGeneration=0,spinOrdinal=0,paintedPosition=0,lastReducedPaint=0;
let spinAnchor=0,spinOffset=0,windowWasOpen=false;
const spinElapsed=()=>Math.max(spinOffset+performance.now()-spinAnchor,Date.now()-(state.draft?.spin?.startedAt??Date.now()));
function renderSpinAction(){
 const d=state.draft;const quick=rolling&&canQuickStop(spinElapsed());
 $('mainAction').hidden=!!d?.wildcard;$('mainAction').disabled=blocked||busyAction||settling||(rolling&&!quick);
 $('mainAction').classList.toggle('is-rolling',quick);
 const next=remainingPlayers(activeRound(state),state.activeHoleId)[0];const nextName=state.players.find(p=>p.id===next)?.name;
 $('actionLabel').textContent=settling?'LOCKED':rolling?(quick?'QUICK STOP':'LET IT SPIN'):d?.stage==='complete'?(activeRound(state).playerIds.length?(next?'PASS TO '+nextName:'SCORE HOLE'):'BEGIN DISC'):d?.spin?'RESUME '+d.stage.toUpperCase():'BEGIN '+(d?.stage??'disc').toUpperCase();
 $('mainAction').setAttribute('aria-label',rolling?(quick?'Quick stop: catch it now':'Quick stop closed. Reel will stop automatically.'):$('actionLabel').textContent);
 $('actionIcon').textContent=settling?'✓':rolling?'◆':'▶';
 if(rolling&&!quick&&windowWasOpen)announce('Quick stop closed. Let it spin.');windowWasOpen=quick;
}
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
let currentView='start',baseView='start',scoreHoleId=null,lastMessage='',navigatingBack=false;
const focusReturns=new Map();
let updateRegistration=null,updateAvailable=false,updateReady=false,checkingUpdate=false,queuedUpdateCheck=false,updateMessage='Updates keep your saved scores.';
let updateRetry=null,updateRetryCount=0;
function renderUpdate(){
 const unsafe=!!inProgress()||rolling||settling||busyAction;
 for(const id of ['splashUpdate','applyUpdate']){$(id).hidden=!updateAvailable;$(id).disabled=!updateReady||unsafe;}
 $('openHelp').classList.toggle('has-update',updateAvailable);
 $('updateStatus').textContent=updateAvailable?(unsafe?'Update available. Finish the current challenge, then reload here.':updateReady?'Update ready. Reload to use it; your saved scores stay on this device.':'Downloading update. Keep this tab open.'):updateMessage;
 $('checkUpdate').disabled=checkingUpdate;
}
async function checkUpdate(manual=false){
 if(checkingUpdate){queuedUpdateCheck=true;return;}checkingUpdate=true;renderUpdate();
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
 finally{
  checkingUpdate=false;renderUpdate();clearTimeout(updateRetry);
  if(!updateAvailable||updateReady)updateRetryCount=0;
  // Activation and routing can settle after controllerchange. Recheck a known
  // pending release a few times; never reload an open game automatically.
  if(updateAvailable&&!updateReady&&navigator.onLine&&updateRetryCount<5)updateRetry=setTimeout(()=>{updateRetryCount++;checkUpdate(true);},1500);
  if(queuedUpdateCheck){queuedUpdateCheck=false;queueMicrotask(()=>checkUpdate());}
 }
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
  const write=()=>{let next;try{next=applyCommand(state,type,payload);}catch(error){error.commandValidation=true;throw error;}repo.save(next,state.revision);state=next;return next;};
  try{const next=navigator.locks?await navigator.locks.request('disc-roller-write',write):write();$('saveStatus').textContent='Saved on this device · '+new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});return next;}
  catch(error){stopTimer();notice(error.commandValidation||error.message.includes('another tab')?error.message:'Could not save this change. Previous saved data is intact. Export a backup, check storage, then reload.');$('saveStatus').textContent='Change not saved';throw error;}
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
 const previous=currentView;const requested=location.hash.slice(1)==='hole-entry'?'scores':location.hash.slice(1);currentView=views.has(requested)?requested:'start';
 baseView=dialogs[currentView]?(history.state?.rollerUI?history.state.base:'play'):currentView;
 if(currentView!=='play')stopTimer();
 for(const [view,id] of Object.entries(dialogs))if(view!==currentView&&$(id).open)$(id).close();
 $('splashScreen').hidden=baseView!=='start';$('rollerScreen').hidden=baseView!=='play';
 renderMachine();
 const dialog=dialogs[currentView]?$(dialogs[currentView]):null;
 if(dialog&&!dialog.open){dialog.showModal();dialog.scrollTop=0;dialog.querySelector('.close-button').focus({preventScroll:true});}
 if(!dialog&&previous!==currentView){const target=dialogs[previous]&&focusReturns.get(previous)?$(focusReturns.get(previous)):currentView==='play'?$('mainAction'):$('startButton');(target&&target.getClientRects().length&&!target.disabled?target:currentView==='play'?$('mainAction'):$('startButton')).focus({preventScroll:true});}
 if(currentView==='scores'&&previous!==currentView){scoreHoleId=history.state?.scoreHoleId||scoreHoleId;scoreUI.enter({preserve:previous==='par'});}if(previous==='scores'&&currentView!=='scores')scoreUI.leave();notice(lastMessage);window.scrollTo(0,0);
}
function navigate(view,{replace=false}={}){
 if(currentView===view)return;
 if(dialogs[view]){focusReturns.set(view,document.activeElement?.id||null);render();}
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
for(const [id,view] of [['openScores','scores'],['openPlayers','players'],['playerContext','players'],['openHelp','help']])$(id).addEventListener('click',()=>{if(view==='scores')scoreHoleId=state.activeHoleId;navigate(view);});

function renderMachine(){
 renderUpdate();
 const d=state.draft;const current=activePlayer();const round=activeRound(state);const busy=!!inProgress();
 $('currentPlayerLabel').textContent=current?.name??'Free play';
 $('playerContext').style.setProperty('--player-color',current?PLAYER_COLORS[current.colorIndex]:'#74a9e4');$('playerBadge').textContent=current?String(current.colorIndex+1).padStart(2,'0'):'●';
 const order=teeOrder(round,state.activeHoleId).order;const rank=current?order.indexOf(current.id)+1:0;
 $('turnHint').textContent=current?(d?.stage==='complete'?'Challenge ready · pass the phone':rank+' of '+order.length+' · Up now'):'No roster needed';
 $('playerContext').setAttribute('aria-label',(current?current.name+' is up. ':'Free play. ')+'Choose player and hole');$('playerPrompt').textContent=current?current.name+', begin your disc spin.':'Begin your disc spin.';$('currentPlayerLabel').title=current?.name??'Free play';$('holeLabel').textContent=current?'Hole '+hole().number:levelName(state.preferences.experience).toLowerCase();
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
 const round=activeRound(state);const players=teeOrder(round,state.activeHoleId).order.map(id=>state.players.find(p=>p.id===id));$('emptyPlayers').hidden=players.length>0;
 $('playerList').replaceChildren(...players.map((p,i)=>{const button=document.createElement('button');button.style.setProperty('--player-color',PLAYER_COLORS[p.colorIndex]);button.className='player-row'+(p.id===state.activePlayerId?' selected':'');button.type='button';button.setAttribute('aria-pressed',String(p.id===state.activePlayerId));button.disabled=!!inProgress()||blocked||busyAction;const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=String(p.colorIndex+1).padStart(2,'0');avatar.setAttribute('aria-hidden','true');const info=document.createElement('span');info.className='player-info';const name=document.createElement('span');name.className='player-name';name.textContent=p.name;const meta=document.createElement('span');meta.className='player-meta';const summary=strokeSummary(round,p.id);meta.textContent=summary.played?`${summary.total} strokes · ${summary.played}/${summary.holes} holes`:'Ready to play';info.append(name,meta);button.append(avatar,info);if(p.id===state.activePlayerId){const turn=document.createElement('span');turn.className='player-turn';turn.textContent='UP';button.append(turn);}button.addEventListener('click',async()=>{try{await commit('player.select',{playerId:p.id});render();back();}catch{}});return button;}));
 $('playerName').disabled=!!inProgress()||blocked||busyAction;$('playerForm').querySelector('button').disabled=!!inProgress()||blocked||busyAction;
}
const scoreUI=createScoreUI({getState:()=>state,getHole:()=>scoreHoleId,setHole:id=>{scoreHoleId=id;if(currentView==='scores'||currentView==='par')history.replaceState({...history.state,scoreHoleId:id},'');},commit,navigate,back,notice,announce,isBlocked:()=>blocked,advance:async()=>{if(busyAction)return;busyAction=true;try{await commit('hole.advance');scoreHoleId=state.activeHoleId;notice('');render();navigate('play');announce((activePlayer()?.name??'Free play')+' is up on hole '+hole().number);}catch{}finally{busyAction=false;render();}}});
function renderScores(){scoreUI.render();}
function renderHistory(){const round=activeRound(state);const entries=round.challenges.slice().reverse();$('historyEmpty').hidden=!!entries.length;$('historyList').replaceChildren(...entries.slice(0,30).map(entry=>{const li=document.createElement('li');li.className='history-item';const who=document.createElement('span');who.className='history-person';who.textContent=state.players.find(p=>p.id===entry.playerId)?.name??'Free play';const detail=document.createElement('small');detail.textContent='Hole '+round.holes.find(h=>h.id===entry.holeId).number+' · '+levelName(entry.experience).toLowerCase();who.append(detail);const chips=document.createElement('span');chips.className='history-challenge';for(const value of [entry.disc,entry.stability,entry.shot]){const chip=document.createElement('span');chip.className='challenge-chip';chip.textContent=value;chips.append(chip);}li.append(who,chips);return li;}));}
function render(){renderMachine();renderPlayers();renderScores();renderHistory();$('roundPicker').replaceChildren(...state.rounds.map((r,i)=>option(r.id,'Round '+(i+1)+' · '+r.holes.length+' holes')));$('roundPicker').value=state.activeRoundId;$('roundPicker').disabled=!!inProgress()||blocked||busyAction;}
async function choose(value){if(!inProgress()||busyAction||blocked)return;stopTimer();busyAction=true;renderMachine();try{await commit('challenge.choose',{value});index=0;const d=state.draft;if(d.stage==='complete'){announce(`Challenge locked: ${d.disc}, ${d.stability}, ${d.shot}.`);$('gameDisplay').classList.add('celebrate');setTimeout(()=>$('gameDisplay').classList.remove('celebrate'),550);}else announce(d.wildcard?'Wild card. Choose your '+d.stage+'.':value+' locked. Begin '+d.stage+' when ready.');}catch{}finally{busyAction=false;render();if(currentView==='play')(state.draft?.wildcard?$('wildOptions').querySelector('button'):$('mainAction'))?.focus({preventScroll:true});}}
$('mainAction').addEventListener('click',async()=>{if(blocked||busyAction||settling)return;if(rolling){finishSpin();return;}if(state.draft?.stage==='complete'&&activeRound(state).playerIds.length){const next=remainingPlayers(activeRound(state),state.activeHoleId)[0];if(next){busyAction=true;try{await commit('turn.next');notice('');announce(activePlayer().name+' is up.');}catch{}finally{busyAction=false;render();}}else{scoreHoleId=state.activeHoleId;navigate('scores');}return;}if(inProgress()){busyAction=true;try{await startTimer();}catch{}finally{busyAction=false;renderMachine();}return;}busyAction=true;renderMachine();try{await commit('challenge.start');index=0;await startTimer();announce('Disc reel started. Quick stop is available for the first third.');}catch{}finally{busyAction=false;render();}});
$('difficulty').addEventListener('input',()=>{$('difficultyName').textContent=levelName(Number($('difficulty').value));});
$('difficulty').addEventListener('change',async()=>{const experience=Number($('difficulty').value);stopTimer();busyAction=true;try{await commit('difficulty.set',{experience});if(inProgress()&&!state.draft.wildcard)index=normalizeIndex(index,poolFor(state.draft.stage,experience).length);}catch{}finally{busyAction=false;renderMachine();}});
$('playerForm').addEventListener('submit',async event=>{event.preventDefault();const name=$('playerName').value;$('playerError').hidden=true;try{applyCommand(state,'player.add',{name});await commit('player.add',{name});$('playerName').value='';render();$('playerName').focus();announce(name.trim()+' added.');}catch(error){$('playerError').textContent=error.message;$('playerError').hidden=false;}});
$('activeHole').addEventListener('change',async()=>{try{await commit('hole.select',{holeId:$('activeHole').value});scoreHoleId=state.activeHoleId;render();}catch{renderMachine();}});
$('roundPicker').addEventListener('change',async()=>{try{await commit('round.select',{roundId:$('roundPicker').value});scoreHoleId=state.activeHoleId;render();}catch{render();}});
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
