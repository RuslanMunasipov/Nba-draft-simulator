"""FBL season projection model trained on full career game logs (ESPN, NBA regular seasons 2002-2026).

Marcel-style, every weight fitted on data and checked on an untouched season:
- points per minute (Sports.ru formula without participation and result bonuses): weighted last three seasons,
  shrunk to the league rate by total minutes, plus an age curve;
- minutes per game: weighted last three seasons, shrunk to the league mean by games, plus an age curve;
- share of team games played: weighted last three seasons and the career share, shrunk to the age-group mean;
- participation bonus from the player's own share of games under 10 minutes; result bonus from the team's previous
  season, shrunk by the measured year-to-year team persistence;
- rookies: first-season rate, minutes and share by draft pick, fitted on complete draft classes.
Season ranges come from paired residuals of similar fitted transitions, scaled per tail by split-conformal calibration.

Fit: target seasons up to 2024-25. Test: 2025-26 (untouched). Production: refit on all seasons, target 2026-27.
Population: the current-player universe of the collection (players on 2026-27 rosters), which is the population the
app forecasts; transitions of older seasons are survivor-selected and the report says so.
Usage: projection_model.py [--report-only]  (reads and updates public/data/default-draft.json)
"""
import json,math,random,statistics,sys,unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path
import pyarrow.parquet as pq

CAREER=Path('data/raw/career_games.parquet')
PEOPLE=Path('data/career-players.json')
DRAFTS=Path('data/nba-drafts.json')
SEASON_FILES={2024:'data/raw/game_logs_2023-24.parquet',2025:'data/raw/game_logs_2024-25.parquet',2026:'data/raw/game_logs_2025-26.parquet'}
TEST,TARGET=2026,2027
RULES='https://www.sports.ru/fantasy/basketball/tournament/rules/150.html'
STAT_KEYS=['pts','reb','ast','stl','blk','tov','pf','fgm','fga','ftm','fta']

def counting(r):
    """Sports.ru points of one game without the participation and result bonuses."""
    return r['pts']+r['reb']+r['ast']+r['stl']+r['blk']-(r['fga']-r['fgm'])-(r['fta']-r['ftm'])-2*r['tov']-r['pf']
def result_bonus(home,won):return (2 if home else 3) if won else (-3 if home else -2)
def quantile(values,p):
    v=sorted(values)
    if not v:return None
    x=(len(v)-1)*p;i=int(x);return v[i]+(v[min(i+1,len(v)-1)]-v[i])*(x-i)
def normalize(name):
    text=''.join(c for c in unicodedata.normalize('NFKD',name or '').lower() if c.isalnum() or c.isspace())
    return ' '.join(w for w in text.split() if w not in {'jr','sr','ii','iii','iv'})

# ---------- seasons ----------
def season_table(rows,key):
    """(player, season) -> games, minutes, counting points, games under 10 minutes, team, result bonus; plus team calendars."""
    seasons=defaultdict(lambda:dict(games=0,minutes=0.0,counting=0.0,short=0,bonus=0.0,teams=[],logs=[],stats=defaultdict(float)))
    team_games=defaultdict(set);team_bonus=defaultdict(list)
    for r in rows:
        s=seasons[(key(r),r['season'])];s['games']+=1;s['minutes']+=r['minutes'];s['counting']+=counting(r);s['short']+=r['minutes']<10
        for k in STAT_KEYS:s['stats'][k]+=r[k]
        s['teams'].append(r['team']);s['logs'].append(counting(r)+(2 if r['minutes']>=10 else 1))
        if r.get('result') in ('W','L'):
            b=result_bonus(r['home'],r['result']=='W');s['bonus']+=b
            team_games[(r['season'],r['team'])].add(r['game_id']);team_bonus[(r['season'],r['team'])].append((r['game_id'],b))
    for s in seasons.values():s['team']=max(set(s['teams']),key=s['teams'].count)
    bonus={k:statistics.mean(dict(v).values()) for k,v in team_bonus.items() if len(dict(v))>=20}
    return dict(seasons),{k:len(v) for k,v in team_games.items()},bonus
def season_length(year,team=None,team_games=None):
    if team_games and (year,team) in team_games and team_games[(year,team)]>=40:return max(team_games[(year,team)],{2012:66,2020:63,2021:72}.get(year,82))
    return {2012:66,2020:72,2021:72}.get(year,82)

