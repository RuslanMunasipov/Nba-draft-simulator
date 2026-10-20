"""Calibrate how the season assistant updates forecasts from games already played.
Parameters are chosen on 2023/24 -> 2024/25 only and then frozen; 2024/25 -> 2025/26 is the held-out test.
The pre-season prior in this backtest is the previous season (newcomers: the median newcomer),
so the fitted weights describe a prior of that quality, not a validated ESPN forecast.
"""
import json,random,statistics,sys
from collections import defaultdict
from pathlib import Path
import pyarrow.parquet as pq
try:
    from build_forecasts import full
    from minute_encoding import normalize_minutes
except ImportError:
    from scripts.build_forecasts import full
    from scripts.minute_encoding import normalize_minutes

SEASONS=['2023-24','2024-25','2025-26']
FIT,TEST=('2023-24','2024-25'),('2024-25','2025-26')
GAME_CHECKS=[0,1,2,3,5,8,12,16,20,30,40]
TEAM_CHECKS=[0,3,5,10,15,20,30,40]
CURRENT_PRIOR_GAMES=10
OUT=Path('data/inseason-calibration.json')

def load(season):
    rows,_=normalize_minutes(pq.read_table('data/raw/game_logs_'+season+'.parquet').to_pylist(),season)
    players=defaultdict(list);dates=defaultdict(set)
    for r in rows:
        dates[r['team']].add(r['game_date'])
        # The FBL formula scores every game on its own row (no team result bonus, so no reconstructed outcome is needed).
        players[r['player_id']].append(dict(date=r['game_date'],team=r['team'],min=r['minutes'],fp=full(r)))
    for logs in players.values():logs.sort(key=lambda g:g['date'])
    return dict(players=players,dates={t:sorted(d) for t,d in dates.items()})

def played(logs):return [g for g in logs if g['min']>0]
def prior_of(logs):
    p=played(logs)
    if len(p)<20 or statistics.mean(g['min'] for g in p)<10:return None
    return dict(fp=statistics.mean(g['fp'] for g in p),min=statistics.mean(g['min'] for g in p),games=len(p))
def newcomer_prior(data,season):
    """Median of players in their first supplied season; mirrors a group prior without personal history."""
    i=SEASONS.index(season);before=data[SEASONS[i-1]]['players'] if i else {}
    cohort=[played(v) for k,v in data[season]['players'].items() if k not in before]
    cohort=[p for p in cohort if len(p)>=20]
    return dict(fp=statistics.median(statistics.mean(g['fp'] for g in p) for p in cohort),
                min=statistics.median(statistics.mean(g['min'] for g in p) for p in cohort))

def point_cases(data,a,b):
    est=[];new=[];group=newcomer_prior(data,a)
    for pid,logs in data[b]['players'].items():
        prior=prior_of(data[a]['players'].get(pid,[]))
        target=est if prior else new if pid not in data[a]['players'] else None
        if target is None:continue
        p=played(logs)
        for n in GAME_CHECKS:
            if len(p)-n<10:continue
            target.append(dict(id=pid,n=n,prior=prior or group,obs=p[:n],target=statistics.mean(g['fp'] for g in p[n:])))
    return est,new
def availability_cases(data,a,b):
    out=[]
    for pid,logs in data[b]['players'].items():
        prior=prior_of(data[a]['players'].get(pid,[]))
        teams={g['team'] for g in logs}
        # Traded players have no single team calendar to count missed games against.
        if not prior or len(teams)!=1:continue
        on={g['date'] for g in played(logs)};seq=[d in on for d in data[b]['dates'][teams.pop()]]
        for t in TEAM_CHECKS:
            if len(seq)-t<20:continue
            out.append(dict(id=pid,n=t,prior=min(.97,max(.5,prior['games']/82)),obs=seq[:t],target=sum(seq[t:])/len(seq[t:])))
    return out

def weights(n,half_life):return [1.0]*n if not half_life else [.5**((n-1-i)/half_life) for i in range(n)]
def simple(c,k=CURRENT_PRIOR_GAMES):
    return (k*c['prior']['fp']+sum(g['fp'] for g in c['obs']))/(k+len(c['obs']))
