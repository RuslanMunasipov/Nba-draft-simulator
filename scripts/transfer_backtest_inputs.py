"""Point-in-time inputs of the transfer-advice backtest (scripts/transfer_backtest.mjs) for the 2024/25 and 2025/26 NBA
regular seasons: what the season assistant would have known before each season, and the games as they were played.

Nothing of the predicted season enters a forecast:
- the career model, its ranges and the absence chain are fitted on target seasons before it (as the held-out check of
  projection_model.py does for 2025/26); rookies come from the draft-pick model fitted on the previous class;
- the in-season update (inseason_calibration.py) is refitted on the pair of seasons before it, its early-season offsets
  from the season before it; 2024/25's fit pair starts from 2022/23, which only the career logs hold (players still in
  the league in 2026, survivor-selected);
- the absence chain's spell lengths are refitted on seasons before it.
What is not available historically is replaced and said so in the report:
- no ESPN injury report (the chain alone, from the start of the season unconditional, not healthy);
- Sports.ru prices: the 2026/27 prices regressed on the previous season's FBL points per game (rookies on the draft
  pick), fixed through the season (Sports.ru's in-season price moves are not modelled);
- Sports.ru positions: the 2026/27 positions where the player has one, otherwise the nearest stat profile among them;
- the white rule: the league's list where the player was checked, otherwise not white.
The population is the forecast population of projection_model.examples_for (players with an NBA record who play that
season or later, or are on a 2026/27 roster) plus the draft class and the season's undrafted debutants.
Usage: transfer_backtest_inputs.py [out_dir]  (default .cache/transfer-backtest; one <season>.json per season)
"""
import html,json,math,statistics,sys
from collections import defaultdict
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
try:
    import projection_model as pm
    import availability_model as av
    import inseason_calibration as ic
    from fbl_formula import fbl_points
    from minute_encoding import normalize_minutes
except ImportError:
    from scripts import projection_model as pm
    from scripts import availability_model as av
    from scripts import inseason_calibration as ic
    from scripts.fbl_formula import fbl_points
    from scripts.minute_encoding import normalize_minutes

TARGETS={2025:'2024-25',2026:'2025-26'}
POSITIONS=['PG','SG','SF','PF','C']
OUT=Path(sys.argv[1] if len(sys.argv)>1 else '.cache/transfer-backtest')

def market():
    """Sports.ru's market of 17.10.2026 by NBA id: price, position, white-rule status where the league checked him."""
    prices={r['sportsId']:r for r in json.loads(Path('data/sports-prices-2026-10-17.json').read_text())['players']}
    league=json.loads(Path('data/fbl-league.json').read_text())
    white={str(x) for x in league.get('white',[])};checked={str(x) for x in league.get('whiteChecked',[])}
    out={}
    for m in json.loads(Path('data/sports-player-map.json').read_text())['players']:
        r=prices.get(m['sportsId'])
        if r and m.get('nbaId'):out[str(m['nbaId'])]=dict(price=r['price'],position=POSITIONS[int(r['sportsPosition'])-1])
    return out,white,checked

def season_rows(year):
    rows,_=normalize_minutes(pq.read_table(pm.SEASON_FILES[year]).to_pylist(),year)
    for r in rows:r['date']=str(r['game_date'])[:10];r['player_id']=str(r['player_id']);r['team']=pm.ESPN_CODES.get(r['team'],r['team'])
    return rows

def per_minute_profile(rows):
    """Per-minute rebounds, assists, blocks, threes attempted and steals: the stat profile the positions are matched on."""
    s=defaultdict(lambda:np.zeros(6))
    for r in rows:
        if r['minutes']>0:s[r['player_id']]+=np.array([r['minutes'],r['reb'],r['ast'],r['blk'],r['fg3a'],r['stl']],dtype=float)
    return {k:v[1:]/v[0] for k,v in s.items() if v[0]>=100}