class History:
    """Per-player season records with explicit zero-game seasons between a player's first and last NBA season."""
    def __init__(self,seasons,team_games,births):
        self.by=defaultdict(dict);self.team_games=team_games;self.births=births
        for (pid,year),s in seasons.items():self.by[pid][year]=s
        self.first={pid:min(v) for pid,v in self.by.items()}
    def age(self,pid,year):
        b=self.births.get(pid)
        if not b:return None
        y,m,d=map(int,b.split('-'));return (date(year-1,10,22)-date(y,m,d)).days/365.25
    def share(self,pid,year):
        s=self.by[pid].get(year)
        return 0.0 if not s else min(1.0,s['games']/season_length(year,s['team'],self.team_games))
    def features(self,pid,target):
        """Seasons target-1..target-3 (missing seasons after the debut count as zero games) and the career share."""
        first=self.first.get(pid)
        if first is None or first>=target:return None
        past=[]
        for year in (target-1,target-2,target-3):
            if year<first:past.append(None);continue
            s=self.by[pid].get(year)
            past.append(dict(games=s['games'] if s else 0,minutes=s['minutes'] if s else 0.0,counting=s['counting'] if s else 0.0,stats=dict(s['stats']) if s else {},
                             short=s['short'] if s else 0,share=self.share(pid,year),team=s['team'] if s else None))
        if not any(p and p['games'] for p in past):return None
        career=[self.share(pid,y) for y in range(first,target)]
        return dict(past=past,career=statistics.mean(career),seasons=len(career),age=self.age(pid,target))
    def target(self,pid,year):
        s=self.by[pid].get(year)
        if not s:return dict(games=0,share=0.0,rate=None,minutes=None,perMinute=None,short=None)
        return dict(games=s['games'],share=self.share(pid,year),rate=(s['counting']+2*s['games']-s['short'])/s['games'],
                    minutes=s['minutes']/s['games'],perMinute=s['counting']/s['minutes'] if s['minutes'] else 0,short=s['short']/s['games'],stats=dict(s['stats']))

