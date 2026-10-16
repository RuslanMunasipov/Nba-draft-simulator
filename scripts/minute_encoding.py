"""Detect minute encoding by team-minute conservation; never invent missing seconds."""
from collections import defaultdict
def normalize_minutes(rows,season):
    teams=defaultdict(list)
    for r in rows:teams[(r['game_id'],r['team'])].append(r)
    target=lambda total:any(abs(total-(240+25*o))<.5 for o in range(6))
    fractional=sum(abs(r['minutes']-int(r['minutes']))>1e-6 for r in rows)
    patched=lambda m:abs(m-round(m,2))>1e-6
    clock=lambda m:m if patched(m) else int(m)+round((m%1)*100)/60
    raw=sum(target(sum(r['minutes'] for r in logs)) for logs in teams.values())
    converted=sum(target(sum(clock(r['minutes']) for r in logs)) for logs in teams.values())
    if not fractional:
        mode='TRUNCATED_INTEGER_MINUTES'
    elif converted/len(teams)>=.8 and converted>raw:
        bad=[r for r in rows if not patched(r['minutes']) and round((r['minutes']%1)*100)>60]
        if bad:raise ValueError('Invalid clock seconds '+str((season,len(bad),[(r.get('player_name'),r['minutes']) for r in bad[:8]])))
        mode='MM_SS_NUMERIC'
    elif raw/len(teams)>=.8:
        mode='DECIMAL_MINUTES'
    else:raise ValueError('Unresolved minute encoding '+str((season,raw,converted,len(teams))))
    result=[{**r,'minutes':clock(r['minutes']) if mode=='MM_SS_NUMERIC' else r['minutes'],'minuteEncoding':mode} for r in rows]
    return result,{'encoding':mode,'rawConservedTeamGames':raw,'clockConservedTeamGames':converted,'teamGames':len(teams),'fractionalRows':fractional,'secondsMissing':mode=='TRUNCATED_INTEGER_MINUTES','preservedDecimalPatchRows':sum(patched(r['minutes']) for r in rows),'carried60SecondRows':sum(round((r['minutes']%1)*100)==60 for r in rows)}
