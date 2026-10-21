/** FBL per-game fantasy points as the league counts them on Yahoo (league settings, 21.10.2026): the box-score terms
 * plus 1 for every game played, whatever the minutes, and no team result bonus. */
export const GAME_PLAYED=1;
const KEYS=['pts','reb','ast','stl','blk','fga','fgm','fta','ftm','tov','pf','minutes'];
const points=s=>s.pts+s.reb+s.ast+s.stl+s.blk-(s.fga-s.fgm)-(s.fta-s.ftm)-2*s.tov-s.pf+GAME_PLAYED;
export function fblPoints(s) {
 for(const key of KEYS)if(!Number.isFinite(s?.[key])||s[key]<0)throw Error('Некорректная статистика: '+key);
 if(s.fgm>s.fga||s.ftm>s.fta)throw Error('Попаданий больше попыток');
 return points(s);
}
export function projectedFblPoints(s) {
 for(const key of KEYS)if(!Number.isFinite(s?.[key])||s[key]<0)throw Error('Недостаточно данных для прогноза: '+key);
 if(s.fgm>s.fga||s.ftm>s.fta)throw Error('Попаданий больше попыток');
 return points(s);
}
