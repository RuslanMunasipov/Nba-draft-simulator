"""Complete-formula estimates and empirical upside. No synthetic confidence percentages.
The ESPN counting-stat forecast is the centre. PF/participation/result are estimated
from observed games. P10/P90 are historical scenarios, not calibrated probabilities.
"""
import json, math, statistics
from collections import defaultdict
from pathlib import Path
import pyarrow.parquet as pq
try:
    from season_accuracy import cohort, SeasonModel, evaluate
except ImportError:
    from scripts.season_accuracy import cohort, SeasonModel, evaluate
try:
    from minute_encoding import normalize_minutes
except ImportError:
    from scripts.minute_encoding import normalize_minutes

SEASONS=['2023-24','2024-25','2025-26']
RULES='https://www.sports.ru/fantasy/basketball/tournament/rules/150.html'
def quantile(values,p):
    values=sorted(values)
    if not values:return None
    x=(len(values)-1)*p;i=int(x);return values[i]+(values[min(i+1,len(values)-1)]-values[i])*(x-i)
def partial(r):
    return r['pts']+r['reb']+r['ast']+r['stl']+r['blk']-(r['fga']-r['fgm'])-(r['fta']-r['ftm'])-2*r['tov']
def full(r,bonus):
    return partial(r)-r['pf']+(2 if r['minutes']>=10 else 1)+bonus
