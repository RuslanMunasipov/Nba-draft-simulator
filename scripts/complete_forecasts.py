"""Every catalog entry gets an explicit full-formula estimate and evidence grade.
Weak group priors are visible and are never promoted to a personal ESPN forecast.
"""
import json,math,statistics
from collections import Counter
from pathlib import Path
from build_forecasts import partial
try:from fbl_formula import GAME_PLAYED
except ImportError:from scripts.fbl_formula import GAME_PLAYED
KEYS=['pts','reb','ast','stl','blk','tov','pf','fgm','fga','ftm','fta','minutes']
def from_history(player,history):
 career=(player.get('onlineEvidence',{}).get('career') or {}).get('seasons',[])
 usable=[r for r in career if r.get('year',9999)<=2026 and r.get('games',0)>0 and r.get('perGame') and all(k in r['perGame'] for k in KEYS)]
 if usable:
  row=max(usable,key=lambda r:r['year'])
  return dict(perGame=row['perGame'],games=row['games'],season=row['season'])
 p=history.get(player.get('nbaId'))
 if not p:return None
 year=max(p['seasons']);row=p['seasons'][year]
 if not all(k in row['averages'] for k in KEYS):return None
 return dict(perGame={k:row['averages'][k] for k in KEYS},games=row['games'],season=year)