# ---------- veteran model ----------
def age_bucket(age):return None if age is None else max(20,min(37,int(round(age))))
class Veteran:
    # Levels (league rates, age curves, age-group availability) come from the last RECENT target seasons only: the
    # collection holds today's players, so older transitions are survivors whose careers went up. Weights and shrinkage,
    # which describe how fast a player's own record speaks, use every season.
    RECENT=3
    def __init__(self,examples):
        last=max(e['t'] for e in examples);recent=[e for e in examples if e['t']>last-self.RECENT]
        played=[e for e in examples if e['y']['games']>0];recent_played=[e for e in recent if e['y']['games']>0]
        self.league_pm=sum(e['y']['perMinute']*e['y']['minutes']*e['y']['games'] for e in recent_played)/sum(e['y']['minutes']*e['y']['games'] for e in recent_played)
        self.league_min=statistics.mean(e['y']['minutes'] for e in recent_played)
        # Per-minute league rates of every box-score stat on the same footing, so the shrunk stat line adds up exactly
        # to the shrunk points per minute.
        minutes=sum(e['y']['minutes']*e['y']['games'] for e in recent_played)
        self.league_stats={k:sum(e['y']['stats'][k] for e in recent_played)/minutes for k in STAT_KEYS}
        self.age_pm={};self.age_min={};self.age_share={}
        best=None
        # Points per minute: weights of the 2nd/3rd previous season and the shrinkage in minutes.
        for w2 in (0,.25,.5,.75,1):
            for w3 in (0,.25,.5):
                if w3>w2:continue
                for k in (0,100,250,500,1000,2000):
                    err=sum(abs(self._pm(e['x'],(1,w2,w3),k)-e['y']['perMinute'])*e['y']['minutes']*e['y']['games'] for e in played)
                    if best is None or err<best[0]:best=(err,(1,w2,w3),k)
        _,self.pm_w,self.pm_k=best
        self.age_pm=self._age_curve(recent_played,lambda e:e['y']['perMinute']-self._pm(e['x'],self.pm_w,self.pm_k),lambda e:e['y']['minutes']*e['y']['games'])
        best=None
        for w2 in (0,.25,.5,.75):
            for w3 in (0,.25,.5):
                if w3>w2:continue
                for k in (0,5,10,20,40,80):
                    err=sum(abs(self._min(e['x'],(1,w2,w3),k)-e['y']['minutes'])*e['y']['games'] for e in played)
                    if best is None or err<best[0]:best=(err,(1,w2,w3),k)
        _,self.min_w,self.min_k=best
        self.age_min=self._age_curve(recent_played,lambda e:e['y']['minutes']-self._min(e['x'],self.min_w,self.min_k),lambda e:e['y']['games'])
        self.base_share={b:statistics.mean(e['y']['share'] for e in recent if age_bucket(e['x']['age'])==b) for b in {age_bucket(e['x']['age']) for e in recent if e['x']['age'] is not None}}
        self.mean_share=statistics.mean(e['y']['share'] for e in recent)
        best=None
        for w2 in (0,.25,.5,.75):
            for w3 in (0,.25,.5):
                if w3>w2:continue
                for wc in (0,.5,1,2):
                    for j in (0,.5,1,2,4):
                        err=sum(abs(self._share(e['x'],(1,w2,w3),wc,j)-e['y']['share']) for e in examples)
                        if best is None or err<best[0]:best=(err,(1,w2,w3),wc,j)
        _,self.share_w,self.share_wc,self.share_j=best
        self.short_k=10
    def _pm(self,x,w,k):
        # Shrinking towards a minutes-dependent rate instead of the league rate was tried and lost on the held-out season.
        prior=self.league_pm;num=k*prior;den=k
        for wi,p in zip(w,x['past']):
            if p and p['minutes']>0:num+=wi*p['counting'];den+=wi*p['minutes']
        return num/den if den else prior
    def _min(self,x,w,k):
        num=k*self.league_min;den=k
        for wi,p in zip(w,x['past']):
            if p and p['games']>0:num+=wi*p['minutes'];den+=wi*p['games']
        return num/den if den else self.league_min
    def _share(self,x,w,wc,j):
        prior=self.base_share.get(age_bucket(x['age']),self.mean_share)
        num=j*prior+wc*x['career'];den=j+wc
        for wi,p in zip(w,x['past']):
            if p is not None:num+=wi*p['share'];den+=wi
        return num/den if den else prior
    @staticmethod
    def _age_curve(rows,residual,weight):
        """Mean residual per age, smoothed over neighbouring ages and shrunk where data are thin."""
        sums=defaultdict(float);weights=defaultdict(float)
        for e in rows:
            b=age_bucket(e['x']['age'])
            if b is None:continue
            w=weight(e);sums[b]+=residual(e)*w;weights[b]+=w
        curve={}
        for b in range(20,38):
            s=sum(sums[a]*(1 if a==b else .5) for a in (b-1,b,b+1));w=sum(weights[a]*(1 if a==b else .5) for a in (b-1,b,b+1))
            # A thin age group is pulled towards zero by a tenth of an average group's weight.
            curve[b]=s/(w+.1*statistics.mean(weights.values())) if w else 0.0
        return curve
    def predict(self,x):
        b=age_bucket(x['age'])
        pm=self._pm(x,self.pm_w,self.pm_k)+(self.age_pm.get(b,0) if b else 0)
        minutes=max(1.0,min(42.0,self._min(x,self.min_w,self.min_k)+(self.age_min.get(b,0) if b else 0)))
        share=max(0.0,min(1.0,self._share(x,self.share_w,self.share_wc,self.share_j)))
        short_games=sum(p['short'] for p in x['past'][:2] if p);games=sum(p['games'] for p in x['past'][:2] if p)
        prior_short=1/(1+math.exp((minutes-8)/2.5))  # league-wide link between average minutes and short games
        short=(short_games+self.short_k*prior_short)/(games+self.short_k)
        age_pm=self.age_pm.get(b,0) if b else 0
        stats={}
        for k in STAT_KEYS:
            num=self.pm_k*self.league_stats[k];den=self.pm_k
            for wi,p in zip(self.pm_w,x['past']):
                if p and p['minutes']>0:num+=wi*p['stats'].get(k,0);den+=wi*p['minutes']
            stats[k]=num/den*minutes
        return dict(perMinute=pm,minutes=minutes,share=share,short=short,rate=pm*minutes+2-short,stats=stats,ageAdjustment=age_pm*minutes)
    def report(self):
        return dict(perMinuteWeights=self.pm_w,perMinuteShrinkMinutes=self.pm_k,minuteWeights=self.min_w,minuteShrinkGames=self.min_k,
                    shareWeights=self.share_w,careerShareWeight=self.share_wc,shareShrink=self.share_j,
                    leaguePerMinute=self.league_pm,leagueMinutes=self.league_min,
                    agePerMinute={k:round(v,4) for k,v in self.age_pm.items()},ageMinutes={k:round(v,2) for k,v in self.age_min.items()})

def examples_for(history,targets,current):
    """Transitions into each target season for players still in the league afterwards: they appear in a later season
    or are on a 2026-27 roster. This mirrors the forecast population (players on a roster) and keeps a missed season by
    an injured player (Haliburton 2025-26) while dropping players who had left the NBA."""
    out=[]
    for pid in history.by:
        last=max(history.by[pid])
        for t in targets:
            if not (last>t or pid in current):continue
            x=history.features(pid,t)
            if x:out.append(dict(pid=pid,t=t,x=x,y=history.target(pid,t)))
    return out

