"""Attach official Sports.ru fantasy points per season and audit forecasts against them.

Sports.ru computes these points with the tournament's own formula, so they are the
reference for checking our full-formula forecasts. Missing seasons stay missing."""
import json
from pathlib import Path

SOURCE = Path('data/sports-fantasy-history.json')
DB = Path('public/data/default-draft.json')
MIN_GAMES = 20
GAP = 0.15


def season_key(label):
    return int(label[:4])


def attach(database, history):
    players = history.get('players', {})
    checked = flagged = attached = 0
    for player in database['players']:
        record = players.get(str(player.get('sportsId') or ''))
        if not record or not record.get('seasons'):
            continue
        seasons = {k: v for k, v in sorted(record['seasons'].items(), key=lambda kv: season_key(kv[0]))
                   if isinstance(v.get('games'), int) and v['games'] > 0 and isinstance(v.get('perGame'), (int, float))}
        if not seasons:
            continue
        player['sportsHistory'] = seasons
        attached += 1
        full = [(k, v) for k, v in seasons.items() if v['games'] >= MIN_GAMES]
        forecast = (player.get('forecast') or {}).get('meanPerGame')
        if full and isinstance(forecast, (int, float)):
            label, last = full[-1]
            gap = (forecast - last['perGame']) / last['perGame'] if last['perGame'] else None
            player['sportsCheck'] = {'season': label, 'perGame': last['perGame'], 'games': last['games'],
                                     'forecastPerGame': forecast, 'gap': gap,
                                     'flag': gap is not None and abs(gap) > GAP}
            checked += 1
            flagged += bool(player['sportsCheck']['flag'])
    database['sportsHistoryAudit'] = {'source': history.get('source'), 'capturedAt': history.get('capturedAt'),
                                      'attached': attached, 'checked': checked, 'flagged': flagged,
                                      'rule': f'forecast per game vs last Sports.ru season with >= {MIN_GAMES} games; flag when gap > {int(GAP*100)}%'}
    return database['sportsHistoryAudit']


if __name__ == '__main__':
    if not SOURCE.exists():
        print('No Sports.ru fantasy history file; nothing attached.')
    else:
        database = json.loads(DB.read_text())
        report = attach(database, json.loads(SOURCE.read_text()))
        DB.write_text(json.dumps(database, ensure_ascii=False))
        Path('public/data/sports-history-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(report)