def price_model(sports,prev_rate,picks):
    """Sports.ru price from what Sports.ru saw before the season: quadratic in the previous season's FBL points per game
    (players with 10+ games), linear in log(pick) for rookies, rounded to 100 within Sports.ru's 1000-3500, both fitted on
    the 17.10.2026 prices."""
    x=[(prev_rate[k],v['price']) for k,v in sports.items() if k in prev_rate]
    a=np.array([[1,r,r*r] for r,_ in x]);y=np.array([p for _,p in x]);c=np.linalg.lstsq(a,y,rcond=None)[0]
    rmse=float(np.sqrt(((y-a@c)**2).mean()))
    rk=[(math.log(picks[k]),v['price']) for k,v in sports.items() if k in picks and k not in prev_rate]
    b=np.linalg.lstsq(np.array([[1,l] for l,_ in rk]),np.array([p for _,p in rk]),rcond=None)[0] if len(rk)>=8 else np.array([1100.0,0.0])
    clamp=lambda v:int(min(3500,max(1000,round(v/100)*100)))
    return (lambda rate:clamp(c[0]+c[1]*rate+c[2]*rate*rate)),(lambda pick:clamp(b[0]+b[1]*math.log(pick)) if pick else 1000),dict(veteranRMSE=round(rmse,1),players=len(x),rookies=len(rk))

def prev_rates(history,year):
    """FBL points per game of each player's season `year` (10+ games)."""
    return {pid:(s['counting']+s['games'])/s['games'] for pid,s in ((pid,v.get(year)) for pid,v in history.by.items()) if s and s['games']>=10}

def game_ratios(history,year):
    """projection_model.game_spread on the season before the forecast one (the shipped version reads 2025/26)."""
    pairs=[]
    for seasons in history.by.values():
        s=seasons.get(year)
        if s and s['games']>=20:
            m=statistics.mean(s['logs'])
            if m>1:pairs.append((m,pm.quantile(s['logs'],.1)/m,pm.quantile(s['logs'],.9)/m))
    def ratios(rate):
        near=sorted(pairs,key=lambda q:abs(q[0]-rate))[:40]
        return statistics.median(q[1] for q in near),statistics.median(q[2] for q in near)
    return ratios

def load_inseason(season):
    """inseason_calibration.load for a complete league file, or the career logs for 2022/23 (survivor-selected)."""
    if season in ic.SEASONS:return ic.load(season)
    year=int(season[:4])+1
    rows=pq.read_table(pm.CAREER,filters=[('competition','=','nba'),('season_type','=','REGULAR'),('season','=',year)]).to_pylist()
    players=defaultdict(list);dates=defaultdict(set)
    for r in rows:
        if r['team'] in pm.EXHIBITION:continue
        dates[r['team']].add(r['date']);players[int(r['player_id']) if r['player_id'].isdigit() else r['player_id']].append(dict(date=r['date'],team=r['team'],min=r['minutes'],fp=fbl_points(r)))
    for logs in players.values():logs.sort(key=lambda g:g['date'])
    return dict(players=players,dates={t:sorted(d) for t,d in dates.items()})

def inseason(target):
    """The in-season update as src/season.js reads it (CALIBRATION.points, .availability), fitted without `target`."""
    tag=TARGETS[target];prev=f'{target-2}-{str(target-1)[2:]}';prev2=f'{target-3}-{str(target-2)[2:]}'
    data={s:load_inseason(s) for s in (prev2,prev)}
    # newcomer_prior reads the season before its own from ic.SEASONS: the fit pair alone, as the shipped fit does.
    seasons,ic.SEASONS=ic.SEASONS,[prev2,prev]
    try:return _inseason(target,tag,prev2,prev,data)
    finally:ic.SEASONS=seasons
def _inseason(target,tag,prev2,prev,data):
    off=ic.game_offsets(data[prev]['players'])
    fit_est,fit_new=ic.point_cases(data,prev2,prev)
    # Offsets of the fit: from the season before the fit pair's target, as inseason_calibration does (the fit pair's own
    # prior season).
    off_fit=ic.game_offsets(data[prev2]['players'])
    est=ic.choose_split(fit_est,off_fit);new=ic.choose_split(fit_new,off_fit)
    fit_av=ic.availability_cases(data,prev2,prev);avail=ic.choose(fit_av,ic.availability,[(k,) for k in [5,10,15,20,30,40,60,80]])
    fit_ret=ic.return_cases(data,prev2,prev);cap=min(ic.SPELL_CAPS,key=lambda m:ic.mse(fit_ret,lambda c:ic.availability(c,avail[0],m)))
    pack=lambda g:dict(rateGames=g[0],minuteGames=g[1],minuteHalfLife=g[2],offsetScale=g[3])
    return dict(fitSeasons=[prev2,prev],target=tag,points=dict(established=pack(est),newcomer=pack(new),offsets=dict(off,buckets=[list(b) for b in ic.BUCKETS],season=prev)),
                availability=dict(priorGames=avail[0],spellMisses=cap,spellGames=ic.SPELL))

