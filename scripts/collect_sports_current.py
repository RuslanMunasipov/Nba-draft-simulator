#!/usr/bin/env python3
"""Collect the live Sports.ru fantasy state of every player in the transfer pool.

Source: the public Sports.ru fantasy player popup (no login needed)
  https://www.sports.ru/fantasy/basketball/player/info/150/<sportsId>.html
It shows the current and initial price, the role ("Амплуа"), the share of
Sports.ru users who own the player, the club calendar with official fantasy
week numbers and, once the season has started, the per-game table of the
current season with the official fantasy points ("ФО") and the price after
each game ("С"). Nothing is estimated here.

Usage: collect_sports_current.py [output.json]
"""
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRICES = ROOT / 'data' / 'sports-prices-2026-10-17.json'
ADDITIONS = ROOT / 'data' / 'sports-market-additions.json'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'public' / 'data' / 'sports-current.json'
TOURNAMENT = 150
BASE_URL = 'https://www.sports.ru/fantasy/basketball/player/info/{t}/{pid}.html'
SEASON_URL = BASE_URL + '?s={sid}'
SEASON_LABEL = '2026/2027'
INJURY_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries'
TEAMS = ROOT / 'data' / 'fbl-sports-teams.json'
TEAM_URL = 'https://www.sports.ru/fantasy/basketball/team/{id}.html'
JOURNAL_URL = 'https://www.sports.ru/fantasy/basketball/team/journal/{id}.html'
ROSTER_URL = 'https://www.sports.ru/fantasy/basketball/team/points/{id}/0.json'
AMPLUA = {'1': 'PG', '2': 'SG', '3': 'SF', '4': 'PF', '5': 'C'}
# Below these shares of the pool a collection is a broken page layout, not data: nothing is published.
MIN_COLLECTED, MIN_PRICED = 0.9, 0.9
UA = 'Mozilla/5.0 (compatible; fbl-draft-simulator/1.0; season tracker)'
# Four parallel requests with a short pause each: about 960 pages every two hours, gentle on Sports.ru.
WORKERS = 4
PAUSE = 0.25
ROLES = {'Разыгрывающий защитник': 'PG', 'Разыгрывающий': 'PG', 'Атакующий защитник': 'SG', 'Лёгкий форвард': 'SF', 'Легкий форвард': 'SF',
         'Тяжёлый форвард': 'PF', 'Тяжелый форвард': 'PF', 'Центровой': 'C'}


def fetch(url):
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ru'})
            with urllib.request.urlopen(req, timeout=20) as r:
                body = r.read().decode('utf-8', 'replace')
            time.sleep(PAUSE)
            return body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            last = e
            if e.code == 429:  # rate limited: back off longer before the next attempt
                time.sleep(15 * (attempt + 1))
        except Exception as e:  # noqa: BLE001
            last = e
        time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f'{url}: {last}')


def text(page):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', page))).strip()


def cell(c):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', c))).strip()


def iso(d):
    day, month, year = d.split('.')
    return f'{year}-{month}-{day}'


def number(value):
    try:
        return float(value.replace(',', '.'))
    except (AttributeError, ValueError):
        return None


def parse_info(page):
    t = text(page)
    out = {}
    m = re.search(r'Амплуа (.+?) Текущая стоимость', t)
    if m:
        out['role'] = m.group(1).strip()
        out['position'] = ROLES.get(out['role'])
    for key, label in (('price', 'Текущая стоимость'), ('initialPrice', 'Первоначальная стоимость')):
        m = re.search(label + r' (\d+)', t)
        if m:
            out[key] = int(m.group(1))
    m = re.search(r'Выбрали ([\d.,]+)%', t)
    if m:
        out['ownedShare'] = number(m.group(1)) / 100
    m = re.search(r'Команда (.+?) \(номер', t) or re.search(r'Команда (.+?) Амплуа', t)
    if m:
        out['club'] = m.group(1).strip()
    m = re.search(r'<h1[^>]*>\s*(?:<b>)?([^<]+)', page)
    if m:
        out['fullName'] = html.unescape(m.group(1)).strip()
    return out


