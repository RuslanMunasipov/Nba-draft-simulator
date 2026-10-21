"""FBL season projection model trained on full career game logs (ESPN, NBA regular seasons 2002-2026).

Marcel-style, every weight fitted on data and checked on an untouched season:
- points per minute (Sports.ru formula without the participation bonus): weighted last three seasons,
  shrunk to the league rate by total minutes, plus an age curve;
- minutes per game: weighted last three seasons, shrunk to the league mean by games, plus an age curve;
- share of team games played: weighted last three seasons and the career share, shrunk to the age-group mean;
- participation bonus from the player's own share of games under 10 minutes. The FBL formula has no team result bonus
  (league owner, 20.10.2026: the league scores on Yahoo, which cannot award points for wins or take them for losses);
- rookies: first-season rate, minutes and share by draft pick, fitted on complete draft classes.
- games distribution: a semi-Markov absence chain with Gamma frailty (availability_model.py), its mean set to the
  forecast games (no lower than a floor of the hazard scale); it supplies the games side of the season range and the
  short-season probability.
Season ranges pair rate residuals of similar fitted transitions with the chain's games, scaled per tail by conformal calibration.

Fit: target seasons up to 2024-25. Test: 2025-26 (untouched). Production: refit on all seasons, target 2026-27.
Population: the current-player universe of the collection (players on 2026-27 rosters), which is the population the
app forecasts; transitions of older seasons are survivor-selected and the report says so.
Usage: projection_model.py [--report-only]  (reads and updates public/data/default-draft.json)
"""
import html,itertools,json,math,random,statistics,sys,unicodedata
from collections import defaultdict
from datetime import date
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq
try:import availability_model as av
except ImportError:from scripts import availability_model as av

CAREER=Path('data/raw/career_games.parquet')
TEAM_CONTEXT=Path('public/data/team-context.json')
AVAILABILITY_LENGTHS=Path('data/availability-lengths.json')
PEOPLE=Path('data/career-players.json')
DRAFTS=Path('data/nba-drafts.json')
INDEX=Path('data/official-nba-player-index.json')
SEASON_FILES={2024:'data/raw/game_logs_2023-24.parquet',2025:'data/raw/game_logs_2024-25.parquet',2026:'data/raw/game_logs_2025-26.parquet'}
TEST,TARGET=2026,2027
RULES='https://www.sports.ru/fantasy/basketball/tournament/rules/150.html'
STAT_KEYS=['pts','reb','ast','stl','blk','tov','pf','fgm','fga','ftm','fta']

def counting(r):
    """FBL points of one game without the participation bonus."""
    return r['pts']+r['reb']+r['ast']+r['stl']+r['blk']-(r['fga']-r['fgm'])-(r['fta']-r['ftm'])-2*r['tov']-r['pf']
def quantile(values,p):
    v=sorted(values)
    if not v:return None
    x=(len(v)-1)*p;i=int(x);return v[i]+(v[min(i+1,len(v)-1)]-v[i])*(x-i)
def normalize(name):
    text=''.join(c for c in unicodedata.normalize('NFKD',name or '').lower() if c.isalnum() or c.isspace())
    return ' '.join(w for w in text.split() if w not in {'jr','sr','ii','iii','iv'})

# ---------- seasons ----------
def season_table(rows,key):
    """(player, season) -> games, minutes, counting points, games under 10 minutes, team; plus team calendars."""
    seasons=defaultdict(lambda:dict(games=0,minutes=0.0,counting=0.0,short=0,teams=[],logs=[],stats=defaultdict(float)))
    team_games=defaultdict(set)
    for r in rows:
        s=seasons[(key(r),r['season'])];s['games']+=1;s['minutes']+=r['minutes'];s['counting']+=counting(r);s['short']+=r['minutes']<10
        for k in STAT_KEYS:s['stats'][k]+=r[k]
        s['teams'].append(r['team']);s['logs'].append(counting(r)+(2 if r['minutes']>=10 else 1))
        # A team's calendar counts its decided games (a row with a result).
        if r.get('result') in ('W','L'):team_games[(r['season'],r['team'])].add(r['game_id'])
    for s in seasons.values():s['team']=max(sorted(set(s['teams'])),key=s['teams'].count)  # sorted: ties do not depend on the hash seed
    return dict(seasons),{k:len(v) for k,v in team_games.items()}
def season_length(year,team=None,team_games=None):
    if team_games and (year,team) in team_games and team_games[(year,team)]>=40:return max(team_games[(year,team)],{2012:66,2020:63,2021:72}.get(year,82))
    return {2012:66,2020:72,2021:72}.get(year,82)

class History:
    """Per-player season records with explicit zero-game seasons between a player's first and last NBA season."""
    def __init__(self,seasons,team_games,births):
        self.by=defaultdict(dict);self.team_games=team_games;self.births=births;self.imputed={}
        for (pid,year),s in seasons.items():self.by[pid][year]=s
        self.first={pid:min(v) for pid,v in self.by.items()}
    def age(self,pid,year):
        b=self.births.get(pid)
        if not b:
            base=self.imputed.get(pid)
            return None if base is None else base[1]+year-base[0]
        y,m,d=map(int,b.split('-'));return (date(year-1,10,22)-date(y,m,d)).days/365.25
    def impute_ages(self,names,drafted,draft_ids=None):
        """Players without a birth date get the mean age of players with one on the same footing: at the first season
        after their draft (official index by id, else the draft class by name), or at the debut when undrafted. They are
        almost all players who left the league and declined, so skipping them (or a constant age) fitted the age curves
        on survivors and pushed forecasts up."""
        draft_ids=draft_ids or {};draft=lambda pid:draft_ids.get(pid) or drafted.get(normalize(names.get(pid,'')))
        start=min(self.first.values(),default=0)  # a debut in the first logged season may be an earlier career
        at_draft=[self.age(pid,draft(pid)+1) for pid in self.first if pid in self.births and draft(pid)]
        at_debut=[self.age(pid,f) for pid,f in self.first.items() if pid in self.births and not draft(pid) and f>start]
        if not at_draft or not at_debut:return self
        a_draft,a_debut=statistics.mean(at_draft),statistics.mean(at_debut)
        self.imputed={pid:(draft(pid)+1,a_draft) if draft(pid) else (f,a_debut) for pid,f in self.first.items() if pid not in self.births}
        return self
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
        return dict(past=past,career=statistics.mean(career),seasons=len(career),age=self.age(pid,target),ageImputed=pid in self.imputed)
    def target(self,pid,year):
        s=self.by[pid].get(year)
        if not s:return dict(games=0,share=0.0,rate=None,minutes=None,perMinute=None,short=None)
        return dict(games=s['games'],share=self.share(pid,year),rate=(s['counting']+2*s['games']-s['short'])/s['games'],
                    minutes=s['minutes']/s['games'],perMinute=s['counting']/s['minutes'] if s['minutes'] else 0,short=s['short']/s['games'],stats=dict(s['stats']))

