"""Fit season-by-season career models; future rows never enter a feature vector."""
import json,math,statistics
from pathlib import Path
import numpy as np
from build_forecasts import partial
KEYS=['pts','reb','ast','stl','blk','tov','pf','fgm','fga','ftm','fta','minutes']
def core(s):return partial(s)-s['pf']+(2 if s['minutes']>=10 else 1)
def features(rows,year,age,profile='BASE'):
 previous=sorted([r for r in rows if r['year']<year and r['games']>0],key=lambda r:r['year'])
 if not previous:return None
 last=previous[-1];prior=previous[-2] if len(previous)>1 else last
 games=sum(r['games'] for r in previous)
 career={k:sum(r['perGame'][k]*r['games'] for r in previous)/games for k in KEYS}
 base=[last['perGame'][k] for k in KEYS]+[prior['perGame'][k] for k in KEYS]+[career[k] for k in KEYS]+[last['games'],prior['games'],age-(2027-year) if age else 0,year-last['year'],len(previous)]
 if profile=='BASE':return base
 if profile!='DEVELOPMENT':raise ValueError('Unknown feature profile')
 first=previous[0];elapsed=max(1,last['year']-first['year'])
 reliability=first['games']/(first['games']+20)
 debut=[first['perGame'][k] for k in KEYS]
 growth=[(last['perGame'][k]-first['perGame'][k])/elapsed for k in KEYS]
 recent=[last['perGame'][k]-prior['perGame'][k] for k in KEYS]
 early=float(len(previous)<=3)
 per36=[first['perGame'][k]*36/max(6,first['perGame']['minutes'])*reliability for k in KEYS if k!='minutes']
 stage=[float(len(previous)==1),float(len(previous)==2),float(3<=len(previous)<=4)]
 return base+debut+growth+recent+[v*early for v in recent]+per36+stage+[first['games'],reliability,float(not age)]
def target(row):
 if row is None:return None
 return [row['perGame'][k] for k in KEYS]+[row['games']]
def tidy(values):
 s={k:max(0,float(v)) for k,v in zip(KEYS,values)}
 s['minutes']=min(48,s['minutes']);s['pf']=min(6,s['pf'])
 s['fgm']=min(s['fgm'],s['fga']);s['ftm']=min(s['ftm'],s['fta'])
 # Predicted points cannot fall below the value of the made two-pointers and FTs.
 s['pts']=max(2*s['fgm']+s['ftm'],s['pts'])
 return s,max(0,min(82,float(values[-1])))
class Ridge:
 def __init__(self,rows,alpha):
  x=np.array([r['x'] for r in rows]);y=np.array([r['y'] for r in rows])
  self.mean=x.mean(axis=0);self.scale=x.std(axis=0);self.scale[self.scale<1e-8]=1
  x=np.column_stack([np.ones(len(x)),(x-self.mean)/self.scale])
  regular=np.eye(x.shape[1])*alpha;regular[0,0]=0
  self.beta=np.linalg.solve(x.T@x+regular,x.T@y)
 def predict(self,x):return np.r_[1,(np.array(x)-self.mean)/self.scale]@self.beta
def transitions(players,profile='BASE'):
 rows=[]
 for p in players:
  history=p.get('onlineEvidence',{}).get('career') or {}
  seasons=[s for s in history.get('seasons',[]) if s['year']<=2026]
  if not seasons:continue
  byyear={s['year']:s for s in seasons}
  for year in range(max(2005,seasons[0]['year']+1),2027):
   x=features(seasons,year,p.get('age'),profile)
   if x is None:continue
   actual=byyear.get(year);past=[r for r in seasons if r['year']<year]
   if year-past[-1]['year']>1:continue
   # Availability includes absent next seasons; conditional stat model does not
   # teach a missed season as a zero-talent per-game season.
   last=past[-1]
   y=target(actual or dict(last,games=0))
   rows.append(dict(id=p['id'],year=year,x=x,y=y,experience=len(past),active=actual is not None,
                    actual=core(actual['perGame'])*actual['games'] if actual else 0,
                    baseline=core(last['perGame'])*last['games']))
 return rows
def fit(rows,alpha):
 active=[r for r in rows if r['active']]
 rate=Ridge(active,alpha)
 games=Ridge([dict(r,y=[r['y'][-1]]) for r in rows],alpha)
 return rate,games
