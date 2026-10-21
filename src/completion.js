import {POSITIONS,getPlayer,pick,replacePick,rosterFits,TEAM_COUNT,CLUB_LIMIT,clubOf,clubsFit} from './engine.js';

// Exact single-team min-cost circulation with lower bounds. Fixed picks are
// mandatory; the rookie gate carries at least one player; each position holds 2.
// This is a feasibility bound using players available NOW, not a promise that
// seven opponents will leave the completion available until our next pick.
// With the league's «белое правило» list (`white`) the ten also need one listed player: every such roster contains some
// listed player w, so the exact answer is the cheapest completion with one w fixed, tried in the order of a lower bound.
export function completionPlan(state,team=state.picks.length%TEAM_COUNT,{white=null}={}){
 const plan=completionCore(state,team);
 if(!white?.length||!plan.possible)return plan;
 const listed=new Set(white.map(String)),isWhite=p=>listed.has(String(p.id));
 const fixedPlayers=state.picks.filter(p=>p.team===team).map(p=>getPlayer(state,p.playerId));
 if(fixedPlayers.some(isWhite)||plan.playerIds.some(id=>listed.has(String(id))))return plan;
 const used=new Set(state.picks.map(p=>p.playerId)),priced=state.priceMode==='ON',cost=p=>priced?p.price:0;
 const free=state.players.filter(p=>!used.has(p.id)&&p.positions.length&&(!priced||(p.priceStatus==='VERIFIED'&&Number.isFinite(p.price))));
 // Lower bound of a roster holding w: the cheapest two per position without the rookie and club rules, w replacing the
 // dearest of them at his position (singleton positions); otherwise the cheapest roster without the list.
 let bound=()=>plan.minimumCost??0;
 if([...fixedPlayers,...free].every(p=>p.positions.length===1)){
  const greedy=new Map(POSITIONS.map(pos=>[pos,free.filter(p=>p.positions[0]===pos).map(cost).sort((a,b)=>a-b).slice(0,2-fixedPlayers.filter(p=>p.positions[0]===pos).length)]));
  const total=fixedPlayers.reduce((s,p)=>s+cost(p),0)+[...greedy.values()].flat().reduce((s,c)=>s+c,0);
  bound=w=>{const chosen=greedy.get(w.positions[0]);return total+Math.max(0,cost(w)-(chosen.at(-1)??Infinity));};
 }
 const order=free.filter(p=>isWhite(p)&&rosterFits([...fixedPlayers,p])&&clubsFit([...fixedPlayers,p])).map(w=>({w,low:bound(w)})).sort((a,b)=>a.low-b.low);
 let best=null;
 for(const {w,low} of order){
  if(best&&(!priced||low>=best.minimumCost-1e-9))break;
  if(!best&&priced&&low>state.cap+1e-9)return {possible:false,reason:`Полный состав с игроком «белого правила» дороже лимита ${state.cap}`};
  const r=completionCore({...state,cap:Infinity,picks:[...state.picks,{number:state.picks.length+1,team,playerId:w.id}]},team);
  if(r.possible&&(!best||r.minimumCost<best.minimumCost))best=r;
 }
 if(!best)return {possible:false,reason:'Нельзя добрать игрока из списка «белого правила» лиги при позициях, rookie, клубах и бюджете'};
 if(priced&&best.minimumCost>state.cap+1e-9)return {possible:false,minimumCost:best.minimumCost,reason:`Минимальный бюджет полного состава с игроком «белого правила» ${best.minimumCost.toFixed(2)} превышает лимит ${state.cap}`};
 const existingCost=priced?fixedPlayers.reduce((s,p)=>s+p.price,0):null;
 return {possible:true,minimumCost:best.minimumCost,minimumRemainingCost:priced?best.minimumCost-existingCost:null,playerIds:best.playerIds};
}
function completionCore(state,team){
 const fixed=new Set(state.picks.filter(p=>p.team===team).map(p=>p.playerId));
 const used=new Set(state.picks.map(p=>p.playerId));
 const candidates=state.players.filter(p=>(fixed.has(p.id)||!used.has(p.id))&&p.positions.length&&
  (state.priceMode!=='ON'||(p.priceStatus==='VERIFIED'&&Number.isFinite(p.price))));
 if([...fixed].some(id=>!candidates.some(p=>p.id===id)))return {possible:false,reason:'Цена или позиции выбранного игрока не подтверждены'};
 // With strict Sports.ru singleton positions, independent slot minima plus
 // the cheapest rookie exchange are the exact solution of the same problem.
 if(candidates.every(p=>p.positions.length===1)){
  const fixedPlayers=candidates.filter(p=>fixed.has(p.id));
  const selected=[...fixedPlayers],groups=[];
  const cost=p=>state.priceMode==='ON'?p.price:0;
  for(const position of POSITIONS){
   const remaining=2-fixedPlayers.filter(p=>p.positions[0]===position).length;
   if(remaining<0)return {possible:false,reason:'Невозможно назначить позиции'};
   const pool=candidates.filter(p=>!fixed.has(p.id)&&p.positions[0]===position).sort((a,b)=>cost(a)-cost(b));
   if(pool.length<remaining)return {possible:false,reason:'Недостаточно игроков для добора позиции '+position};
   const chosen=pool.slice(0,remaining);selected.push(...chosen);groups.push({pool,chosen});
  }
  if(!selected.some(p=>p.isRookie===true)){
   let exchange=null;
   for(const {pool,chosen} of groups){
    if(!chosen.length)continue;
    const rookie=pool.find(p=>p.isRookie===true);if(!rookie)continue;
    const replace=chosen.at(-1),extra=cost(rookie)-cost(replace);
    if(!exchange||extra<exchange.extra)exchange={rookie,replace,extra};
   }
   if(!exchange)return {possible:false,reason:'Нельзя добрать минимум одного rookie на свободную позицию'};
   selected[selected.findIndex(p=>p.id===exchange.replace.id)]=exchange.rookie;
  }
  // The greedy answer is optimal without the club rule; when it also keeps every club within the limit it is optimal
  // with it. Otherwise a club-aware greedy pass that reaches the same cost is optimal too (that cost is a lower bound);
  // only when it cannot does the exact flow below decide.
  if(!clubsFit(selected)){
   const bound=selected.reduce((sum,p)=>sum+cost(p),0),alt=clubAwareGreedy(candidates,fixedPlayers,cost);
   if(alt&&alt.reduce((sum,p)=>sum+cost(p),0)<=bound+1e-9)selected.splice(0,selected.length,...alt);
  }
  if(clubsFit(selected)){
   const minimumCost=state.priceMode==='ON'?selected.reduce((sum,p)=>sum+p.price,0):null;
   if(minimumCost!==null&&minimumCost>state.cap+1e-9)return {possible:false,minimumCost,reason:`Минимальный бюджет полного состава ${minimumCost.toFixed(2)} превышает лимит ${state.cap}`};
   const existingCost=state.priceMode==='ON'?fixedPlayers.reduce((sum,p)=>sum+p.price,0):null;
   return {possible:true,minimumCost,minimumRemainingCost:minimumCost===null?null:minimumCost-existingCost,playerIds:selected.map(p=>p.id)};
  }
 }
 return clubCompletion(state,candidates,fixed);
}

