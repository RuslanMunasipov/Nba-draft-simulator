// Sentences that explain a forecast and the season tab's numbers, built from the data they describe so that they
// cannot drift from it: the forecast's own sources and fields, the database's held-out audit and the in-season calibration.
import {dec,int,signed,count} from './format.js';
import {CALIBRATION,WEEKLY_TRANSFERS,CAP,CLUB_LIMIT} from './season.js';

const NBSP='\u00a0',games=n=>count(Math.round(n),'матч','матча','матчей');
const near=(x,y,tol)=>Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=tol;
// "2026" → "2025/26": the audit names a season by the year it ends.
const seasonLabel=end=>Number.isFinite(end)?`${end-1}/${String(end).slice(2)}`:null;

// How the final numbers came out of the model and ESPN, read from the forecast: the documented mean of both
// (forecast.gamesBasis 'MEAN_ESPN_MODEL'), or, for older data, whatever the numbers show (games ESPN's alone).
export function combineNote(f){
 const m=f?.sources?.model,e=f?.sources?.espn;if(!m||!e)return '';
 const rate=near(f.meanPerGame,(m.perGame+e.perGame)/2,.06),meanGames=f.gamesBasis==='MEAN_ESPN_MODEL'||!near(m.games,e.games,.5)&&near(f.games,(m.games+e.games)/2,.5);
 const espnGames=!meanGames&&near(f.games,e.games,.5)&&!near(f.games,m.games,.5);
 if(rate&&meanGames)return 'ФО за матч и число матчей — средние модели и ESPN';
 if(rate&&espnGames)return 'ФО за матч — среднее модели и ESPN, число матчей — ESPN';
 if(rate)return 'ФО за матч — среднее модели и ESPN';
 if(meanGames)return 'число матчей — среднее модели и ESPN';
 return espnGames?'число матчей — ESPN':'';
}
// Where a forecast comes from, in one sentence: the career model, ESPN, the draft-pick model, their numbers and the result.
export function forecastSources(f){
 if(f.version!==4)return `Основа: ${f.origin==='ESPN_INDIVIDUAL'?'индивидуальный прогноз ESPN':'исторический ориентир'}.${f.rookieExtrapolation&&f.analogs?.length?' Похожие игроки для оценки разброса: '+f.analogs.map(a=>a.name).join(', ')+'.':''}`;
 const m=f.sources?.model,e=f.sources?.espn,parts=[],note=combineNote(f);
 if(m)parts.push(`${f.draftPick?`модель новичков (пик №${f.draftPick})`:f.origin==='UNDRAFTED_ROOKIE_MODEL'?'модель незадрафтованных новичков':'модель по карьере'}: ${dec(m.perGame)} × ${games(m.games)}`);
 if(e)parts.push(`ESPN: ${dec(e.perGame)} × ${Math.round(e.games)}`);
 return `Основа: ${parts.join('; ')}${e?` → итог ${dec(f.meanPerGame)} × ${games(f.games)}${note?` (${note})`:''}`:''}.${Number.isFinite(f.shortSeasonRisk)?` Риск короткого сезона (меньше четверти матчей): ${Math.round(f.shortSeasonRisk*100)}${NBSP}%.`:''}`;
}

// The season range's measured hit rate on the held-out season (projectionModelAudit.holdout), or null without an audit.
export function rangeCoverage(audit){
 const h=audit?.holdout,c=h?.coverage80;
 return Number.isFinite(c)?{share:c,season:seasonLabel(audit.testTarget),games:Number.isFinite(h.gamesCoverage80)?h.gamesCoverage80:null}:null;
}
const share=x=>`${Math.round(x*100)}${NBSP}%`;
// "Слабый/сильный сезон" on the card: the 10th and 90th percentiles, with how often such a range held on a season the
// model never saw (it is not "8 seasons out of 10" unless the check says so).
export function seasonRangeLine(f,audit){
 const c=rangeCoverage(audit),head=`Слабый сезон ${int(f.seasonFloor)}, сильный ${int(f.seasonCeiling)} — 10-й и 90-й процентили прогноза`;
 return c?`${head}: на проверке${c.season?` по сезону ${c.season}`:''}, которого модель не видела, между ними оказались ${share(c.share)} игроков (цель — 80${NBSP}%).`:`${head}.`;
}
export function rangeMethod(f,audit){
 const c=rangeCoverage(audit);
 if(!c)return 'Слабый и сильный сезон — 10-й и 90-й процентили прогноза модели.';
 return `Слабый и сильный сезон — 10-й и 90-й процентили прогноза модели; на отложенном сезоне${c.season?' '+c.season:''} в такой диапазон попали ${share(c.share)} игроков при цели 80${NBSP}%.${f?.sources?.espn?' Для игроков с прогнозом ESPN проверка касается только модельной части.':''}`;
}

