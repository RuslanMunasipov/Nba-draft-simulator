#!/usr/bin/env python3
"""Sports.ru fantasy prices of past seasons, game by game: the price the transfer-advice backtest
(scripts/transfer_backtest.mjs) buys and sells at, on the day it decides.

Source: the Sports.ru fantasy player popup of a season,
  https://www.sports.ru/fantasy/basketball/player/info/150/<sportsId>.html?s=<seasonId>
whose game table ends with the column «С» (the price after that game; rows of games he missed, 00:00, keep the price)
and whose card shows «Первоначальная стоимость» (the season's opening price). Players are those of
data/sports-player-map.json (Sports.ru's 2026/27 market with their NBA ids): a player Sports.ru no longer lists has no
history here, and the backtest prices him by the model fitted on these (scripts/transfer_backtest_inputs.py).
Only prices and whether he played are kept; Sports.ru's ФО are never FBL points and are not stored.

Output data/sports-price-history.json, per season and NBA id: sportsId, the opening price `open`, and the games as
`days` (days since the season's first date, seasonStart; Sports.ru's dates are Moscow dates, so a US evening game is a
day later), `prices` and `played` ("1"/"0" per game). What the prices show (tests/test_price_injury_history.py): a game
adds its Sports.ru fantasy points to the price (about 1.05 x its FBL points), a missed game nothing.
Usage: collect_sports_price_history.py [sportsId ...]
"""
import html
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MAP = ROOT / 'data' / 'sports-player-map.json'
OUT = ROOT / 'data' / 'sports-price-history.json'
URL = 'https://www.sports.ru/fantasy/basketball/player/info/150/{pid}.html?s={sid}'
# The seasons' ids in the popup's own season selector.
SEASONS = {'2023-24': ('666688', '2023-10-24'), '2024-25': ('1014621', '2024-10-22'), '2025-26': ('1317725', '2025-10-21')}
UA = 'Mozilla/5.0 (compatible; fbl-draft-simulator/1.0; research)'
NOTES = ('«С» after each game of the regular-season log (a missed game, 00:00, keeps it); open: «Первоначальная стоимость». '
         'days: since the season\'s first date (seasonStart), in Sports.ru\'s Moscow dates. Players of sports-player-map.json only.')


def fetch(url):
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ru'})
            with urllib.request.urlopen(req, timeout=25) as r:
                return r.read().decode('utf-8', 'replace')
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(2 * (attempt + 1))
    raise RuntimeError(f'{url}: {last}')


def cell(c):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', c))).strip()


def card(page, label):
    m = re.search(rf'<th>{label}</th>\s*<td>\s*([\d\s]+)\s*</td>', page)
    return int(m.group(1).replace(' ', '')) if m else None


def parse(page, start):
    """(opening price, [(day, price, played)]) of a season page, oldest game first; None without a game table."""
    m = re.search(r'<table class="stat-table small".*?</table>', page, re.S)
    if not m:
        return None
    rows = re.findall(r'<tr>(.*?)</tr>', m.group(0), re.S)
    head = [cell(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', rows[0], re.S)] if rows else []
    if 'С' not in head or 'МИН' not in head:
        return None
    i_date, i_min, i_price = 0, head.index('МИН'), head.index('С')
    games = []
    for r in rows[1:]:
        cs = [cell(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', r, re.S)]
        if len(cs) <= i_price or not re.fullmatch(r'\d\d\.\d\d\.\d{4}', cs[i_date]) or not cs[i_price].isdigit():
            continue
        d, mo, y = cs[i_date].split('.')
        day = (date(int(y), int(mo), int(d)) - start).days
        games.append((day, int(cs[i_price]), cs[i_min] not in ('', '00:00', '–', '-')))
    games.sort()
    return card(page, 'Первоначальная стоимость'), games


def collect(player):
    out = {}
    for season, (sid, first) in SEASONS.items():
        page = fetch(URL.format(pid=player['sportsId'], sid=sid))
        got = parse(page, date.fromisoformat(first)) if page else None
        if not got or not got[1]:
            continue
        opening, games = got
        out[season] = dict(sportsId=player['sportsId'], open=opening, days=[g[0] for g in games], prices=[g[1] for g in games],
                           played=''.join('1' if g[2] else '0' for g in games))
    return player, out


def main():
    players = [p for p in json.loads(MAP.read_text(encoding='utf-8'))['players'] if p.get('nbaId')]
    ids = [a for a in sys.argv[1:] if not a.startswith('--')]
    if ids:
        players = [p for p in players if p['sportsId'] in ids]
    result = dict(source=URL.format(pid='<sportsId>', sid='<seasonId>'),
                  capturedAt=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
                  notes=NOTES,
                  seasons={s: dict(seasonId=sid, seasonStart=first, players={}) for s, (sid, first) in SEASONS.items()}, errors={})
    done = 0
    with ThreadPoolExecutor(8) as ex:
        futures = [ex.submit(collect, p) for p in players]
        for f in futures:
            try:
                player, seasons = f.result()
            except Exception as e:  # noqa: BLE001
                result['errors'][str(len(result['errors']))] = str(e)
                continue
            for s, v in seasons.items():
                result['seasons'][s]['players'][str(player['nbaId'])] = v
            done += 1
            if done % 50 == 0:
                print(f'{done}/{len(players)}', flush=True)
    OUT.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print({s: len(v['players']) for s, v in result['seasons'].items()}, 'errors', len(result['errors']))


if __name__ == '__main__':
    main()
