"""Transparent experimental core-FP estimates, never official full FBL forecasts."""
import json
from pathlib import Path
from statistics import mean

MIN_GAMES=20

def estimate(player, seasons, weighted=False):
    available=[season for season in seasons if player['seasons'].get(season,{}).get('games',0)>0]
    if not available:return None
    reliable=[season for season in available if player['seasons'][season]['games']>=MIN_GAMES]
    base_season=(reliable or available)[-1]
    recent=player['seasons'][base_season]
    stale=base_season!=seasons[-1]
    low_sample=recent['games']<MIN_GAMES
    previous=[season for season in reliable if season<base_season]
    older=player['seasons'][previous[-1]] if previous else None
    use_older=weighted and older is not None
    def blend(value):
        return .75*value(recent)+.25*value(older) if use_older else value(recent)
    games=blend(lambda s:s['games']) if not stale and not low_sample else None
    fp=blend(lambda s:s['historicalCoreFPPerGame'])
    minutes=blend(lambda s:s['averages']['minutes'])
    return {'id':player['id'],'name':player['name'],'status':'ESTIMATED',
        'coverageStatus':'LOW_SAMPLE' if low_sample else 'EARLIER_SEASON' if stale else 'RECENT_SEASON',
        'baseSeason':base_season,'sampleGames':recent['games'],
        'latestSeasonGames':player['seasons'].get(seasons[-1],{}).get('games',0),
        'currentRosterStatus':'UNKNOWN',
        'expectedObservedGames':round(games,2) if games is not None else None,'expectedMinutes':round(minutes,3),
        'estimatedCoreFPPerGame':round(fp,3),'estimatedCoreSeasonTotal':round(fp*games,2) if games is not None else None,
        'trainingSeasons':[previous[-1],base_season] if use_older else [base_season],
        'weights':[.25,.75] if use_older else [1], 'uncertainty':'VERY_HIGH' if stale or low_sample else 'HIGH',
        'limitations':['No result bonuses, current role, injuries, age or schedule adjustments.',
          'Missing latest-season rows are not interpreted as retirement or zero ability.',
          'Games and season total remain unknown for earlier-season or low-sample fallback.',
          'No official Yahoo positions, rookie projections or prices.']}

def build(history):
    # Held-out 2025/26 is NEVER passed into either estimation function here.
    train=['2023-24','2024-25'];target='2025-26'
    errors={'previousSeason':[], 'weightedTwoSeasons':[]}
    errors_minutes={'previousSeason':[], 'weightedTwoSeasons':[]}
    errors_games={'previousSeason':[], 'weightedTwoSeasons':[]}
    for player in history['players']:
        actual=player['seasons'].get(target)
        if not actual or actual['games']<MIN_GAMES or player['seasons'].get(train[-1],{}).get('games',0)<MIN_GAMES: continue
        for name,weighted in [('previousSeason',False),('weightedTwoSeasons',True)]:
            prediction=estimate(player,train,weighted)
            if prediction:
                errors[name].append(abs(prediction['estimatedCoreFPPerGame']-actual['historicalCoreFPPerGame']))
                errors_minutes[name].append(abs(prediction['expectedMinutes']-actual['averages']['minutes']))
                errors_games[name].append(abs(prediction['expectedObservedGames']-actual['games']))
    metrics={name:{'players':len(values),'maeCoreFPPerGame':round(mean(values),4) if values else None,
        'maeMinutes':round(mean(errors_minutes[name]),4) if values else None,
        'maeObservedGames':round(mean(errors_games[name]),4) if values else None} for name,values in errors.items()}
    if not all(metrics[n]['players'] for n in metrics):raise ValueError('No eligible holdout sample')
    selected=min(metrics,key=lambda n:metrics[n]['maeCoreFPPerGame'])
    candidates=[estimate(p,history['seasons'],selected=='weightedTwoSeasons') for p in history['players']]
    return {'version':1,'status':'EXPERIMENTAL_NOT_DRAFT_READY','targetSeason':'2026-27',
      'generatedAt':history['generatedAt'],'dataCutoff':max((s['date_max'][:10] for s in history.get('audit',{}).get('seasons',{}).values()),default='UNKNOWN'),
      'evaluation':{'trainSeasons':train,'testSeason':target,'minimumGames':MIN_GAMES,
        'models':metrics,'selectedModel':selected,
        'limitations':['Selection uses this comparison; there is no second independent final test.',
         'Evaluation includes returning players with at least 20 observed games, not all NBA players.',
         'Training season 2024/25 is incomplete. MAE is not a calibrated prediction interval.']},
      'coverage':{'historicalPlayers':len(history['players']),'includedPlayers':sum(p is not None for p in candidates),
        'earlierSeason':sum(p is not None and p['coverageStatus']=='EARLIER_SEASON' for p in candidates),
        'lowSample':sum(p is not None and p['coverageStatus']=='LOW_SAMPLE' for p in candidates)},
      'players':sorted((p for p in candidates if p),key=lambda p:({'RECENT_SEASON':0,'EARLIER_SEASON':1,'LOW_SAMPLE':2}[p['coverageStatus']],-p['estimatedCoreFPPerGame']))}

if __name__=='__main__':
    result=build(json.loads(Path('public/data/nba-history.json').read_text()))
    context=json.loads(Path('data/return-context.json').read_text())
    for player in result['players']:
        player['returnContext']=context.get(str(player['id']))
    if result['coverage']['includedPlayers']!=result['coverage']['historicalPlayers']:raise ValueError('Historical players silently dropped')
    Path('public/data/experimental-baseline.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'experimentalPlayers':len(result['players']),'evaluation':result['evaluation']},ensure_ascii=False,indent=2))
