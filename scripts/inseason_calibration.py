"""Calibrate how the season assistant updates forecasts from games already played.
Parameters are chosen on 2023/24 -> 2024/25 only and then frozen; 2024/25 -> 2025/26 is the held-out test.
The pre-season prior in this backtest is the previous season (newcomers: the median newcomer),
so the fitted weights describe a prior of that quality, not a validated ESPN forecast.
src/season.js perGame mirrors split(); tests/fixtures/inseason-golden.json pins it. The fitted share of games played
(availability()) is reported but no longer used: games come only from the ESPN injury report (league owner, 21.10.2026).
"""
import json,math,random,statistics,sys
from collections import defaultdict
from pathlib import Path
import pyarrow.parquet as pq
try:
    from build_forecasts import full
    from fbl_formula import GAME_PLAYED
    from minute_encoding import normalize_minutes
except ImportError:
    from scripts.build_forecasts import full
    from scripts.fbl_formula import GAME_PLAYED
    from scripts.minute_encoding import normalize_minutes

SEASONS=['2023-24','2024-25','2025-26']
FIT,TEST=('2023-24','2024-25'),('2024-25','2025-26')
GAME_CHECKS=[0,1,2,3,5,8,12,16,20,30,40]
TEAM_CHECKS=[0,3,5,10,15,20,30,40]
CURRENT_PRIOR_GAMES=10
# Places of a game among a player's games of the season, for the early-season offsets (the last one is open).
BUCKETS=[(1,5),(6,10),(11,20),(21,40),(41,None)]
OFFSET_SCALES=[0,.25,.5,.75,1]
# A run of this many missed team games in a row is an absence spell, the kind an injury report covers.
SPELL=10
SPELL_CAPS=[0,1,2,3,4,5,6,8,10,15,None]
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

# The FBL formula's participation term: 1 per game played (Yahoo GP, league settings 21.10.2026), not a rate of minutes.
def participation(minutes):return GAME_PLAYED
def counting(g):return g['fp']-participation(g['min'])
def played(logs):return [g for g in logs if g['min']>0]
def prior_of(logs):
    p=played(logs)
    if len(p)<20 or statistics.mean(g['min'] for g in p)<10:return None
    return dict(fp=statistics.mean(g['fp'] for g in p),min=statistics.mean(g['min'] for g in p),
                part=statistics.mean(participation(g['min']) for g in p),games=len(p))
def newcomer_prior(data,season):
    """Median of players in their first supplied season; mirrors a group prior without personal history."""
    i=SEASONS.index(season);before=data[SEASONS[i-1]]['players'] if i else {}
    cohort=[played(v) for k,v in data[season]['players'].items() if k not in before]
    cohort=[p for p in cohort if len(p)>=20]
    return dict(fp=statistics.median(statistics.mean(g['fp'] for g in p) for p in cohort),
                min=statistics.median(statistics.mean(g['min'] for g in p) for p in cohort),
                part=statistics.median(statistics.mean(participation(g['min']) for g in p) for p in cohort))

def bucket(i):return next(j for j,(a,b) in enumerate(BUCKETS) if i>=a and (b is None or i<=b))
def game_offsets(players,min_games=50):
    """How far a game falls below the player's later games of the season, by its place among his games: roles and
    fitness ramp up, so the first games run low (about 1.4 FP and 1.7-2 minutes) and an update pooling them would read a
    lower level than the one that follows. Counting points and minutes; players with 50+ games, every game with 10 later."""
    dc=defaultdict(list);dm=defaultdict(list)
    for logs in players.values():
        p=played(logs)
        if len(p)<min_games:continue
        c=[counting(g) for g in p];m=[g['min'] for g in p]
        for i in range(len(p)-10):
            dc[bucket(i+1)].append(statistics.mean(c[i+1:])-c[i]);dm[bucket(i+1)].append(statistics.mean(m[i+1:])-m[i])
    return dict(counting=[round(statistics.mean(dc[j]),3) for j in range(len(BUCKETS))],minutes=[round(statistics.mean(dm[j]),3) for j in range(len(BUCKETS))])

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
def team_sequences(data,a,b):
    """Single-team players with a prior: their prior share and whether they played each of the team's games."""
    for pid,logs in data[b]['players'].items():
        prior=prior_of(data[a]['players'].get(pid,[]))
        teams={g['team'] for g in logs}
        # Traded players have no single team calendar to count missed games against.
        if not prior or len(teams)!=1:continue
        on={g['date'] for g in played(logs)}
        yield pid,min(.97,max(.5,prior['games']/82)),[d in on for d in data[b]['dates'][teams.pop()]]
def availability_cases(data,a,b):
    out=[]
    for pid,prior,seq in team_sequences(data,a,b):
        for t in TEAM_CHECKS:
            if len(seq)-t<20:continue
            out.append(dict(id=pid,n=t,prior=prior,obs=seq[:t],target=sum(seq[t:])/len(seq[t:])))
    return out
