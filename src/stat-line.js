import {GAME_PLAYED} from './fbl-scoring.js';
// The FBL formula term by term on an ESPN box-score line (the categories Yahoo counts): what each stat adds to the
// game's points. The terms add up to boxScorePoints exactly.
const num=v=>Number(v)||0,pair=v=>{const [m,a]=String(v||'0-0').split('-').map(Number);return [m||0,a||0];};
export function statLine(stats){
 if(!stats||!Object.keys(stats).length)return null;
 const [fgm,fga]=pair(stats.FG),[ftm,fta]=pair(stats.FT),[tpm,tpa]=pair(stats['3PT']);
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
  // Yahoo gives 1 point for the game played (GP), whatever the minutes.
  {key:'MIN',label:'Сыгранный матч',value:`${stats.MIN??0} мин`,note:'+1 за игру',points:GAME_PLAYED}];
 return {rows,total:rows.reduce((s,r)=>s+r.points,0)};
}