def parse_calendar(page):
    i = page.find('id="calendar"')
    if i < 0:
        return []
    block = page[i:page.find('</table>', i)]
    games = []
    for row in re.findall(r'<tr>(.*?)</tr>', block, re.S):
        m = re.search(r'(\d\d\.\d\d\.\d{4})<span class="sp">\|</span>\s*неделя (\d+)', row)
        if not m:
            continue
        cs = [cell(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]
        games.append({'date': iso(m.group(1)), 'week': int(m.group(2)), 'opponent': cs[1] if len(cs) > 1 else '',
                      'home': len(cs) > 2 and cs[2].startswith('Д'),
                      'score': cs[3].replace(' ', '') if len(cs) > 3 and re.search(r'\d', cs[3]) else None})
    return games


def season_id(page, label=SEASON_LABEL):
    sel = re.search(r'<select[^>]*id="slt"[^>]*>(.*?)</select>', page, re.S)
    if not sel:
        return None
    for sid, name in re.findall(r'<option value="(\d+)"[^>]*>\s*([^<]+?)\s*</option>', sel.group(1)):
        if name == label:
            return sid
    return None


def parse_games(page, season_start='2026-10-01'):
    m = re.search(r'<table class="stat-table small".*?</table>', page, re.S)
    if not m:
        return []
    rows = re.findall(r'<tr>(.*?)</tr>', m.group(0), re.S)
    if not rows:
        return []
    head = [cell(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', rows[0], re.S)]
    if 'ФО' not in head or 'МИН' not in head:
        return []
    col = {name: i for i, name in enumerate(head)}
    games = []
    for row in rows[1:]:
        cs = [cell(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]
        if len(cs) <= col['ФО'] or not re.fullmatch(r'\d\d\.\d\d\.\d{4}', cs[0]):
            continue
        day = iso(cs[0])
        if day < season_start:
            continue
        minutes = cs[col['МИН']]
        played = minutes not in ('', '00:00', '–', '-')
        points = number(cs[col['ФО']])
        if points is None and played:
            continue  # an unreadable score is left out, never counted as zero
        game = {'date': day, 'opponent': cs[1], 'home': cs[2].startswith('Д'), 'minutes': minutes if played else '00:00',
                'points': points or 0, 'played': played}
        if 'С' in col and len(cs) > col['С']:
            price = number(cs[col['С']])
            if price is not None:
                game['price'] = int(price)
        games.append(game)
    games.sort(key=lambda g: g['date'])
    return games


def collect(player):
    pid = player['sportsId']
    page = fetch(BASE_URL.format(t=TOURNAMENT, pid=pid))
    if page is None:
        return pid, None, None
    info = parse_info(page)
    info['name'] = player.get('name')
    info['clubId'] = player.get('clubId')
    games = parse_games(page)
    if not games:
        sid = season_id(page)
        if sid:
            season_page = fetch(SEASON_URL.format(t=TOURNAMENT, pid=pid, sid=sid))
            games = parse_games(season_page) if season_page else []
    info['games'] = games
    return pid, info, parse_calendar(page)


def espn_injuries():
    """ESPN injury report trimmed to what the app reads; a fallback when the browser cannot reach ESPN."""
    try:
        feed = json.loads(fetch(INJURY_URL))
    except Exception as e:  # noqa: BLE001
        print(f'ESPN injuries unavailable: {e}')
        return None
    teams = []
    for team in feed.get('injuries', []):
        rows = []
        for i in team.get('injuries', []):
            links = (i.get('athlete') or {}).get('links') or []
            details = i.get('details') or {}
            rows.append({'status': i.get('status'), 'shortComment': i.get('shortComment', ''), 'date': i.get('date'),
                         'athlete': {'displayName': (i.get('athlete') or {}).get('displayName'),
                                     'links': [{'href': links[0].get('href')}] if links else []},
                         'details': {'returnDate': details.get('returnDate'), 'type': details.get('type'),
                                     'fantasyStatus': {'abbreviation': (details.get('fantasyStatus') or {}).get('abbreviation', '')}}})
        teams.append({'displayName': team.get('displayName'), 'injuries': rows})
    return {'source': INJURY_URL, 'fetchedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'injuries': teams}


def parse_team(page):
    """Public Sports.ru team profile: name, place, team value, money left and transfers left."""
    out = {}
    m = re.search(r'<h1[^>]*>\s*(?:<b>)?([^<]+)', page)
    if m:
        out['name'] = html.unescape(m.group(1)).strip()
    for key, label in (('value', 'Стоимость команды'), ('balance', 'Баланс'), ('transfersLeft', 'Трансферы')):
        m = re.search(r'<th>' + label + r'</th>\s*<td>\s*(-?\d+)', page)
        if m:
            out[key] = int(m.group(1))
    m = re.search(r'<th>Место</th>\s*<td>\s*(\d+) из (\d+)', page)
    if m:
        out['place'], out['of'] = int(m.group(1)), int(m.group(2))
    m = re.search(r'<th>Текущая неделя</th>\s*<td>([^<]+)', page)
    if m:
        out['week'] = html.unescape(m.group(1)).strip()
    return out


def parse_journal(page):
    """Transfer journal rows, oldest first: {date, buy:{name,price}, sell:{name,price}|None}."""
    m = re.search(r'<td>Покупки</td>.*?<tbody>(.*?)</tbody>', page, re.S)
    if not m:
        return []
    def side(c):
        mm = re.search(r'(?:куплен|продан)\s+(.+?)\s+за\s+(\d+)', cell(c))
        return {'name': mm.group(1), 'price': int(mm.group(2))} if mm else None
    rows = []
    for row in re.findall(r'<tr>(.*?)</tr>', m.group(1), re.S):
        cs = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
        if len(cs) < 2 or not re.fullmatch(r'\d\d\.\d\d\.\d\d', cell(cs[0])):
            continue
        d, mth, y = cell(cs[0]).split('.')
        rows.append({'date': f'20{y}-{mth}-{d}', 'buy': side(cs[1]), 'sell': side(cs[2]) if len(cs) > 2 else None})
    # The page lists newest first.
    return rows[::-1]


def parse_roster(raw):
    """Sports.ru team roster JSON: the exact player ids, so names never have to be guessed."""
    out = []
    for p in json.loads(raw).get('players', []):
        out.append({'sportsId': str(p['id']), 'name': p.get('name'), 'club': p.get('club'), 'position': AMPLUA.get(str(p.get('amplua'))),
                    'price': int(p['price']) if str(p.get('price', '')).isdigit() else None, 'locked': str(p.get('lock')) not in ('0', '', 'None')})
    return out


def collect_teams(previous=None, errors=None):
    """Profile, journal and roster of every FBL team. A team whose pages fail keeps its previous entry, and a journal
    shorter than the published one is a failed parse, never a reversal of transfers."""
    previous, errors = previous or {}, errors if errors is not None else []
    try:
        config = json.loads(TEAMS.read_text(encoding='utf-8')).get('teams', {})
    except FileNotFoundError:
        return {}
    teams = {}
    for team, sid in config.items():
        old = previous.get(team)
        try:
            profile, journal, roster = fetch(TEAM_URL.format(id=sid)), fetch(JOURNAL_URL.format(id=sid)), fetch(ROSTER_URL.format(id=sid))
            if profile is None or journal is None:
                raise RuntimeError('page not found')
            entry = {'sportsTeamId': sid, **parse_team(profile), 'journal': parse_journal(journal)}
            if roster:
                entry['roster'] = parse_roster(roster)
        except Exception as e:  # noqa: BLE001
            errors.append({'team': team, 'error': str(e)[:200]})
            print(f'Sports.ru team {sid}: {e}')
            if old:
                teams[team] = {**old, 'stale': True}
            continue
        if old and len(entry['journal']) < len(old.get('journal') or []):
            errors.append({'team': team, 'error': f"journal shrank from {len(old['journal'])} to {len(entry['journal'])} rows; kept the previous one"})
            entry['journal'] = old['journal']
        if 'balance' not in entry or 'transfersLeft' not in entry:
            errors.append({'team': team, 'error': 'team profile without balance or transfers; layout changed?'})
            for key in ('balance', 'transfersLeft', 'value'):
                if key not in entry and old and key in old:
                    entry[key] = old[key]
        teams[team] = entry
    return teams


def week_ranges(calendars):
    """Sports.ru game weeks by the week number of each calendar game (Moscow dates, so a US Monday-Sunday week shows as
    Tuesday-Monday). Each week runs from the day after the previous week's last game to its own last game."""
    weeks = {}
    for games in calendars:
        for g in games:
            weeks.setdefault(g['week'], []).append(g['date'])
    out, previous_end = {}, None
    for week, days in sorted(weeks.items()):
        start = (date.fromisoformat(previous_end) + timedelta(days=1)).isoformat() if previous_end else min(days)
        out[str(week)] = {'start': start, 'end': max(days)}
        previous_end = max(days)
    return out


def quality(pool, players):
    """Shares of the pool collected and carrying a price and a position: a page redesign shows up here, not as empty data."""
    collected = len(players) / max(1, len(pool))
    priced = sum(1 for p in players.values() if isinstance(p.get('price'), int) and p.get('position')) / max(1, len(pool))
    return collected, priced


def main():
    pool = json.loads(PRICES.read_text(encoding='utf-8'))['players'] + json.loads(ADDITIONS.read_text(encoding='utf-8'))['players']
    try:
        previous = json.loads(OUT.read_text(encoding='utf-8'))
    except (FileNotFoundError, ValueError):
        previous = {}
    errors = []
    teams = collect_teams(previous.get('teams'), errors)
    # Players new to the Sports.ru market reach the pool through FBL rosters: their exact ids come with the roster JSON.
    known = {p['sportsId'] for p in pool}
    for entry in teams.values():
        for r in entry.get('roster', []):
            if r['sportsId'] not in known:
                known.add(r['sportsId'])
                pool.append({'sportsId': r['sportsId'], 'name': r['name'], 'club': r['club'], 'marketAddition': 'FBL_ROSTER'})
    players, calendars = {}, {}
    with ThreadPoolExecutor(WORKERS) as ex:
        futures = [ex.submit(collect, p) for p in pool]
        for p, f in zip(pool, futures):
            try:
                pid, info, calendar = f.result()
            except Exception as e:  # noqa: BLE001
                errors.append({'sportsId': p['sportsId'], 'error': str(e)[:200]})
                continue
            if info is None:
                errors.append({'sportsId': pid, 'error': 'page not found'})
                continue
            if p.get('marketAddition'):
                info['marketAddition'] = p['marketAddition']
            players[pid] = info
            club = info.get('club') or p.get('club')
            if calendar and club:
                key = json.dumps(calendar, ensure_ascii=False, sort_keys=True)
                votes = calendars.setdefault(club, {})
                votes[key] = votes.get(key, 0) + 1
    # A traded player's page can carry another club's calendar: each club keeps the one most of its players show.
    clubs = {club: json.loads(max(votes, key=votes.get)) for club, votes in calendars.items()}
    collected, priced = quality(pool, players)
    if collected < MIN_COLLECTED or priced < MIN_PRICED:
        raise SystemExit(f'Only {collected:.0%} of {len(pool)} Sports.ru players collected and {priced:.0%} with a price and position; '
                         'refusing to publish.')
    out_injuries = espn_injuries()
    out = {'source': BASE_URL.format(t=TOURNAMENT, pid='<sportsId>'), 'season': SEASON_LABEL,
           'collectedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'weeks': week_ranges(clubs.values()), 'clubs': clubs, 'players': players, 'teams': teams, 'errors': errors}
    if out_injuries:
        out['espnInjuries'] = out_injuries
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    played = sum(1 for p in players.values() for g in p['games'] if g['played'])
    print(f'Sports.ru: {len(players)} players, {len(clubs)} club calendars, {played} played games, {len(errors)} errors -> {OUT}')


if __name__ == '__main__':
    main()