# ---------- veteran model ----------
def age_bucket(age):return None if age is None else max(20,min(37,int(round(age))))
class Veteran:
    # Levels (league rates, age curves) come from the last RECENT target seasons only: the collection holds today's
    # players, so older transitions are survivors whose careers went up. Weights and shrinkage, which describe how fast a
    # player's own record speaks, use every season. Availability comes from the share regression over the last six
    # target seasons, whose survivor seasons get their own level (base_share/mean_share only feed the reported shrinkage).
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
        # Squared error: a season total needs the mean share, and the median-seeking absolute error under-predicted the
        # bounce-back of players whose last season was cut short (0.54 predicted, 0.67 played over 2019-2026).
        for w2 in (0,.25,.5,.75,1):
            for w3 in (0,.25,.5):
                if w3>w2:continue
                for wc in (0,.5,1,2,4):
                    for j in (0,.5,1,2,4,8):
                        err=sum((self._share(e['x'],(1,w2,w3),wc,j)-e['y']['share'])**2 for e in examples)
                        if best is None or err<best[0]:best=(err,(1,w2,w3),wc,j)
        _,self.share_w,self.share_wc,self.share_j=best
        # Availability itself: least squares on the last three seasons, the career share, career length and age (with the
        # interaction of a short last season and a sound career). Forward-tested 2020-2026 it beats the shrinkage above
        # (15.0 vs 15.2 games MAE) and halves the under-prediction of bounce-back seasons; the shrinkage stays reported.
        last=max(e['t'] for e in examples);rows=[e for e in examples if e['t']>last-6]
        # Career-log seasons before the complete league files hold only today's catalog players, survivors who played more
        # at equal features: a season indicator takes that level out (forecasts are for the complete population, so 0).
        surv=[float(e['t']<min(SEASON_FILES)) for e in rows];self.survivor=0<sum(surv)<len(surv)
        X=np.array([self.share_features(e['x'])+[s]*self.survivor for e,s in zip(rows,surv)]);y=np.array([e['y']['share'] for e in rows])
        self.share_coef=np.linalg.lstsq(X,y,rcond=None)[0]
        self.short_k=10
    @staticmethod
    def share_features(x):
        last=x['past'][0]['share'] if x['past'][0] else 0;prev=x['past'][1]['share'] if x['past'][1] else x['career']
        # One linear age term, clamped like the age curves: the quadratic rose again after 32 (a survivor artefact of the
        # missing birth dates) and gave a 41-year-old six games more than a 32-year-old.
        a=max(20,min(37,x['age'] if x['age'] is not None else 27))-27
        return [1,last,prev,x['career'],min(1,x['seasons']/5),a,last*x['career']]
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
        share=float(max(0.0,min(1.0,np.dot(self.share_coef,self.share_features(x)+[0.0]*self.survivor))))
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
                    shareRegression=dict(zip(['intercept','last','previous','career','careerLength','age','lastXcareer','survivorSeason'],[round(float(c),4) for c in self.share_coef])),
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
            # Playing in the target season puts a player in the population too (complete league seasons).
            if not (last>t or pid in current or t in history.by[pid]):continue
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
    NEAR=30  # residual rows nearest in predicted level behind one rookie's range
    def errors(self,rows):
        """Out-of-sample (relative rate, share) errors of this fit on another draft class, for rookie ranges, with the
        predicted per-game level of each row."""
        self.residuals=[((r['rate']/self.predict(r['pick'])['rate']-1) if r['rate'] is not None else None,r['share']-self.predict(r['pick'])['share']) for r in rows]
        self.levels=[self.predict(r['pick'])['rate'] for r in rows]
        return self
    def interval(self,rate,share,games_scale=82):
        # Relative errors grow as the predicted level falls (undrafted p90 +144%, picks 1-14 +78%): the errors of the
        # NEAR rows closest in predicted level. Three-class rotations (2023-2025): interval score 677 -> 661, picks 1-14
        # 1304 -> 1125 with coverage 0.86 -> 0.79; the #1 pick's ceiling 1.9x -> 1.5x the mean.
        levels=getattr(self,'levels',None)
        near=sorted(range(len(self.residuals)),key=lambda i:abs(math.log(max(.5,levels[i]))-math.log(max(.5,rate))))[:self.NEAR] if levels else range(len(self.residuals))
        residuals=[self.residuals[i] for i in near]
        rels=[a for a,_ in residuals if a is not None] or [0];scen=[]
        for i,(rel,ds) in enumerate(residuals):
            scen.append(rate*(1+(rel if rel is not None else rels[i%len(rels)]))*max(0,min(1,share+ds))*games_scale)
        centre=rate*share*games_scale
        return min(centre,quantile(scen,.1)),max(centre,quantile(scen,.9)),statistics.mean(max(0,min(1,share+ds))<.25 for _,ds in residuals)
    def predict(self,pick):
        out={}
        for key,f in self.fit.items():out[key]=f['intercept']+f['slope']*math.log(pick) if pick else f['undrafted']
        out['share']=max(0.0,min(1.0,out['share']));out['minutes']=max(1.0,out['minutes'])
        # Stat line: per-minute box score of the 15 first seasons nearest in draft position, at the predicted minutes.
        near=sorted([r for r in self.rows if r.get('perMinuteStats') and r['games']>=10],key=lambda r:abs(math.log(r['pick'] or 75)-math.log(pick or 75)))[:15]
        if near:out['stats']={k:statistics.mean(r['perMinuteStats'][k] for r in near)*out['minutes'] for k in STAT_KEYS}
        return out
def rookie_rows(drafts,season_rows_by_year,index=None,first=None):
    """Complete draft classes: every drafted player's first season (zero games when he did not play), and undrafted
    debutants. A pick is matched to the league player by NBA id (official index: draft year and number) before the name,
    because names differ ('Ron Holland' / 'Ronald Holland II', 'Yang Hansen' / 'Hansen Yang'): unmatched, he counted as a
    0-game pick and again as an undrafted debutant. An undrafted debutant has no earlier NBA season (`first`: first
    season in the career logs) and no pick in this or an earlier class."""
    index=index or {};first=first or {};named=lambda n:normalize(html.unescape(n or ''))
    out=[]
    for year,(rows,earlier) in season_rows_by_year.items():
        byname=defaultdict(list)
        for pid,s in rows.items():byname[named(s['name'])].append(pid)
        byid={(o.get('DRAFT_YEAR'),o.get('DRAFT_NUMBER')):pid for pid in rows if (o:=index.get(str(pid)))}
        drafted={named(p['name']) for y,picks in drafts.items() if int(y)<=year for p in picks}
        seen=set()
        for p in drafts.get(str(year-1),[]):
            name=named(p['name']);pid=byid.get((year-1,p['overall']))
            ids=[pid] if pid is not None else byname.get(name,[])
            if len(ids)>1:continue
            s=rows[ids[0]] if ids else None
            if ids and ids[0] in earlier:continue
            seen.update(ids)
            out.append(dict(year=year,pick=p['overall'],name=name,games=s['games'] if s else 0,share=min(1,s['games']/82) if s else 0.0,
                            rate=s['rate'] if s else None,minutes=s['minutes'] if s else None,perMinuteStats=s['perMinuteStats'] if s else None))
        for pid,s in rows.items():
            o=index.get(str(pid),{})
            if pid in seen or pid in earlier or named(s['name']) in drafted or first.get(str(pid),year)<year:continue
            if isinstance(o.get('DRAFT_YEAR'),int) and o['DRAFT_YEAR']<year and o.get('DRAFT_NUMBER'):continue
            out.append(dict(year=year,pick=None,name=s['name'],games=s['games'],share=min(1,s['games']/82),rate=s['rate'],minutes=s['minutes'],perMinuteStats=s['perMinuteStats']))
    return out
