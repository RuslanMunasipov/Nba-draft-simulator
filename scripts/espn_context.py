"""Source-labelled ESPN ADP and season game projections; never ESPN FP as FBL FP."""
import json
import math
import urllib.request

SOURCE='https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2027/segments/0/leaguedefaults/1?view=kona_player_info'

def finite(value):
    return isinstance(value,(float,int)) and not isinstance(value,bool) and math.isfinite(value)

def individual_projection(record,games):
    if games is None:return None
    stats=record.get('stats',{})
    ids={'points':'0','blocks':'1','steals':'2','assists':'3','rebounds':'6','turnovers':'11','fgMade':'13','fgAttempted':'14','ftMade':'15','ftAttempted':'16','threesMade':'17','minutes':'40'}
    if any(not finite(stats.get(key)) or stats[key]<0 for key in ids.values()):return None
    totals={name:stats[key] for name,key in ids.items()}
    if totals['fgMade']>totals['fgAttempted'] or totals['ftMade']>totals['ftAttempted']:return None
    if abs(totals['points']-(2*totals['fgMade']+totals['threesMade']+totals['ftMade']))>.1:return None
    if totals['minutes']/games>48:return None
    component=totals['points']+totals['rebounds']+totals['assists']+totals['steals']+totals['blocks']-(totals['fgAttempted']-totals['fgMade'])-(totals['ftAttempted']-totals['ftMade'])-2*totals['turnovers']
    return {'games':games,'perGame':{name:value/games for name,value in totals.items()},
        'componentFPPerGame':component/games,'componentSeasonTotal':component,
        'metric':'FBL_COMPONENTS_EXCLUDING_PF_MINUTES_RESULT_BONUSES',
        'limitations':['Personal fouls absent: not silently assumed zero.','Minute and game-result bonuses excluded.','Provider projection, not observed NBA rookie performance.']}

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
    with urllib.request.urlopen(request,timeout=30) as response:payload=json.load(response)
    result=parse_context(payload,now)
    if len(result)<500:raise ValueError('Incomplete ESPN player feed')
    return result
