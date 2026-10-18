import {POSITIONS,getPlayer,pick,TEAM_COUNT} from './engine.js';

// Exact single-team min-cost circulation with lower bounds. Fixed picks are
// mandatory; the rookie gate carries at least one player; each position holds 2.
// This is a feasibility bound using players available NOW, not a promise that
// seven opponents will leave the completion available until our next pick.
export function completionPlan(state,team=state.picks.length%TEAM_COUNT){
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
  const minimumCost=state.priceMode==='ON'?selected.reduce((sum,p)=>sum+p.price,0):null;
  if(minimumCost!==null&&minimumCost>state.cap+1e-9)return {possible:false,minimumCost,reason:`Минимальный бюджет полного состава ${minimumCost.toFixed(2)} превышает лимит ${state.cap}`};
  const existingCost=state.priceMode==='ON'?fixedPlayers.reduce((sum,p)=>sum+p.price,0):null;
  return {possible:true,minimumCost,minimumRemainingCost:minimumCost===null?null:minimumCost-existingCost,playerIds:selected.map(p=>p.id)};
 }
 const source=0,rookies=1,veterans=2,firstPlayer=3,firstPosition=firstPlayer+candidates.length,sink=firstPosition+5,ss=sink+1,tt=sink+2;
 const graph=Array.from({length:tt+1},()=>[]),balance=Array(tt+1).fill(0),playerEdges=[];
 function edge(a,b,lower,upper,cost=0){
  const f={to:b,reverse:graph[b].length,capacity:upper-lower,cost,initial:upper-lower,lower};
  const r={to:a,reverse:graph[a].length,capacity:0,cost:-cost};graph[a].push(f);graph[b].push(r);balance[a]-=lower;balance[b]+=lower;return f;
 }
 edge(source,rookies,1,10);edge(source,veterans,0,10);
 candidates.forEach((p,i)=>{
  playerEdges.push(edge(p.isRookie===true?rookies:veterans,firstPlayer+i,fixed.has(p.id)?1:0,1));
  for(const position of p.positions)edge(firstPlayer+i,firstPosition+POSITIONS.indexOf(position),0,1,state.priceMode==='ON'?p.price:0);
 });
 for(let i=0;i<5;i++)edge(firstPosition+i,sink,0,2);
 edge(sink,source,10,10);
 let required=0;for(let i=0;i<=sink;i++)if(balance[i]>0){edge(ss,i,0,balance[i]);required+=balance[i];}else if(balance[i]<0)edge(i,tt,0,-balance[i]);
 let flow=0,cost=0;
 while(flow<required){
  const distance=Array(graph.length).fill(Infinity),prev=Array(graph.length),queue=[ss],queued=Array(graph.length).fill(false);distance[ss]=0;queued[ss]=true;
  for(let head=0;head<queue.length;head++){
   const node=queue[head];queued[node]=false;
   for(let i=0;i<graph[node].length;i++){const e=graph[node][i];if(e.capacity>0&&distance[e.to]>distance[node]+e.cost+1e-9){distance[e.to]=distance[node]+e.cost;prev[e.to]=[node,i];if(!queued[e.to]){queue.push(e.to);queued[e.to]=true;}}}
  }
  if(!Number.isFinite(distance[tt]))return {possible:false,reason:'Нельзя добрать 2 PG, 2 SG, 2 SF, 2 PF, 2 C и минимум одного rookie из оставшихся игроков'};
  let amount=required-flow;
  for(let node=tt;node!==ss;node=prev[node][0])amount=Math.min(amount,graph[prev[node][0]][prev[node][1]].capacity);
  for(let node=tt;node!==ss;node=prev[node][0]){const [a,i]=prev[node],e=graph[a][i];e.capacity-=amount;graph[node][e.reverse].capacity+=amount;}
  flow+=amount;cost+=amount*distance[tt];
 }
 const selected=candidates.filter((p,i)=>playerEdges[i].lower+playerEdges[i].initial-playerEdges[i].capacity===1);
 const minimumCost=state.priceMode==='ON'?selected.reduce((sum,p)=>sum+p.price,0):null;
 if(minimumCost!==null&&minimumCost>state.cap+1e-9)return {possible:false,minimumCost,reason:`Минимальный бюджет полного состава ${minimumCost.toFixed(2)} превышает лимит ${state.cap}`};
 const existingCost=state.priceMode==='ON'?[...fixed].reduce((sum,id)=>sum+getPlayer(state,id).price,0):null;
 return {possible:true,minimumCost,minimumRemainingCost:minimumCost===null?null:minimumCost-existingCost,playerIds:selected.map(p=>p.id)};
}

const pickPlans=new WeakMap();
export function pickCompletion(state,id){
 let plans=pickPlans.get(state);if(!plans){plans=new Map();pickPlans.set(state,plans);}
 if(!plans.has(id)){let result;try{result=completionPlan(pick(state,id),state.picks.length%TEAM_COUNT);}catch(error){result={possible:false,reason:error.message};}plans.set(id,result);}
 return plans.get(id);
}