# ---------- rookies ----------
class Rookie:
    """First NBA season by draft pick: rate, minutes and share regress on log(pick); undrafted players have their own mean."""
    def __init__(self,rows):
        self.rows=rows
        drafted=[r for r in rows if r['pick']];self.fit={}
        for key in ('rate','minutes','share'):
            data=[(math.log(r['pick']),r[key]) for r in drafted if r[key] is not None]
            mx=statistics.mean(a for a,_ in data);my=statistics.mean(b for _,b in data)
            beta=sum((a-mx)*(b-my) for a,b in data)/sum((a-mx)**2 for a,_ in data)
            undrafted=[r[key] for r in rows if not r['pick'] and r[key] is not None]
            self.fit[key]=dict(intercept=my-beta*mx,slope=beta,undrafted=statistics.mean(undrafted) if undrafted else my-beta*math.log(60))
    def errors(self,rows):
        """Out-of-sample (relative rate, share) errors of this fit on another draft class, for rookie ranges."""
        self.residuals=[((r['rate']/self.predict(r['pick'])['rate']-1) if r['rate'] is not None else None,r['share']-self.predict(r['pick'])['share']) for r in rows]
        return self
    def interval(self,rate,share,games_scale=82):
        rels=[a for a,_ in self.residuals if a is not None] or [0];scen=[]
        for i,(rel,ds) in enumerate(self.residuals):
            scen.append(rate*(1+(rel if rel is not None else rels[i%len(rels)]))*max(0,min(1,share+ds))*games_scale)
        centre=rate*share*games_scale
        return min(centre,quantile(scen,.1)),max(centre,quantile(scen,.9)),statistics.mean(max(0,min(1,share+ds))<.25 for _,ds in self.residuals)
    def predict(self,pick):
        out={}
        for key,f in self.fit.items():out[key]=f['intercept']+f['slope']*math.log(pick) if pick else f['undrafted']
        out['share']=max(0.0,min(1.0,out['share']));out['minutes']=max(1.0,out['minutes'])
        # Stat line: per-minute box score of the 15 first seasons nearest in draft position, at the predicted minutes.
        near=sorted([r for r in self.rows if r.get('perMinuteStats') and r['games']>=10],key=lambda r:abs(math.log(r['pick'] or 75)-math.log(pick or 75)))[:15]
        if near:out['stats']={k:statistics.mean(r['perMinuteStats'][k] for r in near)*out['minutes'] for k in STAT_KEYS}
        return out
def rookie_rows(drafts,season_rows_by_year):
    """Complete draft classes: every drafted player's first season (zero games when he did not play), and undrafted debutants."""
    out=[]
    for year,(rows,earlier) in season_rows_by_year.items():
        byname=defaultdict(list)
        for pid,s in rows.items():byname[normalize(s['name'])].append(pid)
        picks={normalize(p['name']):p['overall'] for p in drafts.get(str(year-1),[])}
        seen=set()
        for name,pick in picks.items():
            ids=byname.get(name,[])
            if len(ids)>1:continue
            s=rows[ids[0]] if ids else None
            if ids and ids[0] in earlier:continue
            seen.update(ids)
            out.append(dict(year=year,pick=pick,name=name,games=s['games'] if s else 0,share=min(1,s['games']/82) if s else 0.0,
                            rate=s['rate'] if s else None,minutes=s['minutes'] if s else None,perMinuteStats=s['perMinuteStats'] if s else None))
        later=set().union(*[set(picks) for picks in [ {normalize(p['name']) for p in drafts.get(str(y),[])} for y in range(year-1,year+1)]])
        for pid,s in rows.items():
            if pid in seen or pid in earlier or normalize(s['name']) in later:continue
            out.append(dict(year=year,pick=None,name=s['name'],games=s['games'],share=min(1,s['games']/82),rate=s['rate'],minutes=s['minutes'],perMinuteStats=s['perMinuteStats']))
    return out
def league_seasons(path,year):
    """All players of one supplied league season (complete, not survivor-selected): per-game rate and minutes."""
    rows=pq.read_table(path).to_pylist();out={}
    for r in rows:
        if r['minutes']<=0:continue
        s=out.setdefault(r['player_id'],dict(name=r['player_name'],games=0,minutes=0.0,points=0.0,stats=defaultdict(float)))
        s['games']+=1;s['minutes']+=r['minutes'];s['points']+=counting(r)+(2 if r['minutes']>=10 else 1)
        for k in STAT_KEYS:s['stats'][k]+=r[k]
    for s in out.values():s['perMinuteStats']={k:v/s['minutes'] for k,v in s['stats'].items()};s['rate']=s['points']/s['games'];s['minutes']=s['minutes']/s['games']
    return out

