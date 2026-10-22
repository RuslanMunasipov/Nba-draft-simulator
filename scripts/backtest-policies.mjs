// Policies of the transfer backtest (scripts/transfer_backtest.mjs). A policy gets the decision moment (ctx at 12:00
// Moscow time, the team, its bank and the transfers left this FBL week) and returns the moves to make: {pairs:[{outId,
// inId,...}]} or null. `record`, when given, collects candidate swaps with their predicted and (later) real gains for the
// confidence calibration.
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
// The windows a decision is judged on, in Moscow dates after the decision: the FBL week the move counts in (to its
// Moscow Monday), 4 weeks (the app's month: today and the next 27 days) and the rest of the season.
export function windows(season,d){
 return {week:addDays(season.monday,7*d.week),month:addDays(d.day,27),season:season.end};
}
// Expected points and spread of one player over each window (season.js expectedPoints and pointsSpread, as explainSwap).
function picture(S,ctx,p,to){
 const o=S.expectedPoints(p,ctx,ctx.today,to);return {points:o.points,spread:S.pointsSpread(p,ctx,o)};
}
export function swapEstimate(S,season,ctx,d,pairs){
 const byId=new Map(ctx.players.map(p=>[p.id,p])),w=windows(season,d),out={};
 for(const [h,to] of Object.entries(w)){
  let gain=0,v=0;
  for(const [o,i] of pairs){const a=picture(S,ctx,byId.get(o),to),b=picture(S,ctx,byId.get(i),to);gain+=b.points-a.points;v+=a.spread**2+b.spread**2;}
  out[h]={gain,sd:Math.sqrt(v)};
 }
 return out;
}
function recordCandidates(S,season,ctx,team,bankMoney,d,record){
 const seen=new Set();
 for(const sort of ['month','season'])for(const x of S.bestTransfers(ctx,{team,bankMoney,sort,limit:10})){
  const k=x.outId+'>'+x.player.id;if(seen.has(k))continue;seen.add(k);
  record.push({day:d.day,week:d.week,kind:d.kind,outId:x.outId,inId:x.player.id,estimate:swapEstimate(S,season,ctx,d,[[x.outId,x.player.id]])});
 }
}
// The model each policy reads: 'shipped' (the chain as of 22.10.2026, without the current absence run) or 'current'.
export const MODEL_OF={hold:'current',current:'shipped',rivals:'shipped',currentNewModel:'current'};
export const POLICIES={
 // (a) Never transfer.
 hold({S,season,ctx,team,bankMoney,decision,record}){
  if(record)recordCandidates(S,season,ctx,team,bankMoney,decision,record);
  return null;
 },
 // (b) The advice as shipped on 22.10.2026: recommendPackage over the next 4 weeks, made only when it is CONFIDENT (the
 // app's and Telegram's «Сделай»).
 current({S,season,ctx,team,bankMoney,left,decision,record}){
  if(record)recordCandidates(S,season,ctx,team,bankMoney,decision,record);
  const {best}=S.recommendPackage(ctx,{team,bankMoney,left,sort:'month'});
  if(!best)return null;
  const pairs=best.pairs.map(x=>[x.out.id,x.in.id]),estimate=swapEstimate(S,season,ctx,decision,pairs);
  return {pairs:best.pairs.map(x=>({outId:x.out.id,inId:x.in.id})),predicted:estimate,confidence:best.why.confidence,label:best.why.level};
 },
 // (b') The same rule on the current model: what the model change alone is worth.
 currentNewModel(x){return POLICIES.current(x);},
 // The rival teams: once a week, the best one-for-one swap over the rest of the season when it gains 40+ points there and
 // does not lose the next 4 weeks.
 rivals({S,ctx,team,bankMoney,decision}){
  if(decision.kind!=='start')return null;
  const [best]=S.bestTransfers(ctx,{team,bankMoney,sort:'season',limit:1});
  return best&&best.gain.season>=40&&best.gain.month>=0?{pairs:[{outId:best.outId,inId:best.player.id}]}:null;
 },
};
