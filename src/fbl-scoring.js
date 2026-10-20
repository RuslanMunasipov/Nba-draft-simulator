/** FBL per-game fantasy points: the Sports.ru formula without the team result bonus (league owner, 20.10.2026: the
 * league scores on Yahoo, which cannot award points for a team's wins or take them for its losses). */
const KEYS=['pts','reb','ast','stl','blk','fga','fgm','fta','ftm','tov','pf','minutes'];
const points=s=>s.pts+s.reb+s.ast+s.stl+s.blk-(s.fga-s.fgm)-(s.fta-s.ftm)-2*s.tov-s.pf+(s.minutes>=10?2:1);
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