# ---------- ranges ----------
class Ranges:
    """Season range from out-of-sample errors: every pooled season was predicted by a model fitted only on earlier
    seasons. A player's scenarios apply the relative rate error and the share error of the 150 pooled cases with the
    closest predicted share and evidence. Each season's median error is removed first (a level bias of the survivor-
    selected older fits, which the held-out 2025-26 season does not show), so only the spread is transferred. Each tail is
    then scaled by leave-one-season-out conformal calibration to its 10% target."""
    def __init__(self,forward,scales=None):
        by=defaultdict(list)
        for e,p in forward:by[e['t']].append((e,p))
        self.pool=[]
        for season,rows in by.items():
            rel=[(e['y']['rate']/p['rate']-1) for e,p in rows if e['y']['games']>=5 and p['rate']>1]
            mid_rel=statistics.median(rel) if rel else 0;mid_ds=statistics.median(e['y']['share']-p['share'] for e,p in rows)
            for e,p in rows:
                self.pool.append(dict(season=season,share=p['share'],evidence=self.evidence(e['x']),age=e['x']['age'] or 27,
                    rel=(e['y']['rate']/p['rate']-1-mid_rel) if e['y']['games']>=5 and p['rate']>1 else None,ds=e['y']['share']-p['share']-mid_ds))
        self.low=self.high=1.0
        if scales:self.low,self.high=scales;return
        lows=[];highs=[];full=self.pool
        for season,rows in by.items():
            self.pool=[r for r in full if r['season']!=season]
            for e,p in rows:
                centre,lo,hi=self.raw(p,e['x'],season_length(e['t']));actual=(e['y']['rate'] or 0)*e['y']['games']
                lows.append((centre-actual)/max(1,centre-lo));highs.append((actual-centre)/max(1,hi-centre))
        self.pool=full
        self.low=max(.5,quantile(lows,.9));self.high=max(.5,quantile(highs,.9))
    @staticmethod
    def evidence(x):return sum(p['games'] for p in x['past'] if p)
    def neighbours(self,p,x):
        # Young players with short records break out far more often than veterans: age and evidence pick the errors.
        e=self.evidence(x);age=(x or {}).get('age') or 27
        return sorted(self.pool,key=lambda r:abs(r['share']-p['share'])/.15+abs(math.log1p(r['evidence'])-math.log1p(e))+abs(r['age']-age)/3)[:150]
    def raw(self,p,x,games_scale=82):
        near=self.neighbours(p,x);rels=[r['rel'] for r in near if r['rel'] is not None] or [0]
        scen=[]
        for i,r in enumerate(near):
            rel=r['rel'] if r['rel'] is not None else rels[i%len(rels)]
            scen.append(p['rate']*(1+rel)*max(0,min(1,p['share']+r['ds']))*games_scale)
        centre=p['rate']*p['share']*games_scale
        return centre,min(centre,quantile(scen,.1)),max(centre,quantile(scen,.9))
    def interval(self,p,x,games_scale=82):
        centre,lo,hi=self.raw(p,x,games_scale)
        near=self.neighbours(p,x);short=statistics.mean(max(0,min(1,p['share']+r['ds']))<.25 for r in near)
        return max(0,centre-(centre-lo)*self.low),centre+(hi-centre)*self.high,short

def forward(examples,seasons):
    """(example, prediction) for every season in `seasons`, each predicted by a model fitted only on earlier seasons."""
    out=[]
    for season in seasons:
        model=Veteran([e for e in examples if e['t']<season])
        out+=[(e,model.predict(e['x'])) for e in examples if e['t']==season]
    return out

