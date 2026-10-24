// Inside FBL, the Monday show (inside-show.js): the cards its blocks carry beside their pictures, drawn by the code in
// the awards bot's style (cards.js: 1080×1350, Manrope and Oswald, the same palette), never by a model, so no name or
// number on them can be wrong. Christopher Dildo's table of the week (every team's FBL points of the week, its place and
// its move), Zak Onn's case file for the new week (each team's standing before the law: its deals in reserve, the white
// rule, the rookie rule, a team under his watch), and the show's opener when its cover picture could not be drawn.
// Pure: logos and emoji come in through `look` (render.mjs loadLook).
import {LEAGUE_TEAMS} from '../src/teams.js';
import {int} from '../src/format.js';
import {esc} from './messages.js';
import {page,opener,NOMINATION} from './cards.js';

const MONTHS=['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const dayRu=d=>`${Number(d.slice(8))} ${MONTHS[Number(d.slice(5,7))-1]}`;
const span=week=>`${dayRu(week.start)} – ${dayRu(week.end)}`;
const logo=(look,t)=>{const l=look.logo(t);return l?`<img class="lg" src="${l}">`:look.emoji(LEAGUE_TEAMS[t]?.symbol||'🏀');};
const indexOf=name=>LEAGUE_TEAMS.findIndex(t=>t.name===name);
const STYLE=`<style>
.tbl{display:flex;flex-direction:column;gap:12px;margin-top:4px}
.tr{display:grid;grid-template-columns:64px 76px minmax(0,1fr) 200px 110px;align-items:center;gap:16px;height:118px;padding:0 22px;border-radius:22px;background:#ffffff0d;border:1px solid #ffffff14}
.tr>div,.case>div{min-width:0}
.tr .pl{font-family:Oswald;font-weight:700;font-size:46px;text-align:center;color:#c8d0ea}
.tr .lg,.tr .emo{width:68px;height:68px;object-fit:contain;padding:6px;border-radius:50%;background:#e9edff}
.tr .nm{font-size:32px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tr .gm{font-size:21px;color:#aab4d4;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tr .bar{height:18px;border-radius:9px;margin-top:10px;background:linear-gradient(90deg,#3ea6ff,#a06bff)}
.tr .wk{display:flex;flex-direction:column;align-items:flex-end}
.tr .wk .n{font-family:Oswald;font-weight:700;font-size:52px;line-height:1}
.tr .wk .u{font-size:16px;font-weight:800;letter-spacing:2px;color:#aab4d4}
.tr .mv{font-family:Oswald;font-weight:700;font-size:30px;text-align:right}
.tr .mv small{display:block;font-family:Manrope;font-size:16px;color:#aab4d4;font-weight:700}
.up{color:#4ade80}.down{color:#ff6b7a}.same{color:#7f8bb3}
.case{display:grid;grid-template-columns:76px minmax(0,1fr) auto;align-items:center;gap:16px;height:124px;padding:0 20px;border-radius:20px;background:#ffffff0b;border:1px solid #ffffff14;border-left:10px solid #22c55e}
.case.check{border-left-color:#f5b301}.case.breach{border-left-color:#ff4d5e;background:#ff4d5e12}
.case .lg,.case .emo{width:68px;height:68px;object-fit:contain;padding:6px;border-radius:50%;background:#e9edff}
.case .nm{font-size:30px;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:560px}
.case .nm .emo{width:30px;height:30px;padding:0;background:none;vertical-align:-4px}
.case .chips{display:flex;gap:10px;margin-top:8px}
.chip{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:10px;background:#ffffff12;font-size:19px;font-weight:800;color:#dfe5ff;white-space:nowrap}
.chip .emo{width:22px;height:22px;padding:0;background:none}
.stamp{font-family:Oswald;font-weight:700;font-size:26px;letter-spacing:2px;padding:6px 14px;border:4px solid;border-radius:10px;transform:rotate(-4deg);white-space:nowrap}
.stamp.ok{color:#22c55e;border-color:#22c55e}.stamp.check{color:#f5b301;border-color:#f5b301}.stamp.breach{color:#ff4d5e;border-color:#ff4d5e}
</style>`;
const withStyle=html=>html.replace('</head>',`${STYLE}</head>`);

// Christopher Dildo's table of the week. facts: inside-show.js numbersFacts (table: place, placeBefore, moved, points,
// weekFo; the first week has no places before it).
export function weekTableCard(week,facts,look,fonts){
 const rows=facts.table,top=Math.max(1,...rows.map(r=>r.weekFo));
 const move=r=>r.placeBefore==null?`<span class="same">—</span>`:r.moved>0?`<span class="up">▲${r.moved}</span>`:r.moved<0?`<span class="down">▼${-r.moved}</span>`:`<span class="same">=</span>`;
 const body=`<div class="tbl">${rows.map(r=>{const t=indexOf(r.team);
  return `<div class="tr"><div class="pl">${r.place}</div>${logo(look,t)}<div><div class="nm"${r.team.length>20?' style="font-size:27px"':''}>${esc(r.team)}</div><div class="gm">GM ${esc(r.gm||'')} · ${int(r.points)} ФО в таблице</div>
<div class="bar" style="width:${Math.max(4,Math.round(100*Math.max(0,r.weekFo)/top))}%"></div></div><div class="wk"><span class="n">${int(r.weekFo)}</span><span class="u">ФО ЗА НЕДЕЛЮ</span></div><div class="mv">${move(r)}<small>место</small></div></div>`;}).join('')}</div>`;
 return withStyle(page(look,fonts,{title:'Цифры недели',sub:`Неделя ${week.n}<br>${esc(span(week))}`,foot:'📓 Кристофер Дилдо · Inside FBL'},body));
}

// Zak Onn's case file for the new week. facts: inside-show.js lawFacts (teams: verdict, watched, newWeek, whiteRule,
// rookieRule). Words of a case, never of a machine: the stamp, the deals in reserve, the rules.
const RULE_MARK={'соблюдено':'✅','нарушено':'🚫'};
export function dossierCard(week,facts,look,fonts){
 const kind=v=>v==='нарушение'?'breach':v==='под проверкой'?'check':'ok';
 const stamp=v=>({ok:'ЧИСТО',check:'ПРОВЕРКА',breach:'НАРУШЕНИЕ'})[kind(v)];
 const body=`<div class="tbl">${facts.teams.map(x=>{const t=indexOf(x.team);
  return `<div class="case ${kind(x.verdict)==='ok'?'':kind(x.verdict)}">${logo(look,t)}<div><div class="nm"${x.team.length>22?' style="font-size:27px"':''}>${esc(x.team)}${x.watched?` ${look.emoji('🎯')}`:''}</div>
<div class="chips"><span class="chip">СДЕЛКИ ${x.newWeek.transfersLeft} ИЗ ${x.newWeek.limit}</span><span class="chip">БЕЛОЕ ${look.emoji(RULE_MARK[x.whiteRule]||'❔')}</span><span class="chip">НОВИЧОК ${look.emoji(RULE_MARK[x.rookieRule]||'❔')}</span></div></div>
<div class="stamp ${kind(x.verdict)}">${stamp(x.verdict)}</div></div>`;}).join('')}</div>`;
 return withStyle(page(look,fonts,{title:'Досье на неделю',sub:`Рынок открыт<br>${esc(facts.newWeek.opens)} – ${esc(facts.newWeek.closes)}`,
  note:`Сделки: ${facts.newWeek.hours} · 🎯 под прицелом`,foot:'⚖️ Зак Онн · Закон и порядок'},body));
}

// The show's opener, when Claude could not write its cover or it could not be drawn.
export const showOpener=(week,look,fonts)=>opener(look,fonts,{nom:NOMINATION.show,date:`Выпуск ${week.n}`,sub:`главный журнал лиги · ${span(week)}`});