def result_bonuses(rows):
    games=defaultdict(list);result={};rejected=0
    for r in rows:games[r['game_id']].append(r)
    for game,logs in games.items():
        teams=defaultdict(list)
        for r in logs:teams[r['team']].append(r)
        if len(teams)!=2:rejected+=1;continue
        a,b=teams.values();sa=sum(r['pts'] for r in a);sb=sum(r['pts'] for r in b)
        # Team-point reconstruction needs both complete lineups, not one player row.
        minutes=[sum(r['minutes'] for r in team) for team in [a,b]]
        def valid(team,m):
            if team[0].get('minuteEncoding')=='TRUNCATED_INTEGER_MINUTES':
                upper=m+sum(r['minutes']>0 for r in team)
                return any(m<=240+25*o<upper for o in range(6))
            return any(abs(m-(240+25*o))<.5 for o in range(6))
        if sa==sb or any(len(t)<5 for t in [a,b]) or not all(valid(t,m) for t,m in zip([a,b],minutes)):
            rejected+=1;continue
        for team,won in [(a,sa>sb),(b,sb>sa)]:
            homes={bool(r['home']) for r in team}
            if len(homes)!=1:raise ValueError('Contradictory home flag')
            home=homes.pop();result[(game,team[0]['team'])]=(2 if home else 3) if won else (-3 if home else -2)
    return result,{'usableGames':len(result)//2,'rejectedGames':rejected}
def profiles(rows,bonuses):
    groups=defaultdict(list)
    for r in rows:
        if (r['game_id'],r['team']) in bonuses and r['minutes']>0:groups[r['player_id']].append(r)
    return {pid:{'id':pid,'name':logs[-1]['player_name'],'logs':logs,
        'games':len(logs),'minutes':statistics.mean(r['minutes'] for r in logs),
        'partial':statistics.mean(partial(r) for r in logs),
        'full':statistics.mean(full(r,bonuses[(r['game_id'],r['team'])]) for r in logs),
        'features':[statistics.mean(r[k] for r in logs) for k in ['minutes','pts','reb','ast','stl','blk','tov','fga','fta']]}
        for pid,logs in groups.items()}
def changes(before,after):
    return [(after[i]['full']-p['full'],after[i]['games']-p['games'])
        for i,p in before.items() if i in after and p['games']>=20 and p['minutes']>=10]
def season_scenarios(mean,games,residuals):
    return [(mean+d)*max(0,min(82,games+g)) for d,g in residuals]
def rookie_component_audit(data,groups,bonuses):
    """Conditional held-out rookie scoring-components test, NOT a stats forecast test.
    Uses observed rookie counting stats/minutes as inputs, prior-year donors only.
    """
    experience={p.get('nbaId'):p.get('nbaExperience') for p in data['players'] if p.get('nbaId')}
    details=[]
    for before,year,years_now in [('2023-24','2024-25',2),('2024-25','2025-26',1)]:
        donors=[p for p in groups[before].values() if p['games']>=20 and p['minutes']>=10]
        scales=[statistics.pstdev(p['features'][j] for p in donors) or 1 for j in range(9)]
        for pid,p in groups[year].items():
            if pid in groups[before] or experience.get(pid)!=years_now or p['games']<20 or p['minutes']<10:continue
            selected=sorted(donors,key=lambda d:sum(((a-b)/s)**2 for a,b,s in zip(p['features'],d['features'],scales)))[:10]
            extras=[]
            for donor in selected:
                ratio=p['minutes']/donor['minutes']
                for row in donor['logs']:
                    extras.append(-max(0,min(6,row['pf']*ratio))+(2 if row['minutes']*ratio>=10 else 1)+bonuses[before][(row['game_id'],row['team'])])
            predicted=p['partial']+statistics.mean(extras)
            details.append(dict(id=pid,name=p['name'],season=year,games=p['games'],actual=p['full'],
                                predicted=predicted,baseline=p['partial'],absoluteError=abs(predicted-p['full'])))
    return dict(players=len(details),conditionalPerGameMAE=statistics.mean(p['absoluteError'] for p in details) if details else None,
                excludingComponentsMAE=statistics.mean(abs(p['baseline']-p['actual']) for p in details) if details else None,
                seasons=['2024-25','2025-26'],details=details,
                scope='Rookie PF/minute/result component transfer conditional on actual counting stats and minutes. Not a validation of rookie ESPN forecasts or season availability.',
                selection='First appearance in supplied history and current ESPN experience 1/2; current-roster survivor cohort, not complete draft classes.')

def build(data,rows_by_season):
    bonuses={};groups={};coverage={};encoding={}
    for year,rows in rows_by_season.items():
        rows,encoding[year]=normalize_minutes(rows,year)
        bonuses[year],coverage[year]=result_bonuses(rows)
        groups[year]=profiles(rows,bonuses[year])
        if coverage[year]['usableGames']<1000:raise ValueError('Insufficient complete games for full scoring '+year)
    # Freeze every model choice before evaluating the next season.
    train_rows=cohort(groups[SEASONS[0]],groups[SEASONS[1]])
    test_rows=cohort(groups[SEASONS[1]],groups[SEASONS[2]])
    frozen=SeasonModel(train_rows)
    validation=evaluate(frozen,test_rows,train_rows)
    validation.pop('details')
    production=SeasonModel(train_rows+test_rows)
    train=changes(groups[SEASONS[0]],groups[SEASONS[1]])
    test=changes(groups[SEASONS[1]],groups[SEASONS[2]])
    latest=groups[SEASONS[-1]]
    donors=[p for p in latest.values() if p['games']>=20 and p['minutes']>=10]
    scales=[statistics.pstdev(p['features'][j] for p in donors) or 1 for j in range(9)]
    residuals=train+test
    team_bonuses=defaultdict(list)
    for (game,team),bonus in bonuses[SEASONS[-1]].items():team_bonuses[team].append(bonus)
    forecasts=0
    for player in data['players']:
        q=(player.get('espnContext') or {}).get('individualProjection')
        source=latest.get(player.get('nbaId'))
        if q and q['metric']=='FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES':
            per=q['perGame'];centre=q['componentFPPerGame'];games=q['games'];minutes=per['minutes']
            features=[per[k] for k in ['minutes','points','rebounds','assists','steals','blocks','turnovers','fgAttempted','ftAttempted']]
            origin='ESPN_INDIVIDUAL'
        elif source and source['games']>=20 and source['minutes']>=10:
            centre=source['partial'];games=(player.get('espnContext') or {}).get('projectedGames') or source['games'];minutes=source['minutes'];features=source['features'];origin='HISTORICAL_BASELINE'
        else:continue
        if not (0<minutes<=48 and 0<games<=82):continue
        nearest=sorted(donors,key=lambda d:sum(((a-b)/s)**2 for a,b,s in zip(features,d['features'],scales)))[:10]
        selected=[source] if source and source['games']>=20 and source['minutes']>=10 else nearest
        scores=[];fouls=[];participation=[];results=[]
        aliases=[['SA','SAN','SAS'],['GS','GSW'],['NY','NYK'],['NO','NOP'],['UTAH','UTA'],['WSH','WAS'],['PHO','PHX'],['BKN','BRK']]
        candidates=next((names for names in aliases if player.get('team') in names),[player.get('team')])
        team_values=next((team_bonuses[name] for name in candidates if name in team_bonuses),None)
        team_mean=statistics.mean(team_values) if team_values else statistics.mean(bonuses[SEASONS[-1]].values())
        for donor in selected:
            ratio=minutes/donor['minutes']
            donor_mean=statistics.mean(bonuses[SEASONS[-1]][(r['game_id'],r['team'])] for r in donor['logs'])
            for row in donor['logs']:
                pf=max(0,min(6,row['pf']*ratio));minute_bonus=2 if row['minutes']*ratio>=10 else 1
                result=max(-3,min(3,bonuses[SEASONS[-1]][(row['game_id'],row['team'])]-donor_mean+team_mean))
                score=centre+(partial(row)-donor['partial'])*ratio-pf+minute_bonus+result
                scores.append(score);fouls.append(pf);participation.append(minute_bonus);results.append(result)
        mean=statistics.mean(scores)
        scenario_input={'full':mean,'games':games,'minutes':minutes}
        season_estimate,season_low,season_high=production.interval(scenario_input)
        # ESPN remains the provider centre; only historical fallback gets learned correction.
        raw_mean=mean
        if origin=='HISTORICAL_BASELINE':
            mean,games=production.point_parts(scenario_input)
            if games<=0:continue
        season_low=min(mean*games,season_low)
        season_high=max(mean*games,season_high)
        player['forecast']={'version':2,'metric':'FBL_FULL_FORMULA_ESTIMATE','origin':origin,
          'meanPerGame':mean,'games':games,'minutes':minutes,'meanSeason':mean*games,
          'gameFloor':quantile(scores,.1)+(mean-raw_mean),'gameCeiling':quantile(scores,.9)+(mean-raw_mean),
          'seasonFloor':season_low,'seasonCeiling':season_high,
          'components':{'countingAndMisses':centre,'personalFouls':-statistics.mean(fouls),'participation':statistics.mean(participation),'teamResult':statistics.mean(results),'historicalAdjustment':mean-raw_mean},
          'sampleGames':len(scores),'analogs':[{'name':d['name'],'id':d['id']} for d in selected],
          'rookieExtrapolation':bool(player.get('isRookie')),'rulesSource':RULES,
          'teamResultBasis':'2025-26 team game outcomes reconstructed from complete player logs',
          'rangeMeaning':'Split-conformal season range targets 80% marginal coverage; ESPN/rookie transfer not independently validated. Game P90 descriptive; career ceiling not estimated.',
          'seasonRangeBasis':'conditional paired transitions including zero-game seasons; grouped split-conformal calibration',
          'asOf':data['generatedAt']}
        forecasts+=1
    audit={'status':'EXPERIMENTAL_FULL_FORMULA_ESTIMATES','rulesSource':RULES,'checkedAt':data['generatedAt'],
      'minuteEncoding':encoding,'coverage':coverage,'forecastPlayers':forecasts,'rookieForecasts':sum(bool(p.get('isRookie') and p.get('forecast')) for p in data['players']),
      'positionAudit':data.get('positionAudit'),
      'leagueRules':json.loads(Path('data/league-rules.json').read_text()),
      'projectionArchive':json.loads(Path('public/data/projection-archive-audit.json').read_text()) if Path('public/data/projection-archive-audit.json').exists() else None,
      'seasonModel':production.report(),
      'rookieComponentAudit':rookie_component_audit(data,groups,bonuses),
      'holdout':dict(validation,trainResiduals=['2023-24','2024-25'],testSeason='2025-26',
        frozenModel=frozen.report(),target='Full formula, including zero-game target seasons',
        limitation='Retrospective development validation. Model selection fits 2023/24->2024/25; 2025/26 diagnostics informed interval safeguards, so this is not untouched external validation. Not ESPN/rookie accuracy.'),
      'limitations':['No career-peak model. Game upside is P90 for one game; season upside is a separate paired scenario.',
        'ESPN counting stats/games/minutes are provider forecasts. PF and participation are historical-role estimates.',
        'Team bonuses reflect previous season, not current roster strength or confirmed future outcomes.',
        '2023/24 minutes are truncated integers; seconds cannot be recovered. Team-minute intervals are checked, which is weaker than exact conservation.',
        'Rookie analog ranges are an extrapolation and have no independent rookie holdout calibration.',
        'Zero-game target seasons included; absence may mean injury, retirement or departure. Marginal conformal coverage can fail under season shift.',
        'League slots, straight draft and adjustable cap 20000 are user-confirmed. Actual Yahoo eligibility and Sports.ru prices remain unverified in feeds; no unconfirmed NBA club limit is imposed.']}
    data['forecastAudit']=audit
    return data,audit
if __name__=='__main__':
    path=Path('public/data/default-draft.json');data=json.loads(path.read_text())
    rows={s:pq.read_table('data/raw/game_logs_'+s+'.parquet').to_pylist() for s in SEASONS}
    for year,logs in rows.items():
        samples=defaultdict(list)
        for row in logs:samples[(row['game_id'],row['team'])].append(row)
        print(json.dumps({'diagnosticSeason':year,'teamGames':len(samples),'sample':[{'game':str(k[0]),'team':k[1],'players':len(v),'minutes':sum(r['minutes'] for r in v),'points':sum(r['pts'] for r in v),'clockMinutes':sum(int(r['minutes'])+round((r['minutes']%1)*100)/60 for r in v)} for k,v in list(samples.items())[:12]],'firstRow':{k:str(logs[0][k]) for k in ['game_id','player_name','team','home','minutes','pts']}},ensure_ascii=False),flush=True)
    data,audit=build(data,rows)
    path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    Path('public/data/forecast-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(audit,ensure_ascii=False,indent=2))