def draft_class(drafts,year,index,names):
    """Players drafted in `year`: (pid or None, pick) matched by NBA id, then by a unique name among logged players."""
    byid={(o.get('DRAFT_YEAR'),o.get('DRAFT_NUMBER')):pid for pid,o in index.items()}
    out=[]
    for p in drafts.get(str(year),[]):
        name=pm.normalize(html.unescape(p['name']));pid=byid.get((year,p['overall']))
        if pid is None:
            ids=names.get(name,[]);pid=ids[0] if len(ids)==1 else None
        out.append((pid,p['overall'],html.unescape(p['name'])))
    return out

def build(target,history,current,league,drafts,index,sports,white,checked,profiles):
    tag=TARGETS[target];rows=season_rows(target)
    fit=pm.examples_for(history,range(pm.FIT_FROM,target),current)
    model=pm.Veteran(fit);ranges=pm.Ranges(pm.forward(fit,range(target-pm.POOL,target),history));chain=pm.availability(history,target)
    test=pm.examples_for(history,[target],current)
    # Rookie model: fitted on the previous draft class, its errors from the class before when the league files hold one.
    prev_class=pm.rookie_rows(drafts,{target-1:(league[target-1],league.get(target-2,{}))},index,history.first,history.collected)
    rookies=pm.Rookie(prev_class)
    older=pm.rookie_rows(drafts,{target-2:(league[target-2],{})},index,history.first,history.collected) if target-2 in league else prev_class
    rookies.errors(older)
    ratios=game_ratios(history,target-1);rate_prev=prev_rates(history,target-1)
    names=defaultdict(list)
    for pid,s in league[target].items():names[pm.normalize(s['name'])].append(str(pid))
    klass=draft_class(drafts,target-1,{str(k):v for k,v in index.items()},names)
    picks={str(pid):pick for pid,pick,_ in klass if pid is not None}
    vet_price,rookie_price,price_fit=price_model(sports,prev_rates(history,2026),{str(o['PERSON_ID']):o['DRAFT_NUMBER'] for o in index.values() if o.get('DRAFT_YEAR')==2026 and o.get('DRAFT_NUMBER')})
    # Positions: Sports.ru's where known, else the nearest stat profile (5 neighbours) among players who have one.
    known=[(profiles[k],v['position']) for k,v in sports.items() if k in profiles]
    mu=np.mean([p for p,_ in known],0);sd=np.std([p for p,_ in known],0)+1e-9
    def position(pid):
        if pid in sports:return sports[pid]['position'],'SPORTS_RU_2026'
        prof=profiles.get(pid)
        if prof is None:return None,None
        d=sorted(known,key=lambda k:float((((k[0]-prof)/sd)**2).sum()))[:5]
        return max(POSITIONS,key=lambda q:sum(x==q for _,x in d)),'STAT_PROFILE'
    first_team={};last_team={}
    for r in sorted(rows,key=lambda r:r['date']):
        if r['minutes']>0:first_team.setdefault(r['player_id'],r['team'])
    for pid,years in history.by.items():
        s=years.get(target-1)
        if s:last_team[pid]=s['team']
    players=[];out_ids=set()
    def entry(pid,name,f,rookie,price,pos,how):
        team=first_team.get(pid) or last_team.get(pid)
        if not pos or not team:return
        out_ids.add(pid)
        players.append(dict(id=pid,name=name,positions=[pos],positionSource=how,isRookie=rookie,price=price,team=team,
                            white=pid in white,whiteKnown=pid in checked,forecast=f))
    for e in test:
        pid=e['pid'];p=pm.with_games(model.predict(e['x']),chain,pid,target)
        rate=p['rate'];games=p['share']*82;a=p.get('availability') or {}
        lo,hi,short=ranges.interval(p,e['x'])
        logs=[v for y in (target-1,target-2) for v in history.by[pid].get(y,{}).get('logs',[])]
        if len(logs)>=10:shift=rate-statistics.mean(logs);gf,gc=pm.quantile(logs,.1)+shift,pm.quantile(logs,.9)+shift
        else:r0,r1=ratios(rate);gf,gc=rate*r0,rate*r1
        f=dict(origin='CAREER_MODEL',coverageTier='PERSONAL_HISTORY',meanPerGame=rate,games=games,minutes=p['minutes'],meanSeason=rate*games,
               gameFloor=min(rate,gf),gameCeiling=max(rate,gc),seasonFloor=min(rate*games,lo),seasonCeiling=max(rate*games,hi),shortSeasonRisk=short,
               availability=dict(hazards=[a.get('shortHazard',0),a.get('longHazard',0)],unconditionalGames=games) if a else None,
               components=dict(participation=1),sources=dict(model=dict(perGame=rate,games=games)))
        pos,how=position(pid);name=league[target].get(int(pid),{}).get('name') if int(pid) in league[target] else None
        name=name or league[target-1].get(int(pid),{}).get('name') or pid
        entry(pid,name,f,False,vet_price(rate_prev[pid]) if pid in rate_prev else 1000,pos,how)
    # The draft class and the undrafted debutants: the pick model (rate, minutes, share), the class errors for the range.
    debut=[(str(pid),None,s['name']) for pid,s in league[target].items() if history.first.get(str(pid))==target and str(pid) not in picks]
    for pid,pick,name in [(p,k,n) for p,k,n in klass if p is not None]+debut:
        if pid in out_ids:continue
        q=rookies.predict(pick);rate=q['rate'];games=q['share']*82;lo,hi,short=rookies.interval(rate,q['share'])
        r0,r1=ratios(rate)
        f=dict(origin='DRAFT_PICK_MODEL' if pick else 'UNDRAFTED_ROOKIE_MODEL',coverageTier='DRAFT_PRIOR',meanPerGame=rate,games=games,minutes=q['minutes'],
               meanSeason=rate*games,gameFloor=rate*r0,gameCeiling=rate*r1,seasonFloor=min(rate*games,lo),seasonCeiling=max(rate*games,hi),shortSeasonRisk=short,
               availability=None,components=dict(participation=1),draftPick=pick,sources=dict(model=dict(perGame=rate,games=games)))
        pos,how=position(pid)
        if pos is None:pos,how=('SF','DEFAULT')  # a rookie with under 100 minutes all season: the commonest slot
        entry(pid,name,f,True,rookie_price(pick),pos,how)
    # Games as played: every appearance (minutes > 0) with its FBL points, by the official formula.
    games=defaultdict(list);clubs=defaultdict(set)
    for r in rows:
        clubs[r['team']].add(r['date'])
        if r['minutes']>0 and r['player_id'] in out_ids:games[r['player_id']].append([r['date'],r['team'],round(r['minutes'],2),fbl_points(r)])
    for v in games.values():v.sort()
    lengths=dict(shortLengths=[round(float(v),5) for v in chain.fs],longLengths=[round(float(v),5) for v in chain.fl])
    how={}
    for p in players:how[p['positionSource']]=how.get(p['positionSource'],0)+1
    return dict(season=tag,target=target,players=players,games=dict(games),clubs={k:sorted(v) for k,v in clubs.items()},lengths=lengths,
                calibration=inseason(target),priceModel=price_fit,positions=how,
                population=dict(players=len(players),rookies=sum(p['isRookie'] for p in players)))

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    history=pm.load();sports,white,checked=market();current=set(sports)
    league={y:pm.league_seasons(p,y) for y,p in pm.SEASON_FILES.items()}
    drafts=json.loads(pm.DRAFTS.read_text())['drafts']
    index={str(p['PERSON_ID']):p for p in json.loads(pm.INDEX.read_text())['players']}
    profiles={}
    for y in pm.SEASON_FILES:profiles.update(per_minute_profile(season_rows(y)))
    for target in TARGETS:
        data=build(target,history,current,league,drafts,index,sports,white,checked,profiles)
        (OUT/f"{data['season']}.json").write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')
        print(data['season'],data['population'],data['positions'],data['priceModel'],json.dumps(data['calibration']['availability']))

if __name__=='__main__':main()