def rookie_range_check(classes):
    """Coverage of rookie ranges over every rotation of three draft classes: fit on one, errors from another, predict
    the third (the production recipe one class earlier), by pick group. Few classes, so a diagnostic, not a guarantee."""
    rows=[]
    for a,b,c in itertools.permutations(classes,3):
        model=Rookie(classes[a]).errors(classes[b])
        for r in classes[c]:
            q=model.predict(r['pick']);lo,hi,_=model.interval(q['rate'],q['share'])
            rows.append(dict(lo=lo,hi=hi,actual=(r['rate'] or 0)*r['games'],group='picks1-14' if r['pick'] and r['pick']<=14 else 'picks15-30' if r['pick'] and r['pick']<=30 else 'picks31-60' if r['pick'] else 'undrafted'))
    return dict(classes=sorted(classes),all=coverage(rows),**{g:coverage([r for r in rows if r['group']==g]) for g in ('picks1-14','picks15-30','picks31-60','undrafted')})
def league_seasons(path,year):
    """All players of one supplied league season (complete, not survivor-selected): per-game rate and minutes."""
    try:from minute_encoding import normalize_minutes
    except ImportError:from scripts.minute_encoding import normalize_minutes
    rows,_=normalize_minutes(pq.read_table(path).to_pylist(),year);out={}  # MM.SS minutes to minutes, as league_rows()
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
    seasons. A player's scenarios combine the relative rate errors of the 150 pooled cases with the closest predicted
    share, evidence and age with every games outcome of the absence chain, weighted by its pmf (the exact mixture, so no
    Monte Carlo pairing noise). Each season's median rate error is removed first, so only the spread transfers: every
    forward season, 2025-26 included, has a negative median (relative rate -4.5% to -10.7%, 2025-26 -6.2%). Each tail is
    then scaled by leave-one-season-out conformal calibration to its 10% target, separately per group (forecast under 10
    FP a game or not, healthy start or not: Mondrian), on the range as published: a player who started the season healthy
    gets the healthy-start chain of apply(). Nested over 2020-2026 this covered 79.8% (interval score 935 against 989
    for one global pair of scales calibrated on the unconditional chain, which covered 76.9% of the published range)."""
    TIER=10  # FP a game: fringe forecasts miss above and below far more often than rotation players
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
        self.low=self.high=1.0;self.scales={}
        if scales:self.low,self.high=scales;return
        lows=defaultdict(list);highs=defaultdict(list);full=self.pool
        for season,rows in by.items():
            self.pool=[r for r in full if r['season']!=season]
            for e,p in rows:
                q=p.get('deployed',p)
                centre,lo,hi=self.raw(q,e['x'],season_length(e['t']));actual=(e['y']['rate'] or 0)*e['y']['games']
                for k in (None,self.group(q)):lows[k].append((centre-actual)/max(1,centre-lo));highs[k].append((actual-centre)/max(1,hi-centre))
        self.pool=full
        self.low=max(.5,quantile(lows[None],.9));self.high=max(.5,quantile(highs[None],.9))
        self.scales={k:(max(.5,quantile(lows[k],.9)),max(.5,quantile(highs[k],.9))) for k in lows if k is not None and len(lows[k])>=100}
    @classmethod
    def group(cls,p):return (p['rate']>=cls.TIER,bool((p.get('availability') or {}).get('healthy')))
    @staticmethod
    def evidence(x):return sum(p['games'] for p in x['past'] if p)
    def neighbours(self,p,x):
        # Young players with short records break out far more often than veterans: age and evidence pick the errors.
        e=self.evidence(x);age=(x or {}).get('age') or 27
        return sorted(self.pool,key=lambda r:abs(r['share']-p['share'])/.15+abs(math.log1p(r['evidence'])-math.log1p(e))+abs(r['age']-age)/3)[:150]
    def raw(self,p,x,games_scale=82):
        near=self.neighbours(p,x);rels=[r['rel'] for r in near if r['rel'] is not None] or [0]
        centre=p['rate']*p['share']*games_scale;pmf=p.get('gamesPmf')
        if pmf is None:
            scen=[p['rate']*(1+(r['rel'] if r['rel'] is not None else rels[i%len(rels)]))*max(0,min(1,p['share']+r['ds']))*games_scale for i,r in enumerate(near)]
            return centre,min(centre,quantile(scen,.1)),max(centre,quantile(scen,.9))
        # Every rate error with every games outcome: the chain holds the games uncertainty, the neighbours the rate's.
        pmf=np.asarray(pmf,dtype=float);g=np.arange(len(pmf))*games_scale/(len(pmf)-1);r=p['rate']*(1+np.array(rels))
        v=(r[:,None]*g[None,:]).ravel();w=np.broadcast_to(pmf[None,:]/len(r),(len(r),len(pmf))).ravel()
        o=np.argsort(v,kind='stable');c=np.cumsum(w[o]);v=v[o]
        q10,q90=(float(v[min(len(v)-1,int(np.searchsorted(c,q)))]) for q in (.1,.9))
        return centre,min(centre,q10),max(centre,q90)
    @staticmethod
    def short_risk(p,games_scale=82):
        pmf=p.get('gamesPmf')
        return None if pmf is None else float(sum(pmf[:math.ceil(.25*82*(len(pmf)-1)/games_scale)]))
    def interval(self,p,x,games_scale=82):
        centre,lo,hi=self.raw(p,x,games_scale);low,high=self.scales.get(self.group(p),(self.low,self.high))
        short=self.short_risk(p,games_scale)
        if short is None:short=statistics.mean(max(0,min(1,p['share']+r['ds']))<.25 for r in self.neighbours(p,x))
        return max(0,centre-(centre-lo)*low),centre+(hi-centre)*high,short
    def report(self):
        name=lambda k:('rate10plus' if k[0] else 'rateBelow10')+('HealthyStart' if k[1] else 'OtherStart')
        return dict(low=self.low,high=self.high,groups={name(k):dict(low=a,high=b) for k,(a,b) in sorted(self.scales.items())},
                    method='forward (out-of-sample) errors, leave-one-season-out conformal per tail and group (forecast under/over 10 FP a game x healthy start), '
                           'calibrated on the published construction (healthy-start chain for players who started healthy)')

def forward(examples,seasons,history=None):
    """(example, prediction) for every season in `seasons`, each predicted by a model fitted only on earlier seasons
    (with the games distribution of the absence chain fitted on the same earlier seasons). A player who started the
    season healthy also carries p['deployed'], his prediction built the way apply() builds it, which the range is
    calibrated on."""
    out=[]
    for season in seasons:
        model=Veteran([e for e in examples if e['t']<season])
        chain=availability(history,season)
        for e in examples:
            if e['t']!=season:continue
            p=with_games(model.predict(e['x']),chain,e['pid'],season)
            if chain and healthy_start(history,e['pid'],season):p['deployed']=deployed(model,chain,e)
            out.append((e,p))
    return out
def healthy_start(history,pid,t):
    """Held-out stand-in for 'no injury on the preseason report': the player played his club's first game."""
    o=(getattr(history,'spells',None) or {}).get((pid,t));return bool(o and o['start']==0)
