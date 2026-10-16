"""Source-labelled ESPN ADP and season game projections; never ESPN FP as FBL FP."""
import json
import math
import urllib.request

SOURCE='https://lm-api-reads.fantasy.espn.com/apis/v3/games/fba/seasons/2027/segments/0/leaguedefaults/1?view=kona_player_info'

def finite(value):
    return isinstance(value,(float,int)) and not isinstance(value,bool) and math.isfinite(value)

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
        result[identifier]={'adp':adp,'projectedGames':games,'season':'2026-27','fetchedAt':now,
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
