// Every played game the collector scored (data/season-live sports-current.json, pointsSource ESPN) against the awards
// bot's archive of the same ESPN event and athlete (data/awards-bot archive.json): one FBL number per game everywhere
// (league owner, 22.10.2026). Usage: node scripts/check-game-points.mjs [sports-current.json] [archive.json]
// (default: .cache/season-live and .cache/awards-bot, fetched from their branches). Exits 1 on a mismatch.
import fs from 'node:fs';
import {execSync} from 'node:child_process';
export function gamePointsMismatches(snapshot,archive){
 const byGame=new Map((archive?.lines||[]).map(l=>[`${l.e}|${l.a}`,l.p]));let compared=0;const mismatches=[];
 for(const [sid,info] of Object.entries(snapshot?.players||{}))for(const g of info.games||[]){
  if(g.pointsSource!=='ESPN'||!g.espnEvent||!info.espnId)continue;
  const p=byGame.get(`${g.espnEvent}|${info.espnId}`);if(p===undefined)continue;
  compared++;if(p!==g.points)mismatches.push({sportsId:sid,name:info.name,date:g.date,site:g.points,archive:p});
 }
 return {compared,mismatches};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [live='.cache/season-live/sports-current.json',awards='.cache/awards-bot/archive.json']=process.argv.slice(2);
 for(const [file,branch,name] of [[live,'data/season-live','sports-current.json'],[awards,'data/awards-bot','archive.json']])
  if(!fs.existsSync(file)){fs.mkdirSync(file.replace(/\/[^/]+$/,''),{recursive:true});execSync(`git fetch -q origin ${branch} && git show FETCH_HEAD:${name} > ${file}`);}
 const out=gamePointsMismatches(JSON.parse(fs.readFileSync(live,'utf8')),JSON.parse(fs.readFileSync(awards,'utf8')));
 console.log(`${out.compared} games compared, ${out.mismatches.length} mismatches`);for(const m of out.mismatches)console.log(JSON.stringify(m));
 process.exit(out.mismatches.length?1:0);
}