def teammate_correlation(forward):
    """Correlation of season errors between players of the same NBA club in the same season (out-of-sample errors,
    standardised within each season). Shared minutes and usage pull it below zero, shared pace and health above."""
    by=defaultdict(list)
    for e,p in forward:
        team=next((q['team'] for q in e['x']['past'] if q and q['team']),None)
        if team:by[e['t']].append((team,(e['y']['rate'] or 0)*e['y']['games']-p['rate']*p['share']*season_length(e['t'])))
    xs=[];ys=[]
    for season,rows in by.items():
        sd=statistics.pstdev(r for _,r in rows) or 1;mid=statistics.mean(r for _,r in rows)
        clubs=defaultdict(list)
        for team,r in rows:clubs[team].append((r-mid)/sd)
        for vals in clubs.values():
            for i in range(len(vals)):
                for j in range(i+1,len(vals)):xs+=[vals[i],vals[j]];ys+=[vals[j],vals[i]]
    mx=statistics.mean(xs);my=statistics.mean(ys)
    cov=sum((a-mx)*(b-my) for a,b in zip(xs,ys))/len(xs)
    return dict(correlation=cov/(statistics.pstdev(xs)*statistics.pstdev(ys)),pairs=len(xs)//2)

# ---------- team results ----------
def team_persistence(bonus):
    pairs=[(bonus[(y-1,t)],bonus[(y,t)]) for (y,t) in bonus if (y-1,t) in bonus and y<=TEST]
    mx=statistics.mean(a for a,_ in pairs);my=statistics.mean(b for _,b in pairs)
    beta=sum((a-mx)*(b-my) for a,b in pairs)/sum((a-mx)**2 for a,_ in pairs)
    return beta,len(pairs)

# ---------- evaluation ----------
def evaluate(model,ranges,test,bonus,beta):
    rows=[]
    for e in test:
        p=model.predict(e['x']);last=next((q for q in e['x']['past'] if q and q['games']),None)
        team=last['team'];b=beta*bonus.get((e['t']-1,team),0)
        n=season_length(e['t']);centre=(p['rate']+b)*p['share']*n;lo,hi,short=ranges.interval(dict(p,rate=p['rate']+b),e['x'],n)
        actual=((e['y']['rate'] or 0)+b)*e['y']['games']
        lp=e['x']['past'][0]
        persistence=((lp['counting']+2*lp['games']-lp['short'])/lp['games']+b)*lp['games'] if lp and lp['games'] else 0
        rows.append(dict(pid=e['pid'],actual=actual,centre=centre,persistence=persistence,lo=lo,hi=hi,short=short,
                         rate=p['rate'],actualRate=e['y']['rate'],games=p['share']*n,actualGames=e['y']['games'],lastGames=lp['games'] if lp else 0))
    gains=[abs(r['persistence']-r['actual'])-abs(r['centre']-r['actual']) for r in rows]
    rng=random.Random(17);boot=[statistics.mean(rng.choices(gains,k=len(gains))) for _ in range(2000)]
    played=[r for r in rows if r['actualGames']>=10]
    outcome=[r['actualGames']<.25*82 for r in rows];base=statistics.mean(outcome)
    brier=statistics.mean((r['short']-o)**2 for r,o in zip(rows,outcome));brier0=statistics.mean((base-o)**2 for o in outcome)
    return dict(players=len(rows),seasonMAE=statistics.mean(abs(r['centre']-r['actual']) for r in rows),
                persistenceSeasonMAE=statistics.mean(abs(r['persistence']-r['actual']) for r in rows),
                pairedGain95=[quantile(boot,.025),quantile(boot,.975)],
                perGameMAE=statistics.mean(abs(r['rate']-r['actualRate']) for r in played),
                persistencePerGameMAE=statistics.mean(abs((r['persistence']/r['lastGames'] if r['lastGames'] else 0)-(r['actualRate']+0)) for r in played if r['lastGames']),
                gamesMAE=statistics.mean(abs(r['games']-r['actualGames']) for r in rows),
                persistenceGamesMAE=statistics.mean(abs(r['lastGames']-r['actualGames']) for r in rows),
                coverage80=statistics.mean(r['lo']<=r['actual']<=r['hi'] for r in rows),
                belowRange=statistics.mean(r['actual']<r['lo'] for r in rows),aboveRange=statistics.mean(r['actual']>r['hi'] for r in rows),
                coverage80Active=statistics.mean(r['lo']<=r['actual']<=r['hi'] for r in played),
                medianFloorShare=statistics.median(r['lo']/r['centre'] for r in rows if r['centre']>0),
                shortSeasonBrier=brier,shortSeasonBaseRateBrier=brier0,shortSeasonRate=base)

# ---------- build ----------
def load():
    births={p['playerId']:p['birthDate'] for p in json.loads(PEOPLE.read_text())['players'] if p.get('birthDate')}
    rows=pq.read_table(CAREER,filters=[('competition','=','nba'),('season_type','=','REGULAR')]).to_pylist()
    seasons,team_games,bonus=season_table(rows,lambda r:r['player_id'])
    return History(seasons,team_games,births),bonus

FIT_FROM=2014  # earlier seasons hold few players of this universe and only long careers
POOL=6  # seasons of out-of-sample errors behind the ranges

def current_roster(data):
    data=data or (json.loads(Path('public/data/default-draft.json').read_text()) if Path('public/data/default-draft.json').exists() else {'players':[]})
    return {str(p.get('nbaId') or p['id']) for p in data['players'] if p.get('currentRosterStatus')=='SOURCE_REPORTED'}

def run(data=None):
    history,bonus=load()
    beta,team_pairs=team_persistence(bonus)
    current=current_roster(data)
    if len(current)<300:raise ValueError('Current rosters are required to define the forecast population')
    fit=examples_for(history,range(FIT_FROM,TEST),current);test=examples_for(history,[TEST],current)
    # Calibration players are held out of the model fit (by player, so no player is on both sides).
    frozen=Veteran(fit)
    ranges=Ranges(forward(fit,range(TEST-POOL,TEST)))
    holdout=evaluate(frozen,ranges,test,bonus,beta)
    drafts=json.loads(DRAFTS.read_text())['drafts']
    league={y:league_seasons(p,y) for y,p in SEASON_FILES.items()}
    rookie_fit=rookie_rows(drafts,{2025:(league[2025],league[2024])})
    rookie_test=rookie_rows(drafts,{2026:(league[2026],{**league[2024],**league[2025]})})
    rookie_frozen=Rookie(rookie_fit)
    def rookie_err(model,rows,key):return statistics.mean(abs(model.predict(r['pick'])[key]-r[key]) for r in rows if r[key] is not None)
    flat={k:statistics.mean(r[k] for r in rookie_fit if r[k] is not None) for k in ('rate','minutes','share')}
    rookie_holdout={k:dict(modelMAE=rookie_err(rookie_frozen,rookie_test,k),flatPriorMAE=statistics.mean(abs(flat[k]-r[k]) for r in rookie_test if r[k] is not None)) for k in ('rate','minutes','share')}
    rookie_holdout.update(players=len(rookie_test),drafted=sum(bool(r['pick']) for r in rookie_test))
    report=dict(status='TRAINED_AND_HELD_OUT',fitTargets=[FIT_FROM,TEST-1],testTarget=TEST,fitTransitions=len(fit),testPlayers=len(test),
                frozenModel=frozen.report(),holdout=holdout,teamResultPersistence=dict(slope=beta,teamSeasons=team_pairs),
                rangeScaling=dict(low=ranges.low,high=ranges.high,errorPool=[TEST-POOL,TEST-1],method='forward (out-of-sample) errors, leave-one-season-out conformal per tail'),
                rookies=dict(fit=rookie_frozen.fit,holdout=rookie_holdout,fitSeasons=[2024],testSeason=2025),
                limitations=['Career logs cover players on 2026-27 rosters: older transitions are survivor-selected (players who lasted). '
                             'The test season matches the forecast population (players who are on a roster the following season).',
                             'ESPN minutes are whole numbers, so the 10-minute participation threshold is approximate near 10 minutes.',
                             'Team result bonus uses the previous season shrunk by measured persistence, not the current roster strength.',
                             'Rookie rows match draft names to league logs; ambiguous names are skipped. Drafted players who never played count as zero games.'])
    if data is None:return report
    production=Veteran(fit+test);pool=forward(fit+test,range(TARGET-POOL,TARGET));prod_ranges=Ranges(pool)
    club=teammate_correlation(pool)
    rookies=Rookie(rookie_fit+rookie_test);rookies.residuals=Rookie(rookie_fit).errors(rookie_test).residuals
    game_ratios=game_spread(history)
    index={str(p['PERSON_ID']):p for p in json.loads(Path('data/official-nba-player-index.json').read_text())['players']}
    draft_names={normalize(p['name']):p['overall'] for p in drafts.get(str(TARGET-1),[])}
    applied=apply(data,history,production,prod_ranges,rookies,bonus,beta,index,draft_names,game_ratios)
    for player in data['players']:
        if (player.get('forecast') or {}).get('version')==4:player['forecast']['clubCorrelation']=club['correlation']
    report['production']=dict(model=production.report(),teammateCorrelation=club,rangeScaling=dict(low=prod_ranges.low,high=prod_ranges.high),rookies=rookies.fit,applied=applied)
    data['projectionModelAudit']=report
    return report

def apply(data,history,model,ranges,rookies,bonus,beta,index,draft_names,game_ratios):
    """Model forecast for every catalog player with NBA history or a draft pick, combined with ESPN where it exists."""
    counts=defaultdict(int)
    for player in data['players']:
        pid=str(player.get('nbaId') or player['id'])
        f=player.get('forecast') or {}
        team=player.get('team');b=beta*bonus.get((TEST,team),0) if team else 0
        x=history.features(pid,TARGET)
        if x:
            p=model.predict(x);evidence='CAREER_MODEL'
        else:
            official=index.get(str(player.get('nbaId') or ''),{})
            pick=official.get('DRAFT_NUMBER') if official.get('DRAFT_YEAR')==TARGET-1 else draft_names.get(normalize(player['name']))
            if not (player.get('isRookie') or pick):continue
            p=rookies.predict(pick);p['short']=1/(1+math.exp((p['minutes']-8)/2.5));evidence='DRAFT_PICK_MODEL' if pick else 'UNDRAFTED_ROOKIE_MODEL'
            p['pick']=pick
        model_rate=p['rate']+b;model_games=p['share']*82
        espn=f if f.get('origin')=='ESPN_INDIVIDUAL' else None
        # Without any archive of ESPN projections their relative accuracy cannot be fitted: an equal-weight combination,
        # the standard choice for two unvalidated forecasts, until the 2026/27 season measures it.
        rate=(model_rate+espn['meanPerGame'])/2 if espn else model_rate
        games=(model_games+espn['games'])/2 if espn else model_games
        share=games/82
        lo,hi,short=ranges.interval(dict(p,rate=rate,share=share),x) if x else rookies.interval(rate,share)
        game_floor=f.get('gameFloor');game_ceiling=f.get('gameCeiling')
        if x:
            logs=[v+b for year in (TARGET-1,TARGET-2) for v in history.by[pid].get(year,{}).get('logs',[])]
            if len(logs)>=10:
                shift=rate-statistics.mean(logs);game_floor=quantile(logs,.1)+shift;game_ceiling=quantile(logs,.9)+shift
        if game_floor is None or not x:
            lo_r,hi_r=game_ratios(rate);game_floor,game_ceiling=rate*lo_r,rate*hi_r
        origin=('ESPN_MODEL_COMBINED' if espn else evidence)
        line,components=stat_line(p,espn,player,rate,b)
        tier='PERSONAL_PROVIDER' if espn else 'PERSONAL_HISTORY' if x else 'DRAFT_PRIOR'
        player['forecast']=dict(version=4,metric='FBL_FULL_FORMULA_ESTIMATE',origin=origin,coverageTier=tier,
            basis=('Среднее прогноза ESPN и модели по карьере' if espn else 'Модель по карьере' if x else 'Модель новичков по номеру драфта'
                   if p.get('pick') else 'Модель незадрафтованных новичков')+'; веса модели подобраны на сезонах до 2024/25 и проверены на 2025/26',
            meanPerGame=rate,games=games,minutes=(p['minutes']+espn['minutes'])/2 if espn else p['minutes'],meanSeason=rate*games,
            gameFloor=min(rate,game_floor),gameCeiling=max(rate,game_ceiling),seasonFloor=min(rate*games,lo),seasonCeiling=max(rate*games,hi),
            shortSeasonRisk=short,
            intervalCalibration='FORWARD_CONFORMAL_PER_TAIL' if x else 'ROOKIE_CLASS_2025_ERRORS',
            rangeMeaning='Сезонный диапазон 10–90%: остатки похожих игроков, каждая сторона откалибрована отдельно (проверка на 2025/26). '
                         'Риск короткого сезона — доля похожих случаев с менее чем четвертью матчей.',
            inputStats=line,components=components,
            sources=dict(model=dict(perGame=model_rate,games=model_games,perMinute=p.get('perMinute'),minutes=p['minutes'],participation=2-p['short']),
                         espn=dict(perGame=espn['meanPerGame'],games=espn['games']) if espn else None),
            draftPick=p.get('pick'),rookieExtrapolation=not x,rulesSource=RULES,asOf=data['generatedAt'],
            previous=dict(origin=f.get('origin'),meanPerGame=f.get('meanPerGame'),games=f.get('games')) if f else None)
        counts[origin]+=1
    # One metric everywhere: the per-game value every module ranks by is the full-formula forecast.
    for player in data['players']:
        f=player.get('forecast')
        if f and f.get('metric')=='FBL_FULL_FORMULA_ESTIMATE' and math.isfinite(f.get('meanPerGame',float('nan'))):
            player['projectedFP']=f['meanPerGame'];player['projectionMetric']='FBL_FULL_FORMULA_PER_GAME';player['projectionStatus']='FBL_FORECAST'
    return dict(counts)

def terms(st):return st['pts']+st['reb']+st['ast']+st['stl']+st['blk']-(st['fga']-st['fgm'])-(st['fta']-st['ftm'])-2*st['tov']
def stat_line(p,espn,player,rate,bonus):
    """Per-game box-score line of the forecast (model, or the mean of model and ESPN) and the Sports.ru components that
    add up exactly to the per-game forecast; what the stat line does not explain (age curve, ESPN's own adjustments) is
    a separate `adjustment` term."""
    model=p.get('stats')
    q=((player.get('espnContext') or {}).get('individualProjection') or {}).get('perGame') if espn else None
    espn_line=None
    if q:
        names=dict(pts='points',reb='rebounds',ast='assists',stl='steals',blk='blocks',tov='turnovers',fgm='fgMade',fga='fgAttempted',ftm='ftMade',fta='ftAttempted')
        if all(n in q for n in names.values()):
            espn_line={k:q[n] for k,n in names.items()};espn_line['pf']=-((espn.get('components') or {}).get('personalFouls') or 0)
    lines=[x for x in (model,espn_line) if x]
    line={k:statistics.mean(x.get(k,0) for x in lines) for k in STAT_KEYS} if lines else None
    participation=2-p['short']
    if line:
        components=dict(countingAndMisses=terms(line),personalFouls=-line['pf'],participation=participation,teamResult=bonus)
    else:
        components=dict(countingAndMisses=rate-bonus-participation,personalFouls=0,participation=participation,teamResult=bonus)
    components['adjustment']=rate-sum(components.values())
    return line,components

def game_spread(history):
    """Single-game P10/P90 as multiples of the season mean, from 2025-26 players of a similar per-game level."""
    pairs=[]
    for pid,seasons in history.by.items():
        s=seasons.get(TEST)
        if s and s['games']>=20:
            m=statistics.mean(s['logs'])
            if m>1:pairs.append((m,quantile(s['logs'],.1)/m,quantile(s['logs'],.9)/m))
    def ratios(rate):
        near=sorted(pairs,key=lambda q:abs(q[0]-rate))[:40]
        return statistics.median(q[1] for q in near),statistics.median(q[2] for q in near)
    return ratios

if __name__=='__main__':
    path=Path('public/data/default-draft.json')
    if '--report-only' in sys.argv:print(json.dumps(run(),indent=2,default=str));sys.exit()
    data=json.loads(path.read_text());report=run(data)
    # Publishing gate: the model must stay ahead of persistence on the untouched season.
    if report['holdout']['pairedGain95'][0]<=0:raise SystemExit('Projection model no longer beats persistence on the held-out season')
    path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    Path('public/data/projection-model-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2,default=str))
    print(json.dumps({k:v for k,v in report.items() if k in ('holdout','rookies','teamResultPersistence','rangeScaling','production')},indent=2,default=str)[:6000])