// Absence rates on the card: the player's own logged spells (ownShortPer82/ownLongPer82, unscaled) when the database has
// them; otherwise the chain's rates are only the ones that reproduce the forecast games, and are named so.
const rate=x=>x>82?'больше 82':dec(x);
export function absenceRates(a,forecastGames){
 if(Number.isFinite(a?.ownShortPer82)&&Number.isFinite(a?.ownLongPer82))
  return {own:true,head:'Пропуски по логам 2002–2026',short:a.ownShortPer82,long:a.ownLongPer82,text:`коротких (1–3 матча) ${dec(a.ownShortPer82)} за 82 матча при ${dec(a.leagueShortSpellsPer82)} у ровесников, длинных (4+) ${dec(a.ownLongPer82)} при ${dec(a.leagueLongSpellsPer82)}`};
 const head=Number.isFinite(forecastGames)?`Темп пропусков под прогноз ${games(forecastGames)}`:'Темп пропусков под прогноз числа матчей';
 return {own:false,head,short:a?.shortSpellsPer82,long:a?.longSpellsPer82,text:`коротких (1–3 матча) ${rate(a?.shortSpellsPer82)} и длинных (4+) ${rate(a?.longSpellsPer82)} за 82 матча${a?.ownShortPer82===null?'; своих матчей в логах мало для личного темпа':''}`};
}
const SEASON_END={healthy:'прошлый сезон закончил в строю',endedOut:'прошлый сезон закончил с пропуском 10+ матчей',noGames:'прошлый сезон пропустил целиком'};
// Health in numbers: absence rates, how last season ended, and the model's games range.
export function healthLine(a,f,audit){
 const r=absenceRates(a,f?.games),c=rangeCoverage(audit),range=a.gamesRange;
 const cover=c?.games!=null&&!f?.sources?.espn?` (на сезоне${c.season?' '+c.season:''} в такой диапазон попали ${share(c.games)} игроков)`:'';
 const span=Array.isArray(range)&&range.length===2?` По модели с вероятностью 80${NBSP}% сыграет ${range[0]}–${range[1]} матчей, медиана ${a.gamesMedian}${cover}.`:'';
 return `${r.head}: ${r.text}; ${SEASON_END[a.lastSeasonEnd]??'конец прошлого сезона неизвестен'}.${span}`;
}
// The short version for the season tab's "about the forecast".
export function absenceShort(a,forecastGames){
 const r=absenceRates(a,forecastGames);
 return r.own?`${r.head}: ${dec(r.short)} коротких и ${dec(r.long)} длинных за 82 матча (у ровесников ${dec(a.leagueShortSpellsPer82)} и ${dec(a.leagueLongSpellsPer82)}).`
  :`${r.head}: ${rate(r.short)} коротких и ${rate(r.long)} длинных за 82 матча.`;
}

