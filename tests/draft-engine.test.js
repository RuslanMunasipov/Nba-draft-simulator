import test from 'node:test';import assert from 'node:assert/strict';
import {newDraft,pick,rosterFits,clubsFit} from '../src/engine.js';
import {completionPlan,pickCompletion} from '../src/completion.js';
import {rookiesLeftAfter} from '../src/simulation.js';
const POS=['PG','SG','SF','PF','C'];
const byIds=(players,ids)=>ids.map(id=>players.find(p=>p.id===id));
// Team 0 holds two SF of club X; the cheapest rookie is an X PG (a third X player), a legal rookie of club Y costs more.
function fullClubCase({withLegalRookie=true}={}){
 const players=[
  {id:1,name:'X SF A',positions:['SF'],price:1000,priceStatus:'VERIFIED',sportsClub:'X'},
  {id:2,name:'X SF B',positions:['SF'],price:1000,priceStatus:'VERIFIED',sportsClub:'X'},
  {id:3,name:'X PG rookie',positions:['PG'],price:500,priceStatus:'VERIFIED',sportsClub:'X',isRookie:true},
  ...(withLegalRookie?[{id:4,name:'Y PG rookie',positions:['PG'],price:1500,priceStatus:'VERIFIED',sportsClub:'Y',isRookie:true}]:[]),
  ...['PG','PG','SG','SG','PF','PF','C','C'].map((pos,i)=>({id:10+i,name:'Filler '+i,positions:[pos],price:800,priceStatus:'VERIFIED',sportsClub:'K'+i})),
  ...Array.from({length:14},(_,i)=>({id:50+i,name:'Rival pick '+i,positions:[POS[i%5]],price:100,priceStatus:'VERIFIED',sportsClub:'R'+i})),
 ];
 let s=newDraft(players,20000,'ON');s=pick(s,1);for(let i=0;i<7;i++)s=pick(s,50+i);s=pick(s,2);for(let i=7;i<14;i++)s=pick(s,50+i);
 return {players,state:s};
}
test('a forced rookie never becomes the third player of a full club',()=>{
 const {players,state}=fullClubCase();
 const plan=completionPlan(state,0);
 assert.equal(plan.possible,true);
 // Legal minimum: X SF A + X SF B + Y rookie + the cheapest PG, SG, SG, PF, PF, C, C fillers = 2000 + 1500 + 7*800.
 assert.equal(plan.minimumCost,2000+1500+7*800);
 const roster=byIds(players,plan.playerIds);
 assert.ok(clubsFit(roster)&&rosterFits(roster)&&roster.some(p=>p.isRookie));
 assert.ok(!plan.playerIds.includes(3));
 // Between the illegal and the legal minimum the cap makes the roster impossible.
 assert.equal(completionPlan({...state,cap:2000+1500+7*800-1},0).possible,false);
 // Without the Y rookie no legal completion exists: the only rookie left would be a third X player.
 const {state:only}=fullClubCase({withLegalRookie:false});
 assert.equal(completionPlan(only,0).possible,false);
});
test('the pick gate refuses the second X player when the only rookie left is from club X',()=>{
 const {players}=fullClubCase({withLegalRookie:false});
 let s=newDraft(players,20000,'ON');s=pick(s,1);for(let i=0;i<7;i++)s=pick(s,50+i);
 const gate=pickCompletion(s,2);
 assert.equal(gate.possible,false);
});
test('bots do not count a third same-club rookie as usable',()=>{
 const {state}=fullClubCase();
 // Team 0 on the clock: after a cheap PF only the Y rookie remains usable (the X rookie would be a third X player).
 const s={...state,picks:state.picks.slice(0,16)};
 assert.equal(s.picks.length%8,0);
 assert.equal(rookiesLeftAfter(s,s.players.find(p=>p.id===14)),1);
});