def deployed(model,chain,e):
    """A healthy starter's prediction as apply() builds it: the healthy-start shift of the games and the chain started
    in the available state, anchored to them."""
    n=season_length(e['t']);q=model.predict(e['x']);hm=chain.healthy_mean(e['pid'],e['t'],q['share']*n,n)
    q['share']=hm/n;return with_games(q,chain,e['pid'],e['t'],hm,True)
def availability(history,target):
    spells=getattr(history,'spells',None)
    return av.Availability(spells,history,set(range(min(s for _,s in spells),target))) if spells else None
def with_games(p,chain,pid,t,games=None,healthy=False):
    """Prediction with the chain's games pmf, its mean set to the forecast games."""
    if chain:p['gamesPmf'],p['availability']=chain.distribution(pid,t,mean=games if games is not None else p['share']*season_length(t),healthy=healthy)
    return p
def actual_replaced(o,n,delay=av.REPLACE_DELAY):
    """Games a manager would have covered with a replacement in a season that happened: every absence of 4+ games after
    the first `delay` (a season without games counts as one absence)."""
    if not o:return max(0,n-delay)
    spells=[g for g in o['gaps'] if g>av.SHORT]+[x for x in (o['start'],o['end']) if x>av.SHORT]
    return sum(max(0,g-delay) for g in spells)
def replacement_rate(rates,rostered=80,depth=16):
    """Per-game value of the best players left after the league's 80 roster spots (ranks 81-96 by forecast)."""
    v=sorted(rates,reverse=True)[rostered:rostered+depth];return statistics.mean(v) if v else 0.0
def transfer_check(model,chain,test,history):
    """Held-out check of the slot value with replacements: on 2025/26, does adding the expected replacement points to a
    player's own forecast predict (and rank) what his roster slot actually produced, own points plus a replacement's
    over his actual long absences? The replacement level is the same on both sides, so only the absence model is tested."""
    rows=[]
    for e in test:
        n=season_length(e['t']);p=model.predict(e['x'])
        _,info=chain.distribution(e['pid'],e['t'],mean=p['share']*n,L=n)
        rows.append(dict(rate=p['rate'],centre=p['rate']*p['share']*n,expected=info['replacedGames'],
                         actual=(e['y']['rate'] or 0)*e['y']['games'],replaced=actual_replaced(history.spells.get((e['pid'],e['t'])),n)))
    R=replacement_rate([r['rate'] for r in rows])*(1-chain.short-chain.long)
    level=R*statistics.mean(r['expected'] for r in rows)
    # 'constant': the own forecast plus the average replacement credit. The slot target contains replacement points
    # the own forecast leaves out by construction, so the fair baseline for the player-specific credit is this one.
    for r in rows:r['slot']=r['actual']+R*r['replaced'];r['adjusted']=r['centre']+R*r['expected'];r['constant']=r['centre']+level
    def top(key,k=80,rs=rows):return sum(r['slot'] for r in sorted(rs,key=lambda r:-r[key])[:k])
    def gain95(k):
        rng=random.Random(19);g=[]
        for _ in range(500):
            rs=rng.choices(rows,k=len(rows));g.append(top('adjusted',k,rs)/top('centre',k,rs)-1)
        return [quantile(g,.025),quantile(g,.975)]
    def ranks(key):
        order=sorted(range(len(rows)),key=lambda i:rows[i][key]);out=[0]*len(rows)
        for k,i in enumerate(order):out[i]=k
        return out
    def spearman(a,b):
        ra,rb=ranks(a),ranks(b);ma=statistics.mean(ra);mb=statistics.mean(rb)
        return sum((x-ma)*(y-mb) for x,y in zip(ra,rb))/math.sqrt(sum((x-ma)**2 for x in ra)*sum((y-mb)**2 for y in rb))
    return dict(players=len(rows),replacementPerGame=R,delayGames=av.REPLACE_DELAY,
                expectedReplacedGames=statistics.mean(r['expected'] for r in rows),actualReplacedGames=statistics.mean(r['replaced'] for r in rows),
                slotMAE=dict(ownForecast=statistics.mean(abs(r['centre']-r['slot']) for r in rows),ownPlusConstant=statistics.mean(abs(r['constant']-r['slot']) for r in rows),
                             withReplacements=statistics.mean(abs(r['adjusted']-r['slot']) for r in rows)),
                slotSpearman=dict(ownForecast=spearman('centre','slot'),withReplacements=spearman('adjusted','slot')),
                top80SlotPoints=dict(ownForecast=top('centre'),withReplacements=top('adjusted'),relativeGain95=gain95(80)),
                top40SlotPoints=dict(ownForecast=top('centre',40),withReplacements=top('adjusted',40),relativeGain95=gain95(40)),
                replacementLevel='ranks 81-96 of all players by forecast (position-agnostic; production uses ranks 17-24 per Sports.ru position)')
def healthy_start_check(model,chain,test,history):
    """Held-out check of the healthy-start shift: players who played their club's first game of the test season."""
    rows=[]
    for e in test:
        o=history.spells.get((e['pid'],e['t']))
        if not o or o['start']>0:continue
        n=season_length(e['t']);g=model.predict(e['x'])['share']*n
        rows.append((g,chain.healthy_mean(e['pid'],e['t'],g,n),e['y']['games']))
    return dict(players=len(rows),unconditionalMAE=statistics.mean(abs(a-y) for a,_,y in rows),healthyStartMAE=statistics.mean(abs(b-y) for _,b,y in rows),
                unconditionalBias=statistics.mean(a-y for a,_,y in rows),healthyStartBias=statistics.mean(b-y for _,b,y in rows))

