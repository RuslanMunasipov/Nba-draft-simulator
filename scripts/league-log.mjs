// Applies one league-log request (an issue opened by the repository owner) to data/fbl-league.json.
// The issue body carries a fenced JSON payload: {"action":"transfer",team,outId,inId,date,outPrice,inPrice[,platform]},
// {"action":"undo"} (drops the latest transfer), {"action":"bank",team,value} or {"action":"white",players:[ids]} (the
// full list of players the league counts for the «белое правило»; it replaces the previous list).
import fs from 'node:fs';
import {seasonRosters,TEAM_COUNT} from '../src/season.js';
const FILE=new URL('../data/fbl-league.json',import.meta.url);
// Teams whose transfers come from their Sports.ru journal: a deal the league logs for one was made off Sports.ru (Yahoo,
// regulation 3.3) on the roster the journal built, which this log does not hold; the site checks it against the journal.
const CONNECTED=new Set(Object.keys(JSON.parse(fs.readFileSync(new URL('../data/fbl-sports-teams.json',import.meta.url),'utf8')).teams||{}).map(Number));
const body=process.env.ISSUE_BODY||'';
const match=body.match(/```json\s*([\s\S]*?)```/);
function fail(message){fs.writeFileSync('league-log-result.txt','❌ '+message);console.error(message);process.exit(1);}
if(!match)fail('В заявке нет блока ```json```.');
let req;try{req=JSON.parse(match[1]);}catch{fail('JSON заявки не читается.');}
const league=JSON.parse(fs.readFileSync(FILE,'utf8'));
const int=v=>Number.isInteger(v)?v:fail('Неверное число: '+v);
// Player ids are NBA numbers, or provider-prefixed strings for players without one ("espn:5041935", "sports:1796991").
const pid=v=>Number.isInteger(v)||/^(espn|sports):\d+$/.test(v)?v:fail('Неверный id игрока: '+v);
let note;
if(req.action==='transfer'){
 const x={team:int(req.team),outId:pid(req.outId),inId:pid(req.inId),date:String(req.date),outPrice:int(req.outPrice),inPrice:int(req.inPrice),
  ...(req.platform?{platform:String(req.platform).slice(0,20)}:{})};
 if(x.team<0||x.team>=TEAM_COUNT||!/^\d{4}-\d\d-\d\d$/.test(x.date))fail('Неверная команда или дата.');
 if(x.outId===x.inId)fail('Игрок не может заменить сам себя.');
 if(league.transfers.some(t=>t.team===x.team&&t.outId===x.outId&&t.inId===x.inId&&t.date===x.date))fail('Такой трансфер уже записан.');
 if(!CONNECTED.has(x.team))try{seasonRosters([...league.transfers.filter(t=>!CONNECTED.has(t.team)),x]);}catch(e){fail(e.message);}
 league.transfers.push(x);note=`✅ Трансфер записан: команда ${x.team+1}, ${x.outId} → ${x.inId} (${x.date}).`;
}else if(req.action==='undo'){
 // With a team, its own latest transfer is undone, not whichever team moved last.
 const team=req.team===undefined?null:int(req.team),i=league.transfers.findLastIndex(t=>team===null||t.team===team);
 if(i<0)fail('Журнал пуст.');
 const [x]=league.transfers.splice(i,1);note=`↩️ Удалён последний трансфер: команда ${x.team+1}, ${x.outId} → ${x.inId}.`;
}else if(req.action==='bank'){
 const team=int(req.team);if(team<0||team>=TEAM_COUNT)fail('Неверная команда.');
 if(req.value===null)delete league.banks[team];else league.banks[team]=int(req.value);
 note=`✅ Банк команды ${team+1}: ${req.value??'расчётный'}.`;
}else if(req.action==='white'){
 if(!Array.isArray(req.players))fail('Нужен список players.');
 // A player id, or "none:<team>" when the league found that a team has no such player.
 league.white=[...new Set(req.players.map(v=>/^none:[0-7]$/.test(v)?v:pid(v)))];
 // Optional "checked": every player the league decided on (counting or not), so a fully decided roster with nobody
 // counting is a breach and a player nobody decided on is reported as undecided.
 if(req.checked!==undefined){if(!Array.isArray(req.checked))fail('checked должен быть списком id.');league.whiteChecked=[...new Set([...req.checked.map(pid),...league.white.filter(v=>!String(v).startsWith('none:'))])];}
 note=`✅ Белое правило: засчитываются ${league.white.length}${league.whiteChecked?`, решение принято по ${league.whiteChecked.length} игрокам`:''}.`;
}else fail('Неизвестное действие.');
fs.writeFileSync(FILE,JSON.stringify(league,null,2)+'\n');fs.writeFileSync('league-log-result.txt',note);console.log(note);