def complete(data,history):
 history={p['id']:p for p in history['players']}
 donors=[]
 for p in data['players']:
  h=from_history(p,history)
  if h and h['games']>=20:
   donors.append(dict(h,name=p['name'],positions=p['positions'],rookie=p.get('nbaExperience')==1))
 if not donors:raise ValueError('No empirical coverage cohort')
 error=(data.get('careerModelAudit') or {}).get('validation',{}).get('error80')
 if error is None:error=statistics.median(abs((d['perGame']['pts']-2*d['perGame']['tov'])*d['games']) for d in donors)
 added=0;career_replaced=0
 for p in data['players']:
  f=p.get('forecast');prediction=p.get('careerPrediction')
  # ESPN's individual projections are never the forecast (the league owner, 21.10.2026: the model alone, as for every
  # player): such a player gets the estimate a player without one would get.
  if f and f.get('origin')=='ESPN_INDIVIDUAL':f=None
  if f and not (prediction and prediction['eligibleForPrimary'] and not p.get('isRookie')):
   f['coverageTier']='PERSONAL_HISTORY'
   f['intervalCalibration']='HISTORICAL_MODEL_ONLY'
   f['seasonFloor']=min(f['meanSeason'],max(0,f['seasonFloor']))
   f['seasonCeiling']=max(f['meanSeason'],f['seasonCeiling'])
   continue
  conditional=p.get('currentRosterStatus')!='SOURCE_REPORTED'
  rookie=p.get('rookiePrediction')
  if rookie and rookie['eligibleForPrimary'] and not f:
   s=rookie['perGame'];games=rookie['games'];origin='NCAA_TRAINED_TRANSFER'
   basis='Перенос личной NCAA-статистики '+rookie['collegeSeason']+' в NBA; обучение на '+str(rookie['trainingPlayers'])+' игроках'
   tier='LIMITED_PERSONAL'
  elif prediction and prediction.get('eligibleForPrimary'):
   s=prediction['perGame'];games=prediction['games'];origin='CAREER_TRAINED'
   basis='Модель всей доступной NBA-карьеры: '+str(prediction['historySeasons'])+' сезонов; '+prediction['firstSeason']+' — '+prediction['lastSeason']
   tier='PERSONAL_HISTORY';career_replaced+=bool(f)
  else:
   personal=from_history(p,history)
   if personal:
    s=personal['perGame'];games=personal['games'];origin='PERSONAL_SMALL_OR_OLD_HISTORY'
    basis='Личная NBA-статистика '+personal['season']+'; малая или устаревшая выборка';tier='LIMITED_PERSONAL'
   else:
    cohort=[d for d in donors if d['rookie']] if p.get('isRookie') else [d for d in donors if set(d['positions'])&set(p['positions'])]
    if not cohort:cohort=donors
    midpoint=statistics.median(partial(d['perGame'])-d['perGame']['pf'] for d in cohort)
    donor=min(cohort,key=lambda d:abs(partial(d['perGame'])-d['perGame']['pf']-midpoint))
    s=donor['perGame'];games=statistics.median(d['games'] for d in cohort);origin='EMPIRICAL_ROLE_PRIOR';tier='GROUP_PRIOR'
    basis='Групповой NBA-ориентир по '+str(len(cohort))+' игрокам; это не персональный прогноз будущей статистики'
  s={k:float(s[k]) for k in KEYS};games=max(0,min(82,float(games)))
  participation=GAME_PLAYED
  # The FBL formula as Yahoo counts it: no team result bonus, 1 point per game played.
  mean=partial(s)-s['pf']+participation
  # Descriptive game residuals from the existing player estimate if available.
  if f:
   floor=f['gameFloor']+mean-f['meanPerGame'];ceiling=f['gameCeiling']+mean-f['meanPerGame'];sample=f['sampleGames'];analogs=f['analogs']
  else:
   rates=sorted(partial(d['perGame'])-d['perGame']['pf']+GAME_PLAYED for d in donors)
   floor=rates[int(.1*(len(rates)-1))];ceiling=rates[int(.9*(len(rates)-1))]
   sample=0;analogs=[]
  base=mean*games
  # Different evidence classes use separate, explicitly uncalibrated safeguards.
  # Career radius is selected on earlier validation in the matching career cohort.
  if origin=='CAREER_TRAINED':
   radius=prediction.get('seasonError80',error)
  else:
   relative={'NCAA_TRAINED_TRANSFER':.65,'PERSONAL_SMALL_OR_OLD_HISTORY':.55,'EMPIRICAL_ROLE_PRIOR':.85}[origin]
   radius=max(abs(base)*relative,abs(mean)*20)
  p['forecast']=dict(version=3,metric='FBL_FULL_FORMULA_ESTIMATE',origin=origin,coverageTier=tier,basis=basis,
    conditionalOnRoster=conditional,inputStats=s,meanPerGame=mean,games=games,minutes=s['minutes'],meanSeason=base,
    gameFloor=min(mean,floor),gameCeiling=max(mean,ceiling),seasonFloor=min(base,max(0,base-radius)),seasonCeiling=max(base,base+radius),
    intervalCalibration='UNVALIDATED_FULL_FORMULA_TRANSFER',intervalCohort=prediction.get('intervalCohort') if origin=='CAREER_TRAINED' else tier,
    components=dict(countingAndMisses=partial(s),personalFouls=-s['pf'],participation=participation,historicalAdjustment=0),
    sampleGames=sample,analogs=analogs,rookieExtrapolation=bool(p.get('isRookie')),
    rulesSource='https://www.sports.ru/fantasy/basketball/tournament/rules/150.html',asOf=data['generatedAt'],
    gameRangeBasis='Existing own game residuals where available; otherwise cross-player season-rate range, NOT a calibrated game P90',
    seasonRangeBasis='Career cohort validation absolute-error radius; separate relative sensitivity safeguards for NCAA, limited history and group priors. Not calibrated P10/P90',
    rangeMeaning='Forecast coverage does not imply equal evidence or confidence. Conditional on participation for players without a confirmed roster.')
  added+=not bool(f)
 totals=Counter(p['forecast']['coverageTier'] for p in data['players'])
 data['forecastCoverage']=dict(total=len(data['players']),covered=sum(bool(p.get('forecast')) for p in data['players']),
                              tiers=dict(totals),added=added,careerReplaced=career_replaced,
                              note='All estimates use full arithmetic. GROUP_PRIOR is not personal data; unknown roster/positions remain constraints.')
 data['forecastAudit']['forecastPlayers']=len(data['players'])
 data['forecastAudit']['rookieForecasts']=sum(bool(p.get('isRookie') and p.get('forecast')) for p in data['players'])
 data['forecastAudit']['coverage']=dict(data['forecastAudit']['coverage'])
 return data['forecastCoverage']
if __name__=='__main__':
 path=Path('public/data/default-draft.json');data=json.loads(path.read_text())
 report=complete(data,json.loads(Path('public/data/nba-history.json').read_text()))
 path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
 Path('public/data/forecast-coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
 Path('public/data/forecast-audit.json').write_text(json.dumps(data['forecastAudit'],ensure_ascii=False,indent=2))
 print(json.dumps(report,ensure_ascii=False))
