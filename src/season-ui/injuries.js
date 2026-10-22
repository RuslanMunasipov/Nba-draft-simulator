// Season → Травмы: the ESPN injury report of the league's and the free players.
import {writeStored} from '../storage.js';
import {teamName} from '../teams.js';
import {horizons,playerOutlook,seasonEnding} from '../season.js';
import {dec,ddmm,stampMsk} from '../format.js';
import {$,bodyPart,button,clubOf,el,errorBlock,injuries,injuryInfo,injuryScope,league,live,loading,loadingBlock,openRows,owners,players,renderSeason,setInjuryScope,setReplacing,setTeam,setView,src,team} from './state.js';

// ---------- Injuries ----------
export function injuriesView(ctx){
 if(src.injuries==='idle'||(loading&&!injuries.size))return [loadingBlock(null)];
 if(src.injuries==='error')return [errorBlock('Нет данных о травмах','ESPN не ответил. Список травм появится после обновления.')];
 const own=owners(ctx),byEspn=new Map(players.filter(p=>p.espnId).map(p=>[String(p.espnId),p]));
 const all=[...injuries.entries()].map(([id,i])=>({i,p:byEspn.get(id)}));
 const league=all.filter(r=>r.p&&own.has(r.p.id)),market=all.filter(r=>r.p&&!own.has(r.p.id)&&live?.players?.[r.p.sportsId]);
 const scope=el('div',null,'segmented sp-period');scope.setAttribute('role','group');scope.setAttribute('aria-label','Чьи травмы');
 for(const [k,label] of [['league',`Лига (${league.length})`],['market',`Свободные (${market.length})`]]){const b=button(label,()=>{setInjuryScope(k);renderSeason();},'');b.setAttribute('aria-pressed',String(injuryScope===k));scope.append(b);}
 const rows=injuryScope==='league'?league:market;
 const group=r=>injuryScope==='league'?own.get(r.p.id):9;
 // By return date; a season-ending report's date is ESPN's placeholder, so those players come last.
 const back=r=>seasonEnding(r.i)?'99':String(r.i.returnDate||'9');
 rows.sort((a,b)=>group(a)-group(b)||back(a).localeCompare(back(b)));
 const list=el('div',null,'sp-injuries');let last=null;
 for(const r of rows){const g=group(r);
  if(g!==last&&injuryScope==='league'){const h=el('h3',teamName(g));if(g===0)h.append(' ',el('span','ты','chip chip--accent'));list.append(h);last=g;}
  const info=injuryInfo(r.p),item=el('div',null,'sp-injury-item'+(info.level==='out'?' out':'')),head=el('div',null,'head');
  head.append(el('strong',r.p.name),el('span',info.text,'chip '+(info.level==='out'?'chip--danger':'chip--warn')));
  item.append(head,el('small',[r.p.team,bodyPart(r.i.type),r.i.date?'отчёт '+ddmm(String(r.i.date).slice(0,10)):''].filter(Boolean).join(' · ')));
  if(g===0){const o=playerOutlook(r.p,{...ctx,running:new Map()});const missed=Math.max(0,(live?.clubs?.[clubOf(r.p)]||[]).filter(x=>x.date>=ctx.today&&x.date<=horizons(ctx).week.to&&!x.score&&!x.gone).length-o.week.games);
   if(missed>=.5)item.append(el('p',`Пропустит ~${dec(missed)} матча до конца недели.`));
   item.append(button('Найти замену',()=>{setTeam(0);writeStored('fbl-season-team','0');setReplacing(r.p.id);openRows.add(r.p.id);setView('teams');},'btn-ghost btn-sm'));}
  if(r.i.comment){const c=el('details',null,'inline');c.append(el('summary','Комментарий ESPN'),el('p',r.i.comment));c.lang='en';item.append(c);}
  list.append(item);}
 if(!rows.length)list.append(el('p',injuryScope==='league'?'В составах FBL травмированных нет.':'Среди свободных игроков травмированных нет.','muted'));
 return [el('p',`Отчёт ESPN${src.injuriesAt?' от '+stampMsk(src.injuriesAt):''}. Даты возвращения — оценка ESPN.`,'muted'),scope,list];
}
