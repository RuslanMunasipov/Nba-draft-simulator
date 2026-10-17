"""Keep the mobile draft small; career details load only when opened."""
import json
from pathlib import Path
path=Path('public/data/default-draft.json');data=json.loads(path.read_text())
folder=Path('public/data/players');folder.mkdir(parents=True,exist_ok=True)
for player in data['players']:
 evidence=player.pop('onlineEvidence',{})
 prediction=player.pop('careerPrediction',None)
 career=(evidence.get('career') or {}).get('seasons',[])
 player['onlineSummary']=dict(careerSeasons=len(career),firstSeason=career[0]['season'] if career else None,
                             lastSeason=career[-1]['season'] if career else None,
                             recentGames=len(evidence.get('recentGames',[])),collegeSeasons=len((evidence.get('college') or {}).get('seasons',[])))
 if prediction:player['careerModelSummary']={k:v for k,v in prediction.items() if k not in ('perGame',)}
 filename=str(player['id']).replace(':','-')+'.json'
 (folder/filename).write_text(json.dumps(dict(name=player['name'],espnId=player.get('espnId'),evidence=evidence,draft=player.get('draftContext')),ensure_ascii=False),encoding='utf-8')
path.write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
size=path.stat().st_size
if size>4_000_000:raise ValueError('Mobile draft payload too large: '+str(size))
print(json.dumps(dict(mobileDatabaseBytes=size,playerDetailFiles=len(data['players'])),ensure_ascii=False))
