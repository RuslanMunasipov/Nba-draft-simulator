// Season → Правила: the league rules for every team and the appeals to the lawyer.
import {writeStored} from '../storage.js';
import {teamName} from '../teams.js';
import {checkRules,verdict,appeal,LAWYER,TRANSFER_HOURS} from '../rules.js';
import {count,ddmm} from '../format.js';
import {$,button,byId,card,clubOf,el,issueUrl,league,link,needsLive,pending,players,readJson,renderSeason,setTeam,setView,team,transfers} from './state.js';

// ---------- Rules ----------
// League rules for every team, the appeal to the league's lawyer for each breach, and the league's «белое правило» list.
// The list is the league's decision (data/fbl-league.json "white"); marks made here wait on this device until the
// league log has them, and a draft mark never turns into a breach before the league decides.
export function rulesView(ctx){
 const wait=needsLive('Правила лиги');if(wait)return wait;
 const official=(league.white||[]).map(String),draft=readJson('fbl-white-pending',null),marks=new Set(draft?draft.map(String):official),out=[];
 const args={rosters:ctx.rosters,byId,transfers:ctx.transfers,checked:(league.whiteChecked||[]).map(String),today:ctx.today,clubOf,nameOf:p=>p?.name};
 const checks=checkRules({...args,white:official}),shown=draft?checkRules({...args,white:[...marks]}):checks;
 const t0=checks[0].transfers;
 const intro=el('ul',null,'sp-rules-intro');
 for(const line of ['Минимум 1 rookie в составе.','Минимум 1 игрок по «белому правилу» — засчитывается по отцу, решает лига.','Не больше 2 игроков одного клуба NBA и ни одного игрока сразу в двух командах FBL.',`До ${t0.limit} трансферов за неделю лиги (пн–вс). Трансферы до старта сезона на Sports.ru бесплатны и в лимит не входят.`,`Трансферы только с ${TRANSFER_HOURS.from} до ${TRANSFER_HOURS.to} МСК.`])intro.append(el('li',line));
 out.push(el('h3','Правила лиги'),intro,el('p',`Нарушения разбирает ${LAWYER.name}, юрист лиги.`,'muted'));
 const unmarked=shown.filter(c=>c.whiteState==='unmarked').length;
 if(unmarked)out.push(el('p',`Белое правило: отметь по одному игроку у ${count(unmarked,'команды','команд','команд')} — кто закрывает правило. Дальше приложение само следит за продажами этих игроков.`,'warning'));
 const pickMark=(c,value)=>{for(const p of c.roster)marks.delete(String(p.id));marks.delete(`none:${c.team}`);if(value)marks.add(value);writeStored('fbl-white-pending',JSON.stringify([...marks]));renderSeason();};
 const table=el('table',null,'sp-table'),head=el('tr');for(const h of ['Команда','Rookie','Белое правило','Клубы NBA',`Трансферы до ${ddmm(t0.week.end)}`,'Итог'])head.append(el('th',h));table.append(head);
 for(const [i,c] of checks.entries()){
  const d=shown[i],v=verdict(c),tr=el('tr');if(c.team===0)tr.className='mine';
  const has=r=>c.violations.some(x=>x.rule===r);
  // On phones each row becomes a card: the label comes from data-label and the content sits in one inner block.
  const cell=(label,value,cls)=>{const td=el('td',null,cls),inner=el('div');td.dataset.label=label;if(value!=null)inner.append(value);td.append(inner);tr.append(td);return inner;};
  const name=cell('Команда',teamName(c.team),'team');if(c.team===0)name.append(' ',el('span','ты','chip chip--accent'));
  // No marked rookie beside a player whose rookie status the database does not know is a check, not a breach (rules.js).
  const rk=c.violations.find(x=>x.rule==='rookie'),unsure=rk?.certain===false;
  const rc=cell('Rookie',!rk?'✅ '+c.rookies.map(p=>p.name).join(', '):unsure?'⏳ не отмечен':'❌ нет',!rk?'':unsure?'wait':'bad');
  if(unsure)rc.append(el('small',`статус ${c.roster.filter(p=>p.isRookie!==true&&p.rookieStatus==='NOT_SHOWN_BY_SPORTS_RU').map(p=>p.name).join(', ')} базе не известен`));
  // One player per team is enough: the select names who satisfies the rule for this team, or the league's finding of none.
  const w=cell('Белое правило'),select=el('select');select.setAttribute('aria-label','Белое правило: '+teamName(c.team));
  const decided=c.whites[0]||marks.has(`none:${c.team}`);
  for(const [value,label] of [...(decided?[]:[['','не отмечен']]),...c.roster.map(p=>[String(p.id),p.name]),[`none:${c.team}`,'никто не подходит']]){const o=el('option',label);o.value=value;select.append(o);}
  select.value=d.whites[0]?String(d.whites[0].id):marks.has(`none:${c.team}`)?`none:${c.team}`:'';select.onchange=()=>pickMark(c,select.value);
  const state=d.whiteState==='ok'?['✅','ok']:d.whiteState==='unmarked'?['⏳','wait']:d.whiteState==='sold'?['⏳','wait']:['❌','bad'];
  w.append(el('span',state[0]+' ',state[1]),select);
  if(c.undecided.length)w.append(el('small',`нет решения лиги: ${c.undecided.map(p=>p.name).join(', ')}`));
  cell('Клубы NBA',has('club')?'❌ больше двух':'✅',has('club')?'bad':'');
  const tc=cell('Трансферы',`${c.transfers.left} из ${c.transfers.limit}`);tc.append(el('small',`осталось до ${ddmm(t0.week.end)}`));if(has('transfers'))tc.append(el('small','❌ превышение','bad'));
  const other=c.violations.filter(x=>x.rule==='time'||x.rule==='duplicate');
  const sum=cell('Итог',v.kind==='violation'?'❌ нарушение':v.kind==='check'?'⏳ проверить':'✅ в порядке',v.kind==='violation'?'bad':v.kind==='check'?'wait':'ok');
  if(other.length)sum.append(el('small',other.map(x=>x.rule==='time'?'время сделки':'игрок в двух командах').join(', ')));
  table.append(tr);
 }
 const wrap=el('div',null,'table-scroll');wrap.append(table);out.push(wrap);
 if(draft){const bar=el('div',null,'white-pending notice notice--warn');
  const send=link('Отправить в лигу ↗',issueUrl('белое правило',{action:'white',players:[...marks].map(x=>/^\d+$/.test(x)?Number(x):x)}),'btn-primary btn-sm');
  bar.append(el('p','Черновик белого правила на этом устройстве. Чтобы его увидели бот лиги и Telegram, отправь заявку.'),send,button('Сбросить',()=>{writeStored('fbl-white-pending','');renderSeason();},'btn-ghost btn-sm'));out.push(bar);}
 for(const c of checks.filter(c=>c.violations.length)){
  const v=verdict(c),items=[...v.breaches,...v.doubts];
  if(c.team===0){const box=el('div',null,'sp-appeal');box.append(el('h4',v.breaches.length?'⚠ У тебя нарушение':'⏳ Проверь свой состав'),...items.map(x=>el('p','• '+x.text)));
   box.append(button('Открыть мой состав',()=>{setTeam(0);writeStored('fbl-season-team','0');setView('teams');}));out.push(box);continue;}
  const box=el('div',null,'sp-appeal'),text=appeal(c,ctx.today,0),area=el('textarea');area.value=text;area.rows=10;area.readOnly=true;area.setAttribute('aria-label','Текст обращения');
  box.append(el('h4',`${v.breaches.length?'⚖️':'⏳'} ${teamName(c.team)} — ${v.breaches.length?'обращение к юристу лиги':'нужна проверка'}`),...items.map(x=>el('p','• '+x.text)));
  const letter=el('details',null,'inline');letter.append(el('summary','Текст обращения'),area);box.append(letter);
  const copy=button('Скопировать обращение',async()=>{try{await navigator.clipboard.writeText(text);copy.textContent='Скопировано ✓';setTimeout(()=>{copy.textContent='Скопировать обращение';},2000);}catch{letter.open=true;area.select();copy.textContent='Выдели текст и скопируй';}});
  const share=link('Отправить в Telegram ↗',`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`,'btn-secondary btn-sm');
  const actions=el('div',null,'actions');actions.append(copy,share);box.append(actions);out.push(box);
 }
 if(!checks.some(c=>c.violations.length))out.push(el('p','Нарушений не найдено.','muted'));
 return out;
}