// Sports.ru's printed points include its team result bonus, which FBL does not count: next to FBL forecasts a season is
// shown without it (fblPerGame) when the database has it, otherwise labelled as Sports.ru's own number.
const seasonName=k=>k.replace(/^20(\d\d)-(\d\d)$/,'$1/$2');
export function sportsSeasonsLine(entries){
 if(!entries?.length)return '';
 const clean=entries.every(([,v])=>Number.isFinite(v.fblPerGame));
 return `${clean?'Sports.ru без бонуса за результат':'Sports.ru, с бонусом за результат'}: ${entries.map(([k,v])=>`${seasonName(k)} — ${dec(clean?v.fblPerGame:v.perGame)} × ${v.games}`).join(' · ')}`;
}
// The forecast against last Sports.ru season (sportsCheck): like for like when its basis is the FBL formula.
export function sportsCheckLine(c){
 const pct=`${signed(c.gap*100)}${NBSP}%`,season=seasonName(String(c.season));
 const where=c.basis==='FBL_NO_RESULT_BONUS'?`по формуле FBL (Sports.ru без бонуса за результат: ${dec(c.perGame)} за матч${Number.isFinite(c.sportsPerGame)?`, с бонусом ${dec(c.sportsPerGame)}`:''})`:`на Sports.ru (${dec(c.perGame)} за матч, с бонусом за результат, которого в FBL нет)`;
 return `${c.flag?'⚠ ':''}${pct} к сезону ${season} ${where}.${c.flag?' Проверь роль, состав и здоровье и при необходимости задай поправку.':''}`;
}

// "Как считается" on the season tab, from the in-season calibration and the league limits in the code.
export function seasonMethod(calibration=CALIBRATION){
 const e=calibration.points.established,n=calibration.points.newcomer,k=calibration.availability.priorGames;
 const chances='Шансы на 1-е место и топ-3 — 20 000 розыгрышей остатка сезона: у каждого игрока свой разброс прогноза, игроки независимы, составы как сейчас, будущие трансферы не учтены. Это оценка модели, а не гарантия.';
 const transfers=[`ФО за матч — прогноз сезона по формуле FBL (Sports.ru без бонуса за результат), который с каждым сыгранным матчем сдвигается к фактическим очкам: очки за минуту — с весом прогноза ${count(e.rateGames,'матч','матча','матчей')} (у новичков ${n.rateGames}), минуты — быстрее (вес прогноза ${e.minuteGames}, у новичков ${n.minuteGames}) и с упором на последние игры.`,
  `Ожидаемые ФО = ФО за матч × шанс сыграть каждый оставшийся матч клуба по календарю. Шанс — из цепи коротких и длинных пропусков игрока, подогнанной к его доле матчей (прогноз с весом ${k} матчей плюс сыгранные и пропущенные в сезоне); без цепи — просто эта доля. По отчёту ESPN: не играет — 0 до даты возвращения (без даты — 10 дней), под вопросом — 50${NBSP}% на ближайшие матчи, до конца сезона — 0.`,
  `Допустимость: позиция Sports.ru (по 2 на позицию), текущие цены, банк, минимум один rookie, не больше ${CLUB_LIMIT} игроков одного клуба NBA, игрок по «белому правилу», лимит ${WEEKLY_TRANSFERS} трансфера за неделю лиги, бюджет ${int(CAP)}. Пакеты — точная оптимизация.`,
  'Выигрыш «неделя» — до конца текущего тура, «4 недели» — 28 дней начиная с сегодня, «сезон» — до последнего тура.',
  'Sports.ru обновляется каждые 2 часа, травмы и матчи ESPN — при открытии, во время матчей — раз в минуту.'];
 return {
  overview:['Очки — по формуле FBL: ФО Sports.ru за матч без бонуса за результат команды; игрок приносит их, только пока он в команде. Официальная таблица лиги — на Yahoo, здесь её реконструкция.','«В игре» — матчи, которые Sports.ru ещё не засчитал: протоколы ESPN по той же формуле, предварительно.','Прогноз — очки сейчас плюс ожидание до конца сезона с учётом календаря и травм. Равные очки делят место.',chances],
  transfers,
  teams:['Факт — очки по формуле FBL за период; игрок считается, только пока он в команде. Прогноз — факт плюс очки матчей, которые Sports.ru ещё не засчитал, плюс ожидаемые очки до конца периода.','Неделя — текущий тур Sports.ru; 4 недели — факт с начала текущего тура и прогноз на 28 дней вперёд, как у выигрышей трансферов; сезон — от первого тура до последнего.','Место в лиге — среди 8 команд FBL по тем же очкам вместе с ещё не засчитанными матчами, как в таблице на «Обзоре»; равные очки делят место. Официальная таблица — на Yahoo.',chances,...transfers]};
}
