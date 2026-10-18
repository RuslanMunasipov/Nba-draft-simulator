#!/usr/bin/env python3
"""Collect official Sports.ru fantasy points per player per season.

Source: the Sports.ru fantasy player popup
  https://www.sports.ru/fantasy/basketball/player/info/150/<sportsId>.html?s=<seasonId>
which renders a per-game table for the chosen season. Column "ФО" holds the
fantasy points Sports.ru computed with its own formula; "МИН" is minutes.
A game counts as played when minutes != 00:00 (this reproduces Sports.ru's own
"В среднем очков за матч" figure). Seasons are taken from the page's own
season selector. Nothing is estimated: a season whose table has no non-zero
fantasy points is recorded under "missingSeasons" instead of "seasons".
"""
import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRICES = ROOT / 'data' / 'sports-prices-2026-10-17.json'
OUT = ROOT / 'data' / 'sports-fantasy-history.json'
TOURNAMENT = 150
URL = 'https://www.sports.ru/fantasy/basketball/player/info/{t}/{pid}.html?s={sid}'
BASE_URL = 'https://www.sports.ru/fantasy/basketball/player/info/{t}/{pid}.html'
# Latest completed season id; its page also carries the season selector.
LATEST_SEASON_ID = '1317725'
UA = 'Mozilla/5.0 (compatible; fbl-draft-simulator/1.0; research)'
WORKERS = 10
# Seasons where the page shows ФО = 0 for every game (checked on Jokic and others):
# Sports.ru did not compute fantasy points then. Skipped unless --all-seasons.
NO_FP_SEASONS = {'5157', '5776', '6453'}
ALL_SEASONS = '--all-seasons' in sys.argv


def fetch(url):
    last = None
    for attempt in range(3):  # 1 try + 2 retries
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ru'})
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'{url}: {last}')


def seasons_of(page):
    sel = re.search(r'<select[^>]*id="slt"[^>]*>(.*?)</select>', page, re.S)
    if not sel:
        return []
    return re.findall(r'<option value="(\d+)"[^>]*>\s*(\d{4})/(\d{4})\s*</option>', sel.group(1))


def label(y1, y2):
    return f'{y1}-{y2[2:]}'


def cell(c):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', c))).strip()


def parse_table(page):
    m = re.search(r'<table class="stat-table small".*?</table>', page, re.S)
    if not m:
        return None
    rows = re.findall(r'<tr>(.*?)</tr>', m.group(0), re.S)
    if not rows:
        return None
    head = [cell(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', rows[0], re.S)]
    try:
        i_min, i_fo = head.index('МИН'), head.index('ФО')
    except ValueError:
        return None
    games, total, logged, played, zero = 0, 0.0, 0, 0, 0
    for r in rows[1:]:
        cs = [cell(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)]
        if len(cs) <= i_fo:
            continue
        logged += 1
        if cs[i_min] in ('', '00:00', '–', '-'):
            continue
        played += 1
        try:
            fo = float(cs[i_fo].replace(',', '.'))
        except ValueError:
            fo = 0.0
        if fo == 0:
            # Play-in/postseason rows appear in the log with ФО = 0 and are not
            # counted by Sports.ru's own per-game average; excluded likewise.
            zero += 1
            continue
        games += 1
        total += fo
    return {'games': games, 'points': total, 'logged': logged, 'gamesWithMinutes': played, 'zeroPointGames': zero}


def page_avg(page):
    m = re.search(r'В среднем очков за матч\s*</[^>]+>\s*<[^>]+>\s*([\d.,-]+)', page)
    if not m:
        m = re.search(r'В среднем очков за матч(?:<[^>]+>|\s)*([\d.,-]+)', page)
    return float(m.group(1).replace(',', '.')) if m else None


def collect(player):
    pid = player['sportsId']
    out = {'name': player.get('name'), 'club': player.get('club'), 'seasons': {}, 'missingSeasons': []}
    try:
        first = fetch(URL.format(t=TOURNAMENT, pid=pid, sid=LATEST_SEASON_ID))
        if first is None:
            first = fetch(BASE_URL.format(t=TOURNAMENT, pid=pid))
        if first is None:
            return pid, None, 'page not found'
        h1 = re.search(r'<h1[^>]*>\s*(?:<b>)?([^<]+)', first)
        if h1:
            out['fullName'] = html.unescape(h1.group(1)).strip()
        for sid, y1, y2 in seasons_of(first):
            if sid in NO_FP_SEASONS and not ALL_SEASONS:
                out['missingSeasons'].append({'season': label(y1, y2), 'seasonId': sid,
                                              'reason': 'fantasy points not computed by Sports.ru for this season (skipped)'})
                continue
            page = first if sid == LATEST_SEASON_ID else fetch(URL.format(t=TOURNAMENT, pid=pid, sid=sid))
            lab = label(y1, y2)
            t = parse_table(page) if page else None
            if not t or t['gamesWithMinutes'] == 0:
                out['missingSeasons'].append({'season': lab, 'seasonId': sid, 'reason': 'no games played'})
                continue
            if t['points'] == 0:
                out['missingSeasons'].append({'season': lab, 'seasonId': sid, 'games': t['gamesWithMinutes'],
                                              'reason': 'fantasy points not computed by Sports.ru for this season'})
                continue
            pts = int(t['points']) if t['points'].is_integer() else round(t['points'], 2)
            row = {'games': t['games'], 'points': pts, 'perGame': round(t['points'] / t['games'], 2), 'seasonId': sid,
                   'gamesWithMinutes': t['gamesWithMinutes'], 'zeroPointGames': t['zeroPointGames']}
            avg = page_avg(page)
            if avg is not None:
                row['sportsPerGame'] = avg
            out['seasons'][lab] = row
    except Exception as e:  # noqa: BLE001
        return pid, None, str(e)
    return pid, out, None


def main():
    prices = json.loads(PRICES.read_text(encoding='utf-8'))
    players = prices['players']
    ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    if ids:
        players = [p for p in players if p['sportsId'] in ids]
    result = {
        'source': URL.format(t=TOURNAMENT, pid='<sportsId>', sid='<seasonId>'),
        'capturedAt': datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
        'formula': 'Sports.ru fantasy points',
        'notes': 'Per-game "ФО" column summed; games = rows with minutes > 0 and ФО != 0 (play-in/playoff rows carry ФО=0); perGame = points/games. '
                 'sportsPerGame is the average printed by Sports.ru on the same page. Regular-season game logs.',
        'players': {},
        'missing': [],
        'errors': {},
    }
    done = 0
    with ThreadPoolExecutor(WORKERS) as ex:
        for pid, data, err in ex.map(collect, players):
            done += 1
            if err:
                result['errors'][pid] = err
                result['missing'].append(pid)
            elif not data['seasons']:
                result['missing'].append(pid)
                result['players'][pid] = data
            else:
                result['players'][pid] = data
            if done % 25 == 0:
                print(f'{done}/{len(players)}', flush=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding='utf-8')
    with_data = sum(1 for p in result['players'].values() if p['seasons'])
    print(f'players with data: {with_data}, missing: {len(result["missing"])}, errors: {len(result["errors"])}')


if __name__ == '__main__':
    main()