// Independent oracle: every completion by enumeration, with positions (augmenting paths), clubs, rookie and the cap.
function combos(n,k,start=0,cur=[],out=[]){if(cur.length===k){out.push([...cur]);return out;}for(let i=start;i<=n-(k-cur.length);i++){cur.push(i);combos(n,k,i+1,cur,out);cur.pop();}return out;}
function oracle(players,fixedIds,taken,priced){
 const fixed=byIds(players,fixedIds),free=players.filter(p=>!fixedIds.includes(p.id)&&!taken.includes(p.id)&&(!priced||p.priceStatus==='VERIFIED'));
 let minimum=Infinity;
 for(const c of combos(free.length,10-fixed.length)){
  const roster=[...fixed,...c.map(i=>free[i])];
  if(roster.some(p=>p.isRookie===true)&&clubsFit(roster)&&rosterFits(roster))minimum=Math.min(minimum,priced?roster.reduce((s,p)=>s+p.price,0):0);
 }
 return minimum;
}
test('completion agrees with enumeration when 2-4 picks are fixed, with same-club pairs and a cheap rookie at their club',()=>{
 let checks=0;
 for(let seed=1;seed<=400;seed++){
  let n=seed*104729+11;const random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/2**32);
  const multi=seed%4===0,priced=seed%7!==0;
  const players=Array.from({length:15},(_,i)=>{
   let positions=multi&&random()<.5?POS.filter(()=>random()<.4):[POS[Math.floor(random()*5)]];if(!positions.length)positions=[POS[i%5]];
   return {id:i+1,name:'S'+i,positions,isRookie:i>=3&&random()<.15,price:50+Math.round(random()*10)*10,priceStatus:'VERIFIED',sportsClub:i<3?'X':random()<.9?'C'+Math.floor(random()*6):undefined};
  });
  // Two club-X players are fixed; a cheap X rookie tempts the solver into a third.
  players[2].isRookie=true;players[2].price=50;
  if(!rosterFits([players[0],players[1]]))continue;
  const fixed=[1,2];const extra=Math.floor(random()*3);
  for(const i of [3,4,5,6,7,8,9,10,11,12,13,14].sort(()=>random()-.5)){if(fixed.length>=2+extra)break;const r=byIds(players,[...fixed,i+1]);if(rosterFits(r)&&clubsFit(r))fixed.push(i+1);}
  // Rivals hold up to three other players; team 0's fixed picks are legal by construction (positions and clubs checked).
  const taken=players.filter(p=>p.id>3&&!fixed.includes(p.id)&&random()<.12).slice(0,3).map(p=>p.id);
  const state={...newDraft(players,20000,priced?'ON':'OFF'),picks:[...fixed.map(id=>({team:0,playerId:id})),...taken.map((id,k)=>({team:1+k,playerId:id}))].map((x,k)=>({number:k+1,...x}))};
  const minimum=oracle(players,fixed,taken,priced);
  for(const cap of priced&&Number.isFinite(minimum)?[20000,minimum,minimum-1]:[20000]){
   const plan=completionPlan({...state,cap},0);checks++;
   assert.equal(plan.possible,Number.isFinite(minimum)&&minimum<=cap,`seed ${seed} cap ${cap}`);
   if(Number.isFinite(minimum)&&priced)assert.equal(plan.minimumCost,minimum,`seed ${seed} cap ${cap}`);
   if(plan.possible){const roster=byIds(players,plan.playerIds);assert.ok(clubsFit(roster)&&rosterFits(roster)&&roster.some(p=>p.isRookie===true),`seed ${seed} witness`);for(const id of fixed)assert.ok(plan.playerIds.includes(id));}
  }
 }
 assert.ok(checks>=500,'checks '+checks);
});