def teammate_correlation(forward,history):
    """Correlation of season errors between players of the same NBA club in the same season (out-of-sample errors,
    standardised within each season). Shared minutes and usage pull it below zero, shared pace and health above.
    The club is the one the player played for in that season (most games), not last season's: a third of the players move."""
    by=defaultdict(list)
    for e,p in forward:
        team=(history.by[e['pid']].get(e['t']) or {}).get('team')
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

# ---------- evaluation ----------
AGE_BANDS=((0,23),(23,26),(26,29),(29,32),(32,99))
RANK_TIERS=((0,50),(50,100),(100,160),(160,250),(250,None))
def coverage(rows,lo='lo',hi='hi'):
    """Share of seasons inside the 80% range, below and above it, the mean width and the interval (Winkler) score."""
    if not rows:return None
    ws=[r[hi]-r[lo]+10*max(0,r[lo]-r['actual'])+10*max(0,r['actual']-r[hi]) for r in rows]
    return dict(players=len(rows),coverage80=statistics.mean(bool(r[lo]<=r['actual']<=r[hi]) for r in rows),
                belowRange=statistics.mean(bool(r['actual']<r[lo]) for r in rows),aboveRange=statistics.mean(bool(r['actual']>r[hi]) for r in rows),
                meanWidth=statistics.mean(r[hi]-r[lo] for r in rows),intervalScore=statistics.mean(ws))
def evaluate(model,ranges,test,chain=None,history=None):
    """Held-out accuracy. Biases are actual minus forecast (negative: the forecast was too high). The headline range
    coverage is for the range as published: a player who started healthy (played his club's first game, the stand-in for
    a clean preseason report) gets the healthy-start construction of apply(); `unconditional` keeps the old construction."""
    rows=[]
    for e in test:
        p=with_games(model.predict(e['x']),chain,e['pid'],e['t'])
        n=season_length(e['t']);centre=p['rate']*p['share']*n;ulo,uhi,short=ranges.interval(p,e['x'],n)
        healthy=bool(chain) and healthy_start(history,e['pid'],e['t'])
        q=deployed(model,chain,e) if healthy else p
        lo,hi,_=ranges.interval(q,e['x'],n) if healthy else (ulo,uhi,short)
        actual=(e['y']['rate'] or 0)*e['y']['games']
        lp=e['x']['past'][0]
        persistence=(lp['counting']+2*lp['games']-lp['short']) if lp and lp['games'] else 0
        rows.append(dict(pid=e['pid'],actual=actual,centre=centre,persistence=persistence,lo=lo,hi=hi,ulo=ulo,uhi=uhi,short=short,
                         rate=p['rate'],actualRate=e['y']['rate'],games=p['share']*n,actualGames=e['y']['games'],lastGames=lp['games'] if lp else 0,
                         deployedCentre=q['rate']*q['share']*n,healthy=healthy,age=e['x']['age'],evidence=Ranges.evidence(e['x']),
                         gamesRange=av.quantiles(p['gamesPmf'],(.1,.9)) if p.get('gamesPmf') is not None else None,
                         deployedGamesRange=av.quantiles(q['gamesPmf'],(.1,.9)) if q.get('gamesPmf') is not None else None))
    gains=[abs(r['persistence']-r['actual'])-abs(r['centre']-r['actual']) for r in rows]
    rng=random.Random(17);boot=[statistics.mean(rng.choices(gains,k=len(gains))) for _ in range(2000)]
    played=[r for r in rows if r['actualGames']>=10]
    outcome=[r['actualGames']<.25*82 for r in rows];base=statistics.mean(outcome)
    brier=statistics.mean((r['short']-o)**2 for r,o in zip(rows,outcome));brier0=statistics.mean((base-o)**2 for o in outcome)
    def per_game_bias(rs):return sum((r['actualRate']-r['rate'])*r['actualGames'] for r in rs)/sum(r['actualGames'] for r in rs) if rs else None
    by_rate=sorted(played,key=lambda r:-r['rate'])
    groups=dict(rateBelow10=[r for r in rows if r['rate']<10],rate10to18=[r for r in rows if 10<=r['rate']<18],rate18plus=[r for r in rows if r['rate']>=18],
                evidenceBelow100=[r for r in rows if r['evidence']<100],evidence100plus=[r for r in rows if r['evidence']>=100],
                healthyStart=[r for r in rows if r['healthy']],otherStart=[r for r in rows if not r['healthy']],
                top160=sorted(rows,key=lambda r:-r['deployedCentre'])[:160])
    return dict(players=len(rows),seasonMAE=statistics.mean(abs(r['centre']-r['actual']) for r in rows),
                persistenceSeasonMAE=statistics.mean(abs(r['persistence']-r['actual']) for r in rows),
                pairedGain95=[quantile(boot,.025),quantile(boot,.975)],
                perGameMAE=statistics.mean(abs(r['rate']-r['actualRate']) for r in played),
                persistencePerGameMAE=statistics.mean(abs((r['persistence']/r['lastGames'] if r['lastGames'] else 0)-(r['actualRate']+0)) for r in played if r['lastGames']),
                gamesMAE=statistics.mean(abs(r['games']-r['actualGames']) for r in rows),
                persistenceGamesMAE=statistics.mean(abs(r['lastGames']-r['actualGames']) for r in rows),
                seasonBias=statistics.mean(r['actual']-r['centre'] for r in rows),gamesBias=statistics.mean(r['actualGames']-r['games'] for r in rows),
                perGameBias=per_game_bias(played),
                seasonBiasByAge={f'{a}-{b}':dict(players=len(v),bias=statistics.mean(r['actual']-r['centre'] for r in v))
                                 for a,b in AGE_BANDS if (v:=[r for r in rows if r['age'] is not None and a<=r['age']<b])},
                perGameBiasByRank={f'{a}-{b or len(by_rate)}':per_game_bias(by_rate[a:b]) for a,b in RANK_TIERS if by_rate[a:b]},
                deployedSeasonMAE=statistics.mean(abs(r['deployedCentre']-r['actual']) for r in rows),
                deployedSeasonBias=statistics.mean(r['actual']-r['deployedCentre'] for r in rows),
                **{k:v for k,v in coverage(rows).items() if k!='players'},
                coverage80Active=statistics.mean(r['lo']<=r['actual']<=r['hi'] for r in played),
                coverageByGroup={k:coverage(v) for k,v in groups.items() if v},
                unconditional=coverage(rows,'ulo','uhi'),
                medianFloorShare=statistics.median(r['lo']/r['deployedCentre'] for r in rows if r['deployedCentre']>0),
                medianFloorShareTop160=statistics.median(r['lo']/r['deployedCentre'] for r in groups['top160'] if r['deployedCentre']>0),
                shortSeasonBrier=brier,shortSeasonBaseRateBrier=brier0,shortSeasonRate=base,
                gamesCoverage80=statistics.mean(r['gamesRange'][0]<=r['actualGames']<=r['gamesRange'][1] for r in rows) if rows[0]['gamesRange'] else None,
                deployedGamesCoverage80=statistics.mean(r['deployedGamesRange'][0]<=r['actualGames']<=r['deployedGamesRange'][1] for r in rows) if rows[0]['deployedGamesRange'] else None)

