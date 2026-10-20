import {parseOnlineGames} from './online-gamelog.js';
import {fetchDatabase} from './database-loader.js';
function text(tag,value){const node=document.createElement(tag);node.textContent=value;return node;}
export function onlinePanel(player){
 const box=document.createElement('details');box.className='online-evidence';box.append(text('summary','Карьера и свежие матчи'));
 const content=document.createElement('div');box.append(content);let loaded=false;
 box.ontoggle=async()=>{
  if(!box.open||loaded)return;loaded=true;content.textContent='Загружаю историю игрока…';
  try{
   const url=import.meta.env.BASE_URL+'data/players/'+String(player.id).replace(':','-')+'.json';
   const record=await fetchDatabase(url);const evidence=record.evidence||{};content.replaceChildren();
   if(record.draft){const d=record.draft;content.append(text('p',`Драфт ${d.year||''} · раунд ${d.round||''} · выбор ${d.selection||d.overall||''}`));}
   const seasons=evidence.career?.seasons||[];
   if(seasons.length){
    content.append(text('p',`NBA-карьера: ${seasons.length} сезонов · ${seasons[0].season} — ${seasons.at(-1).season}. Срез ESPN: ${new Date(evidence.career.checkedAt).toLocaleString('ru-RU')}.`));
    const select=document.createElement('select');select.setAttribute('aria-label','Сезон карьеры '+player.name);
    for(const season of [...seasons].reverse()){const option=text('option',season.season);option.value=String(season.year);select.append(option);}
    const line=text('p',''),show=()=>{const row=seasons.find(r=>r.year===Number(select.value)),s=row.perGame;line.textContent=`${row.games} игр · ${s.minutes.toFixed(1)} мин · PTS ${s.pts.toFixed(1)} · REB ${s.reb.toFixed(1)} · AST ${s.ast.toFixed(1)} · TOV ${s.tov.toFixed(1)} · PF ${s.pf.toFixed(1)}`;};
    select.onchange=show;content.append(select,line);show();
   }
   for(const season of (evidence.college?.seasons||[]).slice(-2)){const s=season.perGame;content.append(text('p',`NCAA ${season.season}: ${season.games} игр · ${s.minutes.toFixed(1)} мин · PTS ${s.pts.toFixed(1)} · REB ${s.reb.toFixed(1)} · AST ${s.ast.toFixed(1)} · TOV ${s.tov.toFixed(1)}. Уровень NCAA, не NBA-прогноз.`));}
   const groups=new Map();
   for(const game of evidence.recentGames||[]){const rows=groups.get(game.competition)||[];rows.push(game);groups.set(game.competition,rows);}
   for(const [competition,rows] of groups){const mean=k=>rows.reduce((sum,r)=>sum+r.stats[k],0)/rows.length;content.append(text('p',`${competition==='nba'?'Свежие NBA-матчи':'Летняя лига'}: ${rows.length} игр · ${mean('minutes').toFixed(1)} мин · PTS ${mean('pts').toFixed(1)} · REB ${mean('reb').toFixed(1)} · AST ${mean('ast').toFixed(1)} · TOV ${mean('tov').toFixed(1)}. Соревнования хранятся раздельно.`));}
   if(!seasons.length&&!groups.size)content.append(text('p','Основа оценки этого игрока указана в прогнозе выше.'));
   if(player.espnId)addLive(content,player);
  }catch{content.textContent='Не удалось загрузить карьеру игрока. Прогноз и выбор работают.';loaded=false;}
 };
 return box;
}
function addLive(content,player){
 const label=text('label','Год окончания сезона ');
 const year=document.createElement('input');year.type='number';year.min='1947';year.max=String(new Date().getFullYear()+1);year.value=year.max;year.setAttribute('aria-label','Онлайн-сезон '+player.name);label.append(year);
 const type=document.createElement('select');type.setAttribute('aria-label','Турнир '+player.name);
 for(const [value,title] of [['2','NBA · регулярный сезон'],['1','NBA · предсезонка'],['3','NBA · плей-офф']]){const option=text('option',title);option.value=value;type.append(option);}
 const button=text('button','Загрузить матчи ESPN'),status=text('p','Прямой запрос ESPN по выбранному сезону.'),output=document.createElement('div');status.setAttribute('role','status');
 button.onclick=async()=>{
  const season=Number(year.value);if(!Number.isInteger(season)||season<1947||season>new Date().getFullYear()+1){status.textContent='Укажи корректный год окончания сезона.';return;}
  button.disabled=true;status.textContent='Загружаю матчи ESPN…';
  try{
   const selectedType=type.value;
   const url='https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/'+player.espnId+'/gamelog?season='+season+'&seasontype='+selectedType;
   const data=await fetchDatabase(url,{attempts:1,timeoutMs:10000});output.replaceChildren();let count=0;
   for(const {event,stats:s} of parseOnlineGames(data,selectedType)){
    output.append(text('p',`${String(event.gameDate||'').slice(0,10)} · ${event.opponent?.displayName||''} · ${s.MIN||''} мин · PTS ${s.PTS} · REB ${s.REB||'—'} · AST ${s.AST||'—'} · TOV ${s.TO||'—'}`));count++;
   }
   status.textContent=count?`Получено онлайн: ${count} матчей. ${new Date().toLocaleString('ru-RU')}. Прогноз драфта обновляется проверенной сборкой, отдельно от просмотра матчей.`:'Источник не вернул матчей для этого сезона и турнира.';
  }catch{status.textContent='Прямой запрос ESPN сейчас недоступен. Сохранённая карьера остаётся доступна выше.';}finally{button.disabled=false;}
 };
 content.append(label,type,button,status,output);
}
