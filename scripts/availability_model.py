"""Games played as a semi-Markov chain over the team schedule, fitted on every absence in the 2002-2026 game logs.

Each team game a player is either available or inside an absence spell (injury, illness, rest, coach's decision: the
logs cannot tell them apart and for fantasy all cost the same). From an available game a new spell starts with a
short-spell hazard (1-3 games) or a long-spell hazard (4+ games); its length is drawn from the league's Kaplan-Meier
length distribution, where spells still running at season end are censored. Personal hazards are Gamma-Poisson
posteriors: the player's own spells over his recent available games (older seasons discounted), shrunk to his age
group. The season starts in the state seen in the league after a similar previous season (healthy, ending it out for
10+ games, or a season without games). A Gamma frailty multiplies both hazards, because some seasons are worse than
others for the same player, and the chain is solved exactly (dynamic programming over remaining spell and games).

The model's mean is not used on its own: forward-tested 2020-2026 its games MAE lost to the least-squares share
regression (18.4 vs 15.4). The hazards are scaled so the mean equals the regression's (or the combined forecast's)
and the chain supplies the shape: the 10-90% games range, the probability of a short season and the explanation.
"""
import math,statistics
from collections import Counter,defaultdict
from datetime import date,timedelta

SHORT=3  # a spell of up to three games is a short absence
LATE=10  # ending the previous season out for this many games marks a carried injury
# Chosen forward on 2021-2026 by the log score of the actual games (within two) under the anchored pmf: Gamma shape of the
# season multiplier 2.5 (1: -2.702, 1.5: -2.667, 2.5: -2.653, 4: -2.660; games coverage at 80%: 0.82), decay of older
# seasons 0.6 and prior weights of 2400 (short) and 640 (long) available games. Long spells follow the player's own record
# far more than short ones; the shape barely moves with the priors (-2.653 to -2.661 over the grid).
FRAILTY=2.5
QUADRATURE=7
# A player known to be healthy at the start (no injury on the preseason report): the forecast moves from the
# unconditional mean towards the chain's mean started in the healthy state, by a weight per last-season ending fitted
# on 2021-2025 with "played the club's first game" as the healthy start. Ending the last season out still predicts
# fewer games when healthy now (208 cases: 56.4 played, 52.8 unconditional, 62.1 healthy-start chain).
# Held out 2025/26 (296 healthy starters): games MAE 13.36 vs 14.14, bias -0.7 vs -4.2.
HEALTHY_SHIFT={'healthy':1.0,'endedOut':.3,'noGames':.2}

try:import numpy as np
except ImportError:np=None

def season_games(year):return {2012:66,2020:72,2021:72}.get(year,82)

def spells(rows):
    """(player, season) -> games, the spell before the first game, spells between games and the spell after the last,
    all counted in team games. Team calendars come from the logs; where a club calendar is incomplete (career logs of
    older seasons hold few players of some clubs) the count is estimated from days at the season's game spacing."""
    cal=defaultdict(set);per=defaultdict(set)
    for r in rows:
        d=str(r['date'])[:10];cal[(r['season'],r['team'])].add(d);per[(r['player_id'],r['season'])].add((d,r['team']))
    bounds={}
    for (s,_),ds in cal.items():
        lo,hi=min(ds),max(ds);b=bounds.setdefault(s,[lo,hi]);b[0]=min(b[0],lo);b[1]=max(b[1],hi)
    cal={k:sorted(v) for k,v in cal.items()}
    def between(s,team,a,b):
        days=cal[(s,team)]
        if len(days)>=.95*season_games(s):return sum(1 for d in days if (a is None or d>a) and (b is None or d<b))
        first,last=date.fromisoformat(bounds[s][0]),date.fromisoformat(bounds[s][1])
        lo=date.fromisoformat(a) if a else first-timedelta(days=1)
        hi=date.fromisoformat(b) if b else last+timedelta(days=1)
        return max(0,round((hi-lo).days/((last-first).days/(season_games(s)-1)))-1)
    out={}
    for (pid,s),games in per.items():
        g=sorted(games);gaps=[between(s,t,a[0],d) for a,(d,t) in zip(g,g[1:])]
        out[(pid,s)]=dict(games=len(g),start=between(s,g[0][1],None,g[0][0]),gaps=gaps,end=between(s,g[-1][1],g[-1][0],None))
    return out

