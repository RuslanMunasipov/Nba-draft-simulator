"""Build the usable default catalog from history plus source-dated ESPN rosters.

No Yahoo eligibility or full FBL forecasts are implied. New rookies use a labelled
empirical group prior, not fabricated individual NBA statistics.
"""
import concurrent.futures
import json
import statistics
import time
import unicodedata
import urllib.request
from datetime import datetime,timezone
from pathlib import Path

BASE='https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
POSITIONS={'PG':['PG'],'SG':['SG'],'SF':['SF'],'PF':['PF'],'C':['C'],
           'G':['PG','SG'],'F':['SF','PF'],'G-F':['SG','SF'],'F-G':['SG','SF'],
           'F-C':['PF','C'],'C-F':['PF','C']}

def normalize(name):
    text=''.join(c for c in unicodedata.normalize('NFKD',name).lower() if c.isalnum() or c.isspace())
    return ' '.join(w for w in text.split() if w not in {'jr','sr','ii','iii','iv'})

def get_json(url):
    error=None
    for attempt in range(2):
        try:
            request=urllib.request.Request(url,headers={'User-Agent':'FBL-Draft-Intelligence/0.3'})
            with urllib.request.urlopen(request,timeout=20) as response:return json.load(response)
        except Exception as exc:
            error=exc
            if not attempt:time.sleep(.4)
    raise RuntimeError(f'{url}: {error}')

def roster(team):
    data=get_json(f"{BASE}/teams/{team['id']}/roster")
    if data.get('season',{}).get('year')!=2027:raise ValueError('Roster season is not 2026/27')
    if not data.get('athletes'):raise ValueError('Empty roster')
    result=[]
    for athlete in data['athletes']:
        result.append({'espnId':str(athlete['id']),'name':athlete['displayName'],
            'team':team['abbreviation'],'positions':POSITIONS.get(athlete.get('position',{}).get('abbreviation'),[]),
            'rawPosition':athlete.get('position',{}).get('abbreviation'),
            'experience':athlete.get('experience',{}).get('years'),
            'injuries':[{'status':i.get('status'),'date':i.get('date')} for i in athlete.get('injuries',[])],
            'source':f"{BASE}/teams/{team['id']}/roster"})
    return result