// Cheapest two per position, skipping players whose club is already full, then the cheapest legal rookie exchange.
function clubAwareGreedy(candidates,fixedPlayers,cost){
 const fixed=new Set(fixedPlayers.map(p=>p.id)),selected=[...fixedPlayers],count=new Map();
 const room=p=>clubOf(p)===null||(count.get(clubOf(p))||0)<CLUB_LIMIT,add=p=>{if(clubOf(p)!==null)count.set(clubOf(p),(count.get(clubOf(p))||0)+1);};
 fixedPlayers.forEach(add);
 const pools=POSITIONS.map(position=>candidates.filter(p=>!fixed.has(p.id)&&p.positions[0]===position).sort((a,b)=>cost(a)-cost(b)));
 for(let i=0;i<5;i++){
  let need=2-fixedPlayers.filter(p=>p.positions[0]===POSITIONS[i]).length;
  for(const p of pools[i]){if(need<=0)break;if(room(p)){selected.push(p);add(p);need--;}}
  if(need>0)return null;
 }
 if(selected.some(p=>p.isRookie===true))return selected;
 let best=null;
 for(let i=0;i<5;i++){
  const mine=selected.filter(p=>!fixed.has(p.id)&&p.positions[0]===POSITIONS[i]);if(!mine.length)continue;
  const out=mine.at(-1);
  for(const r of pools[i]){
   if(r.isRookie!==true||selected.includes(r))continue;
   const club=clubOf(r),ok=club===null||(count.get(club)||0)-(clubOf(out)===club?1:0)<CLUB_LIMIT;
   if(ok){const extra=cost(r)-cost(out);if(!best||extra<best.extra)best={r,out,extra};break;}
  }
 }
 if(!best)return null;
 selected[selected.indexOf(best.out)]=best.r;return selected;
}

