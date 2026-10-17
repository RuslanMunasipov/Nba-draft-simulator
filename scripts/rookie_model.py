"""College-to-NBA transfer with season-ordered evaluation. No SL=NBA shortcut."""
import json,statistics
from pathlib import Path
from career_model import Ridge,KEYS,tidy,core
def college_row(player,year):
 rows=(player.get('onlineEvidence',{}).get('college') or {}).get('seasons',[])
 eligible=[r for r in rows if r['year']<year]
 return eligible[-1] if eligible else None
def draft_pick(player):
 d=player.get('draftContext') or {}
 value=d.get('overall')
 if isinstance(value,(int,float)) and 0<value<=100:return float(value)
 value=d.get('selection');round_number=d.get('round')
 if isinstance(value,(int,float)) and 0<value<=30 and isinstance(round_number,(int,float)) and 1<=round_number<=2:return float((round_number-1)*30+value)
 return None
def vector(player,row,year):
 pick=draft_pick(player)
 return [row['perGame'][k] for k in KEYS]+[row['games'],pick or 0,float(pick is None),
          player['age']-(2027-year) if player.get('age') else 0]
def evaluate(model,rows,baseline):
 errors=[];base=[]
 for r in rows:
  stat,games=tidy(model.predict(r['x']))
  errors.append(abs(core(stat)*games-r['actual']))
  base.append(abs(baseline-r['actual']))
 return dict(players=len(rows),seasonMAE=statistics.mean(errors),groupBaselineMAE=statistics.mean(base))
def run(data):
 rows=[]
 for p in data['players']:
  nba=(p.get('onlineEvidence',{}).get('career') or {}).get('seasons',[])
  if not nba:continue
  first=nba[0];college=college_row(p,first['year'])
  if not college or not all(k in first['perGame'] for k in KEYS):continue
  rows.append(dict(id=p['id'],year=first['year'],x=vector(p,college,first['year']),
                   y=[first['perGame'][k] for k in KEYS]+[first['games']],
                   actual=core(first['perGame'])*first['games']))
 train=[r for r in rows if r['year']<=2024];validation=[r for r in rows if r['year']==2025];test=[r for r in rows if r['year']==2026]
 report=dict(trainPlayers=len(train),validationPlayers=len(validation),testPlayers=len(test),
             scope='College-to-NBA among current-roster survivors. No high-school or international transfer equivalence.',
             limitations=['Current-player survivor selection; failed/departed draft picks may be absent.',
                          'Summer League, preseason and qualitative reports are shown separately, not silently added as NBA points.',
                          'Rotation and expert role forecasts are not yet calibrated as numerical transfer features.'])
 if len(train)<20 or min(len(validation),len(test))<5:
  return dict(report,status='INSUFFICIENT_TEMPORAL_COHORT',promoted=False,predictions=0)
 baseline=statistics.median(r['actual'] for r in train)
 choices=[]
 for alpha in [1,10,100]:
  result=evaluate(Ridge(train,alpha),validation,baseline);choices.append(dict(alpha=alpha,mae=result['seasonMAE']))
 alpha=min(choices,key=lambda c:c['mae'])['alpha']
 val=evaluate(Ridge(train,alpha),validation,baseline)
 held=evaluate(Ridge(train+validation,alpha),test,statistics.median(r['actual'] for r in train+validation))
 promoted=val['seasonMAE']<val['groupBaselineMAE']
 production=Ridge(rows,alpha);count=0
 for p in data['players']:
  if not p.get('isRookie'):continue
  college=college_row(p,2027)
  if not college:continue
  stat,games=tidy(production.predict(vector(p,college,2027)))
  p['rookiePrediction']=dict(perGame=stat,games=games,eligibleForPrimary=promoted,
                            collegeSeason=college['season'],draftPick=draft_pick(p),trainingPlayers=len(rows))
  count+=1
 return dict(report,status='TEMPORAL_EVALUATION',validation=val,test=held,promoted=promoted,selectedAlpha=alpha,predictions=count)
if __name__=='__main__':
 path=Path('public/data/default-draft.json');data=json.loads(path.read_text());report=run(data);data['rookieModelAudit']=report
 path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
 Path('public/data/rookie-model-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(report,ensure_ascii=False))
