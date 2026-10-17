import {importDraft,exportDraft} from './engine.js';
import {importUncappedDraft} from './uncapped.js';
export const SALARY_CAP=20000;
// Keep legacy picks visible for repair; never silently delete them or disable cap.
export function enforceBudget(state){
 const {pricingIssue,...rest}=state;
 const next={...rest,cap:SALARY_CAP,priceMode:'ON'};
 try{return importDraft(exportDraft(next));}
 catch(error){return {...next,pricingIssue:'Сохранённый состав не соответствует правилам Sports.ru: '+error.message+'. Отмени пики или начни новый драфт.'};}
}
export function restoreBudgetDraft(json){
 const original=JSON.parse(json),state=importUncappedDraft(json);
 return original.priceMode==='ON'?enforceBudget(state):state;
}
export function budgetSummary(state,team=state.picks.length%8){
 const roster=state.picks.filter(p=>p.team===team).map(p=>state.players.find(x=>x.id===p.playerId));
 const verified=roster.every(p=>p?.priceStatus==='VERIFIED'&&Number.isFinite(p.price));
 const spent=verified?roster.reduce((s,p)=>s+p.price,0):null;
 return {spent,remaining:spent===null?null:state.cap-spent,slots:10-roster.length};
}