def error_sources(model,test,history):
    """Where the season error comes from on the held-out season: the same MAE if the games played, or the points per game,
    had been known in advance, and the pure game-to-game luck left when both are known (the floor no forecast can pass)."""
    full=[];games=[];level=[];luck=[]
    for e in test:
        p=model.predict(e['x']);y=e['y'];n=season_length(e['t']);act=(y['rate'] or 0)*y['games']
        full.append(abs(p['rate']*p['share']*n-act));games.append(abs(p['rate']*y['games']-act));level.append(abs((y['rate'] or 0)*p['share']*n-act))
        s=history.by[e['pid']].get(e['t'])
        luck.append(statistics.pstdev(s['logs'])*math.sqrt(s['games'])*math.sqrt(2/math.pi) if s and s['games']>=2 else 0)
    return dict(modelMAE=statistics.mean(full),gamesKnownMAE=statistics.mean(games),perGameKnownMAE=statistics.mean(level),gameLuckFloorMAE=statistics.mean(luck))

# ---------- build ----------
# League files use NBA team codes, ESPN (career logs, rosters, BPI) its own: everything is keyed by the ESPN code.
ESPN_CODES={'GSW':'GS','NOP':'NO','NYK':'NY','SAS':'SA','SAN':'SA','UTA':'UTAH','WAS':'WSH'}
def league_rows():
    """Every player of the three complete league seasons, in the career-log row format (result from the two team scores)."""
    try:from minute_encoding import normalize_minutes
    except ImportError:from scripts.minute_encoding import normalize_minutes
    out=[]
    for year,path in SEASON_FILES.items():
        rows,_=normalize_minutes(pq.read_table(path).to_pylist(),year)
        points=defaultdict(float);teams=defaultdict(set)
        for r in rows:points[(r['game_id'],r['team'])]+=r['pts'];teams[r['game_id']].add(r['team'])
        for r in rows:
            if r['minutes']<=0:continue
            other=[t for t in teams[r['game_id']] if t!=r['team']];mine=points[(r['game_id'],r['team'])]
            result=None if not other or mine==points[(r['game_id'],other[0])] else 'W' if mine>points[(r['game_id'],other[0])] else 'L'
            out.append(dict(player_id=str(r['player_id']),season=year,game_id=r['game_id'],date=str(r['game_date'])[:10],team=ESPN_CODES.get(r['team'],r['team']),home=bool(r['home']),result=result,
                            **{k:float(r[k]) for k in ['minutes',*STAT_KEYS]}))
    return out

# All-Star, Rising Stars and celebrity-draft teams sit in the REGULAR career logs: one extra game and a fake gap each.
EXHIBITION={'EAST','WEST','LEB','GIA','STE','DUR','USA','WORLD','KEN','CAN','SHQ','CHK','STRIPES','STARS'}
def load():
    """Career logs (players of the current catalog) up to 2022-23, then the complete league seasons 2023-24 to 2025-26:
    the last three seasons hold every player, so levels fitted on them are free of the survivor selection of the logs."""
    people=json.loads(PEOPLE.read_text())['players']
    births={p['playerId']:p['birthDate'] for p in people if p.get('birthDate')}
    first=min(SEASON_FILES)
    rows=[r for r in pq.read_table(CAREER,filters=[('competition','=','nba'),('season_type','=','REGULAR')]).to_pylist() if r['season']<first and r['team'] not in EXHIBITION]+league_rows()
    seasons,team_games=season_table(rows,lambda r:r['player_id'])
    history=History(seasons,team_games,births);history.spells=av.spells(rows)
    index=json.loads(INDEX.read_text())['players'] if INDEX.exists() else []
    return history.impute_ages({p['playerId']:p['name'] for p in people},draft_years(json.loads(DRAFTS.read_text())['drafts']),
                               {str(p['PERSON_ID']):p['DRAFT_YEAR'] for p in index if isinstance(p.get('DRAFT_YEAR'),int)})
def draft_years(drafts):
    """Draft year by normalised name (names drafted in two classes are left out)."""
    years=defaultdict(set)
    for y,picks in drafts.items():
        for p in picks:years[normalize(html.unescape(p['name']))].add(int(y))
    return {n:min(v) for n,v in years.items() if len(v)==1}

FIT_FROM=2014  # earlier seasons hold few players of this universe and only long careers
POOL=6  # seasons of out-of-sample errors behind the ranges

def current_roster(data):
    data=data or (json.loads(Path('public/data/default-draft.json').read_text()) if Path('public/data/default-draft.json').exists() else {'players':[]})
    return {str(p.get('nbaId') or p['id']) for p in data['players'] if p.get('currentRosterStatus')=='SOURCE_REPORTED'}