def counts(o):
    """Short and long spell starts and the available games they started from."""
    short=sum(1 for g in o['gaps'] if 0<g<=SHORT)+(0<o['end']<=SHORT);long_=sum(1 for g in o['gaps'] if g>SHORT)+(o['end']>SHORT)
    return short,long_,o['games']

def length_pmf(table,seasons,kind):
    """Kaplan-Meier spell length pmf on 1..82: spells between games are observed, spells at season end censored."""
    obs=Counter();cen=Counter()
    for (_,s),o in table.items():
        if s not in seasons:continue
        for g in o['gaps']:
            if g>0 and (g>SHORT)==(kind=='long'):obs[min(g,82)]+=1
        if o['end']>0 and (o['end']>SHORT)==(kind=='long'):cen[min(o['end'],82)]+=1
    lo,hi=(1,SHORT) if kind=='short' else (SHORT+1,82)
    pmf=[0.0]*83;surv=1.0;risk=sum(obs.values())+sum(cen.values())
    for k in range(lo,hi+1):
        q=1.0 if k==hi else (obs[k]/risk if risk else 0.0)
        pmf[k]=surv*q;surv*=1-q;risk-=obs[k]+cen[k]
    total=sum(pmf);return [p/total for p in pmf]

class Availability:
    def __init__(self,table,history,seasons,decay=.6,short_prior=30,long_prior=8):
        """Fit on target seasons `seasons` only (forward use: every season before the predicted one)."""
        self.table,self.history,self.decay,self.ks,self.kl=table,history,decay,short_prior,long_prior
        rows=[(pid,s,counts(o)) for (pid,s),o in table.items() if s in seasons]
        exposure=sum(c[2] for *_,c in rows)
        self.short=sum(c[0] for *_,c in rows)/exposure;self.long=sum(c[1] for *_,c in rows)/exposure
        by=defaultdict(lambda:[0,0,0])
        for pid,s,c in rows:
            b=age_bucket(history.age(pid,s))
            if b is not None:
                for i in range(3):by[b][i]+=c[i]
        # Age groups: shrunk to the league rate by 200 (short) and 2000 (long) available games.
        self.age_short={b:(v[0]+200*self.short)/(v[2]+200) for b,v in by.items()}
        self.age_long={b:(v[1]+2000*self.long)/(v[2]+2000) for b,v in by.items()}
        self.fs=np.array(length_pmf(table,seasons,'short'));self.fl=np.array(length_pmf(table,seasons,'long'))
        groups=defaultdict(list)
        for (pid,s),o in table.items():
            # Not a debut: the player has a previous season (with or without games).
            if s in seasons and history.first.get(pid,9999)<s:groups[self.state(pid,s)].append(o['start'])
        # A season without a game inside a career starts out for good.
        for pid,years in history.by.items():
            for s in range(min(years)+1,max(years)):
                if s in seasons and (pid,s) not in table:groups[self.state(pid,s)].append(82)
        self.start={g:{k:c/len(v) for k,c in Counter(min(x,82) for x in v).items()} for g,v in groups.items()}
        x=np.sort(np.random.default_rng(5).gamma(FRAILTY,1/FRAILTY,QUADRATURE*10000));self.frailty=x.reshape(QUADRATURE,-1).mean(1)
    def state(self,pid,s):
        prev=self.table.get((pid,s-1))
        return 'noGames' if prev is None else 'endedOut' if prev['end']>=LATE else 'healthy'
    def hazards(self,pid,t):
        b=age_bucket(self.history.age(pid,t))
        ps=self.age_short.get(b,self.short);pl=self.age_long.get(b,self.long)
        ns=nl=e=0.0
        for lag in range(1,6):
            o=self.table.get((pid,t-lag));w=self.decay**(lag-1)
            if o is None:continue
            s,l,g=counts(o);ns+=w*s;nl+=w*l;e+=w*g
        return (ns+self.ks*80*ps)/(e+self.ks*80),(nl+self.kl*80*pl)/(e+self.kl*80),dict(leagueShort=ps,leagueLong=pl,availableGames=e)
    def _init(self,pid,t,L):
        p=np.zeros(L+1)
        for r,q in (self.start.get(self.state(pid,t)) or self.start['healthy']).items():p[min(r,L)]+=q
        return p
    def _mean(self,hs,hl,p0,L):
        """Expected games for every frailty point at once (state = remaining spell)."""
        f=self.frailty[:,None];a_s=np.minimum(.45,hs*f);a_l=np.minimum(.45,hl*f)
        w=a_s*self.fs[None,1:L+1]+a_l*self.fl[None,1:L+1];stay=(1-a_s-a_l)[:,0]
        p=np.repeat(p0[None],len(self.frailty),0);g=np.zeros(len(self.frailty))
        for _ in range(L):
            a=p[:,0].copy();g+=a*stay;q=np.zeros_like(p);q[:,:-1]=p[:,1:];q[:,0]+=a*stay;q[:,:L]+=w*a[:,None];p=q
        return g.mean()
    def healthy_mean(self,pid,t,mean,L=None):
        """Expected games of a player healthy at the start, from the unconditional `mean` (see HEALTHY_SHIFT)."""
        L=L or season_games(t);_,info=self.distribution(pid,t,mean=mean,L=L,pmf=False);hs,hl,_=self.hazards(pid,t)
        p0=np.zeros(L+1);p0[0]=1;healthy=self._mean(hs*info['scale'],hl*info['scale'],p0,L)
        return mean+HEALTHY_SHIFT[info['start']]*(healthy-mean)
    def distribution(self,pid,t,mean=None,L=None,healthy=False,pmf=True):
        """pmf of games played over a season of L team games; with `mean`, hazards are scaled to that expectation.
        `healthy`: the season starts in the available state (known healthy now)."""
        L=L or season_games(t);hs,hl,info=self.hazards(pid,t);c=1.0
        if healthy:p0=np.zeros(L+1);p0[0]=1
        else:p0=self._init(pid,t,L)
        if mean is not None:
            mean=min(max(mean,0.0),L)
            lo,hi=-6.0,6.0
            if self._mean(hs*math.exp(hi),hl*math.exp(hi),p0,L)>mean:c=math.exp(hi)
            elif self._mean(hs*math.exp(lo),hl*math.exp(lo),p0,L)<mean:c=math.exp(lo)
            else:
                for _ in range(18):
                    m=(lo+hi)/2
                    if self._mean(hs*math.exp(m),hl*math.exp(m),p0,L)>mean:lo=m
                    else:hi=m
                c=math.exp((lo+hi)/2)
        info=dict(info,shortHazard=c*hs,longHazard=c*hl,start=self.state(pid,t),scale=c)
        if not pmf:return None,info
        f=self.frailty[:,None,None];a_s=np.minimum(.45,c*hs*f);a_l=np.minimum(.45,c*hl*f)
        w=(a_s*self.fs[None,1:L+1,None]+a_l*self.fl[None,1:L+1,None])
        P=np.zeros((len(self.frailty),L+1,L+2));P[:,:,0]=p0[None]
        stay=(1-a_s-a_l)[:,:,0]
        for _ in range(L):
            Q=np.zeros_like(P);Q[:,:-1]=P[:,1:];a=P[:,0].copy()
            Q[:,0,1:]+=a[:,:-1]*stay;Q[:,:L]+=w*a[:,None,:]
            P=Q
        out=P.sum(1).mean(0)[:L+1]
        return out/out.sum(),info
    def report(self):
        return dict(model='semi-Markov absence chain with Gamma frailty, anchored to the regression mean',shortSpellGames=[1,SHORT],
                    leagueShortSpellsPer82=self.short*82,leagueLongSpellsPer82=self.long*82,frailtyShape=FRAILTY,
                    longSpellMedianGames=next(k for k in range(83) if sum(self.fl[:k+1])>=.5),
                    seasonStartOut={g:1-v.get(0,0) for g,v in self.start.items()},decay=self.decay,priorGames=dict(short=self.ks*80,long=self.kl*80))

def quantiles(pmf,ps=(.1,.5,.9)):
    c=np.cumsum(pmf);return [int(np.searchsorted(c,p)) for p in ps]

def age_bucket(age):return None if age is None else max(20,min(37,int(round(age))))
