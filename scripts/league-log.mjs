// Applies one league-log request (an issue opened by the repository owner) to data/fbl-league.json.
// The issue body carries a fenced JSON payload: {"action":"transfer",team,outId,inId,date,outPrice,inPrice},
// {"action":"undo"} (drops the latest transfer), {"action":"bank",team,value} or {"action":"white",players:[ids]} (the
// full list of players the league counts for the «белое правило»; it replaces the previous list).
import fs from 'node:fs';
import {seasonRosters,TEAM_COUNT} from '../src/season.js';
const FILE=new URL('../data/fbl-league.json',import.meta.url);
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
 const x={team:int(req.team),outId:pid(req.outId),inId:pid(req.inId),date:String(req.date),outPrice:int(req.outPrice),inPrice:int(req.inPrice)};
 if(x.team<0||x.team>=TEAM_COUNT||!/^\d{4}-\d\d-\d\d$/.test(x.date))fail('Неверная команда или дата.');
 if(league.transfers.some(t=>t.team===x.team&&t.outId===x.outId&&t.inId===x.inId&&t.date===x.date))fail('Такой трансфер уже записан.');
 try{seasonRosters([...league.transfers,x]);}catch(e){fail(e.message);}
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
 league.white=[...new Set(req.players.map(v=>/^none:[0-7]$/.test(v)?v:pid(v)))];note=`✅ Белое правило: в списке лиги ${league.white.length} игрок(ов).`;
}else fail('Неизвестное действие.');
fs.writeFileSync(FILE,JSON.stringify(league,null,2)+'\n');fs.writeFileSync('league-log-result.txt',note);console.log(note);
