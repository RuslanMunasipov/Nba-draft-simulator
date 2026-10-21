"""Attach Sports.ru fantasy points per season and check forecasts against them.

Sports.ru's season points include its team result bonus (+2/+3 for a home/away win, -3/-2 for a home/away loss),
which the FBL formula does not count (league owner, 20.10.2026). The check therefore compares the forecast with
Sports.ru's per-game average minus that season's mean result bonus of the player's own games in the career logs
(fblPerGame). Sports.ru's own number stays as perGame for display. Missing seasons stay missing."""
import json
from pathlib import Path

SOURCE = Path('data/sports-fantasy-history.json')
DB = Path('public/data/default-draft.json')
LOGS = Path('data/raw/career_games.parquet')
MIN_GAMES = 20
GAP = 0.15
# The logs' games may differ from Sports.ru's by a few (the NBA Cup final, rows Sports.ru scores 0); the mean bonus of
# 70 games barely moves with them, but a larger gap means the seasons are not the same games.
MAX_GAME_DIFF = 5


def season_key(label):
    return int(label[:4])


def result_bonus(home, won):
    return (2 if home else 3) if won else (-3 if home else -2)


def result_bonuses(path=LOGS):
    """Mean Sports.ru result bonus per played regular-season game: {(nbaId, '2025-26'): (mean, games)}."""
    import pyarrow.parquet as pq
    acc = {}
    for g in pq.read_table(path, columns=['player_id', 'competition', 'season', 'season_type', 'home', 'result', 'minutes']).to_pylist():
        if g['competition'] != 'nba' or g['season_type'] != 'REGULAR' or not g['minutes'] or g['result'] not in ('W', 'L'):
            continue
        key = (str(g['player_id']), f"{g['season'] - 1}-{str(g['season'])[2:]}")
        total, games = acc.get(key, (0, 0))
        acc[key] = (total + result_bonus(g['home'], g['result'] == 'W'), games + 1)
    return {key: (total / games, games) for key, (total, games) in acc.items()}


def attach(database, history, bonuses=None):
    """bonuses=None (no career logs) keeps Sports.ru's with-bonus numbers as the reference and says so in basis."""
    players = history.get('players', {})
    checked = flagged = attached = unchecked = 0
    for player in database['players']:
        record = players.get(str(player.get('sportsId') or ''))
        if not record or not record.get('seasons'):
            continue
        # Sports.ru's printed average is the reference: some 0-point rows are real regular-season games it counts,
        # others (play-in, playoffs) it does not, so derive games from that average.
        seasons = {k: {**v, 'games': round(v['points'] / v['sportsPerGame']) if v.get('sportsPerGame') else v.get('games'),
                       'perGame': v.get('sportsPerGame') or v.get('perGame')}
                   for k, v in sorted(record['seasons'].items(), key=lambda kv: season_key(kv[0]))}
        seasons = {k: v for k, v in seasons.items()
                   if isinstance(v['games'], int) and v['games'] > 0 and isinstance(v['perGame'], (int, float))}
        if not seasons:
            continue
        nba = str(player.get('nbaId') or '')
        for k, v in seasons.items():
            b = (bonuses or {}).get((nba, k))
            if b and abs(b[1] - v['games']) <= MAX_GAME_DIFF:
                v['resultBonusPerGame'] = round(b[0], 2)
                v['fblPerGame'] = round(v['perGame'] - b[0], 2)
        player['sportsHistory'] = seasons
        attached += 1
        full = [(k, v) for k, v in seasons.items() if v['games'] >= MIN_GAMES]
        forecast = (player.get('forecast') or {}).get('meanPerGame')
        if full and isinstance(forecast, (int, float)):
            label, last = full[-1]
            if bonuses is None:
                ref, basis = last['perGame'], 'SPORTS_WITH_RESULT_BONUS'
            elif 'fblPerGame' in last:
                ref, basis = last['fblPerGame'], 'FBL_NO_RESULT_BONUS'
            else:
                # No bonus for that season: a with-bonus gap would mostly measure the club's record, so no check.
                unchecked += 1
                continue
            gap = (forecast - ref) / ref if ref > 0 else None
            player['sportsCheck'] = {'season': label, 'perGame': ref, 'sportsPerGame': last['perGame'], 'basis': basis,
                                     'games': last['games'], 'forecastPerGame': forecast, 'gap': gap,
                                     'flag': gap is not None and abs(gap) > GAP}
            checked += 1
            flagged += bool(player['sportsCheck']['flag'])
    reference = ('Sports.ru per game minus the season mean result bonus of the same games (career logs)' if bonuses is not None
                 else "Sports.ru per game including its result bonus (no career logs)")
    database['sportsHistoryAudit'] = {'source': history.get('source'), 'capturedAt': history.get('capturedAt'),
                                      'attached': attached, 'checked': checked, 'flagged': flagged,
                                      'uncheckedWithoutBonus': unchecked, 'reference': reference,
                                      'rule': f'forecast per game vs last Sports.ru season with >= {MIN_GAMES} games; flag when gap > {int(GAP*100)}%'}
    return database['sportsHistoryAudit']


if __name__ == '__main__':
    if not SOURCE.exists():
        print('No Sports.ru fantasy history file; nothing attached.')
    else:
        database = json.loads(DB.read_text())
        report = attach(database, json.loads(SOURCE.read_text()), result_bonuses() if LOGS.exists() else None)
        DB.write_text(json.dumps(database, ensure_ascii=False))
        Path('public/data/sports-history-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(report)
