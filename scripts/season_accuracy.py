"""Historical season forecasting with frozen holdout and split-conformal ranges.
No ESPN forecast archive is available: these metrics validate the historical fallback only.
"""
import math, statistics, random
def q(v,p):
 v=sorted(v);x=(len(v)-1)*p;i=int(x)
 return v[i]+(v[min(i+1,len(v)-1)]-v[i])*(x-i)
def cohort(before,after):
 return [dict(id=i,full=p['full'],games=p['games'],minutes=p['minutes'],
              delta=(after[i]['full']-p['full']) if i in after else 0,
              gamesDelta=(after[i]['games']-p['games']) if i in after else -p['games'],
              absent=i not in after,actual=after[i]['full']*after[i]['games'] if i in after else 0)
         for i,p in before.items() if p['games']>=20 and p['minutes']>=10]
def scenarios(p,rows):
 return [0 if r['absent'] else (p['full']+r['delta'])*max(0,min(82,p['games']+r['gamesDelta'])) for r in rows]
class SeasonModel:
 def __init__(self,rows):
  # Group by player id: no player's transitions may enter both fitting and calibration.
  self.fit=[r for r in rows if int(r['id'])%4!=0]
  calibration=[r for r in rows if int(r['id'])%4==0]
  if len(self.fit)<30 or len(calibration)<15:raise ValueError('Insufficient independent calibration players')
  self.scales=[statistics.pstdev(r[k] for r in self.fit) or 1 for k in ['full','games','minutes']]
  self.candidates={}
  for k in [0,24,48,96,192]:
   errors=[]
   for r in self.fit:
    pool=[s for s in self.fit if s['id']!=r['id']]
    estimate=self.predict(r,k,pool)[0]
    errors.append(abs(estimate-r['actual']))
   self.candidates[str(k)]=statistics.mean(errors)
  self.k=min(self.candidates,key=self.candidates.get);self.k=int(self.k)
  grouped_scores={}
  for r in calibration:
   _,lo,hi=self.predict(r)
   score=max(lo-r['actual'],r['actual']-hi)
   grouped_scores[r['id']]=max(score,grouped_scores.get(r['id'],float('-inf')))
  scores=list(grouped_scores.values())
  # Finite-sample split conformal: 80% marginal target, conditional accuracy not promised.
  self.padding=max(0,sorted(scores)[min(len(scores)-1,math.ceil((len(scores)+1)*.8)-1)])
  self.calibrationPlayers=len(grouped_scores)
 def neighbors(self,p,k,pool):
  if k==0:return pool
  return sorted(pool,key=lambda r:sum(((p[key]-r[key])/s)**2 for key,s in zip(['full','games','minutes'],self.scales)))[:k]
 def point_parts(self,p,k=None,pool=None):
  k=self.k if k is None else k;pool=self.fit if pool is None else pool
  if k==0:return p['full'],p['games']
  neighbors=self.neighbors(p,k,pool)
  played=[r for r in neighbors if not r['absent']]
  rate=p['full']+q([r['delta'] for r in played],.5) if played else p['full']
  games=q([0 if r['absent'] else max(0,min(82,p['games']+r['gamesDelta'])) for r in neighbors],.5)
  return rate,games
 def predict(self,p,k=None,pool=None):
  k=self.k if k is None else k;pool=self.fit if pool is None else pool
  if k==0:
   # Plain persistence is an explicit candidate, not silently forced to be adjusted.
   vals=scenarios(p,pool);return p['full']*p['games'],q(vals,.1),q(vals,.9)
  vals=scenarios(p,self.neighbors(p,k,pool))
  rate,games=self.point_parts(p,k,pool)
  global_values=scenarios(p,pool)
  # Guard against spuriously narrow neighborhoods: retain unconditional risk envelope.
  return rate*games,min(q(vals,.1),q(global_values,.1)),max(q(vals,.9),q(global_values,.9))
 def interval(self,p):
  centre,lo,hi=self.predict(p)
  return centre,min(centre,lo-self.padding),max(centre,hi+self.padding)
 def report(self):
  return dict(neighbors=self.k,fitPlayers=len({r['id'] for r in self.fit}),
              calibrationPlayers=self.calibrationPlayers,conformalPadding=self.padding,
              fitLeavePlayerOutMAE=self.candidates,selection='Fit-only leave-player-out MAE; calibration excluded from selection')
def evaluate(model,rows,legacy):
 errors=[];base=[];coverage=[];widths=[];oldcoverage=[];rate_errors=[];games_errors=[]
 details=[]
 for r in rows:
  estimate,lo,hi=model.interval(r);actual=r['actual']
  rate,games=model.point_parts(r)
  observed_games=0 if r['absent'] else r['games']+r['gamesDelta']
  games_errors.append(abs(games-observed_games))
  if not r['absent']:rate_errors.append(abs(rate-(r['full']+r['delta'])))
  vals=scenarios(r,legacy)
  errors.append(abs(estimate-actual));base.append(abs(r['full']*r['games']-actual))
  coverage.append(lo<=actual<=hi);widths.append(hi-lo)
  oldcoverage.append(q(vals,.1)<=actual<=q(vals,.9))
  details.append(dict(id=r['id'],absent=r['absent'],actual=actual,predicted=estimate,baseline=r['full']*r['games'],lower=lo,upper=hi))
 rng=random.Random(17)
 gains=[a-b for a,b in zip(base,errors)]
 boot=[statistics.mean(rng.choices(gains,k=len(gains))) for _ in range(2000)]
 return dict(pairedMAEGain95Bootstrap=[q(boot,.025),q(boot,.975)],
             perGameMAEAmongActive=statistics.mean(rate_errors),gamesMAE=statistics.mean(games_errors),
             players=len(rows),absentPlayers=sum(r['absent'] for r in rows),
             historicalPersistenceSeasonMAE=statistics.mean(base),selectedModelSeasonMAE=statistics.mean(errors),
             empirical80RangeCoverage=statistics.mean(coverage),uncalibratedRangeCoverage=statistics.mean(oldcoverage),
             meanRangeWidth=statistics.mean(widths),
             absentSeasonMAE=statistics.mean(abs(d['predicted']) for d in details if d['absent']) if any(d['absent'] for d in details) else None,
             details=details)