// «Белое правило»: the league's list binds our own completion when it is given.
test('the white rule makes the gate refuse a pick that leaves no listed player, and the completion pays for one',()=>{
 // Five players per position at 100, 150, ... 300; the PG at 200 is the only rookie, the C at 200 the only listed player.
 const players=POS.flatMap((pos,i)=>[0,1,2,3,4].map(k=>({id:10*i+k+1,name:pos+k,positions:[pos],price:100+50*k,priceStatus:'VERIFIED',sportsClub:'C'+(5*i+k),isRookie:pos==='PG'&&k===2})));
 const white=[43],state=newDraft(players,20000,'ON');
 const without=completionPlan(state,0),listed=completionPlan(state,0,{white});
 // 2 x 250 per position, the rookie for the second PG (+50), the listed C for the second C (+50).
 assert.equal(without.minimumCost,1300);assert.equal(listed.minimumCost,1350);assert.equal(listed.minimumRemainingCost,1350);
 assert.ok(listed.playerIds.includes(43)&&!without.playerIds.includes(43));
 // Our two cheapest C close the rule; without the list the same pick is fine.
 let s=pick(state,41);for(const id of [5,15,25,35,45,4,14])s=pick(s,id);
 assert.equal(pickCompletion(s,42,white).possible,false);assert.match(pickCompletion(s,42,white).reason,/белого правила/);
 assert.equal(pickCompletion(s,42).possible,true);assert.equal(pickCompletion(s,43,white).possible,true);
 // A cap between the two minima: possible without the rule, impossible with it, and the dearer minimum is named.
 const capped={...state,cap:1325};
 assert.equal(completionPlan(capped,0).possible,true);
 const refused=completionPlan(capped,0,{white});assert.equal(refused.possible,false);assert.equal(refused.minimumCost,1350);assert.match(refused.reason,/1350\.00 превышает лимит 1325/);
 // A listed player on the roster lifts the rule; an empty list changes nothing.
 assert.deepEqual(completionPlan(pick(state,43),0,{white}),completionPlan(pick(state,43),0));
 assert.deepEqual(completionPlan(state,0,{white:[]}),without);
});
test('white-rule completion agrees with enumeration (random lists, 0-4 fixed picks with same-club pairs)',()=>{
 let checks=0,bound=0,forced=0;
 for(let seed=1;seed<=500;seed++){
  let n=seed*7919+3;const random=()=>((n=Math.imul(n,1664525)+1013904223>>>0)/2**32);
  const multi=seed%5===0,priced=seed%9!==0;
  const players=Array.from({length:15},(_,i)=>{
   let positions=multi&&random()<.5?POS.filter(()=>random()<.4):[POS[Math.floor(random()*5)]];if(!positions.length)positions=[POS[i%5]];
   return {id:i+1,name:'W'+i,positions,isRookie:random()<.2,price:50+Math.round(random()*10)*10,priceStatus:'VERIFIED',sportsClub:i<3?'X':random()<.9?'C'+Math.floor(random()*6):undefined};
  });
  // One to three listed players, dearer than the rest, so the cheapest roster usually has none.
  const white=players.filter(()=>random()<.15).slice(0,3).map(p=>{p.price+=80;return p.id;});
  const fixed=[];const want=Math.floor(random()*5);
  for(const i of [0,1,...[2,3,4,5,6,7,8,9,10,11,12,13,14].sort(()=>random()-.5)]){if(fixed.length>=want)break;const r=byIds(players,[...fixed,i+1]);if(rosterFits(r)&&clubsFit(r))fixed.push(i+1);}
  const taken=players.filter(p=>!fixed.includes(p.id)&&random()<.1).slice(0,2).map(p=>p.id);
  const state={...newDraft(players,20000,priced?'ON':'OFF'),picks:[...fixed.map(id=>({team:0,playerId:id})),...taken.map((id,k)=>({team:1+k,playerId:id}))].map((x,k)=>({number:k+1,...x}))};
  const fixedP=byIds(players,fixed),free=players.filter(p=>!fixed.includes(p.id)&&!taken.includes(p.id));let minimum=Infinity;
  for(const c of combos(free.length,10-fixed.length)){
   const roster=[...fixedP,...c.map(i=>free[i])];
   if(roster.some(p=>p.isRookie)&&(!white.length||roster.some(p=>white.includes(p.id)))&&clubsFit(roster)&&rosterFits(roster))minimum=Math.min(minimum,priced?roster.reduce((s,p)=>s+p.price,0):0);
  }
  // Cases where the cheapest roster without the list holds no listed player exercise the forcing search.
  const base=completionPlan(state,0);if(white.length&&base.possible&&!fixed.some(id=>white.includes(id))&&!base.playerIds.some(id=>white.includes(id)))forced++;
  for(const cap of priced&&Number.isFinite(minimum)?[20000,minimum,minimum-1]:[20000]){
   const plan=completionPlan({...state,cap},0,{white});checks++;if(Number.isFinite(minimum))bound++;
   assert.equal(plan.possible,Number.isFinite(minimum)&&minimum<=cap,`seed ${seed} cap ${cap}`);
   // Over the cap the search may stop at its lower bound; a minimum it does report is exact.
   if(Number.isFinite(minimum)&&priced&&(plan.possible||plan.minimumCost!=null))assert.equal(plan.minimumCost,minimum,`seed ${seed} cap ${cap}`);
   if(plan.possible){const roster=byIds(players,plan.playerIds);assert.ok(clubsFit(roster)&&rosterFits(roster)&&roster.some(p=>p.isRookie)&&(!white.length||roster.some(p=>white.includes(p.id))),`seed ${seed} witness`);}
  }
 }
 assert.ok(checks>=600&&bound>=250&&forced>=25,`checks ${checks} feasible ${bound} forced ${forced}`);
});

