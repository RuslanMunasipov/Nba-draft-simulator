// Applies one league-log request (an issue opened by the repository owner) to data/fbl-league.json.
// The issue body carries a fenced JSON payload: {"action":"transfer",team,outId,inId,date,outPrice,inPrice},
// {"action":"undo"} (drops the latest transfer) or {"action":"bank",team,value}.
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
let note;
if(req.action==='transfer'){
 const x={team:int(req.team),outId:int(req.outId),inId:int(req.inId),date:String(req.date),outPrice:int(req.outPrice),inPrice:int(req.inPrice)};
 if(x.team<0||x.team>=TEAM_COUNT||!/^\d{4}-\d\d-\d\d$/.test(x.date))fail('Неверная команда или дата.');
 if(league.transfers.some(t=>t.team===x.team&&t.outId===x.outId&&t.inId===x.inId&&t.date===x.date))fail('Такой трансфер уже записан.');
 try{seasonRosters([...league.transfers,x]);}catch(e){fail(e.message);}
 league.transfers.push(x);note=`✅ Трансфер записан: команда ${x.team+1}, ${x.outId} → ${x.inId} (${x.date}).`;
}else if(req.action==='undo'){
 if(!league.transfers.length)fail('Журнал пуст.');
 const x=league.transfers.pop();note=`↩️ Удалён последний трансфер: команда ${x.team+1}, ${x.outId} → ${x.inId}.`;
}else if(req.action==='bank'){
 const team=int(req.team);if(team<0||team>=TEAM_COUNT)fail('Неверная команда.');
 if(req.value===null)delete league.banks[team];else league.banks[team]=int(req.value);
 note=`✅ Банк команды ${team+1}: ${req.value??'расчётный'}.`;
}else fail('Неизвестное действие.');
fs.writeFileSync(FILE,JSON.stringify(league,null,2)+'\n');fs.writeFileSync('league-log-result.txt',note);console.log(note);
