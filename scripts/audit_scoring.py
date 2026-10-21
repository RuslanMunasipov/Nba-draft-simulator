"""Scoring checks of every usable game and every full forecast.

consistency: the formula restated term by term against build_forecasts.full(), and forecast components against
meanPerGame. It is not an independent test of the rule: both sides are the repository's own code.
externalCheck: Sports.ru's official season totals against the FBL formula plus Sports.ru's team result bonus on the
same games of the league logs. Sports.ru computes its totals outside this repository, so this one can catch a wrong
term, a wrong minutes rule or a wrong bonus."""
import json, math, statistics
from collections import defaultdict
from pathlib import Path
import pyarrow.parquet as pq
try:
    from build_forecasts import SEASONS, full, profiles
    from minute_encoding import normalize_minutes
except ImportError:
    from scripts.build_forecasts import SEASONS, full, profiles
    from scripts.minute_encoding import normalize_minutes

HISTORY = Path('data/sports-fantasy-history.json')

def terms(s):
    # The same rule restated as makes minus attempts: a typo in one copy shows up, a wrong rule in both does not.
    return dict(points=s['pts'],rebounds=s['reb'],assists=s['ast'],steals=s['stl'],blocks=s['blk'],
                fieldGoalMisses=s['fgm']-s['fga'],freeThrowMisses=s['ftm']-s['fta'],turnovers=-2*s['tov'])

def close(a,b,label):
    if not math.isfinite(a) or not math.isfinite(b) or abs(a-b)>1e-6:
        raise ValueError('Scoring mismatch: '+label+' '+str((a,b)))

def sports_result_bonus(home,won):
    # Sports.ru's team result bonus (rules page 150), not part of the FBL formula: +2/+3 home/away win, -3/-2 home/away loss.
    return (2 if home else 3) if won else (-3 if home else -2)

def external_check(data,rows_by_season,history):
    """Only player-seasons whose logged games equal Sports.ru's are compared: Sports.ru does not score play-in games or
    the NBA Cup final, and 2024/25 lacks 7 games in the logs."""
    nba={str(p['sportsId']):p['nbaId'] for p in data['players'] if p.get('sportsId') and p.get('nbaId')}
    residuals,without,by_season=[],[],{}
    for year,raw in rows_by_season.items():
        rows,_=normalize_minutes(raw,year)
        score,clubs=defaultdict(int),defaultdict(set)
        for r in raw:score[(r['game_id'],r['team'])]+=r['pts'];clubs[r['game_id']].add(r['team'])
        logs=defaultdict(list)
        for r in rows:
            if r['minutes']>0:logs[r['player_id']].append(r)
        season=[]
        for sid,record in history.get('players',{}).items():
            s=(record.get('seasons') or {}).get(year);games=logs.get(nba.get(sid))
            if not s or not games or len(games)!=s.get('games') or any(len(clubs[r['game_id']])!=2 for r in games):continue
            won=lambda r:score[(r['game_id'],r['team'])]>score[(r['game_id'],next(t for t in clubs[r['game_id']] if t!=r['team']))]
            base=sum(full(r) for r in games);bonus=sum(sports_result_bonus(r['home'],won(r)) for r in games)
            season.append(s['points']-base-bonus);without.append(abs(s['points']-base))
        residuals+=season
        by_season[year]=dict(playerSeasons=len(season),exact=sum(x==0 for x in season),within2=sum(abs(x)<=2 for x in season),
                             meanResidual=round(statistics.mean(season),2) if season else None)
    n=len(residuals);within2=sum(abs(x)<=2 for x in residuals)
    mean_abs=statistics.mean(abs(x) for x in residuals) if n else None
    mean_without=statistics.mean(without) if n else None
    passed=n>=100 and within2/n>=.75 and mean_without>5*mean_abs
    return dict(status='PASS' if passed else 'FAIL',
                source='Sports.ru season totals (data/sports-fantasy-history.json) vs FBL formula + Sports.ru result bonus on the same league-log games',
                playerSeasons=n,exact=sum(x==0 for x in residuals),within2=within2,within5=sum(abs(x)<=5 for x in residuals),
                meanResidual=round(statistics.mean(residuals),2) if n else None,meanAbsResidual=round(mean_abs,2) if n else None,
                meanAbsWithoutBonus=round(mean_without,2) if n else None,bySeason=by_season,
                rule='PASS when at least 100 player-seasons, 75% within ±2 FP a season, and leaving the bonus out is 5x worse')