def run(data=None):
    history=load()
    current=current_roster(data)
    if len(current)<300:raise ValueError('Current rosters are required to define the forecast population')
    fit=examples_for(history,range(FIT_FROM,TEST),current);test=examples_for(history,[TEST],current)
    # Calibration players are held out of the model fit (by player, so no player is on both sides).
    frozen=Veteran(fit)
    ranges=Ranges(forward(fit,range(TEST-POOL,TEST),history))
    chain=availability(history,TEST)
    holdout=evaluate(frozen,ranges,test,chain,history)
    holdout['errorSources']=error_sources(frozen,test,history)
    if chain:
        holdout['healthyStart']=healthy_start_check(frozen,chain,test,history)
        holdout['transferValue']=transfer_check(frozen,chain,test,history)
    drafts=json.loads(DRAFTS.read_text())['drafts']
    league={y:league_seasons(p,y) for y,p in SEASON_FILES.items()}
    index={str(p['PERSON_ID']):p for p in json.loads(INDEX.read_text())['players']}
    rookie_fit=rookie_rows(drafts,{2025:(league[2025],league[2024])},index,history.first)
    rookie_test=rookie_rows(drafts,{2026:(league[2026],{**league[2024],**league[2025]})},index,history.first)
    rookie_frozen=Rookie(rookie_fit)
    def rookie_err(model,rows,key):return statistics.mean(abs(model.predict(r['pick'])[key]-r[key]) for r in rows if r[key] is not None)
    flat={k:statistics.mean(r[k] for r in rookie_fit if r[k] is not None) for k in ('rate','minutes','share')}
    rookie_holdout={k:dict(modelMAE=rookie_err(rookie_frozen,rookie_test,k),flatPriorMAE=statistics.mean(abs(flat[k]-r[k]) for r in rookie_test if r[k] is not None)) for k in ('rate','minutes','share')}
    rookie_holdout.update(players=len(rookie_test),drafted=sum(bool(r['pick']) for r in rookie_test))
    rookie_holdout['rangeCoverage']=rookie_range_check({2023:rookie_rows(drafts,{2024:(league[2024],{})},index,history.first),2024:rookie_fit,2025:rookie_test})
    report=dict(status='TRAINED_AND_HELD_OUT',fitTargets=[FIT_FROM,TEST-1],testTarget=TEST,fitTransitions=len(fit),testPlayers=len(test),
                ageImputation=dict(players=len(history.imputed),fitTransitions=sum(e['x']['ageImputed'] for e in fit),testPlayers=sum(e['x']['ageImputed'] for e in test),
                                   withoutAge=sum(e['x']['age'] is None for e in fit+test)),
                frozenModel=frozen.report(),availability=chain.report() if chain else None,holdout=holdout,
                rangeScaling=dict(ranges.report(),errorPool=[TEST-POOL,TEST-1]),
                rookies=dict(fit=rookie_frozen.fit,holdout=rookie_holdout,fitSeasons=[2024],testSeason=2025),
                limitations=['Career logs cover players on 2026-27 rosters: older transitions are survivor-selected (players who lasted); '
                             'the share regression gives those seasons their own level. The test season matches the forecast population '
                             '(players who are on a roster the following season).',
                             f'{len(history.imputed)} players without a birth date get the mean age at the first season after their draft, or at the debut.',
                             'The published range is checked with "played the club\'s first game" standing in for a clean preseason injury report; '
                             'ranges around ESPN-anchored games cannot be checked without an archive of ESPN projections.',
                             'ESPN minutes are whole numbers, so the 10-minute participation threshold is approximate near 10 minutes.',
                             'No team result bonus: the FBL formula is Sports.ru\'s without it (the league scores on Yahoo, which cannot award it).',
                             'Rookie rows match picks to league players by NBA id, then by name; ambiguous names are skipped. Drafted players who never played '
                             'count as zero games.'])
    if data is None:return report
    production=Veteran(fit+test);pool=forward(fit+test,range(TARGET-POOL,TARGET),history);prod_ranges=Ranges(pool)
    prod_chain=availability(history,TARGET)
    club=teammate_correlation(pool,history)
    rookies=Rookie(rookie_fit+rookie_test);held=Rookie(rookie_fit).errors(rookie_test);rookies.residuals,rookies.levels=held.residuals,held.levels
    game_ratios=game_spread(history)
    draft_names={normalize(p['name']):p['overall'] for p in drafts.get(str(TARGET-1),[])}
    applied=apply(data,history,production,prod_ranges,rookies,index,draft_names,game_ratios,prod_chain)
    for player in data['players']:
        if (player.get('forecast') or {}).get('version')==4:player['forecast']['clubCorrelation']=club['correlation']
    floored=absence_history(data,prod_chain)
    report['production']=dict(model=production.report(),availability=dict(prod_chain.report(),scaleAtFloor=floored) if prod_chain else None,teammateCorrelation=club,
                              rangeScaling=prod_ranges.report(),rookies=rookies.fit,applied=applied)
    data['projectionModelAudit']=report
    return report

def apply(data,history,model,ranges,rookies,index,draft_names,game_ratios,chain=None):
    """Model forecast for every catalog player with NBA history or a draft pick, combined with ESPN where it exists."""
    counts=defaultdict(int)
    context=json.loads(TEAM_CONTEXT.read_text()) if TEAM_CONTEXT.exists() else {}
    depth=context.get('depth',{})
    for player in data['players']:
        pid=str(player.get('nbaId') or player['id'])
        f=player.get('forecast') or {}
        x=history.features(pid,TARGET)
        if x:
            p=model.predict(x);evidence='CAREER_MODEL'
        else:
            official=index.get(str(player.get('nbaId') or ''),{})
            pick=official.get('DRAFT_NUMBER') if official.get('DRAFT_YEAR')==TARGET-1 else draft_names.get(normalize(player['name']))
            if not (player.get('isRookie') or pick):continue
            p=rookies.predict(pick);p['short']=1/(1+math.exp((p['minutes']-8)/2.5));evidence='DRAFT_PICK_MODEL' if pick else 'UNDRAFTED_ROOKIE_MODEL'
            p['pick']=pick
        model_rate=p['rate'];model_games=p['share']*82
        # No injury on the current ESPN report: the season starts healthy (validated shift, see availability_model).
        healthy=bool(x and chain and player.get('currentRosterStatus')=='SOURCE_REPORTED' and not player.get('injuries'))
        unconditional_games=model_games
        if healthy:model_games=chain.healthy_mean(pid,TARGET,model_games,82)
        espn=f if f.get('origin')=='ESPN_INDIVIDUAL' else None
        # Without any archive of ESPN projections their relative accuracy cannot be fitted: an equal-weight combination
        # per game, the standard choice for two unvalidated forecasts, until the 2026/27 season measures it.
        espn_rate=espn['meanPerGame'] if espn else None
        rate=(model_rate+espn_rate)/2 if espn else model_rate
        # Games are ESPN's alone (the owner's call): the absence chain predicts too few games for players who start healthy.
        games=espn['games'] if espn else model_games
        share=games/82
        if x:with_games(p,chain,pid,TARGET,games,healthy)
        # Replacement credit only for players with an NBA record (the held-out check covers them). A rookie's missing games
        # are mostly a rotation question, and the rookie rule keeps one on every roster, so he is not simply swapped out.
        replaced=p['availability']['replacedGames'] if x and chain else None
        lo,hi,short=ranges.interval(dict(p,rate=rate,share=share),x) if x else rookies.interval(rate,share)
        health=None
        if x and p.get('gamesPmf') is not None:
            a=p['availability'];q10,q50,q90=av.quantiles(p['gamesPmf'])
            # hazards: per-game spell starts at this season's scale, for the in-season chain from the current state.
            health=dict(gamesRange=[q10,q90],gamesMedian=q50,shortSpellsPer82=a['shortHazard']*82,longSpellsPer82=a['longHazard']*82,
                        leagueShortSpellsPer82=a['leagueShort']*82,leagueLongSpellsPer82=a['leagueLong']*82,lastSeasonEnd=a['start'],
                        healthyNow=healthy,unconditionalGames=unconditional_games,hazards=[a['shortHazard'],a['longHazard']])
        game_floor=f.get('gameFloor');game_ceiling=f.get('gameCeiling')
        if x:
            logs=[v for year in (TARGET-1,TARGET-2) for v in history.by[pid].get(year,{}).get('logs',[])]
            if len(logs)>=10:
                shift=rate-statistics.mean(logs);game_floor=quantile(logs,.1)+shift;game_ceiling=quantile(logs,.9)+shift
        if game_floor is None or not x:
            lo_r,hi_r=game_ratios(rate);game_floor,game_ceiling=rate*lo_r,rate*hi_r
        origin=('ESPN_MODEL_COMBINED' if espn else evidence)
        line,components=stat_line(p,espn,player,rate)
        tier='PERSONAL_PROVIDER' if espn else 'PERSONAL_HISTORY' if x else 'DRAFT_PRIOR'
        player['forecast']=dict(version=4,metric='FBL_FULL_FORMULA_ESTIMATE',origin=origin,coverageTier=tier,
            basis=('ФО за матч — среднее ESPN и модели по карьере, число матчей — ESPN' if espn else 'Модель по карьере' if x else 'Модель новичков по номеру драфта'
                   if p.get('pick') else 'Модель незадрафтованных новичков')+'; веса модели подобраны на сезонах до 2024/25 и проверены на 2025/26',
            meanPerGame=rate,games=games,minutes=(p['minutes']+espn['minutes'])/2 if espn else p['minutes'],meanSeason=rate*games,
            gameFloor=min(rate,game_floor),gameCeiling=max(rate,game_ceiling),seasonFloor=min(rate*games,lo),seasonCeiling=max(rate*games,hi),
            shortSeasonRisk=short,availability=health,
            intervalCalibration='FORWARD_CONFORMAL_PER_TAIL' if x else 'ROOKIE_CLASS_2025_ERRORS',
            inputStats=line,components=components,
            sources=dict(model=dict(perGame=model_rate,games=model_games,perMinute=p.get('perMinute'),minutes=p['minutes'],participation=2-p['short']),
                         espn=dict(perGame=espn_rate,games=espn['games']) if espn else None),
            draftPick=p.get('pick'),rookieExtrapolation=not x,asOf=data['generatedAt'],
            previous=dict(origin=f.get('origin'),meanPerGame=f.get('meanPerGame'),games=f.get('games')) if f else None)
        if replaced is not None:player['forecast']['_replaced']=replaced
        player['depth']=depth.get(str(player.get('espnId')))
        counts[origin]+=1
    slot_values(data,chain)
    data['forecastNotes']=dict(rulesSource=RULES,
        rangeMeaning='Сезонный диапазон 10–90%: ошибки ФО за матч у похожих игроков и число матчей из цепи пропусков, каждая сторона '
                     'откалибрована отдельно (проверка на 2025/26). Риск короткого сезона — вероятность цепи сыграть меньше четверти матчей. '
                     'У новичков диапазон из ошибок модели драфта на классе 2025.')
    if chain:
        # Spell lengths for the in-season chain (src/season.js imports them at build time, like the in-season calibration).
        AVAILABILITY_LENGTHS.write_text(json.dumps(dict(source='Kaplan-Meier absence spell lengths in club games, NBA regular seasons 2002-2026',
            shortLengths=[round(float(v),5) for v in chain.fs],longLengths=[round(float(v),5) for v in chain.fl])),encoding='utf-8')
    # One metric everywhere: the per-game value every module ranks by is the full-formula forecast.
    for player in data['players']:
        f=player.get('forecast')
        if f and f.get('metric')=='FBL_FULL_FORMULA_ESTIMATE' and math.isfinite(f.get('meanPerGame',float('nan'))):
            player['projectedFP']=f['meanPerGame'];player['projectionMetric']='FBL_FULL_FORMULA_PER_GAME';player['projectionStatus']='FBL_FORECAST'
    return dict(counts)

