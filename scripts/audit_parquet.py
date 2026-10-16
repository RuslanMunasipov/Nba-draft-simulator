#!/usr/bin/env python3
"""Audit supplied historical data. No current positions, prices or forecasts are inferred."""
import hashlib
import json
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
import pyarrow.parquet as pq

SEASONS = ('2023-24', '2024-25', '2025-26')
STATS = ('pts','reb','ast','stl','blk','fga','fgm','fta','ftm','tov','pf','minutes')
report = {'status':'INSPECTED_NOT_INDEPENDENTLY_VERIFIED','seasons':{},'warnings':[]}
players = {}
failed = False
for season in SEASONS:
    path = Path('data/raw') / f'game_logs_{season}.parquet'
    try:
        table = pq.read_table(path)
        required = {'game_id','game_date','season','player_id','player_name','team','opponent','home','source',*STATS}
        if not required.issubset(table.column_names):
            raise ValueError('Missing columns: '+str(required-set(table.column_names)))
        rows = table.to_pylist()
        if not rows:
            raise ValueError('Empty dataset')
        keys = [(r['game_id'],r['player_id']) for r in rows]
        duplicates = len(keys)-len(set(keys))
        invalid = [i for i,r in enumerate(rows) if any(r[k] is None for k in required)
                   or not isinstance(r['player_id'],int) or r['player_id']<=0
                   or r['season']!=season or any(r[k]<0 for k in STATS)
                   or r['fgm']>r['fga'] or r['ftm']>r['fta']]
        if duplicates or invalid:
            raise ValueError(f'Duplicate player/game keys: {duplicates}; invalid rows: {len(invalid)}')
        games = len(set(r['game_id'] for r in rows))
        details = {'rows':len(rows),'games':games,'players':len(set(r['player_id'] for r in rows)),
                   'date_min':str(min(r['game_date'] for r in rows)), 'date_max':str(max(r['game_date'] for r in rows)),
                   'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                   'sources':sorted(set(r['source'] for r in rows)),
                   'columns':[{'name':f.name,'dtype':str(f.type)} for f in table.schema],
                   'null_counts':{k:table.column(k).null_count for k in table.column_names},
                   'duplicate_player_game_keys':duplicates,'invalid_rows':len(invalid)}
        report['seasons'][season]=details
        if games!=1230:
            report['warnings'].append(f'{season}: {games}/1230 regular-season games; coverage is incomplete or game classification needs verification')
        grouped=defaultdict(list)
        for r in rows:
            grouped[r['player_id']].append(r)
        for player_id,logs in grouped.items():
            latest=max(logs,key=lambda r:r['game_date'])
            p=players.setdefault(player_id,{'id':player_id,'name':latest['player_name'],'seasons':{}})
            p['name']=latest['player_name']
            # Result bonuses are deliberately excluded: the inputs have no explicit win/loss field.
            core=sum(r['pts']+r['reb']+r['ast']+r['stl']+r['blk']-(r['fga']-r['fgm'])
                     -(r['fta']-r['ftm'])-2*r['tov']-r['pf']+(2 if r['minutes']>=10 else 1) for r in logs)
            p['seasons'][season]={'games':len(logs),'lastHistoricalTeam':latest['team'],
                'averages':{k:round(sum(r[k] for r in logs)/len(logs),4) for k in STATS},
                'historicalCoreFPPerGame':round(core/len(logs),4),'coreFPTotal':core}
    except Exception as exc:
        failed=True
        report['warnings'].append(f'{season}: {type(exc).__name__}: {exc}')
report['limitations']=['User-supplied Kaggle-derived data; source authenticity is not independently verified.',
    'No Yahoo positions or 2026/27 roster validation.', 'No official prices or rookie verification.',
    'Core FP excludes result bonuses and is not full FBL FP.',
    'Historical averages are not 2026/27 projections; missing games affect totals and availability estimates.',
    'Minute encoding requires source verification before minute-based modelling.']
Path('data/reports').mkdir(parents=True,exist_ok=True)
Path('data/reports/parquet-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
if failed:
    raise SystemExit(1)
Path('public/data').mkdir(parents=True,exist_ok=True)
history={'version':1,'generatedAt':datetime.now(timezone.utc).isoformat(),
         'status':report['status'],'seasons':list(SEASONS),'audit':report,
         'players':sorted(players.values(),key=lambda p:p['id'])}
Path('public/data/nba-history.json').write_text(json.dumps(history,ensure_ascii=False),encoding='utf-8')
print(f'Historical profiles generated: {len(players)}. No forecasts published.')
