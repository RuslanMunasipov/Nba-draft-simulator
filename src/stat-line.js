// The FBL formula term by term on an ESPN box-score line (the categories Yahoo counts): what each stat adds to the
// game's points. The terms add up to boxScorePoints exactly.
const num=v=>Number(v)||0,pair=v=>{const [m,a]=String(v||'0-0').split('-').map(Number);return [m||0,a||0];};
const clock=v=>{const m=String(v??'').match(/^(\d+):(\d{2})$/);return m?Number(m[1])+Number(m[2])/60:num(v);};
export function statLine(stats){
 if(!stats||!Object.keys(stats).length)return null;
 const [fgm,fga]=pair(stats.FG),[ftm,fta]=pair(stats.FT),[tpm,tpa]=pair(stats['3PT']),min=clock(stats.MIN);
 const rows=[
  {key:'PTS',label:'Очки',value:num(stats.PTS),points:num(stats.PTS)},
  {key:'REB',label:'Подборы',value:num(stats.REB),points:num(stats.REB)},
  {key:'AST',label:'Передачи',value:num(stats.AST),points:num(stats.AST)},
  {key:'STL',label:'Перехваты',value:num(stats.STL),points:num(stats.STL)},
  {key:'BLK',label:'Блок-шоты',value:num(stats.BLK),points:num(stats.BLK)},
  {key:'FG',label:'Броски с игры',value:`${fgm}/${fga}`,note:tpa?`трёхочковые ${tpm}/${tpa}`:'',points:-(fga-fgm)},
  {key:'FT',label:'Штрафные',value:`${ftm}/${fta}`,points:-(fta-ftm)},
  {key:'TO',label:'Потери',value:num(stats.TO),note:'×2',points:-2*num(stats.TO)},
  {key:'PF',label:'Фолы',value:num(stats.PF),points:-num(stats.PF)},
  // ESPN rounds minutes: a "10" may be 9:30-9:59, which Sports.ru scores +1.
  {key:'MIN',label:'Минуты',value:String(stats.MIN??'0'),note:min>=10?'10+ мин':'меньше 10 мин',points:min>=10?2:1,unsure:/^\s*10\s*$/.test(String(stats.MIN??''))}];
 return {rows,total:rows.reduce((s,r)=>s+r.points,0)};
}
