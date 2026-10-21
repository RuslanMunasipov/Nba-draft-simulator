"""Source-labelled ESPN ADP and season game projections; never ESPN FP as FBL FP."""
import json,time
import math
import urllib.request

SOURCE='https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2027/segments/0/leaguedefaults/1?view=kona_player_info'

def finite(value):
    return isinstance(value,(float,int)) and not isinstance(value,bool) and math.isfinite(value)

# Required: a missing points, shooting, minutes, rebound, assist, steal or turnover total is a feed defect, not a zero.
REQUIRED={'points':'0','steals':'2','assists':'3','rebounds':'6','turnovers':'11','fgMade':'13','fgAttempted':'14','ftMade':'15','ftAttempted':'16','minutes':'40'}
# ESPN leaves a stat out when it projects a season total of 0: 23 non-shooting centres had no '17' (3PM) and three
# wings no '1' (blocks) on 20.10.2026, every one consistent with 0. Only these two are read as 0 when absent; a
# present one must still be a valid number, and a 3PM absent but really nonzero still fails the points identity.
ZERO_IF_ABSENT={'blocks':'1','threesMade':'17'}

def individual_projection(record,games):
    if games is None:return None
    stats=record.get('stats',{})
    if any(not finite(stats.get(key)) or stats[key]<0 for key in REQUIRED.values()):return None
    if any(key in stats and (not finite(stats[key]) or stats[key]<0) for key in ZERO_IF_ABSENT.values()):return None
    totals={**{name:stats[key] for name,key in REQUIRED.items()},**{name:stats.get(key,0) for name,key in ZERO_IF_ABSENT.items()}}
    absent=[name for name,key in ZERO_IF_ABSENT.items() if key not in stats]
    if totals['fgMade']>totals['fgAttempted'] or totals['ftMade']>totals['ftAttempted']:return None
    if abs(totals['points']-(2*totals['fgMade']+totals['threesMade']+totals['ftMade']))>.1:return None
    if totals['minutes']/games>48:return None
    component=totals['points']+totals['rebounds']+totals['assists']+totals['steals']+totals['blocks']-(totals['fgAttempted']-totals['fgMade'])-(totals['ftAttempted']-totals['ftMade'])-2*totals['turnovers']
    return {'games':games,'perGame':{name:value/games for name,value in totals.items()},
        'componentFPPerGame':component/games,'componentSeasonTotal':component,
        'metric':'FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES','absentStatsReadAsZero':absent,
        'limitations':['Personal fouls absent: not silently assumed zero.','Minute and game-result bonuses excluded.','Provider projection, not observed NBA rookie performance.',
                       'ESPN omits stats projected at 0: an absent block or 3PM total is read as 0 (3PM checked by the points identity).']}

def parse_context(payload,now):
    result={}
    for entry in payload.get('players',[]):
        player=entry['player'];identifier=str(player['id'])
        if identifier in result:raise ValueError('Duplicate ESPN ID')
        ownership=player.get('ownership',{});adp=ownership.get('averageDraftPosition')
        if not finite(adp) or adp<=0:adp=None
        games=None
        projections=[s for s in player.get('stats',[]) if s.get('seasonId')==2027 and s.get('statSourceId')==1 and s.get('statSplitTypeId')==0 and s.get('scoringPeriodId')==0]
        if len(projections)==1:
            record=projections[0];value=record.get('stats',{}).get('42')
            # A season GP field must also agree with total / per-game statistics.
            checks=[]
            for key in ['0','3','6']:
                total=record.get('stats',{}).get(key);average=record.get('averageStats',{}).get(key)
                if finite(total) and finite(average) and average>0:checks.append(abs(total/average-value)<.01 if finite(value) else False)
            if finite(value) and 0<value<=82 and len(checks)>=2 and all(checks):games=value
        projection=individual_projection(projections[0],games) if len(projections)==1 else None
        result[identifier]={'individualProjection':projection,'adp':adp,'projectedGames':games,'season':'2026-27','fetchedAt':now,
            'source':SOURCE,'page':'https://fantasy.espn.com/basketball/players/projections',
            'metric':'ESPN_ADP_AND_PROJECTED_GAMES_NOT_FBL_FP',
            'ownershipUpdatedAt':ownership.get('date')}
    return result

def fetch_context(now):
    filters={'players':{'limit':1500,'sortPercOwned':{'sortAsc':False,'sortPriority':1},
        'filterStatsForSourceIds':{'value':[1]},'filterStatsForExternalIds':{'value':[2027]}}}
    request=urllib.request.Request(SOURCE,headers={'X-Fantasy-Filter':json.dumps(filters),'User-Agent':'FBL-Draft-Intelligence/0.3'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(request,timeout=30) as response:payload=json.load(response)
            break
        except Exception:  # noqa: BLE001
            if attempt==3:raise
            time.sleep(2*(attempt+1))
    result=parse_context(payload,now)
    if len(result)<500:raise ValueError('Incomplete ESPN player feed')
    return result
