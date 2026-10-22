// The transfer decision: one function for the app (Трансферы, Игроки) and the personal bot. A move is weighed over the
// horizons the backtest found worth weighing (data/transfer-policy.json: the weights of the week, 4 weeks and the rest of
// the season) against the price of a transfer, a weekly resource whose predicted gains overstate the real ones; the
// package never lowers the season's expectation (bestPackage's season protection), so there are no short-term moves.
// The answer carries what the app and the bot say about it: the gains over each horizon, the calibrated confidence, the
// main risks, why a pair that loses on its own is in the package, what would change the decision, the best alternative,
// and, when nothing is worth a transfer, why to hold.
import POLICY from '../data/transfer-policy.json' with {type:'json'};
import {bestPackage,explainSwap,contestedBy,transferWindow,transferOptions,playerOutlook,perGame,absenceRun,current,seasonEnding} from './season.js';
import {HORIZONS} from './confidence.js';
import {fblWeek,FBL_TRANSFERS} from './rules.js';
import {count,int,signed} from './format.js';

export const PLAN=POLICY.params;
// The price of a transfer now. A transfer not used by the end of the FBL week (Monday to Sunday, Moscow dates) is lost, so
// with params.weekDecay its price falls with the days the week has left: in full on Monday, 4/7 of it on Thursday.
export function movePriceOf(ctx,params=PLAN){
 if(!params.weekDecay||!ctx?.today)return params.movePrice;
 // The league's week (its first one is longer); before the league's first week (the backtest's seasons) Monday to Sunday.
 const day=ctx.today,end=day<FBL_TRANSFERS.firstWeekFrom?addDays(day,6-(new Date(day+'T00:00:00Z').getUTCDay()+6)%7):fblWeek(day).end;
 return params.movePrice*Math.min(7,daysDiff(end,day)+1)/7;
}
const addDays=(day,n)=>new Date(Date.parse(day+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const daysDiff=(a,b)=>Math.round((Date.parse(a+'T00:00:00Z')-Date.parse(b+'T00:00:00Z'))/864e5);
// The plan's value of a swap's gains: the weighted horizons less the price of one transfer (now, with ctx).
export const planValue=(gain,params=PLAN,ctx=null)=>Object.entries(params.weights).reduce((s,[h,w])=>s+w*(gain[h]||0),0)-movePriceOf(ctx,params);
const byIdOf=ctx=>new Map(ctx.players.map(p=>[p.id,p]));

// Up to three risks, the strongest first: an injury of a player bought, the players the same model tells other teams to
// buy (the first buyer gets him), a confidence under the bar, then the model's own caveats.
function risks(ctx,plan,why,rivals){
 const out=[];
 for(const x of plan.pairs){const i=ctx.injuries?.get(String(x.in.espnId));if(i)out.push(`${x.in.name}: ${i.status}${seasonEnding(i)?' до конца сезона':i.returnDate?' до '+String(i.returnDate).slice(8,10)+'.'+String(i.returnDate).slice(5,7):''}.`);}
 for(const [id,teams] of rivals)if(teams.length){const p=plan.pairs.find(x=>x.in.id===id)?.in;out.push(`${p.name} по модели нужен ещё ${count(teams.length,'команде','командам','командам')} лиги: в FBL игрок может быть только в одной команде, кто купит позже — нарушит правило.`);}
 const c=why.season.confidence;if(c<.7)out.push(`Уверенность за сезон ${Math.floor(c*100)}%: из похожих обменов в прогоне на трёх прошлых сезонах в плюс вышли (в среднем) ${Math.floor(c*100)}%.`);
 for(const f of why.season.flags)if(!/^Сезон только начался/.test(f))out.push(f);
 return [...new Set(out)].slice(0,3);
}
// What would change the decision: how far the newcomer's points per game may fall before the move stops paying for its
// transfer, and the injured player whose return the move is about.
function changes(ctx,plan,params){
 const out=[];
 const w=params.weights,margin=plan.value;
 for(const x of plan.pairs){
  const o=playerOutlook(x.in,ctx),games=Object.entries(w).reduce((s,[h,k])=>s+k*(o[h]?.games||0),0);
  if(games>0){const pg=perGame(x.in,ctx.live?.players?.[x.in.sportsId]).value,drop=margin/games;
   out.push(`Ход перестанет окупать трансфер, если ${x.in.name} будет набирать меньше ${Math.max(0,pg-drop).toFixed(1)} ФО за матч (сейчас ${pg.toFixed(1)}).`);}
  const away=absenceRun(x.out,ctx.live?.players?.[x.out.sportsId],ctx),hurt=ctx.injuries?.get(String(x.out.espnId));
  if(hurt||away>=2)out.push(`Если ${x.out.name} вернётся раньше, чем ждёт модель, продажа теряет смысл: проверь новости перед ходом.`);
 }
 return out.slice(0,2);
}
// A pair that loses points on its own is in the package for the others: it keeps the roster's rookie or its player of
// the white rule when another pair sells him, or frees the money another pair spends. Said, so the move reads as meant.
function forced(ctx,plan,team){
 const byId=byIdOf(ctx),sold=new Set(plan.pairs.map(x=>x.out.id)),rest=ctx.rosters[team].filter(id=>!sold.has(id)).map(id=>byId.get(id)).filter(Boolean);
 const white=p=>ctx.white?.has(String(p.id)),season=p=>playerOutlook(p,ctx).season?.points||0;
 return plan.pairs.filter(x=>x.gain<0).map(x=>{
  const rookie=x.in.isRookie===true&&!rest.some(p=>p.isRookie===true)&&plan.pairs.find(y=>y!==x&&y.out.isRookie===true&&y.in.isRookie!==true);
  const whiteOut=!rookie&&white(x.in)&&!rest.some(white)&&plan.pairs.find(y=>y!==x&&white(y.out)&&!white(y.in));
  const reason=rookie?`в составе обязателен новичок (rookie), а ${rookie.out.name} продаётся`:whiteOut?`в составе нужен игрок белого правила, а ${whiteOut.out.name} продаётся`
   :x.out.price>x.in.price?`освобождает ${int(x.out.price-x.in.price)} на остальные покупки`:'без него остальные покупки не проходят по правилам состава';
  return `${x.out.name} → ${x.in.name} сам по себе даёт ${signed(season(x.in)-season(x.out))} ФО за сезон: ${reason}. Пакет целиком — ${signed(plan.gains.season)}.`;
 });
}
// The best package without the first player the plan buys: the alternative, when it is worth a transfer too.
function alternative(ctx,{team,bankMoney,left,params},plan){
 const pack=bestPackage(ctx,{team,bankMoney,k:Math.min(3,left),weights:params.weights,movePrice:movePriceOf(ctx,params),exclude:plan.pairs.map(x=>x.in.id)});
 return pack?.pairs.length&&pack.gain>1e-6?{pairs:pack.pairs,gains:pack.gains,value:pack.gain}:null;
}
// Roster players out now (on the report, or missing his club's last games): hold him, or a replacement until he is back.
// A replacement and the buy-back are two transfers, and the player may be gone by then: the rivals the model tells to buy
// him are named. Information only: the package above already weighs his outlook against every free player's.
function injured(ctx,{team,bankMoney,params}){
 const byId=byIdOf(ctx),out=[];
 for(const id of ctx.rosters[team]){
  const p=byId.get(id);if(!p)continue;
  const hurt=ctx.injuries?.get(String(p.espnId)),away=absenceRun(p,ctx.live?.players?.[p.sportsId],ctx);
  if(!(hurt&&/out/i.test(hurt.status||''))&&away<2)continue;
  const [best]=transferOptions(ctx,{team,outId:id,bankMoney,limit:1,sort:'month'});
  const value=best?planValue(best.gain,{...params,movePrice:2*params.movePrice,weekDecay:false}):-Infinity;
  out.push({player:current(p,ctx),away,report:hurt||null,replacement:best?.player||null,gains:best?.gain||null,
   verdict:value>0?'replace':'hold'});
 }
 return out;
}
// The decision. `left`: transfers left this FBL week; `bankOf`/`leftOf`: the rivals' (contest check, optional).
export function transferPlan(ctx,{team,bankMoney,left,params=PLAN,bankOf=null,leftOf=null,explain=true}){
 const when=transferWindow(ctx.now??Date.now()),price=movePriceOf(ctx,params);
 if(!(left>0))return {action:'hold',reason:'no-transfers',when,injured:explain?injured(ctx,{team,bankMoney,params}):[]};
 const pack=bestPackage(ctx,{team,bankMoney,k:Math.min(3,left),weights:params.weights,movePrice:price});
 if(!pack||!pack.pairs.length||!(pack.gain>1e-6)){
  // Why hold: the best single move, weighed the same way, does not pay for its transfer.
  const top=explain?bestPackage(ctx,{team,bankMoney,k:1,weights:params.weights,movePrice:0}):null;
  return {action:'hold',reason:'no-gain',when,best:top?.pairs.length?{pairs:top.pairs,gains:top.gains,value:top.gain,price}:null,
   injured:explain?injured(ctx,{team,bankMoney,params}):[]};
 }
 const pairs=pack.pairs.map(x=>[x.out.id,x.in.id]),why={};
 for(const h of HORIZONS)why[h]=explainSwap(ctx,null,null,h,pairs,team);
 const plan={action:'move',pairs:pack.pairs,gains:pack.gains,value:pack.gain,price,bankAfter:pack.bankAfter,why,
  confidence:Object.fromEntries(HORIZONS.map(h=>[h,why[h].confidence])),level:why.season.level,when};
 // With params.minConfidence a package that pays for its transfers but is less sure than that over the season is held.
 if(params.minConfidence&&plan.confidence.season<params.minConfidence)return {action:'hold',reason:'low-confidence',when,
  best:{pairs:pack.pairs,gains:pack.gains,value:pack.gain,price,confidence:plan.confidence.season},minConfidence:params.minConfidence,
  injured:explain?injured(ctx,{team,bankMoney,params}):[]};
 if(!explain)return plan;
 const rivals=new Map(bankOf?pack.pairs.map(x=>[x.in.id,contestedBy(ctx,{team,playerId:x.in.id,bankOf,leftOf})]):[]);
 return {...plan,contested:rivals,forced:forced(ctx,plan,team),risks:risks(ctx,plan,why,rivals),changes:changes(ctx,plan,params),alternative:alternative(ctx,{team,bankMoney,left,params},plan),
  injured:injured(ctx,{team,bankMoney,params})};
}