test('consecutive seeds give independent first draws, so a batch varies our simulated bot style',async()=>{
 const {randomFromSeed}=await import('../src/simulation.js');
 const first=Array.from({length:100},(_,i)=>randomFromSeed(i+1)());
 for(const [a,b] of [[0,1/3],[1/3,2/3],[2/3,1]]){const n=first.filter(x=>x>=a&&x<b).length;assert.ok(n>=20&&n<=46,`third ${a.toFixed(2)}: ${n}`);}
 // simulateDraft draws team 0's style first, exactly like this.
 const styles=['balanced','best','volatile'],counts=new Map();
 for(let seed=1;seed<=100;seed++){const style=styles[Math.floor(randomFromSeed(seed)()*3)];counts.set(style,(counts.get(style)||0)+1);}
 assert.equal(counts.size,3);for(const n of counts.values())assert.ok(n>=15,JSON.stringify([...counts]));
 assert.deepEqual([randomFromSeed(7)(),randomFromSeed(7)()],[randomFromSeed(7)(),randomFromSeed(7)()]);
});

// Re-picking an earlier pick: the team keeps its later picks, so the gate checks the completion with them.
test('a re-pick that keeps every later pick but strands the team over the cap is refused, a cheaper one is not',async()=>{
 const {replaceCompletion}=await import('../src/completion.js');
 const players=[
  {id:1,name:'A',positions:['PG'],price:1000},{id:2,name:'B',positions:['SG'],price:2500},{id:3,name:'C',positions:['SF'],price:2500},{id:4,name:'D',positions:['PF'],price:2500},
  {id:5,name:'E',positions:['PG'],price:3000},{id:6,name:'F',positions:['PG'],price:1500},
  ...POS.flatMap((pos,i)=>Array.from({length:12},(_,k)=>({id:100+12*i+k,name:pos+' filler '+k,positions:[pos],price:1000,isRookie:k===0}))),
 ].map((p,i)=>({...p,priceStatus:'VERIFIED',sportsClub:'K'+i}));
 // Team 0 takes A, B, C, D in rounds 1-4; the rivals take fillers, one position per round.
 let s=newDraft(players,15000,'ON');const mine=[1,2,3,4];
 for(let round=0;round<4;round++){s=pick(s,mine[round]);for(let k=0;k<7;k++)s=pick(s,players.find(p=>p.id>=100&&POS.indexOf(p.positions[0])===(round+1)%5&&p.isRookie!==true&&!s.picks.some(x=>x.playerId===p.id)).id);}
 assert.equal(completionPlan(s,0).possible,true); // A+B+C+D+6 fillers = 14500
 // E for A: 3000+7500+6000 = 16500. The old gate on the draft cut at pick #1 saw only E plus nine fillers (12000).
 assert.equal(pickCompletion({...s,picks:[]},5).possible,true);
 const refused=replaceCompletion(s,0,5);
 assert.equal(refused.possible,false);assert.deepEqual(refused.dropped,[]);assert.match(refused.reason,/16500\.00 превышает лимит 15000/);
 const kept=replaceCompletion(s,0,6);assert.equal(kept.possible,true);assert.equal(kept.minimumCost,15000);
 // A hard-rule failure (A is already pick #1) stays a refusal with its own reason.
 const hard=replaceCompletion(s,8,1);assert.equal(hard.possible,false);assert.match(hard.reason,/уже выбран/);
});
// After the draft a device without the record gets the official draft replayed through the rules.
test('the official 18.10 draft replays through the rules, and a catalog that refuses a pick leaves the draft alone',async()=>{
 const {replayDraft}=await import('../src/engine.js');const {DRAFT_PICKS}=await import('../src/fbl-draft-2026.js');
 // Round r gives every team a player of position r%5; the tenth round is each team's rookie.
 const catalog=DRAFT_PICKS.map((id,i)=>({id,name:'Pick '+(i+1),positions:[POS[Math.floor(i/8)%5]],price:1500,priceStatus:'VERIFIED',isRookie:i>=72,sportsClub:'K'+i}));
 const empty=newDraft(catalog,20000,'ON'),done=replayDraft(empty,DRAFT_PICKS);
 assert.equal(done.picks.length,80);assert.ok(done.picks.every((p,i)=>p.playerId===DRAFT_PICKS[i]&&p.team===i%8&&p.number===i+1));
 const dear=catalog.map((p,i)=>i===79?{...p,price:7000}:p);
 assert.equal(replayDraft(newDraft(dear,20000,'ON'),DRAFT_PICKS),null);assert.equal(empty.picks.length,0);
});

