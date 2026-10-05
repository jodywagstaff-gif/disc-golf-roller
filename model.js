// Serializable domain state. UI and storage are adapters, not scoring rules.
import {QUICK_STOP_DURATION} from './reel-motion.js';
export const SCHEMA_VERSION = 2;
export const PLAYER_COLORS=['#df795b','#43b8a4','#b495e5','#e0b752','#74a9e4','#de88b7','#8fbd62','#e09851','#70bbc5','#bca087','#8396df','#bcb953','#b97dcc','#5fb787','#d8938b','#8eb1c0','#d9a8cb','#a8be8f','#e2ba8e','#8d9ab9','#b7a8db','#a8c66e','#d28599','#64a2b2'];
export function migrateState(input){
 if(input?.schemaVersion!==1)return input;
 const state=structuredClone(input);state.schemaVersion=2;
 state.players?.forEach((p,i)=>{p.colorIndex=i;});
 state.rounds?.forEach(r=>{r.holes?.forEach(h=>{if(h.par===null)h.par=3;});r.teeOrders={};});
 return state;
}
export function playersForHole(round,holeId){const target=round.holes.findIndex(h=>h.id===holeId);return round.playerIds.filter(id=>{const start=round.playerStarts?.[id];return !start||round.holes.findIndex(h=>h.id===start)<=target;});}
export function teeOrder(round,holeId){
 let order=[];const target=round.holes.findIndex(h=>h.id===holeId);if(target<0)throw new Error('Hole not found.');
 for(let i=0;i<=target;i++){
  const h=round.holes[i],eligible=playersForHole(round,h.id),saved=round.teeOrders?.[h.id];
  if(saved){order=[...saved.filter(id=>eligible.includes(id)),...eligible.filter(id=>!saved.includes(id))];continue;}
  if(i>0){const previous=round.holes[i-1],scores=new Map(round.scores.filter(s=>s.holeId===previous.id).map(s=>[s.playerId,s.strokes]));if(order.some(id=>!scores.has(id)))return {order:[...order,...eligible.filter(id=>!order.includes(id))],ready:false,missingHole:previous.number};order=order.map((id,index)=>({id,index})).sort((a,b)=>scores.get(a.id)-scores.get(b.id)||a.index-b.index).map(p=>p.id);}
  order.push(...eligible.filter(id=>!order.includes(id)));
 }return {order,ready:true,missingHole:null};
}
export function remainingPlayers(round,holeId){return teeOrder(round,holeId).order.filter(id=>!round.challenges.some(c=>c.holeId===holeId&&c.playerId===id));}
export function scoreResult(strokes,par){if(strokes==null)return 'unplayed';if(strokes===1)return 'ace';const delta=strokes-par;return delta<-1?'under-par':delta===-1?'birdie':delta===0?'par':delta===1?'bogey':'double-bogey';}
export const STORAGE_KEY = 'disc-roller.league.v1';
export const STROKE_PLAY = Object.freeze({id:'stroke-play', version:1});
export const newId = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export const levelName = exp => exp <= 33 ? 'BEGINNER' : exp <= 66 ? 'INTERMEDIATE' : 'EXPERT';
export const DISCS = ['Driver','Fairway Driver','Midrange','Putter','WILDCARD'];
export function stabilities(exp) { return exp <= 66 ? ['Understable','Neutral','Stable','WILDCARD'] : ['Super Stable','Stable','Neutral','Understable','Super Understable','WILDCARD']; }
export function shots(exp) {
  const basic=['Backhand','Forehand','Overhand'];
  if(exp<=33)return [...basic,...basic,...basic,'Roller','WILDCARD'];
  if(exp<=66)return [...basic,...basic,'Hyzer','Anhyzer','WILDCARD'];
  return [...basic,'Roller','Skip Shot','Hyzer','Anhyzer','Offhand','WILDCARD'];
}
export const wildcardOptions = stage => stage==='disc'?DISCS.slice(0,-1):stage==='stability'?['Super Stable','Stable','Neutral','Understable','Super Understable']:['Backhand','Forehand','Overhand','Roller','Skip Shot','Hyzer','Anhyzer','Offhand'];
export const poolFor = (stage,exp) => stage==='disc'?DISCS:stage==='stability'?stabilities(exp):shots(exp);
export const normalizeIndex = (index,length) => ((index%length)+length)%length;
export function makeRound(players,holeCount=9) {
  if(!Number.isInteger(holeCount)||holeCount<1||holeCount>72)throw new Error('Choose a whole number of holes from 1 to 72.');
 return {id:newId(),createdAt:now(),mode:{...STROKE_PLAY},playerIds:players.map(p=>p.id),holes:Array.from({length:holeCount},(_,i)=>({id:newId(),number:i+1,par:3})),teeOrders:{},scores:[],challenges:[]};
}
export function freshState(){
 const round=makeRound([]);
 return {schemaVersion:SCHEMA_VERSION,revision:0,deviceId:newId(),createdAt:now(),players:[],rounds:[round],activeRoundId:round.id,activePlayerId:null,activeHoleId:round.holes[0].id,preferences:{experience:50},draft:null,events:[]};
}
export const activeRound = state => state.rounds.find(r=>r.id===state.activeRoundId);
export function validateState(state){
 state=migrateState(state);
 if(!state||state.schemaVersion!==SCHEMA_VERSION)throw new Error('This saved version cannot be opened by this app. Export a backup before using a different version.');
 if(!Number.isSafeInteger(state.revision)||state.revision<0||typeof state.deviceId!=='string'||!Array.isArray(state.players)||!Array.isArray(state.rounds)||!Array.isArray(state.events))throw new Error('Saved data is incomplete.');
 const ids=new Set();const register=id=>{if(typeof id!=='string'||!id||ids.has(id))throw new Error('Saved identifiers are invalid.');ids.add(id)};
 if(state.players.some(p=>!Number.isInteger(p.colorIndex)||p.colorIndex<0||p.colorIndex>=PLAYER_COLORS.length)||new Set(state.players.map(p=>p.colorIndex)).size!==state.players.length)throw new Error('Saved player colors are invalid.');
 for(const player of state.players){register(player.id);if(player.skillLevel!=null&&!['beginner','intermediate','advanced'].includes(player.skillLevel))throw new Error('Saved skill level is invalid.');if(typeof player.name!=='string'||!player.name.trim()||player.name.length>32)throw new Error('Saved player names are invalid.');}
 const players=new Set(state.players.map(p=>p.id));
 for(const round of state.rounds){
  register(round.id);if(round.mode?.id!=='stroke-play'||round.mode.version!==1||!Array.isArray(round.holes)||round.holes.length<1||round.holes.length>72||!Array.isArray(round.playerIds)||round.playerIds.some(id=>!players.has(id))||new Set(round.playerIds).size!==round.playerIds.length||!Array.isArray(round.scores)||!Array.isArray(round.challenges))throw new Error('Saved round is invalid.');
  const holes=new Set();round.holes.forEach((h,i)=>{register(h.id);holes.add(h.id);if(h.number!==i+1||!Number.isInteger(h.par)||h.par<2||h.par>9)throw new Error('Saved holes are invalid.')});
  if(!round.teeOrders||typeof round.teeOrders!=='object'||Array.isArray(round.teeOrders)||Object.entries(round.teeOrders).some(([holeId,order])=>!holes.has(holeId)||!Array.isArray(order)||new Set(order).size!==order.length||order.some(id=>!round.playerIds.includes(id))))throw new Error('Saved tee order is invalid.');
  if(round.aceCelebrations!==undefined&&(!Array.isArray(round.aceCelebrations)||round.aceCelebrations.some(a=>!holes.has(a.holeId)||!round.playerIds.includes(a.playerId))))throw new Error('Saved ace celebrations are invalid.');
  if(round.playerStarts!==undefined&&(!round.playerStarts||typeof round.playerStarts!=='object'||Array.isArray(round.playerStarts)||Object.entries(round.playerStarts).some(([id,hole])=>!round.playerIds.includes(id)||!holes.has(hole))))throw new Error('Saved player start is invalid.');
  const scoreKeys=new Set();for(const score of round.scores){register(score.id);const key=score.playerId+score.holeId;if(scoreKeys.has(key)||!round.playerIds.includes(score.playerId)||!holes.has(score.holeId)||!Number.isInteger(score.strokes)||score.strokes<1||score.strokes>99)throw new Error('Saved scores are invalid.');scoreKeys.add(key)}
  for(const challenge of round.challenges){register(challenge.id);if((challenge.playerId!==null&&!round.playerIds.includes(challenge.playerId))||!holes.has(challenge.holeId)||!DISCS.slice(0,-1).includes(challenge.disc)||!wildcardOptions('stability').includes(challenge.stability)||!wildcardOptions('shot').includes(challenge.shot))throw new Error('Saved challenge is invalid.');}
 }
 const round=activeRound(state);if(!round||!round.holes.some(h=>h.id===state.activeHoleId)||(state.activePlayerId!==null&&!round.playerIds.includes(state.activePlayerId))||!Number.isInteger(state.preferences?.experience)||state.preferences.experience<0||state.preferences.experience>100)throw new Error('Saved selection is invalid.');
 if(state.draft){const d=state.draft;if(d.roundId!==round.id||d.playerId!==state.activePlayerId||d.holeId!==state.activeHoleId||!['disc','stability','shot','complete'].includes(d.stage)||typeof d.wildcard!=='boolean'||(d.disc!==null&&!wildcardOptions('disc').includes(d.disc))||(d.stability!==null&&!wildcardOptions('stability').includes(d.stability))||(d.shot!==null&&!wildcardOptions('shot').includes(d.shot))||(['stability','shot','complete'].includes(d.stage)&&!d.disc)||(['shot','complete'].includes(d.stage)&&!d.stability)||(d.stage==='complete'&&!d.shot))throw new Error('Saved challenge progress is invalid.');}
 if(state.draft?.spin){const s=state.draft.spin;if(!Number.isFinite(s.startedAt)||!Number.isInteger(s.start)||s.start<0||!Number.isInteger(s.ordinal)||s.ordinal<0)throw new Error('Saved spin is invalid.');}
 return state;
}
export function strokeSummary(round,playerId){const scores=round.scores.filter(s=>s.playerId===playerId);const eligible=round.holes.filter(h=>playersForHole(round,h.id).includes(playerId)).length;return {toPar:scores.length?scores.reduce((n,s)=>n+s.strokes-round.holes.find(h=>h.id===s.holeId).par,0):null,total:scores.length?scores.reduce((n,s)=>n+s.strokes,0):null,played:scores.length,holes:eligible,complete:scores.length===eligible&&eligible>0};}
// Commands and stable event IDs form a future synchronization boundary. No remote
// transport, authentication, conflict merging, or cross-phone guarantees exist yet.
export function applyCommand(input,type,payload={}){
 const state=structuredClone(migrateState(input));const round=activeRound(state);const time=now();
 switch(type){
 case 'player.add':{
  const name=String(payload.name??'').trim();if(!name||name.length>32)throw new Error('Use a player name between 1 and 32 characters.');
  if(state.players.length>=24)throw new Error('This preview supports up to 24 players.');
  if(state.players.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('That player is already on the card. Add an initial to distinguish names.');
  const colorIndex=payload.colorIndex??PLAYER_COLORS.findIndex((_,i)=>!state.players.some(p=>p.colorIndex===i));if(!Number.isInteger(colorIndex)||colorIndex<0||colorIndex>=PLAYER_COLORS.length||state.players.some(p=>p.colorIndex===colorIndex))throw new Error('Choose an unused player color.');const skillLevel=payload.skillLevel??null;if(![null,'beginner','intermediate','advanced'].includes(skillLevel))throw new Error('Choose a valid skill level.');const player={id:newId(),name,colorIndex,skillLevel,createdAt:time};state.players.push(player);round.playerIds.push(player.id);round.playerStarts??={};round.playerStarts[player.id]=state.activeHoleId;if(!state.activePlayerId&&!state.draft)state.activePlayerId=player.id;break;
 }
 case 'player.select':if(state.draft&&state.draft.stage!=='complete')throw new Error('Finish this challenge before switching players.');if(!round.playerIds.includes(payload.playerId))throw new Error('Player not found.');state.activePlayerId=payload.playerId;state.draft=null;break;
 case 'hole.select':{
  if(state.draft&&state.draft.stage!=='complete')throw new Error('Finish this challenge before switching holes.');
  const honors=teeOrder(round,payload.holeId);if(!honors.ready)throw new Error('Enter every score for hole '+honors.missingHole+' before starting this hole.');
  state.activeHoleId=payload.holeId;state.activePlayerId=honors.order[0]??null;state.draft=null;break;
 }
 case 'turn.next':{
  if(state.draft&&state.draft.stage!=='complete')throw new Error('Finish this challenge before passing the phone.');
  const next=remainingPlayers(round,state.activeHoleId)[0];if(!next)throw new Error('Everyone is ready. Enter this hole’s scores.');state.activePlayerId=next;state.draft=null;break;
 }
  case 'hole.advance':{
  if(state.draft&&state.draft.stage!=='complete')throw new Error('Finish this challenge before moving to the next hole.');
  const index=round.holes.findIndex(h=>h.id===state.activeHoleId);const next=round.holes[index+1];if(!next)throw new Error('This is the last hole.');
  const honors=teeOrder(round,next.id);if(!honors.ready)throw new Error('Enter every score for hole '+honors.missingHole+' to set the next tee order.');
  round.teeOrders[next.id]=honors.order;state.activeHoleId=next.id;state.activePlayerId=honors.order[0]??null;state.draft=null;break;
 }
 case 'par.set':{
  const target=round.holes.find(h=>h.id===payload.holeId);if(!target||!Number.isInteger(payload.par)||payload.par<2||payload.par>9)throw new Error('Choose a par from 2 to 9.');target.par=payload.par;break;
 }
 case 'difficulty.set':if(!Number.isInteger(payload.experience)||payload.experience<0||payload.experience>100)throw new Error('Invalid difficulty.');state.preferences.experience=payload.experience;break;
 case 'challenge.start':{
  if(state.draft&&state.draft.stage!=='complete')throw new Error('A challenge is already in progress.');
  const honors=teeOrder(round,state.activeHoleId);if(!honors.ready)throw new Error('Enter every score for hole '+honors.missingHole+' first.');round.teeOrders[state.activeHoleId]??=honors.order;
  state.draft={id:newId(),roundId:round.id,playerId:state.activePlayerId,holeId:state.activeHoleId,stage:'disc',wildcard:false,disc:null,stability:null,shot:null,spin:null,startedAt:time};break;
 }
 case 'challenge.spin':{
  const d=state.draft;if(!d||d.stage==='complete'||d.wildcard||d.spin)throw new Error('Cannot restart this spin.');
  if(!Number.isInteger(payload.start)||payload.start<0||!Number.isInteger(payload.ordinal)||payload.ordinal<0)throw new Error('Invalid spin.');
  // Older unfinished drafts have no clock: resume with Quick Stop already closed.
  d.spin={startedAt:Date.parse(time)-(Object.hasOwn(d,'spin')?0:QUICK_STOP_DURATION),start:payload.start,ordinal:payload.ordinal};break;
 }
 case 'challenge.choose':{
  const d=state.draft;if(!d||d.stage==='complete')throw new Error('No active reel.');
  const options=d.wildcard?wildcardOptions(d.stage):poolFor(d.stage,state.preferences.experience);if(!options.includes(payload.value))throw new Error('That option is not available.');
  if(payload.value==='WILDCARD'){d.wildcard=true;break;}
  d[d.stage]=payload.value;d.wildcard=false;d.spin=null;
  if(d.stage==='disc')d.stage='stability';else if(d.stage==='stability')d.stage='shot';else {d.stage='complete';round.challenges.push({id:d.id,playerId:d.playerId,holeId:d.holeId,disc:d.disc,stability:d.stability,shot:d.shot,experience:state.preferences.experience,createdAt:time});}
  break;
 }
 case 'score.set':case 'score.hole.set':{
   if(payload.roundId&&payload.roundId!==round.id)throw new Error('Round changed before this score was saved.');
  const entries=type==='score.set'?[payload]:payload.scores?.map(s=>({...s,holeId:payload.holeId}));
  if(!Array.isArray(entries)||new Set(entries.map(s=>s.playerId)).size!==entries.length)throw new Error('Invalid score entries.');
  for(const entry of entries){
   if(!round.playerIds.includes(entry.playerId)||!round.holes.some(h=>h.id===entry.holeId))throw new Error('Score does not belong to this round.');
   const {strokes}=entry;if(strokes!==null&&(!Number.isInteger(strokes)||strokes<1||strokes>99))throw new Error('Enter whole strokes from 1 to 99, or leave the hole blank.');
   const existing=round.scores.find(s=>s.playerId===entry.playerId&&s.holeId===entry.holeId);
   if(strokes===null)round.scores=round.scores.filter(s=>s!==existing);else if(existing){existing.strokes=strokes;existing.updatedAt=time;}else round.scores.push({id:newId(),playerId:entry.playerId,holeId:entry.holeId,strokes,updatedAt:time});
   }
   if(!state.draft&&!round.teeOrders[state.activeHoleId]){const honors=teeOrder(round,state.activeHoleId);if(honors.ready)state.activePlayerId=honors.order[0]??null;}
   break;
  }
  case 'hole.proceed':{
   if(state.draft&&state.draft.stage!=='complete')throw new Error('Finish this challenge before moving to the next hole.');
   const index=round.holes.findIndex(h=>h.id===payload.holeId),next=round.holes[index+1];
   if(index<0||!next)throw new Error('This is the last hole.');
   const honors=teeOrder(round,next.id);if(!honors.ready)throw new Error('Enter every score for hole '+honors.missingHole+' before the next hole.');
   if(playersForHole(round,payload.holeId).some(id=>!round.scores.some(s=>s.holeId===payload.holeId&&s.playerId===id)))throw new Error('Enter every score for this hole before the next hole.');
   round.aceCelebrations??=[];
   for(const s of round.scores.filter(s=>s.holeId===payload.holeId&&s.strokes===1))if(!round.aceCelebrations.some(a=>a.holeId===s.holeId&&a.playerId===s.playerId))round.aceCelebrations.push({holeId:s.holeId,playerId:s.playerId});
   state.activeHoleId=next.id;state.activePlayerId=honors.order[0]??null;state.draft=null;break;
  }
  case 'round.resize':{
  const count=payload.holeCount;if(!Number.isInteger(count)||count<1||count>72)throw new Error('Choose a whole number of holes from 1 to 72.');
  const removed=round.holes.slice(count).map(h=>h.id);if(state.draft&&removed.includes(state.draft.holeId))throw new Error('This hole has a challenge. Keep it or start a new round.');
  const destructive=round.scores.some(s=>removed.includes(s.holeId))||round.challenges.some(c=>removed.includes(c.holeId));if(destructive&&!payload.confirmRemoval)throw new Error('Confirm removal of played holes before shortening this round.');
  if(count>round.holes.length)for(let i=round.holes.length;i<count;i++)round.holes.push({id:newId(),number:i+1,par:3});else round.holes=round.holes.slice(0,count);
  round.scores=round.scores.filter(s=>!removed.includes(s.holeId));round.challenges=round.challenges.filter(c=>!removed.includes(c.holeId));for(const id of removed)delete round.teeOrders[id];if(round.aceCelebrations)round.aceCelebrations=round.aceCelebrations.filter(a=>!removed.includes(a.holeId));for(const [id,hole] of Object.entries(round.playerStarts??{}))if(removed.includes(hole))round.playerStarts[id]=round.holes.at(-1).id;
  if(removed.includes(state.activeHoleId)){state.activeHoleId=round.holes.at(-1).id;state.activePlayerId=teeOrder(round,state.activeHoleId).order[0]??null;}break;
 }
 case 'round.start':{
  if(state.draft&&state.draft.stage!=='complete')throw new Error('Finish this challenge before starting a new round.');const next=makeRound(state.players,payload.holeCount);state.rounds.push(next);state.activeRoundId=next.id;state.activeHoleId=next.holes[0].id;state.activePlayerId=state.players[0]?.id??null;state.draft=null;break;
 }
 case 'round.select':{
  if(state.draft&&state.draft.stage!=='complete')throw new Error('Finish this challenge before switching rounds.');const next=state.rounds.find(r=>r.id===payload.roundId);if(!next)throw new Error('Round not found.');state.activeRoundId=next.id;state.activeHoleId=next.holes[0].id;state.activePlayerId=next.playerIds[0]??null;state.draft=null;break;
 }
 default:throw new Error('Unknown action.');
 }
 state.revision++;state.events.push({id:newId(),deviceId:state.deviceId,revision:state.revision,type,payload:structuredClone(payload),createdAt:time});
 return validateState(state);
}
export class LocalRepository {
 constructor(storage){this.storage=storage;}
 load(){const raw=this.storage.getItem(STORAGE_KEY);return raw===null?null:validateState(JSON.parse(raw));}
 save(state,expectedRevision){const raw=this.storage.getItem(STORAGE_KEY);const existing=raw===null?null:validateState(JSON.parse(raw));if((existing?.revision??0)!==expectedRevision)throw new Error('This round changed in another tab. Reload to see the latest scores before continuing.');const next=JSON.stringify(validateState(state));if(raw&&JSON.parse(raw).schemaVersion===1&&!this.storage.getItem(STORAGE_KEY+'.pre-v2'))this.storage.setItem(STORAGE_KEY+'.pre-v2',raw);this.storage.setItem(STORAGE_KEY,next);}
 raw(){return this.storage.getItem(STORAGE_KEY);}
}