def audit(data,rows_by_season):
    latest={};history={};game_count=0;negative_count=0;mismatches=[]
    def check(a,b,label):
        try:close(a,b,label)
        except ValueError as e:mismatches.append(str(e))
    for year,raw in rows_by_season.items():
        rows,_=normalize_minutes(raw,year)
        grouped=defaultdict(list)
        for row in rows:
            if row['minutes']<=0:continue
            # The FBL formula: Sports.ru's without the team result bonus (the league scores on Yahoo).
            score=sum(terms(row).values())-row['pf']+(2 if row['minutes']>=10 else 1)
            check(score,full(row),year+' '+row['player_name'])
            check(sum(terms(dict(row,tov=row['tov']+1)).values())-sum(terms(row).values()),-2,'one turnover')
            grouped[row['player_id']].append(score)
            game_count+=1;negative_count+=score<0
        if year==SEASONS[-1]:
            latest=profiles(rows)
            history={pid:dict(season=year,games=len(scores),negativeGames=sum(s<0 for s in scores),
                             worstGame=min(scores),meanWorstTenPercent=statistics.mean(sorted(scores)[:max(1,math.ceil(len(scores)*.1))]))
                     for pid,scores in grouped.items()}
    details=[]
    for player in data['players']:
        f=player.get('forecast')
        if not f:continue
        q=(player.get('espnContext') or {}).get('individualProjection')
        if f.get('inputStats'):
            s=f['inputStats']
        elif f['origin']=='ESPN_INDIVIDUAL':
            per=q['perGame']
            s={key:per[name] for key,name in dict(pts='points',reb='rebounds',ast='assists',stl='steals',blk='blocks',fgm='fgMade',fga='fgAttempted',ftm='ftMade',fta='ftAttempted',tov='turnovers').items()}
        else:
            logs=latest[player['nbaId']]['logs']
            s={key:statistics.mean(row[key] for row in logs) for key in ['pts','reb','ast','stl','blk','fgm','fga','ftm','fta','tov']}
        breakdown=terms(s)
        check(sum(breakdown.values()),f['components']['countingAndMisses'],player['name']+' counting')
        breakdown.update({k:v for k,v in f['components'].items() if k!='countingAndMisses'})
        check(sum(breakdown.values()),f['meanPerGame'],player['name']+' full')
        check(f['meanPerGame']*f['games'],f['meanSeason'],player['name']+' season')
        if q and f['origin']=='ESPN_INDIVIDUAL':
            check(sum(terms(s).values())*q['games'],q['componentSeasonTotal'],player['name']+' ESPN total')
        f['scoringBreakdown']=breakdown
        if player.get('nbaId') in history:f['historicalDownside']=history[player['nbaId']]
        details.append(dict(id=player['id'],name=player['name'],turnoversPerGame=s['tov'],
                            turnoverCostPerGame=-breakdown['turnovers'],turnoverCostSeason=-breakdown['turnovers']*f['games'],
                            meanPerGame=f['meanPerGame'],meanSeason=f['meanSeason'],historicalDownside=f.get('historicalDownside')))
    return dict(status='PASS' if not mismatches else 'FAIL',check='CONSISTENCY',
                scope='The formula restated vs build_forecasts.full() and forecast components vs meanPerGame; not an independent test of the rule (see externalCheck).',
                checkedAt=data['generatedAt'],playersInDatabase=len(data['players']),
                auditedForecasts=len(details),withoutFullForecast=len(data['players'])-len(details),
                auditedGames=game_count,negativeGames=negative_count,mismatches=len(mismatches),mismatchExamples=mismatches[:10],
                turnoverWeight=-2,negativeScoresPreserved=True,players=details)

if __name__=='__main__':
    path=Path('public/data/default-draft.json');data=json.loads(path.read_text())
    rows={year:pq.read_table('data/raw/game_logs_'+year+'.parquet').to_pylist() for year in SEASONS}
    report=audit(data,rows)
    report['externalCheck']=(external_check(data,rows,json.loads(HISTORY.read_text())) if HISTORY.exists()
                             else dict(status='NOT_RUN',reason='No Sports.ru fantasy history file'))
    data['scoringAudit']={k:v for k,v in report.items() if k!='players'}
    path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    Path('public/data/scoring-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(data['scoringAudit'],focus=[p for p in report['players'] if p['name'] in ['Cade Cunningham','Cameron Boozer']]),ensure_ascii=False))
    if report['status']!='PASS':raise SystemExit('Scoring consistency check failed: '+'; '.join(report['mismatchExamples']))