OWN_MIN_GAMES=40  # decayed available games below which a player's own spell rate per 82 is noise (shown as null)
def absence_history(data,chain):
    """The player's logged absence history for the card, beside the chain's hazards: his own spell starts per 82
    available games over the last five seasons (each older season weighted 0.6 less), and forecastScale, the factor the
    chain's hazards were multiplied by to meet the forecast games. shortSpellsPer82/hazards stay the scaled rates the
    in-season chain uses; they restate the games forecast, not the logs. Returns how many chains sit at the scale floor."""
    floored=0
    for player in data['players'] if chain else []:
        f=player.get('forecast') or {};a=f.get('availability')
        if f.get('version')!=4 or not a or not a.get('hazards'):continue
        hs,_,info=chain.hazards(str(player.get('nbaId') or player['id']),TARGET);e=info['availableGames']
        own=lambda n:82*n/e if e>=OWN_MIN_GAMES else None
        a.update(ownShortPer82=own(info['ownShort']),ownLongPer82=own(info['ownLong']),availableGames=e,forecastScale=a['hazards'][0]/hs if hs else None)
        floored+=bool(a['forecastScale'] and a['forecastScale']<=chain.MIN_SCALE*1.0001)
    return floored
def slot_values(data,chain):
    """Season value of a roster slot: the player's own points plus a replacement's in the games of his long absences
    (after the reaction delay). The replacement is the best player left at the same Sports.ru position after the league's
    16 starters there (ranks 17-24 by forecast per game), times 1 - short - long hazard (0.87), the chance that an
    available player plays the next game. Both parts are untested assumptions that roughly cancel: a healthy pickup
    plays about 0.7-0.76 of a 13-game replaced window, and the free-agent market after the real draft holds players
    2.6-8.4 FP a game above this level."""
    if not chain:return
    pool=[p for p in data['players'] if (p.get('forecast') or {}).get('version')==4 and p.get('currentRosterStatus')=='SOURCE_REPORTED']
    level={}
    for pos in ('PG','SG','SF','PF','C'):
        v=sorted((p['forecast']['meanPerGame'] for p in pool if pos in (p.get('positions') or [])),reverse=True)[16:24]
        level[pos]=statistics.mean(v)*(1-chain.short-chain.long) if v else None
    for p in data['players']:
        f=p.get('forecast') or {};replaced=f.pop('_replaced',None)
        levels=[level[x] for x in (p.get('positions') or []) if level.get(x) is not None]
        if replaced is None or not levels:continue
        r=statistics.mean(levels)
        f['transfer']=dict(replacedGames=replaced,replacementPerGame=r,value=replaced*r,delayGames=av.REPLACE_DELAY)
        f['slotSeason']=f['meanSeason']+replaced*r
    data['replacementLevel']=dict(perGame=level,delayGames=av.REPLACE_DELAY,
        method='Best players left after 16 starters per Sports.ru position (ranks 17-24 by forecast), times the chance that an available player '
               'plays the next game (1 - short - long hazard). Untested assumption: a pickup plays about 0.7-0.76 of a replaced window, '
               'and the real free-agent market is above ranks 17-24; the two roughly cancel.')
def terms(st):return st['pts']+st['reb']+st['ast']+st['stl']+st['blk']-(st['fga']-st['fgm'])-(st['fta']-st['ftm'])-2*st['tov']
def stat_line(p,espn,player,rate):
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
        components=dict(countingAndMisses=terms(line),personalFouls=-line['pf'],participation=participation)
    else:
        components=dict(countingAndMisses=rate-participation,personalFouls=0,participation=participation)
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
    print(json.dumps({k:v for k,v in report.items() if k in ('holdout','rookies','rangeScaling','production')},indent=2,default=str)[:6000])