// Survival odds of the draft plan («Шанс дожить»).
const adpPool=()=>Array.from({length:100},(_,i)=>({id:i+1,name:'A'+(i+1),positions:[POS[i%5]],price:1000+(i%7)*200,priceStatus:'VERIFIED',projectedFP:30-i/5,isRookie:i%9===0,espnContext:i<90?{adp:i+1}:undefined}));
test('ADP futures keep a rookie for every team instead of running out late (118 of 200 seeds failed on this pool before)',async()=>{
 const {adpDraft}=await import('../src/plan.js');const {importDraft,exportDraft}=await import('../src/engine.js');const {teamRoster}=await import('../src/simulation.js');
 for(let seed=1;seed<=25;seed++){
  const done=adpDraft(newDraft(adpPool(),20000,'ON'),seed);
  assert.equal(done.picks.length,80,'seed '+seed);assert.deepEqual(importDraft(exportDraft(done)).picks,done.picks);
  for(let team=0;team<8;team++)assert.ok(teamRoster(done,team).some(p=>p.isRookie),`seed ${seed} team ${team}`);
 }
});
test('survival odds never show certainty for a gap with rival picks, and the plan reports the futures that completed',async()=>{
 const {availabilityProfile,planAdvice,adpDraft}=await import('../src/plan.js');
 // Round 8, our pick 57: three picks left for us, two gaps of seven rival picks.
 const base=newDraft(adpPool(),20000,'ON'),full=adpDraft(base,5),state={...base,picks:full.picks.slice(0,56)};
 const profile=availabilityProfile(state,{runs:6});
 assert.ok(profile.runs>0&&profile.runs<=6);assert.equal(profile.requested,6);
 const available=state.players.filter(p=>!state.picks.some(x=>x.playerId===p.id));
 for(const p of available){
  const odds=profile.availability.get(p.id);
  // On the clock nobody can take him before our pick; every later gap has seven rival picks.
  assert.equal(odds[0],1);assert.ok(odds.slice(1).every(a=>a<1&&a>0),p.name+' '+odds.join(','));
  assert.ok(profile.sure.has(p.id));
 }
 // Not on the clock: no player reads 100% before our pick, but the never-lost ones remain the alternatives.
 const later={...base,picks:full.picks.slice(0,57)},waiting=availabilityProfile(later,{runs:6});
 assert.ok([...waiting.availability.values()].every(odds=>odds[0]<1));assert.ok(waiting.sure.size>0);
 const advice=planAdvice(later,{runs:6,alternatives:4});
 assert.equal(advice.profile.requested,6);assert.ok(advice.profile.runs<=6);
 assert.ok(advice.best&&advice.options.length>1);
 assert.ok(advice.options.every(o=>waiting.sure.has(o.player.id)));
});

