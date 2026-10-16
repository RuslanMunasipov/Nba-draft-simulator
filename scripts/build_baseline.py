"""Transparent experimental core-FP estimates, never official full FBL forecasts."""
import json
from pathlib import Path
from statistics import mean

MIN_GAMES=20

def estimate(player, seasons, weighted=False):
    recent=player['seasons'].get(seasons[-1])
    if not recent or recent['games']<MIN_GAMES:
        return None
    older=player['seasons'].get(seasons[-2]) if len(seasons)>1 else None
    use_older=weighted and older is not None and older['games']>=MIN_GAMES
    def blend(value):
        return .75*value(recent)+.25*value(older) if use_older else value(recent)
    games=blend(lambda s:s['games'])
    fp=blend(lambda s:s['historicalCoreFPPerGame'])
    minutes=blend(lambda s:s['averages']['minutes'])
    return {'id':player['id'],'name':player['name'],'status':'ESTIMATED',
        'expectedObservedGames':round(games,2),'expectedMinutes':round(minutes,3),
        'estimatedCoreFPPerGame':round(fp,3),'estimatedCoreSeasonTotal':round(fp*games,2),
        'trainingSeasons':list(seasons[-2:] if use_older else seasons[-1:]),
        'weights':[.25,.75] if use_older else [1], 'uncertainty':'HIGH',
        'limitations':['No result bonuses, current role, injuries, age or schedule adjustments.',
          'Games are estimated from observed appearances; 2024/25 has seven missing games.',
          'Not suitable for rookies or low-sample players; no official Yahoo positions or prices.']}

def build(history):
    # Held-out 2025/26 is NEVER passed into either estimation function here.
    train=['2023-24','2024-25'];target='2025-26'
    errors={'previousSeason':[], 'weightedTwoSeasons':[]}
    errors_minutes={'previousSeason':[], 'weightedTwoSeasons':[]}
    errors_games={'previousSeason':[], 'weightedTwoSeasons':[]}
    for player in history['players']:
        actual=player['seasons'].get(target)
        if not actual or actual['games']<MIN_GAMES: continue
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
      'players':sorted((p for p in candidates if p),key=lambda p:-p['estimatedCoreSeasonTotal'])}

if __name__=='__main__':
    result=build(json.loads(Path('public/data/nba-history.json').read_text()))
    Path('public/data/experimental-baseline.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'experimentalPlayers':len(result['players']),'evaluation':result['evaluation']},ensure_ascii=False,indent=2))