def return_cases(data,a,b):
    """The first game back after an absence spell (SPELL+ missed team games in a row), with 10+ team games left: the share
    of those games he played, against the estimate at that moment (the spell is still the trailing run of misses)."""
    out=[]
    for pid,prior,seq in team_sequences(data,a,b):
        run=0
        for t,x in enumerate(seq):
            if not x:run+=1;continue
            if run>=SPELL and len(seq)-t>=10:out.append(dict(id=pid,n=t,run=run,prior=prior,obs=seq[:t],target=sum(seq[t:])/len(seq[t:])))
            run=0
    return out

def weights(n,half_life):return [1.0]*n if not half_life else [.5**((n-1-i)/half_life) for i in range(n)]
def simple(c,k=CURRENT_PRIOR_GAMES):
    return (k*c['prior']['fp']+sum(g['fp'] for g in c['obs']))/(k+len(c['obs']))
def sums(obs,half_life,offsets=None):
    """What split() needs from the games: recency weights and the plain and weighted sums, offsets kept apart."""
    w=weights(len(obs),half_life);o=offsets or dict(counting=[0]*len(BUCKETS),minutes=[0]*len(BUCKETS))
    oc=[o['counting'][bucket(i)] for i in range(1,len(obs)+1)];om=[o['minutes'][bucket(i)] for i in range(1,len(obs)+1)]
    return dict(w=sum(w),wmin=sum(x*g['min'] for x,g in zip(w,obs)),wom=sum(x*v for x,v in zip(w,om)),
                wpart=sum(x*participation(g['min']) for x,g in zip(w,obs)),count=sum(counting(g) for g in obs),
                oc=sum(oc),min=sum(g['min'] for g in obs),om=sum(om))
def combine(p,s,rate_games,minute_games,scale):
    part=p.get('part',participation(p['min']))
    minutes=(minute_games*p['min']+s['wmin']+scale*s['wom'])/(minute_games+s['w'])
    share=(minute_games*part+s['wpart'])/(minute_games+s['w'])
    rate=(rate_games*(p['fp']-part)+s['count']+scale*s['oc'])/(rate_games*p['min']+s['min']+scale*s['om'])
    return rate*minutes+share
def split(c,rate_games,minute_games,half_life,scale=0,offsets=None):
    """Counting points (the FBL formula without its participation term) per minute, shrunk by minutes played, times
    minutes shrunk with recency, because roles move first; plus the participation term, shrunk like minutes. Each game
    is lifted by `scale` x the offset of its place in the season (game_offsets), which early games fall below."""
    if not c['obs']:return c['prior']['fp']
    return combine(c['prior'],sums(c['obs'],half_life,offsets),rate_games,minute_games,scale)
def trailing(obs):
    n=0
    for x in reversed(obs):
        if x:break
        n+=1
    return n
def availability(c,prior_games,spell_misses=None):
    """Prior share updated by games played and missed. No recency weight. With spell_misses, the trailing run of misses
    (the absence an injury report explains, which then removes the games until the return) counts at most that many."""
    obs=c['obs'];run=trailing(obs);n=len(obs)-run+(run if spell_misses is None else min(run,spell_misses))
    return (prior_games*c['prior']+sum(obs))/(prior_games+n)

def mae(cases,f):return statistics.mean(abs(f(c)-c['target']) for c in cases)
def mse(cases,f):return statistics.mean((f(c)-c['target'])**2 for c in cases)
def bias(cases,f):return statistics.mean(f(c)-c['target'] for c in cases)
def by_check(cases,f,signed=False):
    d=defaultdict(list)
    for c in cases:d[c['n']].append(f(c)-c['target'] if signed else abs(f(c)-c['target']))
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
# Weights are chosen on squared error: expected points and games are sums over games, so the estimate must be right on
# average (an MAE fit targets the median and left the update 0.25 FP a game low, 1.5 for newcomers).
def choose(cases,f,grid):return min(grid,key=lambda g:mse(cases,lambda c:f(c,*g)))
def choose_split(cases,offsets):
    """The split weights and offset scale with the lowest squared error; the game sums are computed once per half-life."""
    cache={}
    def value(i,c,r,m,h,s):
        if not c['obs']:return c['prior']['fp']
        if (i,h) not in cache:cache[i,h]=sums(c['obs'],h,offsets)
        return combine(c['prior'],cache[i,h],r,m,s)
    grid=[(r,m,h,s) for r in [5,10,20,30,40,60] for m in [1,2,3,5,8] for h in [None,5,8,12,20] for s in OFFSET_SCALES]
    return min(grid,key=lambda g:statistics.mean((value(i,c,*g)-c['target'])**2 for i,c in enumerate(cases)))
