/** Sports.ru FBL per-game fantasy points. Result bonus must be explicitly sourced. */
export function fblPoints(s, resultBonus) {
 const keys=['pts','reb','ast','stl','blk','fga','fgm','fta','ftm','tov','pf','minutes'];
 for(const key of keys)if(!Number.isFinite(s?.[key])||s[key]<0)throw Error('Некорректная статистика: '+key);
 if(s.fgm>s.fga||s.ftm>s.fta)throw Error('Попаданий больше попыток');
 if(!Number.isFinite(resultBonus))throw Error('Не подтверждён бонус результата');
 return s.pts+s.reb+s.ast+s.stl+s.blk-(s.fga-s.fgm)-(s.fta-s.ftm)-2*s.tov-s.pf+(s.minutes>=10?2:1)+resultBonus;
}
export function projectedFblPoints(s, resultBonus) {
 const keys=['pts','reb','ast','stl','blk','fga','fgm','fta','ftm','tov','pf','minutes'];
 for(const key of keys)if(!Number.isFinite(s?.[key])||s[key]<0)throw Error('Недостаточно данных для прогноза: '+key);
 if(s.fgm>s.fga||s.ftm>s.fta)throw Error('Попаданий больше попыток');
 if(!Number.isFinite(resultBonus))throw Error('Нет оценки бонуса результата');
 return s.pts+s.reb+s.ast+s.stl+s.blk-(s.fga-s.fgm)-(s.fta-s.ftm)-2*s.tov-s.pf+(s.minutes>=10?2:1)+resultBonus;
}