// Exact min-cost completion with the club rule: a circulation source -> club (at most CLUB_LIMIT) -> player -> position
// (exactly two) -> sink, with lower bounds for fixed picks. "At least one rookie" is not a laminar constraint next to the
// clubs, so it is met by forcing each rookie in turn when the unconstrained optimum has none: the cheapest of those
// optima is the exact answer.
function clubCompletion(state,candidates,fixed){
 const cost=p=>state.priceMode==='ON'?p.price:0;
 // Exchange argument: two players with the same positions, club and rookie status are interchangeable, so a roster uses
 // at most CLUB_LIMIT and at most two per position of the set of each such group — only the cheapest of each are kept.
 const groups=new Map();
 for(const p of candidates){if(fixed.has(p.id))continue;const key=p.positions.join('/')+'|'+clubOf(p)+'|'+(p.isRookie===true);(groups.get(key)||groups.set(key,[]).get(key)).push(p);}
 // A roster holds at most two players per position of the set, and at most CLUB_LIMIT of one club.
 let pool=[...groups.values()].flatMap(g=>g.sort((a,b)=>cost(a)-cost(b)).slice(0,Math.min(2*g[0].positions.length,clubOf(g[0])===null?Infinity:CLUB_LIMIT)));
 // With one position each, a roster of ten fills at most five clubs, so for each position and rookie status the players
 // of the eight cheapest clubs always contain a no-dearer, club-legal substitute for any other choice.
 if(pool.every(p=>p.positions.length===1)){
  const byClass=new Map();
  for(const p of pool){const key=p.positions[0]+'|'+(p.isRookie===true);(byClass.get(key)||byClass.set(key,[]).get(key)).push(p);}
  pool=[...byClass.values()].flatMap(list=>{
   const clubs=[];for(const p of [...list].sort((a,b)=>cost(a)-cost(b))){const c=clubOf(p);if(c!==null&&!clubs.includes(c))clubs.push(c);}
   const allowed=new Set(clubs.slice(0,8));return list.filter(p=>clubOf(p)===null||allowed.has(clubOf(p)));
  });
 }
 candidates=[...candidates.filter(p=>fixed.has(p.id)),...pool];
 const result=selection=>{
  const minimumCost=state.priceMode==='ON'?selection.reduce((sum,p)=>sum+p.price,0):null;
  if(minimumCost!==null&&minimumCost>state.cap+1e-9)return {possible:false,minimumCost,reason:`Минимальный бюджет полного состава ${minimumCost.toFixed(2)} превышает лимит ${state.cap}`};
  const existingCost=state.priceMode==='ON'?[...fixed].reduce((sum,id)=>sum+getPlayer(state,id).price,0):null;
  return {possible:true,minimumCost,minimumRemainingCost:minimumCost===null?null:minimumCost-existingCost,playerIds:selection.map(p=>p.id)};
 };
 const fail={possible:false,reason:`Нельзя добрать 2 PG, 2 SG, 2 SF, 2 PF, 2 C, минимум одного rookie и не больше ${CLUB_LIMIT} игроков одного клуба`};
 const base=flowSelect(candidates,fixed,cost);
 if(!base)return fail;
 if(base.some(p=>p.isRookie===true))return result(base);
 let best=null,bestCost=Infinity;
 for(const rookie of candidates){
  if(rookie.isRookie!==true||fixed.has(rookie.id))continue;
  // The forced rookie takes a club place like any pick: club capacity stays that of the real fixed picks.
  const chosen=flowSelect(candidates,new Set([...fixed,rookie.id]),cost,fixed);
  if(!chosen)continue;
  const total=chosen.reduce((s,p)=>s+cost(p),0);
  if(total<bestCost){best=chosen;bestCost=total;if(state.priceMode!=='ON')break;}
 }
 return best?result(best):fail;
}
// Club capacity tolerates fixed picks that already exceed the limit (heldFrom), never a forced player on top of them.
function flowSelect(candidates,fixed,cost,heldFrom=fixed){
 const clubs=[...new Set(candidates.map(clubOf).filter(c=>c!==null))];
 const source=0,firstClub=1,firstPlayer=firstClub+clubs.length,firstPosition=firstPlayer+candidates.length,sink=firstPosition+5,ss=sink+1,tt=sink+2;
 const graph=Array.from({length:tt+1},()=>[]),balance=Array(tt+1).fill(0),playerEdges=[];
 function edge(a,b,lower,upper,c=0){
  const f={to:b,reverse:graph[b].length,capacity:upper-lower,cost:c,initial:upper-lower,lower};
  const r={to:a,reverse:graph[a].length,capacity:0,cost:-c};graph[a].push(f);graph[b].push(r);balance[a]-=lower;balance[b]+=lower;return f;
 }
 clubs.forEach((club,i)=>{const held=candidates.filter(p=>clubOf(p)===club&&heldFrom.has(p.id)).length;edge(source,firstClub+i,0,Math.max(CLUB_LIMIT===Infinity?10:CLUB_LIMIT,held));});
 candidates.forEach((p,i)=>{
  const club=clubOf(p);
  playerEdges.push(edge(club===null?source:firstClub+clubs.indexOf(club),firstPlayer+i,fixed.has(p.id)?1:0,1));
  for(const position of p.positions)edge(firstPlayer+i,firstPosition+POSITIONS.indexOf(position),0,1,cost(p));
 });
 for(let i=0;i<5;i++)edge(firstPosition+i,sink,2,2);
 edge(sink,source,10,10);
 let required=0;for(let i=0;i<=sink;i++)if(balance[i]>0){edge(ss,i,0,balance[i]);required+=balance[i];}else if(balance[i]<0)edge(i,tt,0,-balance[i]);
 let flow=0;
 while(flow<required){
  const distance=Array(graph.length).fill(Infinity),prev=Array(graph.length),queue=[ss],queued=Array(graph.length).fill(false);distance[ss]=0;queued[ss]=true;
  for(let head=0;head<queue.length;head++){
   const node=queue[head];queued[node]=false;
   for(let i=0;i<graph[node].length;i++){const e=graph[node][i];if(e.capacity>0&&distance[e.to]>distance[node]+e.cost+1e-9){distance[e.to]=distance[node]+e.cost;prev[e.to]=[node,i];if(!queued[e.to]){queue.push(e.to);queued[e.to]=true;}}}
  }
  if(!Number.isFinite(distance[tt]))return null;
  let amount=required-flow;
  for(let node=tt;node!==ss;node=prev[node][0])amount=Math.min(amount,graph[prev[node][0]][prev[node][1]].capacity);
  for(let node=tt;node!==ss;node=prev[node][0]){const [a,i]=prev[node],e=graph[a][i];e.capacity-=amount;graph[node][e.reverse].capacity+=amount;}
  flow+=amount;
 }
 return candidates.filter((p,i)=>playerEdges[i].lower+playerEdges[i].initial-playerEdges[i].capacity===1);
}

// Results are cached per immutable state and per white list (the list arrays are module constants).
const pickPlans=new WeakMap();
function cached(state,white,key,compute){
 let lists=pickPlans.get(state);if(!lists){lists=new Map();pickPlans.set(state,lists);}
 const list=white?.length?white:null;let plans=lists.get(list);if(!plans){plans=new Map();lists.set(list,plans);}
 if(!plans.has(key)){let result;try{result=compute(list);}catch(error){result={possible:false,reason:error.message};}plans.set(key,result);}
 return plans.get(key);
}
export function pickCompletion(state,id,white=null){
 return cached(state,white,id,list=>completionPlan(pick(state,id),state.picks.length%TEAM_COUNT,{white:list}));
}
// Re-picking pick `index`: the team keeps its later picks that stay legal, so its completion is checked with them fixed.
export function replaceCompletion(state,index,id,white=null){
 return cached(state,white,index+':'+id,list=>{const {state:next,dropped}=replacePick(state,index,id);return {...completionPlan(next,state.picks[index].team,{white:list}),dropped};});
}