def metrics(test,old,new):
    # Expected points and games are sums over games, so the mean error (bias) and RMSE are reported next to the MAE.
    return dict(cases=len(test),players=len({c['id'] for c in test}),currentMAE=round(mae(test,old),4),calibratedMAE=round(mae(test,new),4),
                currentBias=round(bias(test,old),4),calibratedBias=round(bias(test,new),4),
                currentRMSE=round(math.sqrt(mse(test,old)),4),calibratedRMSE=round(math.sqrt(mse(test,new)),4),maeGain95=gain_interval(test,old,new))
def compare(test,old,new,checks):
    return dict(metrics(test,old,new),currentByCheckpoint=by_check(test,old),calibratedByCheckpoint=by_check(test,new),
                calibratedBiasByCheckpoint=by_check(test,new,signed=True),checkpoints=checks)
def by_spell(cases,f):
    out={}
    for lo,hi in [(10,20),(20,35),(35,None)]:
        b=[c for c in cases if c['run']>=lo and (hi is None or c['run']<hi)]
        if b:out[f'{lo}-{hi-1}' if hi else f'{lo}+']=round(bias(b,f),4)
    return out

def run():
    data={s:load(s) for s in SEASONS}
    # Offsets come from the season before the one being forecast: the fit pair's from 2023/24, the test pair's from
    # 2024/25, the shipped ones from 2025/26.
    off_fit,off_test,off_ship=game_offsets(data[FIT[0]]['players']),game_offsets(data[TEST[0]]['players']),game_offsets(data[SEASONS[-1]]['players'])
    fit_est,fit_new=point_cases(data,*FIT);test_est,test_new=point_cases(data,*TEST)
    est=choose_split(fit_est,off_fit);new=choose_split(fit_new,off_fit)
    fit_av=availability_cases(data,*FIT);test_av=availability_cases(data,*TEST)
    av=choose(fit_av,availability,[(k,) for k in [5,10,15,20,30,40,60,80]])
    fit_ret=return_cases(data,*FIT);test_ret=return_cases(data,*TEST)
    cap=min(SPELL_CAPS,key=lambda m:mse(fit_ret,lambda c:availability(c,av[0],m)))
    current_av=lambda c:c['prior']
    pack=lambda g:dict(rateGames=g[0],minuteGames=g[1],minuteHalfLife=g[2],offsetScale=g[3])
    return dict(version=2,fitSeasons=list(FIT),testSeasons=list(TEST),
        target='FBL points per played game (Sports.ru formula without the team result bonus) over the rest of the season; share of remaining team games played',
        points=dict(established=pack(est),newcomer=pack(new),
            offsets=dict(off_ship,buckets=[list(b) for b in BUCKETS],season=SEASONS[-1],
                note='Added to each played game by its place in the season (times offsetScale): counting points (FBL points without the participation term) and minutes.')),
        availability=dict(priorGames=av[0],spellMisses=cap,spellGames=SPELL),
        holdout=dict(
            established=compare(test_est,simple,lambda c:split(c,*est[:3],est[3],off_test),GAME_CHECKS),
            newcomer=compare(test_new,simple,lambda c:split(c,*new[:3],new[3],off_test),GAME_CHECKS),
            availability=compare(test_av,current_av,lambda c:availability(c,*av),TEAM_CHECKS),
            availabilityAtReturn=dict(metrics(test_ret,lambda c:availability(c,av[0]),lambda c:availability(c,av[0],cap)),
                currentBiasBySpell=by_spell(test_ret,lambda c:availability(c,av[0])),calibratedBiasBySpell=by_spell(test_ret,lambda c:availability(c,av[0],cap)),
                note='First game back after a spell of 10+ missed team games; current = every missed game counted, calibrated = the spell counts at most spellMisses.')),
        current=dict(priorGames=CURRENT_PRIOR_GAMES,availability='Pre-season games/82, never updated'),
        limitations=['Backtest prior is the previous season; a stronger pre-season forecast deserves more weight than fitted here.',
            'Newcomers are players absent from the previous supplied season, a proxy for rookies and group priors.',
            'Availability excludes traded players and players who never appeared; no injury report is used in the backtest.',
            'The spell weight is fitted at the first game back; in the app it applies while an injury report keeps the player out.',
            'One fit pair and one test pair: the calibrated rule is evidence-based, not a guarantee for 2026/27.'])

if __name__=='__main__':
    report=run()
    text=json.dumps(report,ensure_ascii=False,indent=1)+'\n'
    if '--check' in sys.argv:
        if OUT.read_text(encoding='utf-8')!=text:sys.exit('data/inseason-calibration.json is stale: rerun scripts/inseason_calibration.py')
    else:OUT.write_text(text,encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['points','availability']}))
    for k,v in report['holdout'].items():print(k,v['currentMAE'],'->',v['calibratedMAE'],'bias',v['currentBias'],'->',v['calibratedBias'],'gain95',v['maeGain95'])
