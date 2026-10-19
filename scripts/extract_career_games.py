"""Compact, permanent copy of the collected career game logs (ESPN, 2002-2026, current-player universe).

The collection lives in a 90-day Actions artifact (history-checkpoint). This keeps every NBA and NCAA game row with
the box-score fields, date, team, opponent, home flag and result, so the scoring and projection models do not depend
on the artifact. Usage: extract_career_games.py [.cache/history/history.sqlite]
"""
import json,sqlite3,sys
from pathlib import Path
import pyarrow as pa,pyarrow.parquet as pq

OUT=Path('data/raw/career_games.parquet')
PEOPLE=Path('data/career-players.json')
STATS=['minutes','pts','reb','ast','stl','blk','tov','pf','fgm','fga','ftm','fta','fg3m','fg3a']

def rows(db):
    for pid,competition,event,season,season_type,raw in db.execute(
            "SELECT player_id,competition,event_id,season,season_type,stats_json FROM player_games ORDER BY player_id,season,event_id"):
        g=json.loads(raw);e=g.get('event') or {};s=g.get('stats') or {}
        if not all(isinstance(s.get(k),(int,float)) for k in STATS):continue
        score_home,score_away=e.get('homeTeamScore'),e.get('awayTeamScore')
        yield {'player_id':pid,'competition':competition,'game_id':str(event),'season':int(season),'season_type':season_type,
               'date':(e.get('gameDate') or '')[:10] or None,'team':(e.get('team') or {}).get('abbreviation') or g.get('sourceTeam'),
               'opponent':(e.get('opponent') or {}).get('abbreviation'),'home':e.get('atVs')=='vs' if e.get('atVs') in ('vs','@') else None,
               'result':e.get('gameResult') if e.get('gameResult') in ('W','L') else None,
               'team_score':int(score_home if e.get('atVs')=='vs' else score_away) if str(score_home or '').isdigit() and str(score_away or '').isdigit() else None,
               'opponent_score':int(score_away if e.get('atVs')=='vs' else score_home) if str(score_home or '').isdigit() and str(score_away or '').isdigit() else None,
               **{k:float(s[k]) for k in STATS}}

def main():
    db=sqlite3.connect(sys.argv[1] if len(sys.argv)>1 else '.cache/history/history.sqlite')
    table=pa.Table.from_pylist(list(rows(db)))
    OUT.parent.mkdir(parents=True,exist_ok=True)
    pq.write_table(table,OUT,compression='zstd',compression_level=19)
    people=[]
    for pid,name,espn,nba in db.execute('SELECT id,name,espn_id,nba_id FROM players ORDER BY id'):
        birth=db.execute('SELECT birth_date FROM provider_identities WHERE espn_id=?',(espn,)).fetchone()
        people.append({'playerId':pid,'name':name,'espnId':espn,'nbaId':int(nba) if nba else None,'birthDate':(birth[0] or '')[:10] or None if birth else None})
    PEOPLE.write_text(json.dumps({'source':'history-checkpoint (ESPN athlete records)','players':people},ensure_ascii=False,indent=0)+'\n')
    print(json.dumps({'rows':table.num_rows,'players':len({r for r in table.column('player_id').to_pylist()}),'bytes':OUT.stat().st_size,'people':len(people)}))

if __name__=='__main__':main()
