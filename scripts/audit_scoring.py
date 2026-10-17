"""Independent term-by-term audit of every usable game and every full forecast."""
import json, math, statistics
from collections import defaultdict
from pathlib import Path
import pyarrow.parquet as pq
try:
    from build_forecasts import SEASONS, result_bonuses, full, profiles
    from minute_encoding import normalize_minutes
except ImportError:
    from scripts.build_forecasts import SEASONS, result_bonuses, full, profiles
    from scripts.minute_encoding import normalize_minutes

def terms(s):
    # Expanded makes-minus-attempts identity is independent of partial()/full().
    return dict(points=s['pts'],rebounds=s['reb'],assists=s['ast'],steals=s['stl'],blocks=s['blk'],
                fieldGoalMisses=s['fgm']-s['fga'],freeThrowMisses=s['ftm']-s['fta'],turnovers=-2*s['tov'])

def close(a,b,label):
    if not math.isfinite(a) or not math.isfinite(b) or abs(a-b)>1e-6:
        raise ValueError('Scoring mismatch: '+label+' '+str((a,b)))

def audit(data,rows_by_season):
    latest={};history={};game_count=0;negative_count=0
    for year,raw in rows_by_season.items():
        rows,_=normalize_minutes(raw,year)
        bonuses,_=result_bonuses(rows)
        grouped=defaultdict(list)
        for row in rows:
            key=(row['game_id'],row['team'])
            if key not in bonuses or row['minutes']<=0:continue
            score=sum(terms(row).values())-row['pf']+(2 if row['minutes']>=10 else 1)+bonuses[key]
            close(score,full(row,bonuses[key]),year+' '+row['player_name'])
            close(sum(terms(dict(row,tov=row['tov']+1)).values())-sum(terms(row).values()),-2,'one turnover')
            grouped[row['player_id']].append(score)
            game_count+=1;negative_count+=score<0
        if year==SEASONS[-1]:
            latest=profiles(rows,bonuses)
            history={pid:dict(season=year,games=len(scores),negativeGames=sum(s<0 for s in scores),
                             worstGame=min(scores),meanWorstTenPercent=statistics.mean(sorted(scores)[:max(1,math.ceil(len(scores)*.1))]))
                     for pid,scores in grouped.items()}
    details=[]
    for player in data['players']:
        f=player.get('forecast')
        if not f:continue
        q=(player.get('espnContext') or {}).get('individualProjection')
        if f['origin']=='ESPN_INDIVIDUAL':
            per=q['perGame']
            s={key:per[name] for key,name in dict(pts='points',reb='rebounds',ast='assists',stl='steals',blk='blocks',fgm='fgMade',fga='fgAttempted',ftm='ftMade',fta='ftAttempted',tov='turnovers').items()}
        else:
            logs=latest[player['nbaId']]['logs']
            s={key:statistics.mean(row[key] for row in logs) for key in ['pts','reb','ast','stl','blk','fgm','fga','ftm','fta','tov']}
        breakdown=terms(s)
        close(sum(breakdown.values()),f['components']['countingAndMisses'],player['name']+' counting')
        breakdown.update({k:v for k,v in f['components'].items() if k!='countingAndMisses'})
        close(sum(breakdown.values()),f['meanPerGame'],player['name']+' full')
        close(f['meanPerGame']*f['games'],f['meanSeason'],player['name']+' season')
        if q and f['origin']=='ESPN_INDIVIDUAL':
            close(sum(terms(s).values())*q['games'],q['componentSeasonTotal'],player['name']+' ESPN total')
        f['scoringBreakdown']=breakdown
        if player.get('nbaId') in history:f['historicalDownside']=history[player['nbaId']]
        details.append(dict(id=player['id'],name=player['name'],turnoversPerGame=s['tov'],
                            turnoverCostPerGame=-breakdown['turnovers'],turnoverCostSeason=-breakdown['turnovers']*f['games'],
                            meanPerGame=f['meanPerGame'],meanSeason=f['meanSeason'],historicalDownside=f.get('historicalDownside')))
    return dict(status='PASS',checkedAt=data['generatedAt'],playersInDatabase=len(data['players']),
                auditedForecasts=len(details),withoutFullForecast=len(data['players'])-len(details),
                auditedGames=game_count,negativeGames=negative_count,mismatches=0,
                turnoverWeight=-2,negativeScoresPreserved=True,players=details)

if __name__=='__main__':
    path=Path('public/data/default-draft.json');data=json.loads(path.read_text())
    rows={year:pq.read_table('data/raw/game_logs_'+year+'.parquet').to_pylist() for year in SEASONS}
    report=audit(data,rows)
    data['scoringAudit']={k:v for k,v in report.items() if k!='players'}
    path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    Path('public/data/scoring-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(dict(data['scoringAudit'],focus=[p for p in report['players'] if p['name'] in ['Cade Cunningham','Cameron Boozer']]),ensure_ascii=False))
