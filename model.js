// Serializable domain state. UI and storage are adapters, not scoring rules.
export const SCHEMA_VERSION = 1;
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
  if(![9,18].includes(holeCount))throw new Error('Choose a 9- or 18-hole round.');
  return {id:newId(),createdAt:now(),mode:{...STROKE_PLAY},playerIds:players.map(p=>p.id),holes:Array.from({length:holeCount},(_,i)=>({id:newId(),number:i+1,par:null})),scores:[],challenges:[]};
}
export function freshState(){
 const round=makeRound([]);
 return {schemaVersion:SCHEMA_VERSION,revision:0,deviceId:newId(),createdAt:now(),players:[],rounds:[round],activeRoundId:round.id,activePlayerId:null,activeHoleId:round.holes[0].id,preferences:{experience:50},draft:null,events:[]};
}
export const activeRound = state => state.rounds.find(r=>r.id===state.activeRoundId);
export function validateState(state){
 if(!state||state.schemaVersion!==SCHEMA_VERSION)throw new Error('This saved version cannot be opened by this app. Export a backup before using a different version.');
 if(!Number.isSafeInteger(state.revision)||state.revision<0||typeof state.deviceId!=='string'||!Array.isArray(state.players)||!Array.isArray(state.rounds)||!Array.isArray(state.events))throw new Error('Saved data is incomplete.');
 const ids=new Set();const register=id=>{if(typeof id!=='string'||!id||ids.has(id))throw new Error('Saved identifiers are invalid.');ids.add(id)};
 for(const player of state.players){register(player.id);if(typeof player.name!=='string'||!player.name.trim()||player.name.length>32)throw new Error('Saved player names are invalid.');}
 const players=new Set(state.players.map(p=>p.id));
 for(const round of state.rounds){
  register(round.id);if(round.mode?.id!=='stroke-play'||round.mode.version!==1||!Array.isArray(round.holes)||![9,18].includes(round.holes.length)||!Array.isArray(round.playerIds)||round.playerIds.some(id=>!players.has(id))||new Set(round.playerIds).size!==round.playerIds.length||!Array.isArray(round.scores)||!Array.isArray(round.challenges))throw new Error('Saved round is invalid.');
  const holes=new Set();round.holes.forEach((h,i)=>{register(h.id);holes.add(h.id);if(h.number!==i+1||h.par!==null)throw new Error('Saved holes are invalid.')});
  const scoreKeys=new Set();for(const score of round.scores){register(score.id);const key=score.playerId+score.holeId;if(scoreKeys.has(key)||!round.playerIds.includes(score.playerId)||!holes.has(score.holeId)||!Number.isInteger(score.strokes)||score.strokes<1||score.strokes>99)throw new Error('Saved scores are invalid.');scoreKeys.add(key)}
  for(const challenge of round.challenges){register(challenge.id);if((challenge.playerId!==null&&!round.playerIds.includes(challenge.playerId))||!holes.has(challenge.holeId)||!DISCS.slice(0,-1).includes(challenge.disc)||!wildcardOptions('stability').includes(challenge.stability)||!wildcardOptions('shot').includes(challenge.shot))throw new Error('Saved challenge is invalid.');}
 }
 const round=activeRound(state);if(!round||!round.holes.some(h=>h.id===state.activeHoleId)||(state.activePlayerId!==null&&!round.playerIds.includes(state.activePlayerId))||!Number.isInteger(state.preferences?.experience)||state.preferences.experience<0||state.preferences.experience>100)throw new Error('Saved selection is invalid.');
 if(state.draft){const d=state.draft;if(d.roundId!==round.id||d.playerId!==state.activePlayerId||d.holeId!==state.activeHoleId||!['disc','stability','shot','complete'].includes(d.stage)||typeof d.wildcard!=='boolean'||(d.disc!==null&&!wildcardOptions('disc').includes(d.disc))||(d.stability!==null&&!wildcardOptions('stability').includes(d.stability))||(d.shot!==null&&!wildcardOptions('shot').includes(d.shot))||(['stability','shot','complete'].includes(d.stage)&&!d.disc)||(['shot','complete'].includes(d.stage)&&!d.stability)||(d.stage==='complete'&&!d.shot))throw new Error('Saved challenge progress is invalid.');}
 return state;
}
export function strokeSummary(round,playerId){const scores=round.scores.filter(s=>s.playerId===playerId);return {total:scores.length?scores.reduce((n,s)=>n+s.strokes,0):null,played:scores.length,holes:round.holes.length,complete:scores.length===round.holes.length};}
// Commands and stable event IDs form a future synchronization boundary. No remote
// transport, authentication, conflict merging, or cross-phone guarantees exist yet.
export function applyCommand(input,type,payload={}){
 const state=structuredClone(input);const round=activeRound(state);const time=now();
 switch(type){
 case 'player.add':{
  const name=String(payload.name??'').trim();if(!name||name.length>32)throw new Error('Use a player name between 1 and 32 characters.');
  if(state.players.length>=24)throw new Error('This preview supports up to 24 players.');
  if(state.players.some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()))throw new Error('That player is already on the card. Add an initial to distinguish names.');
  const player={id:newId(),name,createdAt:time};state.players.push(player);round.playerIds.push(player.id);if(!state.activePlayerId&&!state.draft)state.activePlayerId=player.id;break;
 }
 case 'player.select':if(state.draft&&state.draft.stage!=='complete')throw new Error('Finish this challenge before switching players.');if(!round.playerIds.includes(payload.playerId))throw new Error('Player not found.');state.activePlayerId=payload.playerId;state.draft=null;break;
 case 'hole.select':if(state.draft&&state.draft.stage!=='complete')throw new Error('Finish this challenge before switching holes.');if(!round.holes.some(h=>h.id===payload.holeId))throw new Error('Hole not found.');state.activeHoleId=payload.holeId;state.draft=null;break;
 case 'difficulty.set':if(!Number.isInteger(payload.experience)||payload.experience<0||payload.experience>100)throw new Error('Invalid difficulty.');state.preferences.experience=payload.experience;break;
 case 'challenge.start':if(state.draft&&state.draft.stage!=='complete')throw new Error('A challenge is already in progress.');state.draft={id:newId(),roundId:round.id,playerId:state.activePlayerId,holeId:state.activeHoleId,stage:'disc',wildcard:false,disc:null,stability:null,shot:null,startedAt:time};break;
 case 'challenge.choose':{
  const d=state.draft;if(!d||d.stage==='complete')throw new Error('No active reel.');
  const options=d.wildcard?wildcardOptions(d.stage):poolFor(d.stage,state.preferences.experience);if(!options.includes(payload.value))throw new Error('That option is not available.');
  if(payload.value==='WILDCARD'){d.wildcard=true;break;}
  d[d.stage]=payload.value;d.wildcard=false;
  if(d.stage==='disc')d.stage='stability';else if(d.stage==='stability')d.stage='shot';else {d.stage='complete';round.challenges.push({id:d.id,playerId:d.playerId,holeId:d.holeId,disc:d.disc,stability:d.stability,shot:d.shot,experience:state.preferences.experience,createdAt:time});}
  break;
 }
 case 'score.set':{
  if(!round.playerIds.includes(payload.playerId)||!round.holes.some(h=>h.id===payload.holeId))throw new Error('Score does not belong to this round.');
  const {strokes}=payload;if(strokes!==null&&(!Number.isInteger(strokes)||strokes<1||strokes>99))throw new Error('Enter whole strokes from 1 to 99, or leave the hole blank.');
  const existing=round.scores.find(s=>s.playerId===payload.playerId&&s.holeId===payload.holeId);
  if(strokes===null)round.scores=round.scores.filter(s=>s!==existing);else if(existing){existing.strokes=strokes;existing.updatedAt=time;}else round.scores.push({id:newId(),playerId:payload.playerId,holeId:payload.holeId,strokes,updatedAt:time});break;
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
 save(state,expectedRevision){const raw=this.storage.getItem(STORAGE_KEY);const existing=raw===null?null:validateState(JSON.parse(raw));if((existing?.revision??0)!==expectedRevision)throw new Error('This round changed in another tab. Reload to see the latest scores before continuing.');this.storage.setItem(STORAGE_KEY,JSON.stringify(validateState(state)));}
 raw(){return this.storage.getItem(STORAGE_KEY);}
}