def predict(models,x):
 values=models[0].predict(x);values[-1]=models[1].predict(x)[0]
 return tidy(values)
def evaluate(models,rows):
 errors=[];base=[];details=[]
 for r in rows:
  s,g=predict(models,r['x']);score=core(s)*g
  errors.append(abs(score-r['actual']));base.append(abs(r['baseline']-r['actual']))
  details.append(dict(id=r['id'],year=r['year'],prediction=score,actual=r['actual'],error=abs(score-r['actual'])))
 return dict(players=len(rows),seasonMAE=statistics.mean(errors),lastSeasonMAE=statistics.mean(base),
             error80=float(np.quantile(errors,.8)),details=details)
def stage_report(models,rows):
 groups={'SECOND_SEASON':lambda n:n==1,'THIRD_SEASON':lambda n:n==2,
         'FOURTH_FIFTH_SEASON':lambda n:3<=n<=4,'LATER_CAREER':lambda n:n>=5}
 result={}
 for name,accept in groups.items():
  cohort=[r for r in rows if accept(r['experience'])]
  if not cohort:continue
  report=evaluate(models,cohort)
  result[name]={k:v for k,v in report.items() if k!='details'}
 return result
def run(data):
 profiles={name:transitions(data['players'],name) for name in ['BASE','DEVELOPMENT']}
 rows=profiles['BASE']
 train=[r for r in rows if r['year']<=2024];validation=[r for r in rows if r['year']==2025];test=[r for r in rows if r['year']==2026]
 if min(len(train),len(validation),len(test))<50:raise ValueError('Insufficient online career transitions')
 candidates=[]
 for profile,profile_rows in profiles.items():
  training=[r for r in profile_rows if r['year']<=2024]
  validating=[r for r in profile_rows if r['year']==2025]
  for alpha in [1,10,100,1000]:
   result=evaluate(fit(training,alpha),validating)
   candidates.append(dict(profile=profile,alpha=alpha,seasonMAE=result['seasonMAE']))
 selected=min(candidates,key=lambda r:r['seasonMAE'])
 alpha=selected['alpha'];profile=selected['profile'];rows=profiles[profile]
 train=[r for r in rows if r['year']<=2024];validation=[r for r in rows if r['year']==2025];test=[r for r in rows if r['year']==2026]
 frozen=fit([r for r in rows if r['year']<=2025],alpha)
 test_report=evaluate(frozen,test);validation_report=evaluate(fit(train,alpha),validation)
 promote=validation_report['seasonMAE']<validation_report['lastSeasonMAE']
 production=fit(rows,alpha)
 error=validation_report['error80']
 forecast_count=0
 for p in data['players']:
  career=(p.get('onlineEvidence',{}).get('career') or {}).get('seasons',[])
  x=features(career,2027,p.get('age'),profile)
  if x is None:continue
  s,g=predict(production,x)
  p['careerPrediction']=dict(perGame=s,games=g,partialSeason=core(s)*g,model='PAST_ONLY_RIDGE',alpha=alpha,featureProfile=profile,
                            historySeasons=len(career),firstSeason=career[0]['season'],lastSeason=career[-1]['season'],
                            eligibleForPrimary=promote,seasonError80=error)
  forecast_count+=1
 report=dict(trainingTransitions=len(train),validationSeason='2024-25',validationPlayers=len(validation),testSeason='2025-26',
             testPlayers=len(test),selectedAlpha=alpha,selectedProfile=profile,candidates=candidates,
             developmentCohorts=dict(validation=stage_report(fit(train,alpha),validation),test=stage_report(frozen,test)),
             validation={k:v for k,v in validation_report.items() if k!='details'},test={k:v for k,v in test_report.items() if k!='details'},
             promotedByValidation=promote,predictions=forecast_count,
             limitations=['Career cohort is current provider universe plus uniquely matched history; selection/survivorship limits remain.',
              'Target excludes team result bonus; that term is estimated separately in full FBL scoring.',
              'Hyperparameters chosen on 2024/25 only; 2025/26 is subsequent temporal evaluation.',
              'No claim that more historical seasons always improve a changing role.'])
 return report
if __name__=='__main__':
 path=Path('public/data/default-draft.json');data=json.loads(path.read_text());report=run(data);data['careerModelAudit']=report
 path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
 Path('public/data/career-model-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False))