def make_database(history,baseline,current,now):
    history_by_name={}
    for p in history['players']:history_by_name.setdefault(normalize(p['name']),[]).append(p)
    estimates={p['id']:p for p in baseline['players']}
    # A transparent reference cohort: new-to-2025/26 NBA histories, with 20+ games,
    # and <=2 years of experience reported in the current roster. Not an individual rookie forecast.
    cohort=[]
    for athlete in current:
        matches=history_by_name.get(normalize(athlete['name']),[])
        if len(matches)!=1:continue
        p=matches[0]
        if set(p['seasons'])=={'2025-26'} and p['seasons']['2025-26']['games']>=20 and athlete.get('experience') in (1,2):
            cohort.append(p)
    if len(cohort)<8:raise ValueError(f'Insufficient empirical rookie reference cohort: {len(cohort)}')
    prior=round(statistics.median(p['seasons']['2025-26']['historicalCoreFPPerGame'] for p in cohort),3)
    players={}
    used_espn=set()
    for athlete in current:
        if athlete['espnId'] in used_espn:raise ValueError('Duplicate ESPN player across rosters')
        used_espn.add(athlete['espnId'])
        matches=history_by_name.get(normalize(athlete['name']),[])
        historical=matches[0] if len(matches)==1 else None
        estimate=estimates.get(historical['id']) if historical else None
        identifier=historical['id'] if historical else 'espn:'+athlete['espnId']
        if identifier in players:raise ValueError('Ambiguous historical name mapping')
        rookie=athlete.get('experience')==0 and historical is None
        value=estimate['estimatedCoreFPPerGame'] if estimate else prior if rookie else None
        players[identifier]={'id':identifier,'nbaId':historical['id'] if historical else None,
            'espnId':athlete['espnId'],'name':athlete['name'],'team':athlete['team'],
            'positions':athlete['positions'],'positionStatus':'ESTIMATED_FROM_ESPN_NOT_YAHOO' if athlete['positions'] else 'MISSING',
            'positionSource':athlete['source'],'isRookie':rookie,
            'rookieStatus':'SOURCE_REPORTED_NO_EXPERIENCE' if rookie else 'HISTORICAL_NBA_PLAYER' if historical else 'UNKNOWN',
            'projectedFP':value,'projectionStatus':'EMPIRICAL_ROOKIE_PRIOR' if rookie else 'HISTORICAL_CORE_ESTIMATE' if estimate else 'MISSING',
            'projectionMetric':'CORE_FP_PER_GAME_NO_RESULT_BONUS',
            'projectionBaseSeason':estimate.get('baseSeason') if estimate else None,
            'coverageStatus':estimate.get('coverageStatus') if estimate else 'ROOKIE_PRIOR' if rookie else 'MISSING',
            'uncertainty':'VERY_HIGH' if rookie or not estimate or estimate.get('uncertainty')=='VERY_HIGH' else 'HIGH',
            'injuries':athlete['injuries'],'returnContext':estimate.get('returnContext') if estimate else None,
            'currentRosterStatus':'SOURCE_REPORTED','rosterSource':athlete['source'],'sourceUpdatedAt':now,
            'reason':'Групповая оценка по историческим молодым игрокам; индивидуального NBA-прогноза нет.' if rookie else 'Историческая основа '+str(estimate.get('trainingSeasons')) if estimate else 'Недостаточно данных для оценки.'}
    # Keep all historical players searchable; absence from current rosters is UNKNOWN, not retirement.
    for p in history['players']:
        if p['id'] in players:continue
        e=estimates[p['id']]
        players[p['id']]={'id':p['id'],'nbaId':p['id'],'name':p['name'],'team':None,
            'positions':[],'positionStatus':'MISSING','isRookie':False,'rookieStatus':'HISTORICAL_NBA_PLAYER',
            'projectedFP':e['estimatedCoreFPPerGame'],'projectionStatus':'HISTORICAL_CORE_ESTIMATE',
            'projectionMetric':'CORE_FP_PER_GAME_NO_RESULT_BONUS','projectionBaseSeason':e['baseSeason'],
            'coverageStatus':e['coverageStatus'],'uncertainty':'VERY_HIGH','injuries':[],
            'returnContext':e.get('returnContext'),'currentRosterStatus':'NOT_IN_CURRENT_SOURCE',
            'reason':'Есть история NBA, но действующий ростер и позиции не подтверждены.'}
    history_by_id={p['id']:p for p in history['players']}
    for p in players.values():
        historical=history_by_id.get(p.get('nbaId'))
        p['historyReferenceSeason']='2025-26'
        p['historyGames']={year:season['games'] for year,season in historical['seasons'].items()} if historical else {}
        competition=[]
        for other in players.values():
            if other['id']==p['id'] or not p.get('team') or other.get('team')!=p['team']:continue
            old=history_by_id.get(other.get('nbaId'))
            if not old:continue
            latest=old['seasons'].get('2025-26')
            if latest and latest['lastHistoricalTeam']!=p['team'] and latest['averages']['fga']>=15:
                competition.append(other['name'])
        p['newHighVolumeTeammates']=competition
    values=list(players.values())
    return {'version':1,'generatedAt':now,'season':'2026-27','priceMode':'OFF',
      'players':values,'coverage':{'players':len(values),'currentRosterPlayers':len(current),
        'historicalPlayers':len(history['players']),'rookies':sum(p['isRookie'] for p in values),
        'estimatedPlayers':sum(p['projectedFP'] is not None for p in values)},
      'rookiePrior':{'value':prior,'cohortSize':len(cohort),'historicalIds':[p['id'] for p in cohort],
        'method':'median observed core FP/game for players first present in 2025/26 with 20+ games and current ESPN experience 1–2'},
      'limitations':['Positions are mapped from ESPN basketball positions, not verified Yahoo eligibility.',
       'Rookie classification and team status are provider-reported; preseason roster can change.',
       'Rookie estimates are empirical group priors, not personal NBA projections.',
       'No official prices, result bonuses, calibrated injury probability or validated season forecast.']}

if __name__=='__main__':
    now=datetime.now(timezone.utc).isoformat()
    listing=get_json(BASE+'/teams?limit=100')
    teams=[entry['team'] for entry in listing['sports'][0]['leagues'][0]['teams']]
    if len(teams)!=30:raise ValueError('Expected all 30 NBA teams')
    current=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for result in pool.map(roster,teams):current.extend(result)
    history=json.loads(Path('public/data/nba-history.json').read_text())
    baseline=json.loads(Path('public/data/experimental-baseline.json').read_text())
    data=make_database(history,baseline,current,now)
    market=json.loads(Path('data/market-context.json').read_text())
    for p in data['players']:p['marketContext']=market.get(str(p['id']))
    notes=json.loads(Path('data/player-notes.json').read_text())
    for p in data['players']:p['roleContext']=notes.get(str(p['id']))
    if data['coverage']['rookies']<8:raise ValueError('Insufficient source-reported rookies')
    for name in ['Tyrese Haliburton','Kyrie Irving']:
        if not any(p['name']==name and p['positions'] and p['projectedFP'] is not None for p in data['players']):
            raise ValueError('Missing returning player '+name)
    Path('public/data/default-draft.json').write_text(json.dumps(data,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'defaultDatabase':data['coverage'],'rookiePrior':data['rookiePrior'],'generatedAt':now},indent=2))