// Rookie slot warnings on our cards: positions, the club rule and the budget, among the best rookies still available.
const watchPool=()=>Array.from({length:120},(_,i)=>({id:i+1,name:'Player '+i,positions:['PG','SG','SF','PF','C'],price:1000,priceStatus:'VERIFIED',projectedFP:i>=100?100-i:20,isRookie:i>=100,sportsClub:'K'+i,espnContext:i>=100?{individualProjection:{componentSeasonTotal:2000-i}}:null}));
const rivals=(s,ids)=>{for(const id of ids)s=pick(s,id);return s;};
test('a second player of the top rookie\'s club warns that the rookie would be a third of that club',async()=>{
 const {rookieSlotWarnings}=await import('../src/rookie-watch.js');
 const players=watchPool();Object.assign(players[0],{positions:['C'],sportsClub:'X'});Object.assign(players[1],{positions:['SG'],sportsClub:'X'});Object.assign(players[100],{positions:['PF'],sportsClub:'X'});
 const s=rivals(pick(newDraft(players,20000,'ON'),1),[10,11,12,13,14,15,16]);
 const warnings=rookieSlotWarnings(s,players[1]);
 assert.equal(warnings.length,1);assert.match(warnings[0],/Player 100.*третьим игроком X/);
 assert.equal(rookieSlotWarnings(s,players[2]).length,0);
});
test('a pick that leaves no budget for the rookie with a full roster warns',async()=>{
 const {rookieSlotWarnings}=await import('../src/rookie-watch.js');
 const players=watchPool();players[1].price=3000;players[100].price=3000;
 const s=rivals(pick(newDraft(players,12000,'ON'),1),[10,11,12,13,14,15,16]);
 // 1000 + 3000 + 3000 + seven at 1000 = 14000 > 12000; the cheaper rookies still fit.
 const warnings=rookieSlotWarnings(s,players[1]);
 assert.equal(warnings.length,1);assert.match(warnings[0],/Player 100.*бюджет/);
 assert.equal(rookieSlotWarnings(s,players[2]).length,0);
});
test('warnings follow the best rookies still available, and stop once our roster has its rookie',async()=>{
 const {rookieSlotWarnings,rookieWatch}=await import('../src/rookie-watch.js');
 const players=watchPool();players[0].positions=['PF'];players[1].positions=['PF'];players[105].positions=['PF'];
 // Rivals take the five best rookies; the sixth plays PF like our two PF.
 let s=rivals(pick(newDraft(players),1),[101,102,103,104,105,10,11]);
 assert.ok(rookieWatch(s).every(w=>w.status==='TAKEN'));
 assert.match(rookieSlotWarnings(s,players[1])[0]??'',/Player 105/);
 // With a rookie already on the roster nothing is reserved.
 let t=rivals(pick(newDraft(players),110),[101,102,103,104,105,10,11]);t=rivals(pick(t,1),[12,13,14,15,16,17,18]);
 assert.deepEqual(rookieSlotWarnings(t,players[1]),[]);
});