def split(c,rate_games,minute_games,half_life):
    """Points per minute shrunk by minutes played; minutes shrunk with recency, because roles move first."""
    p=c['prior'];obs=c['obs']
    if not obs:return p['fp']
    w=weights(len(obs),half_life)
    minutes=(minute_games*p['min']+sum(x*g['min'] for x,g in zip(w,obs)))/(minute_games+sum(w))
    rate=(rate_games*p['fp']+sum(g['fp'] for g in obs))/(rate_games*p['min']+sum(g['min'] for g in obs))
    return rate*minutes
def availability(c,prior_games):
    # No recency weight: current absences are the injury report's job, not a second penalty.
    return (prior_games*c['prior']+sum(c['obs']))/(prior_games+len(c['obs']))

def mae(cases,f):return statistics.mean(abs(f(c)-c['target']) for c in cases)
def by_check(cases,f):
    d=defaultdict(list)
    for c in cases:d[c['n']].append(abs(f(c)-c['target']))
    return {str(n):round(statistics.mean(v),4) for n,v in sorted(d.items())}
def gain_interval(cases,old,new,seed=17):
    """Player-clustered bootstrap of MAE(old)-MAE(new); positive means the new rule is better."""
    by=defaultdict(list)
    for c in cases:by[c['id']].append(abs(old(c)-c['target'])-abs(new(c)-c['target']))
    ids=sorted(by);rng=random.Random(seed);boot=[]
    for _ in range(1000):
        sample=[x for i in rng.choices(ids,k=len(ids)) for x in by[i]]
        boot.append(statistics.mean(sample))
    boot.sort();return [round(boot[25],4),round(boot[974],4)]
def choose(cases,f,grid):return min(grid,key=lambda g:mae(cases,lambda c:f(c,*g)))
def compare(test,old,new,checks):
    return dict(cases=len(test),players=len({c['id'] for c in test}),currentMAE=round(mae(test,old),4),calibratedMAE=round(mae(test,new),4),
                currentByCheckpoint=by_check(test,old),calibratedByCheckpoint=by_check(test,new),
                maeGain95=gain_interval(test,old,new),checkpoints=checks)

def run():
    data={s:load(s) for s in SEASONS}
    fit_est,fit_new=point_cases(data,*FIT);test_est,test_new=point_cases(data,*TEST)
    grid=[(r,m,h) for r in [5,10,20,30,40,60] for m in [1,2,3,5,8] for h in [None,5,8,12,20]]
    est=choose(fit_est,split,grid);new=choose(fit_new,split,grid)
    fit_av=availability_cases(data,*FIT);test_av=availability_cases(data,*TEST)
    av=choose(fit_av,availability,[(k,) for k in [5,10,15,20,30,40,60,80]])
    current_av=lambda c:c['prior']
    pack=lambda g:dict(rateGames=g[0],minuteGames=g[1],minuteHalfLife=g[2])
    return dict(version=1,fitSeasons=list(FIT),testSeasons=list(TEST),
        target='FBL points per played game (Sports.ru formula without the team result bonus) over the rest of the season; share of remaining team games played',
        points=dict(established=pack(est),newcomer=pack(new)),availability=dict(priorGames=av[0]),
        holdout=dict(
            established=compare(test_est,simple,lambda c:split(c,*est),GAME_CHECKS),
            newcomer=compare(test_new,simple,lambda c:split(c,*new),GAME_CHECKS),
            availability=compare(test_av,current_av,lambda c:availability(c,*av),TEAM_CHECKS)),
        current=dict(priorGames=CURRENT_PRIOR_GAMES,availability='Pre-season games/82, never updated'),
        limitations=['Backtest prior is the previous season; a stronger pre-season forecast deserves more weight than fitted here.',
            'Newcomers are players absent from the previous supplied season, a proxy for rookies and group priors.',
            'Availability excludes traded players and players who never appeared; no injury report is used in the backtest.',
            'One fit pair and one test pair: the calibrated rule is evidence-based, not a guarantee for 2026/27.'])

if __name__=='__main__':
    report=run()
    text=json.dumps(report,ensure_ascii=False,indent=1)+'\n'
    if '--check' in sys.argv:
        if OUT.read_text(encoding='utf-8')!=text:sys.exit('data/inseason-calibration.json is stale: rerun scripts/inseason_calibration.py')
    else:OUT.write_text(text,encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['points','availability']}))
    for k,v in report['holdout'].items():print(k,v['currentMAE'],'->',v['calibratedMAE'],'gain95',v['maeGain95'])
