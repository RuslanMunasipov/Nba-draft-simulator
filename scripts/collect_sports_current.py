#!/usr/bin/env python3
"""Collect the live Sports.ru fantasy state of every player in the transfer pool.

Source: the public Sports.ru fantasy player popup (no login needed)
  https://www.sports.ru/fantasy/basketball/player/info/150/<sportsId>.html
It shows the current and initial price, the role ("Амплуа"), the share of
Sports.ru users who own the player, the club calendar with official fantasy
week numbers and, once the season has started, the per-game table of the
current season with each game's box score, Sports.ru's own fantasy points ("ФО", never FBL's) and the price after
each game ("С"). FBL points of a game are the league's Yahoo formula on that box score. Nothing is estimated here.
ESPN adds the injury report and the tip-off time of every calendar game (its team schedules).

Usage: collect_sports_current.py [output.json]
"""
import gzip
import html
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
try:
    from fbl_formula import GAME_PLAYED, fbl_points, sports_participation
except ImportError:
    from scripts.fbl_formula import GAME_PLAYED, fbl_points, sports_participation

ROOT = Path(__file__).resolve().parent.parent
PRICES = ROOT / 'data' / 'sports-prices-2026-10-17.json'
ADDITIONS = ROOT / 'data' / 'sports-market-additions.json'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'public' / 'data' / 'sports-current.json'
TOURNAMENT = 150
BASE_URL = 'https://www.sports.ru/fantasy/basketball/player/info/{t}/{pid}.html'
SEASON_URL = BASE_URL + '?s={sid}'
SEASON_LABEL = '2026/2027'
INJURY_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries'
SCHEDULE_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/{abbr}/schedule?season={year}&seasontype=2'
# ESPN's box score of a game: the source of every played game's FBL points (league owner, 22.10.2026). Sports.ru's game
# table differs from the NBA's official line now and then (Paul George, 20.10: 4 fouls there, 5 at ESPN and the NBA).
SUMMARY_URL = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event={id}'
# The box scores already read, kept beside the snapshot (data/season-live); a copy built elsewhere starts from that one.
ESPN_BOX_RAW = 'https://raw.githubusercontent.com/RuslanMunasipov/Nba-draft-simulator/data/season-live/espn-box.json'
# ESPN corrects a box score for a day or two after the game: finals this recent are read again at every collection.
BOX_REFRESH_DAYS = 3
PLAYER_MAP = ROOT / 'data' / 'sports-player-map.json'
# Row sources that carry FBL points: ESPN's box score of the game, or the Sports.ru row's own.
SCORED = ('ESPN', 'BOX')
# Sports.ru club names and ESPN's team abbreviations, for the tip-off times of ESPN's team schedules.
ESPN_ABBR = {'Атланта': 'ATL', 'Бостон': 'BOS', 'Бруклин': 'BKN', 'Шарлотт': 'CHA', 'Чикаго': 'CHI', 'Кливленд': 'CLE', 'Даллас': 'DAL',
             'Денвер': 'DEN', 'Детройт': 'DET', 'Голден Стэйт': 'GS', 'Хьюстон': 'HOU', 'Индиана': 'IND', 'Клипперс': 'LAC', 'Лейкерс': 'LAL',
             'Мемфис': 'MEM', 'Майами': 'MIA', 'Милуоки': 'MIL', 'Миннесота': 'MIN', 'Новый Орлеан': 'NO', 'Нью-Йорк': 'NY',
             'Оклахома-Сити': 'OKC', 'Орландо': 'ORL', 'Филадельфия': 'PHI', 'Финикс': 'PHX', 'Портленд': 'POR', 'Сакраменто': 'SAC',
             'Сан-Антонио': 'SA', 'Торонто': 'TOR', 'Юта': 'UTAH', 'Вашингтон': 'WSH'}
LEAGUE_RULES = ROOT / 'data' / 'league-rules.json'
TEAMS = ROOT / 'data' / 'fbl-sports-teams.json'
TEAM_URL = 'https://www.sports.ru/fantasy/basketball/team/{id}.html'
JOURNAL_URL = 'https://www.sports.ru/fantasy/basketball/team/journal/{id}.html'
ROSTER_URL = 'https://www.sports.ru/fantasy/basketball/team/points/{id}/0.json'
AMPLUA = {'1': 'PG', '2': 'SG', '3': 'SF', '4': 'PF', '5': 'C'}
# Below these shares of the pool a collection is a broken page layout, not data: nothing is published.
MIN_COLLECTED, MIN_PRICED = 0.9, 0.9
# The same for games: the club calendars of fewer than MIN_CLUBS of the 30 clubs, a tenth of the upcoming calendar games
# or of the played games of the same players gone since the previous snapshot, or game tables without points or minutes.
MIN_CLUBS, MIN_KEPT = 28, 0.9
# A failed ESPN injury fetch keeps the previous report this long (its own fetchedAt shows its age), never an empty one.
INJURY_KEEP_HOURS = 72
UA = 'Mozilla/5.0 (compatible; fbl-draft-simulator/1.0; season tracker)'
# Four parallel requests with a short pause each: about 960 pages every two hours, gentle on Sports.ru.
WORKERS = 4
PAUSE = 0.25
ROLES = {'Разыгрывающий защитник': 'PG', 'Разыгрывающий': 'PG', 'Атакующий защитник': 'SG', 'Лёгкий форвард': 'SF', 'Легкий форвард': 'SF',
         'Тяжёлый форвард': 'PF', 'Тяжелый форвард': 'PF', 'Центровой': 'C'}


def fetch(url, compressed=False):
    """A page's text, None when it does not exist. compressed asks for gzip (ESPN's schedules are 25 times smaller so)."""
    last = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Language': 'ru', **({'Accept-Encoding': 'gzip'} if compressed else {})})
            with urllib.request.urlopen(req, timeout=20) as r:
                raw = r.read()
                body = (gzip.decompress(raw) if r.headers.get('Content-Encoding') == 'gzip' else raw).decode('utf-8', 'replace')
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


def season_end(rules=LEAGUE_RULES):
    """The Moscow date of the last games Yahoo scores: its scoringEnd is a US date, whose evening games Sports.ru files a
    day later. The game table goes on with play-in rows (minutes played, ФО 0), which are no FBL games: the cut is by
    date, never by zero points (real cameos score 0 too)."""
    try:
        end = json.loads(Path(rules).read_text(encoding='utf-8'))['yahoo']['scoringEnd']
        return (date.fromisoformat(end) + timedelta(days=1)).isoformat()
    except (OSError, ValueError, KeyError, TypeError):
        return None


SEASON_END = season_end()
# The FBL formula's inputs as the game table heads them (Sports.ru writes two-point attempts «В20», with a zero).
BOX = {'fgm2': ('2О',), 'fga2': ('В20', 'В2О'), 'fgm3': ('3О',), 'fga3': ('В3О',), 'ftm': ('Ш',), 'fta': ('ВШ',), 'pts': ('О',),
       'reb': ('ПБ',), 'ast': ('ПР',), 'stl': ('ПХ',), 'blk': ('БШ',), 'tov': ('П',), 'pf': ('Ф',)}
FORMULA = ("FBL (Yahoo): PTS+REB+AST+STL+BLK-(FGA-FGM)-(FTA-FTM)-2*TOV-PF+1 per game played, on ESPN's box score of the game "
           "(pointsSource ESPN), the only source of FBL points (league owner, 22.10.2026). A played Sports.ru row ESPN has no line "
           "for yet has no points (AWAITING_ESPN); the Sports.ru game table's own box score (2О+3О of В20+В3О, Ш of ВШ, О, ПБ, ПР, "
           "ПХ, БШ, П, Ф) is kept as sportsBoxPoints for the reconciliation only")


def box_stats(cs, col):
    """The game table row's box score in the formula's terms (pts, reb, ast, stl, blk, tov, pf, fgm, fga, ftm, fta), None
    when a column is missing or unreadable."""
    v = {}
    for key, names in BOX.items():
        i = next((col[n] for n in names if n in col), None)
        x = number(cs[i]) if i is not None and len(cs) > i else None
        if x is None:
            return None
        v[key] = x
    fgm, fga = v.pop('fgm2') + v.pop('fgm3'), v.pop('fga2') + v.pop('fga3')
    return dict(v, fgm=fgm, fga=fga)


def box_points(cs, col):
    """FBL points of a game from its own box score: PTS+REB+AST+STL+BLK-(FGA-FGM)-(FTA-FTM)-2*TOV-PF, plus 1 for the game
    played (Yahoo GP, league settings 21.10.2026). None when a column is missing or unreadable."""
    v = box_stats(cs, col)
    return None if v is None else fbl_points(v)


def row_points(game, cs, col, sports):
    """A played game's FBL points: the league's formula on its own row's box score (pointsSource BOX). Sports.ru's points
    (ФО, sports) stay as sportsPoints and are never FBL's: they carry Sports.ru's team result bonus and its +2 for 10+
    minutes, and stay 0 for hours after the game while its box score is already listed. A row without a readable box
    score gets no points (NO_BOX), never Sports.ru's points less bonuses: consumers leave it out, and refuse_reason
    refuses a collection with many. The row's score, written home side first («118 : 128» away is a win), gives the
    result and checks Sports.ru's line: once Sports.ru counts the game its points are the box score plus that bonus and
    that point. A row where they differ is MISMATCH (the box score stands); one whose ФО is still 0 or no number is
    UNCOUNTED, its box line Sports.ru's provisional one."""
    i = next((col[n] for n in ('Счет', 'Счёт') if n in col), None)
    score = parse_score(cs[i]) if i is not None and len(cs) > i else None
    won = None if not score or score[0] == score[1] else (score[0] > score[1] if game['home'] else score[1] > score[0])
    stats = box_stats(cs, col)
    box = None if stats is None else fbl_points(stats)
    if stats is not None:
        game['sportsBox'] = stats
    game['sportsPoints'] = sports
    if won is not None:
        game['result'] = 'W' if won else 'L'
    game['points'], game['pointsSource'] = (round(box, 2), 'BOX') if box is not None else (None, 'NO_BOX')
    if box is not None and (sports is None or won is not None and round(sports - box, 2) != result_bonus(game['home'], won) + minutes_extra(game['minutes'])):
        game['pointsCheck'] = 'MISMATCH' if sports else 'UNCOUNTED'
    return game


def game_table(page):
    """The game table's rows and its head, or None without one."""
    m = re.search(r'<table class="stat-table small".*?</table>', page or '', re.S)
    rows = re.findall(r'<tr>(.*?)</tr>', m.group(0), re.S) if m else []
    return (rows, [cell(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', rows[0], re.S)]) if rows else None


def unreadable_games(page):
    """A game table with dated rows but without the points or the minutes column: a layout change, not «no games yet»."""
    table = game_table(page)
    return bool(table) and ('ФО' not in table[1] or 'МИН' not in table[1]) and any(
        re.search(r'<td[^>]*>\s*\d\d\.\d\d\.\d{4}', row) for row in table[0][1:])


def parse_games(page, season_start='2026-10-01', season_end=SEASON_END):
    table = game_table(page)
    if not table:
        return []
    rows, head = table
    if 'ФО' not in head or 'МИН' not in head:
        return []
    col = {name: i for i, name in enumerate(head)}
    games = []
    for row in rows[1:]:
        cs = [cell(c) for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]
        if len(cs) <= col['ФО'] or not re.fullmatch(r'\d\d\.\d\d\.\d{4}', cs[0]):
            continue
        day = iso(cs[0])
        if day < season_start or (season_end and day > season_end):
            continue
        minutes = cs[col['МИН']]
        played = minutes not in ('', '00:00', '–', '-')
        # Sports.ru's ФО is no FBL input: a played row whose ФО is no number still counts by its box score.
        points = number(cs[col['ФО']])
        game = {'date': day, 'opponent': cs[1], 'home': cs[2].startswith('Д'), 'minutes': minutes if played else '00:00',
                'points': points or 0, 'played': played}
        if played:
            row_points(game, cs, col, points)
        if 'С' in col and len(cs) > col['С']:
            price = number(cs[col['С']])
            if price is not None:
                game['price'] = int(price)
        games.append(game)
    games.sort(key=lambda g: g['date'])
    return games


def parse_score(text):
    """A score as two numbers in the order written ('112:104', an overtime mark ignored); None before the game."""
    m = re.search(r'(\d+)\s*:\s*(\d+)', text or '')
    return (int(m.group(1)), int(m.group(2))) if m else None


def minutes_extra(minutes):
    """What Sports.ru's minutes rule adds over FBL's 1 per game played: +1 for 10 minutes or more («MM:SS»)."""
    m = re.match(r'(\d+)', minutes or '')
    return sports_participation(int(m.group(1)) if m else 0) - GAME_PLAYED


def result_bonus(home, won):
    """Sports.ru's team result bonus: +2/+3 for a home/away win, -3/-2 for a home/away loss."""
    return (2 if home else 3) if won else (-3 if home else -2)


def unscored(games):
    """Played rows of an earlier snapshot whose points are not the box score's: an older collector's (no pointsSource:
    Sports.ru's ФО, or ФО less its result bonus) or ФО less bonuses (ROW_SCORE, CALENDAR, SPORTS_WITH_BONUS). Without the
    page they cannot be scored again, so Sports.ru's number stays as sportsPoints and they get no points (NO_BOX)."""
    for g in games or []:
        if g.get('played') and (g.get('pointsSource') not in SCORED or not isinstance(g.get('points'), (int, float))):
            g['sportsPoints'] = g.get('sportsPoints', g.get('points'))
            g['points'], g['pointsSource'] = None, 'NO_BOX'
            g.pop('pointsCheck', None)
    return games


def keep_games(players, previous):
    """What the previous snapshot of this season read where this collection could not: a player whose game table is gone
    or unreadable (no games now, played ones before) keeps the previous games, marked gamesKeptFrom, and a played row
    without a readable box score keeps the box-score points the previous snapshot gave the same row (date, opponent),
    marked pointsKeptFrom. Published empty or unscored, his season total and every standing would lose those points till
    the next collection. Rows the previous snapshot did not score from a box score stay unscored. Runs after
    refuse_reason: a layout change of many pages is refused, never masked by old data. Returns the players kept whole."""
    previous = previous or {}
    old = (previous.get('players') or {}) if previous.get('season') == SEASON_LABEL else {}
    at, kept = previous.get('collectedAt'), []
    for sid, info in players.items():
        was = [dict(g) for g in (old.get(sid) or {}).get('games') or [] if not SEASON_END or g.get('date', '') <= SEASON_END]
        if not info.get('games') and any(g.get('played') for g in was):
            info['games'], info['gamesKeptFrom'] = unscored(was), (old[sid].get('gamesKeptFrom') or at)
            kept.append(sid)
            continue
        box = {(g.get('date'), g.get('opponent')): g for g in was if g.get('played') and g.get('pointsSource') in SCORED}
        for g in info.get('games') or []:
            o = box.get((g['date'], g.get('opponent'))) if g.get('played') and g.get('pointsSource') == 'NO_BOX' else None
            if o and isinstance(o.get('points'), (int, float)):
                g['points'], g['pointsSource'], g['pointsKeptFrom'] = o['points'], o['pointsSource'], o.get('pointsKeptFrom') or at
    return kept


def game_points_summary(players):
    """What the published game points rest on: played games by source (BOX: the league's formula on the row's box score;
    NO_BOX: none readable, no points), those whose result is known, those without points, the rows Sports.ru has not
    counted yet (its box line provisional) and those whose box score and Sports.ru's counted points disagree."""
    games = [g for p in players.values() for g in p.get('games') or [] if g.get('played')]
    sources = Counter(g.get('pointsSource') or 'UNMARKED' for g in games)
    checks = Counter(g.get('pointsCheck') for g in games)
    return {'played': len(games), 'sources': dict(sorted(sources.items())), 'gamesWithResult': sum(1 for g in games if g.get('result')),
            'gamesWithoutBox': sum(1 for g in games if g.get('pointsSource') not in SCORED), 'awaitingEspn': sources.get('AWAITING_ESPN', 0),
            'uncounted': checks['UNCOUNTED'],
            'mismatches': checks['MISMATCH'], 'seasonEnd': SEASON_END}


def collect(player):
    pid = player['sportsId']
    page = fetch(BASE_URL.format(t=TOURNAMENT, pid=pid))
    if page is None:
        return pid, None, None
    info = parse_info(page)
    info['name'] = player.get('name')
    info['clubId'] = player.get('clubId')
    games, pages = parse_games(page), [page]
    if not games:
        sid = season_id(page)
        if sid:
            season_page = fetch(SEASON_URL.format(t=TOURNAMENT, pid=pid, sid=sid))
            games = parse_games(season_page) if season_page else []
            pages.append(season_page)
    info['games'] = games
    if not games and any(unreadable_games(p) for p in pages):
        info['gameTable'] = 'UNREADABLE'
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
                         'details': {'returnDate': details.get('returnDate'), 'type': details.get('type'), 'detail': details.get('detail'),
                                     'side': details.get('side'), 'location': details.get('location'),
                                     'fantasyStatus': {'abbreviation': (details.get('fantasyStatus') or {}).get('abbreviation', '')}}})
        teams.append({'displayName': team.get('displayName'), 'injuries': rows})
    if not any(team['injuries'] for team in teams):
        # The NBA always has injured players: an empty report is a broken feed, which must not read as «all healthy».
        print('ESPN injuries unavailable: the report lists nobody')
        return None
    return {'source': INJURY_URL, 'fetchedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'injuries': teams}


def keep_injuries(feed, previous, now, max_hours=INJURY_KEEP_HOURS):
    """The ESPN injury report to publish and whether it was fetched now. A failed fetch keeps the previous snapshot's
    report, with its own fetchedAt, for up to max_hours: never an empty report, which reads as «everyone healthy»."""
    if feed:
        return feed, True
    old = (previous or {}).get('espnInjuries')
    try:
        age = (datetime.fromisoformat(now) - datetime.fromisoformat(old['fetchedAt'])).total_seconds() / 3600
    except (TypeError, KeyError, ValueError):
        return None, False
    return (old, False) if age <= max_hours else (None, False)


def espn_schedules(year=SEASON_LABEL[-4:]):
    """ESPN's regular-season schedule of every club, {abbreviation: JSON}. A club whose page fails is left out (the other
    club of each of its games has it too)."""
    def one(abbr):
        try:
            return abbr, json.loads(fetch(SCHEDULE_URL.format(abbr=abbr.lower(), year=year), compressed=True) or 'null')
        except Exception as e:  # noqa: BLE001
            print(f'ESPN schedule {abbr}: {e}')
            return abbr, None
    with ThreadPoolExecutor(WORKERS) as ex:
        return {abbr: d for abbr, d in ex.map(one, sorted(set(ESPN_ABBR.values()))) if d}


def tip_index(schedules):
    """Each ESPN game's tip-off (UTC ISO) by the Moscow date Sports.ru files it under and its two clubs, in both orders.
    A time ESPN marks as not set yet is left out."""
    out = {}
    for d in schedules.values():
        for e in (d or {}).get('events') or []:
            c = (e.get('competitions') or [{}])[0]
            sides = [((x.get('team') or {}).get('abbreviation') or '').upper() for x in c.get('competitors') or []]
            try:
                tip = datetime.fromisoformat((e.get('date') or c.get('date') or '').replace('Z', '+00:00')).astimezone(timezone.utc)
            except ValueError:
                continue
            if e.get('timeValid') is False or c.get('timeValid') is False or len(sides) != 2 or not all(sides):
                continue
            day = (tip + timedelta(hours=3)).date().isoformat()
            out[(day, sides[0], sides[1])] = out[(day, sides[1], sides[0])] = tip.isoformat(timespec='seconds')
    return out


def add_tips(clubs, players, schedules, previous=None):
    """The tip-off time (UTC ISO) of every club calendar game and every player game row, from ESPN's team schedules
    matched by Moscow date and the two clubs. A game of Moscow date D mostly tips off at night, before that day's transfer
    hours (08:00-22:00), so which FBL team a game counts for follows its tip, not its date. A game ESPN does not give
    keeps the previous snapshot's tip. Returns the number of calendar games with a tip."""
    idx, previous = tip_index(schedules), previous or {}
    old = {(club, g.get('date'), g.get('opponent')): g['tip'] for club, games in (previous.get('clubs') or {}).items() for g in games if g.get('tip')}
    tipped = 0
    for club, games in clubs.items():
        for g in games:
            tip = idx.get((g['date'], ESPN_ABBR.get(club), ESPN_ABBR.get(g.get('opponent')))) or old.get((club, g['date'], g.get('opponent')))
            if tip:
                g['tip'] = tip
                tipped += 1
            else:
                g.pop('tip', None)
    # A player's row by the club calendar that met that opponent that day, home or away as the row says (a traded player
    # is matched too); else by the opponent's only ESPN game of that Moscow date; else as the previous snapshot had it.
    calendar = {(g['date'], g.get('opponent'), bool(g.get('home'))): g.get('tip') for games in clubs.values() for g in games}
    by_opponent = {}
    for (day, a, _), tip in idx.items():
        by_opponent.setdefault((day, a), set()).add(tip)
    rows = {(sid, g.get('date'), g.get('opponent')): g['tip'] for sid, p in (previous.get('players') or {}).items() for g in p.get('games') or [] if g.get('tip')}
    for sid, info in players.items():
        for g in info.get('games') or []:
            alone = by_opponent.get((g['date'], ESPN_ABBR.get(g.get('opponent'))), ())
            tip = (calendar.get((g['date'], g.get('opponent'), bool(g.get('home')))) or (next(iter(alone)) if len(alone) == 1 else None)
                   or rows.get((sid, g['date'], g.get('opponent'))))
            if tip:
                g['tip'] = tip
    return tipped


def espn_lines(summary):
    """Every player who took the floor in an ESPN summary: {athlete id: the box-score numbers the formula reads, the
    minutes, his team and short name}. A DNP has no stats and no line."""
    made = lambda v: [int(x) for x in str(v or '0-0').split('-')[:2]] if re.fullmatch(r'\d+-\d+', str(v or '')) else [0, 0]
    num = lambda v: int(v) if re.fullmatch(r'-?\d+', str(v or '')) else 0
    out = {}
    for team in ((summary or {}).get('boxscore') or {}).get('players') or []:
        for st in team.get('statistics') or []:
            labels = st.get('labels') or st.get('names') or []
            for a in st.get('athletes') or []:
                if not a.get('stats') or a.get('didNotPlay') or not (a.get('athlete') or {}).get('id'):
                    continue
                x = dict(zip(labels, a['stats']))
                (fgm, fga), (ftm, fta) = made(x.get('FG')), made(x.get('FT'))
                out[str(a['athlete']['id'])] = {'pts': num(x.get('PTS')), 'reb': num(x.get('REB')), 'ast': num(x.get('AST')),
                                                'stl': num(x.get('STL')), 'blk': num(x.get('BLK')), 'tov': num(x.get('TO')),
                                                'pf': num(x.get('PF')), 'fgm': fgm, 'fga': fga, 'ftm': ftm, 'fta': fta,
                                                'min': str(x.get('MIN') or ''), 'team': ((team.get('team') or {}).get('abbreviation') or '').upper(),
                                                'name': (a.get('athlete') or {}).get('shortName') or (a.get('athlete') or {}).get('displayName') or ''}
    return out


def finished_games(schedules):
    """ESPN's finished games: {event id: {tip, day (the Moscow date Sports.ru files it under), teams}}."""
    out = {}
    for d in schedules.values():
        for e in (d or {}).get('events') or []:
            c = (e.get('competitions') or [{}])[0]
            status = ((c.get('status') or e.get('status') or {}).get('type') or {})
            sides = [((x.get('team') or {}).get('abbreviation') or '').upper() for x in c.get('competitors') or []]
            try:
                tip = datetime.fromisoformat((e.get('date') or c.get('date') or '').replace('Z', '+00:00')).astimezone(timezone.utc)
            except ValueError:
                continue
            if status.get('completed') and len(sides) == 2 and all(sides) and e.get('id'):
                out[str(e['id'])] = {'tip': tip.isoformat(timespec='seconds'), 'day': (tip + timedelta(hours=3)).date().isoformat(), 'teams': sorted(sides)}
    return out


def load_box_cache(path):
    """The ESPN box scores read before: the file beside the snapshot, else the published one, else none."""
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except (OSError, ValueError):
        pass
    try:
        page = fetch(ESPN_BOX_RAW)
        return json.loads(page) if page else {'events': {}}
    except Exception as e:  # noqa: BLE001
        print(f'ESPN box score cache unavailable: {e}')
        return {'events': {}}


def update_box_cache(cache, games, now):
    """Reads ESPN's box score of every finished game not read yet, and again of those of the last BOX_REFRESH_DAYS (late
    corrections). A failed read keeps what was read before. Returns the number of box scores read now."""
    events = cache.setdefault('events', {})
    due = [eid for eid, g in games.items() if eid not in events or now - datetime.fromisoformat(g['tip']) < timedelta(days=BOX_REFRESH_DAYS)]

    def one(eid):
        try:
            page = fetch(SUMMARY_URL.format(id=eid), compressed=True)
            lines = espn_lines(json.loads(page)) if page else {}
            return eid, lines
        except Exception as e:  # noqa: BLE001
            print(f'ESPN box score {eid}: {e}')
            return eid, None

    read = 0
    with ThreadPoolExecutor(WORKERS) as ex:
        for eid, lines in ex.map(one, due):
            if lines:
                events[eid] = {**games[eid], 'readAt': now.isoformat(timespec='seconds'), 'players': lines}
                read += 1
    cache['source'] = SUMMARY_URL.format(id='<event>')
    return read


def sports_to_espn(path=PLAYER_MAP):
    """Sports.ru id -> ESPN athlete id, from the reviewed player map."""
    try:
        return {str(r['sportsId']): str(r['espnId']) for r in json.loads(path.read_text(encoding='utf-8'))['players'] if r.get('espnId')}
    except (OSError, ValueError, KeyError):
        return {}


def map_rows(path=PLAYER_MAP):
    try:
        return json.loads(path.read_text(encoding='utf-8'))['players']
    except (OSError, ValueError, KeyError):
        return []


def retired_cards(path=PLAYER_MAP):
    """{old id: new id} of every card Sports.ru replaced (the map's previousSportsIds: Keaton Wagler's 2208842 was emptied
    and 2208816 opened on 23.10.2026)."""
    return {old: str(r['sportsId']) for r in map_rows(path) for old in r.get('previousSportsIds', [])}


def current_cards(pool, path=PLAYER_MAP):
    """The pool with every card Sports.ru replaced read under its new id (retired_cards), and every card it renamed under
    its new short name (the map's previousSportsNames: Tobi Lawal's «Lawal», «Лавал» on 23.10.2026). The emptied card is
    not read again; the new one keeps the catalog's club, and the map's ESPN id (sports_to_espn) scores its games."""
    new = retired_cards(path)
    names = {str(r['sportsId']): r['sportsName'] for r in map_rows(path) if r.get('previousSportsNames')}
    out = []
    for p in pool:
        sid = new.get(p['sportsId'], p['sportsId'])
        out.append({**p, 'sportsId': sid, **({'name': names[sid]} if sid in names else {})})
    return out


STAT_KEYS = ('pts', 'reb', 'ast', 'stl', 'blk', 'tov', 'pf', 'fgm', 'fga', 'ftm', 'fta')


def espn_ids(players, cache, espn_of, previous=None):
    """ESPN athlete id of every Sports.ru player: the reviewed map, the id an earlier snapshot found, else the one athlete
    whose ESPN line equals the player's Sports.ru box score in every game both list (FBL points and minutes within one;
    players new to the market reach the pool through FBL rosters without a reviewed id). Returns {sportsId: (id, how)}."""
    games = {(g.get('day'), t): g for g in (cache.get('events') or {}).values() for t in g.get('teams') or []}
    old = (previous or {}).get('players') or {}
    out = {sid: (espn, 'MAP') for sid, espn in espn_of.items()}
    for sid, info in old.items():
        if sid not in out and info.get('espnId') and sid in players:
            out[sid] = (str(info['espnId']), info.get('espnIdSource') or 'BOX_MATCH')
    taken = {e for e, _ in out.values()}
    for sid, info in players.items():
        if sid in out:
            continue
        candidates = None
        for g in info.get('games') or []:
            box = g.get('sportsBoxPoints', g.get('points') if g.get('pointsSource') == 'BOX' else None)
            ev = games.get((g.get('date'), ESPN_ABBR.get(g.get('opponent'))))
            if not g.get('played') or not isinstance(box, (int, float)) or not ev:
                continue
            minutes = clock(g.get('minutes'))
            near = {a for a, line in (ev.get('players') or {}).items() if a not in taken and fbl_points(line) == box
                    and (minutes is None or clock(line.get('min')) is None or abs(clock(line['min']) - minutes) <= 1)}
            candidates = near if candidates is None else candidates & near
        if candidates and len(candidates) == 1:
            out[sid] = (candidates.pop(), 'BOX_MATCH')
            taken.add(out[sid][0])
    return out


def awaiting(players):
    """Without the ESPN box scores every played row not scored from ESPN before waits for it."""
    for info in players.values():
        for g in info.get('games') or []:
            if g.get('played') and g.get('pointsSource') != 'ESPN':
                if g.get('pointsSource') in ('BOX', 'NO_BOX'):
                    g['sportsBoxPoints'] = g.get('points')
                g['points'], g['pointsSource'], g['espnStatus'] = None, 'AWAITING_ESPN', 'GAME_NOT_READ'


def clock(v):
    """Minutes of '31:12', '31' or 31.2; None when unreadable."""
    m = re.fullmatch(r'(\d+):(\d\d)', str(v or '').strip())
    if m:
        return int(m[1]) + int(m[2]) / 60
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def apply_espn(players, cache, espn_of, previous=None):
    """FBL points of every played game from ESPN's box score alone (league owner, 22.10.2026): a row whose game ESPN lists
    for the player gets the official formula on ESPN's line (pointsSource ESPN). A played row ESPN has no line for (game
    not read yet, a player without an ESPN id, ESPN shows no minutes) has no points (AWAITING_ESPN) until it does: the
    Sports.ru game table's own box score stays only as sportsBoxPoints, for the reconciliation. A game ESPN lists for a
    player and Sports.ru does not is added as a row. The row is matched by its Moscow date and its opponent: a club plays
    once a day, so that is its game whoever the player's club was. Returns (rows scored from ESPN, reconciliation)."""
    games = {(g.get('day'), t): (eid, g) for eid, g in (cache.get('events') or {}).items() for t in g.get('teams') or []}
    by_event = {eid: g for eid, g in (cache.get('events') or {}).items()}
    club_of = {abbr: club for club, abbr in ESPN_ABBR.items()}
    ids = espn_ids(players, cache, espn_of, previous)
    scored, report = 0, []
    for sid, info in players.items():
        espn, how = ids.get(sid, (None, None))
        if espn:
            info['espnId'], info['espnIdSource'] = espn, how
        seen = set()
        for g in info.get('games') or []:
            if not g.get('played'):
                continue
            if g.get('pointsSource') in ('BOX', 'NO_BOX'):
                g['sportsBoxPoints'] = g.get('points')
            g.pop('boxPoints', None)
            eid, ev = games.get((g.get('date'), ESPN_ABBR.get(g.get('opponent'))), (None, None))
            line = (ev or {}).get('players', {}).get(espn) if espn else None
            if line:
                seen.add(eid)
                points = fbl_points(line)
                g['points'], g['pointsSource'], g['espnEvent'] = points, 'ESPN', eid
                # Minutes are ESPN's too: Sports.ru's exact mm:ss stays only when it agrees with ESPN's within a minute
                # (its table once had 57:00 beside an all-zero line, Acuff 22.10, and the in-season update read 57).
                espn_min, row_min = clock(line.get('min')), clock(g.get('minutes'))
                if espn_min is not None and (row_min is None or abs(row_min - espn_min) > 1):
                    if g.get('minutes') not in (None, ''):
                        g['sportsMinutes'] = g['minutes']
                    g['minutes'] = line.get('min')
                g.pop('pointsKeptFrom', None)
                sports = g.get('sportsBoxPoints')
                if isinstance(sports, (int, float)) and sports != points:
                    report.append({'sportsId': sid, 'name': info.get('name'), 'date': g.get('date'), 'opponent': g.get('opponent'), 'espn': points,
                                   'sports': sports, 'differs': [k for k in STAT_KEYS if (g.get('sportsBox') or {}).get(k) not in (None, line.get(k))]})
                scored += 1
            else:
                g['points'], g['pointsSource'] = None, 'AWAITING_ESPN'
                g['espnStatus'] = 'NO_ESPN_ID' if not espn else 'GAME_NOT_READ' if not ev else 'NO_LINE'
                if ev and espn:
                    report.append({'sportsId': sid, 'name': info.get('name'), 'date': g.get('date'), 'opponent': g.get('opponent'), 'espn': None,
                                   'sports': g.get('sportsBoxPoints'), 'differs': ['played']})
        # Games ESPN lists for him that the Sports.ru table does not.
        if not espn:
            continue
        for eid, ev in by_event.items():
            line = (ev.get('players') or {}).get(espn)
            if eid in seen or not line or not line.get('team') or any(r.get('date') == ev.get('day') for r in info.get('games') or []):
                continue
            other = [t for t in ev.get('teams') or [] if t != line['team']]
            row = {'date': ev.get('day'), 'opponent': club_of.get(other[0]) if other else None, 'played': True, 'minutes': line.get('min'),
                   'points': fbl_points(line), 'pointsSource': 'ESPN', 'espnEvent': eid, 'tip': ev.get('tip'), 'sportsRow': False}
            info.setdefault('games', []).append(row)
            info['games'].sort(key=lambda r: r.get('date') or '')
            report.append({'sportsId': sid, 'name': info.get('name'), 'date': row['date'], 'opponent': row['opponent'], 'espn': row['points'],
                           'sports': None, 'differs': ['missing at Sports.ru']})
            scored += 1
    return scored, report


# A club's game missing from its calendar is rebuilt from its players' game rows when at least this many of the club's
# players list it (a traded player's rows of his old club are one or two; a club lists 13-17 players a game).
MIN_ROWS = 5


def keep_played(clubs, previous, players, today):
    """Club calendars with the games already played, marked gone. Sports.ru's calendar lists only games still to come, so
    a played game drops out of it, and with it the start of its week (the app's week and season facts start there) and
    the club's game count (the NBA Cup fill). Games of the previous snapshot of this season dated up to today that the
    new calendar no longer lists are kept with their week, score and tip; a later game it drops was moved or cancelled.
    A game no snapshot kept (the opening night, a failed run) is rebuilt from the game rows of the club's players, with
    the week whose games end next. gone tells the app the game can no longer be played. Returns the games added."""
    previous, added = previous or {}, 0
    key = lambda g: (g.get('date'), g.get('opponent'), bool(g.get('home')))
    old = (previous.get('clubs') or {}) if previous.get('season') == SEASON_LABEL else {}
    votes = Counter((p.get('club'), *key(g)) for p in players.values() for g in p.get('games') or [] if g.get('date', '') <= today)
    for club, games in clubs.items():
        listed = {key(g) for g in games}
        back = [{**g, 'gone': True} for g in old.get(club) or [] if g.get('date', '') <= today and key(g) not in listed]
        listed |= {key(g) for g in back}
        ends = sorted((max(d), w) for w, d in week_days(games + back).items())
        for (c, day, opponent, home), n in sorted(votes.items(), key=lambda kv: kv[0][1]):
            if c == club and n >= MIN_ROWS and (day, opponent, home) not in listed:
                week = next((w for end, w in ends if end >= day), None)
                back.append({'date': day, 'opponent': opponent, 'home': home, 'score': None, **({'week': week} if week else {}), 'gone': True})
                listed.add((day, opponent, home))
        if back:
            games.extend(back)
            games.sort(key=lambda g: g.get('date', ''))
            added += len(back)
    return added


def upcoming(clubs, today):
    """Calendar games after today: none of them can have been played, so a collection cannot lose them."""
    return sum(1 for games in (clubs or {}).values() for g in games if g.get('date', '') > today)


def refuse_reason(previous, players, clubs, today, season_end=SEASON_END):
    """Why a collection whose prices are fine still must not be published (None when it may): the club calendars of fewer
    than MIN_CLUBS clubs while the season has games ahead, a tenth of the upcoming calendar games or of the played games
    of the same players gone since the previous snapshot of this season, or the game tables of many players without
    points or minutes, or with played games but no readable box score (every listed game has one, counted by Sports.ru
    or not). Each is a page layout change; published, it would turn every forecast or every standing to 0."""
    previous = previous or {}
    same = previous.get('season') == SEASON_LABEL
    before = upcoming(previous.get('clubs'), today) if same else 0
    # After the regular season a calendar may hold nothing at all.
    if len(clubs) < MIN_CLUBS and (before or not season_end or today < season_end):
        return f'club calendars of only {len(clubs)} clubs read; calendar layout changed?'
    now = upcoming(clubs, today)
    if now < MIN_KEPT * before and before - now > 10:
        return f'upcoming calendar games fell from {before} to {now}; calendar layout changed?'
    played = lambda info: sum(1 for g in (info or {}).get('games') or [] if g.get('played'))
    old = (previous.get('players') or {}) if same else {}
    had = sum(played(old[sid]) for sid in players if sid in old)
    has = sum(played(players[sid]) for sid in players if sid in old)
    if has < MIN_KEPT * had and had - has > 10:
        return f'played games of the same players fell from {had} to {has}; game table layout changed?'
    bad = sum(1 for p in players.values() if p.get('gameTable') == 'UNREADABLE')
    if bad > max(5, 0.05 * len(players)):
        return f'{bad} game tables without points or minutes; game table layout changed?'
    bare = sum(1 for p in players.values() if any(g.get('played') and g.get('pointsSource') == 'NO_BOX' for g in p.get('games') or []))
    if bare > max(5, 0.05 * len(players)):
        return f'{bare} game tables with played games but no readable box score; game table layout changed?'
    return None


def update_injury_history(history, feed, now):
    """Archive of ESPN injury reports: one episode per player and injury (body part and kind), from the first report
    that shows it to the last. ESPN keeps only the current report and about nine months of news, so this is the only way
    to learn, season after season, which injuries cost how many games."""
    history = history or {'source': INJURY_URL, 'note': 'Episodes from successive ESPN injury reports; lastSeen is the last report that listed it.', 'players': {}}
    today = now[:10]
    for team in (feed or {}).get('injuries', []):
        for i in team.get('injuries', []):
            athlete = i.get('athlete') or {};links = athlete.get('links') or []
            m = re.search(r'/id/(\d+)', (links[0].get('href') if links else '') or '')
            if not m:
                continue
            d = i.get('details') or {}
            episodes = history['players'].setdefault(m.group(1), {'name': athlete.get('displayName'), 'episodes': []})['episodes']
            key = (d.get('type'), d.get('detail'), d.get('side'))
            last = episodes[-1] if episodes else None
            # The same injury seen again within a week continues the episode; a new body part or kind starts another.
            if last and (last['type'], last['detail'], last['side']) == key and (date.fromisoformat(today) - date.fromisoformat(last['lastSeen'])).days <= 7:
                last.update(lastSeen=today, status=i.get('status'), returnDate=d.get('returnDate'))
            else:
                episodes.append({'type': key[0], 'detail': key[1], 'side': key[2], 'location': d.get('location'), 'status': i.get('status'),
                                 'firstSeen': today, 'lastSeen': today, 'reported': (i.get('date') or '')[:10] or None,
                                 'returnDate': d.get('returnDate'), 'comment': i.get('shortComment', '')[:300]})
    history['updatedAt'] = now
    return history


def parse_team(page):
    """Public Sports.ru team profile: name, place, team value, money left and transfers left."""
    out = {}
    m = re.search(r'<h1[^>]*>\s*(?:<b>)?([^<]+)', page)
    if m:
        out['name'] = html.unescape(m.group(1)).strip()
    for key, label in (('value', 'Стоимость команды'), ('balance', 'Баланс'), ('transfersLeft', 'Трансферы')):
        m = re.search(r'<th>' + label + r'</th>\s*<td>\s*(-?\d+|∞|&infin;)', page)
        if m and m.group(1) in ('∞', '&infin;'):
            # Pre-season: Sports.ru shows ∞ transfers until shortly before the first game.
            out[key], out['transfersUnlimited'] = None, True
        elif m:
            out[key] = int(m.group(1))
    m = re.search(r'<th>Место</th>\s*<td>\s*(\d+) из (\d+)', page)
    if m:
        out['place'], out['of'] = int(m.group(1)), int(m.group(2))
    m = re.search(r'<th>Дедлайн</th>\s*<td>([^<]+)', page)
    if m:
        out['deadline'] = html.unescape(m.group(1)).strip()
    m = re.search(r'<th>Текущая неделя</th>\s*<td>([^<]+)', page)
    if m:
        out['week'] = html.unescape(m.group(1)).strip()
    return out


def parse_journal(page):
    """Transfer journal rows, oldest first: {date, buy:{name,price}, sell:{name,price}|None}. A player whose card Sports.ru
    emptied has no name in any row («куплен за 1400»): his side keeps its price with the name '' (name_blanks)."""
    m = re.search(r'<td>Покупки</td>.*?<tbody>(.*?)</tbody>', page, re.S)
    if not m:
        return []
    def side(c):
        mm = re.search(r'(?:куплен|продан)\s+(?:(.+?)\s+)?за\s+(\d+)', cell(c))
        return {'name': mm.group(1) or '', 'price': int(mm.group(2))} if mm else None
    rows = []
    for row in re.findall(r'<tr>(.*?)</tr>', m.group(1), re.S):
        cs = re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)
        if len(cs) < 2 or not re.fullmatch(r'\d\d\.\d\d\.\d\d', cell(cs[0])):
            continue
        d, mth, y = cell(cs[0]).split('.')
        rows.append({'date': f'20{y}-{mth}-{d}', 'buy': side(cs[1]), 'sell': side(cs[2]) if len(cs) > 2 else None})
    # The page lists newest first.
    return rows[::-1]


def name_blanks(old, rows):
    """Names the blank sides of a journal (parse_journal). Sports.ru empties a player's name in every row when it empties
    his card (Keaton Wagler, 23.10.2026: no name, club or price, gone from the team's roster JSON while the team's value
    still counts him); a journal with such rows read as fewer events and was kept as a failed read, so the team's later
    deals never came in. A blank sale or purchase takes the name of the previous journal's event of the same date, side
    and price that the page no longer lists by name; a blank still left (a new deal with that player) takes the name the
    others resolved to, when it is one. Without either it stays blank: the site reports such a row."""
    events = lambda rs: Counter(journal_event(side, r) for r in rs or [] for side in ('sell', 'buy') if r.get(side) and r[side].get('name'))
    missing = events(old) - events(rows)
    out, found = [], set()
    for row in rows:
        row = dict(row)
        for side in ('sell', 'buy'):
            if row.get(side) and not row[side]['name']:
                key = next((k for k in missing if missing[k] > 0 and json.loads(k)[:2] == [row['date'], side]
                            and json.loads(k)[2]['price'] == row[side]['price']), None)
                if key:
                    missing[key] -= 1
                    row[side] = {**row[side], 'name': json.loads(key)[2]['name']}
                    found.add(row[side]['name'])
        out.append(row)
    if len(found) == 1:
        name = found.pop()
        out = [{**row, **{side: {**row[side], 'name': name} for side in ('sell', 'buy') if row.get(side) and not row[side]['name']}} for row in out]
    return out


def journal_event(side, row):
    return json.dumps([row.get('date'), side, row.get(side)], ensure_ascii=False, sort_keys=True)


def journal_events(rows):
    """A journal's events, a multiset of (date, side, name, price): Sports.ru re-pairs a day's sales and purchases into
    other rows, so journals are compared by their events, never by their rows."""
    return Counter(journal_event(side, r) for r in rows or [] for side in ('sell', 'buy') if r.get(side))


def stamp_journal(old, new, now=None, after=None, old_roster=None, new_roster=None):
    """Sports.ru journals give only the date of a transfer. A row first seen by this collection gets seenAt, the UTC
    time it appeared, and seenAfter, the previous read of the same journal without it (after): the transfer was made
    between the two (the watcher reads journals every minute). Rows already known keep theirs. Without a previous journal
    nothing is stamped: the time of those rows is unknown.
    Sports.ru lists rows of one date in no stable order and even re-pairs a day's sales and purchases into other rows as
    the day goes on (J→O seen alone, later J→E and K→O after a new deal K→E), so a date of the previous journal keeps its
    earlier pairing: its old rows, in their order, with their stamps, then the page's rows whose sale and purchase are
    both new, as Sports.ru pairs them, then the remaining new sales paired with the remaining new purchases, all seen now.
    One-sided rows (draft purchases) are kept and stamped alike but never paired. Only when an old event of the date is
    gone from the page, or the remaining new sales and purchases do not pair up one to one, does the date follow the page:
    each row's sale and purchase are matched against the earlier sales and purchases of that date, a row whose events
    were all seen before keeps their time (the later of the two) and a row with a new event is new.
    The exact players are pinned too (sellSid, buySid): journals give only short names (two «Уайт»), so a new sale or
    purchase is matched to the player who left or joined the team's Sports.ru roster since the previous read
    (old_roster, new_roster), once, and keeps that id when the rows are re-paired."""
    if not old:
        return new
    now = now or datetime.now(timezone.utc).isoformat(timespec='seconds')
    ident = journal_event
    # Who left and who joined the roster since the previous read, for the new events.
    ids = lambda roster: [p for p in roster or [] if p.get('sportsId')]
    gone, came = [], []
    if old_roster is not None and new_roster is not None:
        before, after_ids = [p['sportsId'] for p in ids(old_roster)], [p['sportsId'] for p in ids(new_roster)]
        gone = [p for p in ids(old_roster) if p['sportsId'] not in after_ids]
        came = [p for p in ids(new_roster) if p['sportsId'] not in before]
    def pin(side, row):
        cands = [p for p in (gone if side == 'sell' else came) if p.get('name') == row[side].get('name')]
        if not cands:
            return None
        best = min(cands, key=lambda p: abs((p.get('price') or 0) - (row[side].get('price') or 0)))
        (gone if side == 'sell' else came).remove(best)
        return best['sportsId']
    def fresh(row):
        pins = {}
        for side in ('sell', 'buy'):
            sid = pin(side, row) if row.get(side) else None
            if sid:
                pins[side + 'Sid'] = sid
        return {**row, 'seenAt': now, **({'seenAfter': after} if after else {}), **pins}
    def keep(day, known, rows):
        """The date's earlier pairing with the page's new events added; None when it cannot stand."""
        if journal_events(known) - journal_events(rows):
            return None
        news, whole, sells, buys, rest = journal_events(rows) - journal_events(known), [], [], [], []
        for row in rows:
            sides = [side for side in ('sell', 'buy') if row.get(side)]
            if sides and all(news[ident(side, row)] > 0 for side in sides):
                for side in sides:
                    news[ident(side, row)] -= 1
                whole.append(row)
            else:
                rest.append(row)
        # A row with one new event and one old: the new one is paired with a new event of the other side.
        for row in rest:
            for side, bucket in (('sell', sells), ('buy', buys)):
                if row.get(side) and news[ident(side, row)] > 0:
                    news[ident(side, row)] -= 1
                    bucket.append({side: row[side], **({side + 'Sid': row[side + 'Sid']} if row.get(side + 'Sid') else {})})
        if len(sells) != len(buys):
            return None
        return [dict(r) for r in known] + [fresh(r) for r in whole + [{'date': day, **b, **s} for s, b in zip(sells, buys)]]
    def follow(known, rows):
        """The page's pairing: each row's sale and purchase matched against the earlier events of the date."""
        pool = {}
        for row in known:
            for side in ('sell', 'buy'):
                if row.get(side):
                    pool.setdefault(ident(side, row), []).append({**{k: row[k] for k in ('seenAt', 'seenAfter') if row.get(k)},
                                                                  **({'sid': row[side + 'Sid']} if row.get(side + 'Sid') else {})})
        out = []
        for row in rows:
            sides = [side for side in ('sell', 'buy') if row.get(side)]
            events = {side: (pool[ident(side, row)].pop(0) if pool.get(ident(side, row)) else None) for side in sides}
            pins = {}
            for side in sides:
                sid = events[side].get('sid') if events[side] else pin(side, row)
                if sid:
                    pins[side + 'Sid'] = sid
            if any(e is None for e in events.values()):
                out.append({**row, 'seenAt': now, **({'seenAfter': after} if after else {}), **pins})
                continue
            seen = [e for e in events.values() if e.get('seenAt')]
            if not seen:
                out.append({**row, **pins})
                continue
            latest = max(seen, key=lambda e: e['seenAt'])
            out.append({**row, 'seenAt': latest['seenAt'], **pins,
                        **({'seenAfter': max(e['seenAfter'] for e in seen if e.get('seenAfter'))} if any(e.get('seenAfter') for e in seen) else {})})
        return out
    known, days = {}, {}
    for row in old:
        known.setdefault(row.get('date'), []).append(row)
    for row in new:
        days.setdefault(row.get('date'), []).append(row)
    out = []
    for day, rows in days.items():
        kept = keep(day, known[day], rows) if day in known else None
        out += kept if kept is not None else follow(known.get(day, []), rows)
    return out


def parse_roster(raw):
    """Sports.ru team roster JSON: the exact player ids, so names never have to be guessed."""
    out = []
    for p in json.loads(raw).get('players', []):
        out.append({'sportsId': str(p['id']), 'name': p.get('name'), 'club': p.get('club'), 'position': AMPLUA.get(str(p.get('amplua'))),
                    'price': int(p['price']) if str(p.get('price', '')).isdigit() else None, 'locked': str(p.get('lock')) not in ('0', '', 'None')})
    return out


def collect_teams(previous=None, errors=None):
    """Profile, journal and roster of every FBL team. A team whose pages fail keeps its previous entry, and a journal
    with fewer events than the published one is a failed parse, never a reversal of transfers (events, not rows: the
    published rows keep their earlier pairing)."""
    previous, errors = previous or {}, errors if errors is not None else []
    try:
        config = json.loads(TEAMS.read_text(encoding='utf-8')).get('teams', {})
    except FileNotFoundError:
        return {}
    teams = {}
    for team, sid in config.items():
        old = previous.get(team)
        read_from = datetime.now(timezone.utc).isoformat(timespec='seconds')
        try:
            profile, journal, roster = fetch(TEAM_URL.format(id=sid)), fetch(JOURNAL_URL.format(id=sid)), fetch(ROSTER_URL.format(id=sid))
            if profile is None or journal is None:
                raise RuntimeError('page not found')
            entry = {'sportsTeamId': sid, **parse_team(profile), 'journal': name_blanks((old or {}).get('journal'), parse_journal(journal))}
            if roster:
                entry['roster'] = parse_roster(roster)
        except Exception as e:  # noqa: BLE001
            errors.append({'team': team, 'error': str(e)[:200]})
            print(f'Sports.ru team {sid}: {e}')
            if old:
                teams[team] = {**old, 'stale': True}
            continue
        had, has = sum(journal_events((old or {}).get('journal')).values()), sum(journal_events(entry['journal']).values())
        if old and has < had:
            errors.append({'team': team, 'error': f"journal shrank from {had} to {has} events; kept the previous one"})
            entry['journal'] = old['journal']
        read_at = datetime.now(timezone.utc).isoformat(timespec='seconds')
        entry['journal'] = stamp_journal((old or {}).get('journal'), entry['journal'], now=read_at, after=(old or {}).get('journalReadAt'),
                                         old_roster=(old or {}).get('roster'), new_roster=entry.get('roster') if roster else None)
        # A failed read bounds nothing: a deal it missed may be older than it.
        entry['journalReadAt'] = old.get('journalReadAt') if old and has < had else read_from
        profile_read = 'balance' in entry
        if 'balance' not in entry or 'transfersLeft' not in entry:
            errors.append({'team': team, 'error': 'team profile without balance or transfers; layout changed?'})
            for key in ('balance', 'transfersLeft', 'value'):
                if key not in entry and old and key in old:
                    entry[key] = old[key]
        # When the profile and the roster were read: the minute watcher reads them again after a deal made meanwhile, and
        # merging this collection keeps whichever copy is later (season_watch.merge_full).
        for key, fresh in (('profileReadAt', profile_read), ('rosterReadAt', 'roster' in entry)):
            stamp = read_from if fresh else (old or {}).get(key)
            if stamp:
                entry[key] = stamp
        teams[team] = entry
    return teams


def week_days(games):
    """{week number: dates of its games} of calendar games that carry a week."""
    weeks = {}
    for g in games:
        if isinstance(g.get('week'), int):
            weeks.setdefault(g['week'], []).append(g['date'])
    return weeks


def week_ranges(calendars):
    """Sports.ru game weeks by the week number of each calendar game (Moscow dates, so a US Monday-Sunday week shows as
    Tuesday-Monday). Each week runs from the day after the previous week's last game to its own last game."""
    weeks = week_days([g for games in calendars for g in games])
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
    pool = current_cards(json.loads(PRICES.read_text(encoding='utf-8'))['players'] + json.loads(ADDITIONS.read_text(encoding='utf-8'))['players'])
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
    today = (datetime.now(timezone.utc) + timedelta(hours=3)).date().isoformat()
    reason = refuse_reason(previous, players, clubs, today)
    if reason:
        raise SystemExit(f'Sports.ru {reason} Refusing to publish.')
    unreadable = sum(1 for p in players.values() if p.get('gameTable') == 'UNREADABLE')
    if unreadable:
        errors.append({'error': f'{unreadable} game tables without points or minutes'})
    for sid in keep_games(players, previous):
        errors.append({'sportsId': sid, 'error': f"game table unread; kept the games of {players[sid]['gamesKeptFrom']}"})
    keep_played(clubs, previous, players, today)
    fresh_injuries = espn_injuries()
    schedules, tipped = {}, 0
    try:
        schedules = espn_schedules()
        tipped = add_tips(clubs, players, schedules, previous)
    except Exception as e:  # noqa: BLE001
        # A tip-off time is never worth a failed collection: the games keep their dates.
        print(f'tip-off times: {e}')
    if len(schedules) < len(set(ESPN_ABBR.values())):
        errors.append({'error': f'ESPN schedules of {len(schedules)} of {len(set(ESPN_ABBR.values()))} clubs read; other tip-off times kept from the previous snapshot'})
    # Every played game's FBL points from ESPN's box score; the box scores read before are kept beside the snapshot.
    cache_path, box_read, from_espn, reconciliation = OUT.parent / 'espn-box.json', 0, 0, None
    try:
        cache = load_box_cache(cache_path)
        box_read = update_box_cache(cache, finished_games(schedules), datetime.now(timezone.utc))
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(cache, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        from_espn, reconciliation = apply_espn(players, cache, sports_to_espn(), previous)
    except Exception as e:  # noqa: BLE001
        # Without ESPN no new game has FBL points: the rows wait for it (the Sports.ru table never scores a game).
        errors.append({'error': f'ESPN box scores unavailable ({str(e)[:120]}); games without an ESPN line have no points yet'})
        reconciliation = None
        awaiting(players)
    points = game_points_summary(players)
    if points['awaitingEspn'] or points['mismatches']:
        errors.append({'error': f"{points['awaitingEspn']} played games without an ESPN line yet (no FBL points), "
                                f"{points['mismatches']} Sports.ru box scores disagree with Sports.ru's counted points"})
    out = {'source': BASE_URL.format(t=TOURNAMENT, pid='<sportsId>'), 'season': SEASON_LABEL,
           'collectedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'weeks': week_ranges(clubs.values()), 'clubs': clubs, 'players': players, 'teams': teams, 'errors': errors,
           # Game points are FBL's: the Yahoo formula on each game row's own box score. sportsPoints keeps Sports.ru's
           # ФО, which is never FBL's (its result bonus, its +2 for 10+ minutes), as a check of Sports.ru's line.
           'gamePoints': {'formula': FORMULA,
                          'check': "sportsPoints = box score + Sports.ru's result bonus (+2/+3 home/away win, -3/-2 home/away loss) "
                                   "+ 1 for 10+ minutes once Sports.ru counts the game: MISMATCH when not, UNCOUNTED while ФО is 0",
                          'espnBoxScores': {'read': box_read, 'rows': from_espn, 'source': SUMMARY_URL.format(id='<event>')},
                          # The Sports.ru game table against ESPN, row by row: a check only, never FBL points.
                          'reconciliation': reconciliation,
                          **points},
           'tips': {'source': SCHEDULE_URL.format(abbr='<club>', year=SEASON_LABEL[-4:]), 'clubs': len(schedules), 'games': tipped, 'of': sum(len(g) for g in clubs.values()),
                    'fetchedAt': datetime.now(timezone.utc).isoformat(timespec='seconds') if schedules else (previous.get('tips') or {}).get('fetchedAt')}}
    # Whether the injury report was fetched now; a failed fetch publishes the last good one (espnInjuriesAt), never none.
    injuries, out['espnInjuriesOk'] = keep_injuries(fresh_injuries, previous, out['collectedAt'])
    last_good = (injuries or {}).get('fetchedAt') or previous.get('espnInjuriesAt') or (previous.get('espnInjuries') or {}).get('fetchedAt')
    if last_good:
        out['espnInjuriesAt'] = last_good
    if injuries:
        out['espnInjuries'] = injuries
    if not out['espnInjuriesOk']:
        errors.append({'error': f"ESPN injuries unavailable; {'kept the report of ' + last_good if injuries else 'no report kept'}"})
    else:
        archive = OUT.parent / 'injury-history.json'
        history = json.loads(archive.read_text(encoding='utf-8')) if archive.exists() else None
        archive.write_text(json.dumps(update_injury_history(history, injuries, out['collectedAt']), ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f"Sports.ru: {len(players)} players, {len(clubs)} club calendars ({tipped} games with a tip-off time), {points['played']} played games "
          f"({from_espn} scored from ESPN box scores, {box_read} read now; {points['awaitingEspn']} awaiting ESPN, {points['uncounted']} not counted by Sports.ru yet, {points['mismatches']} mismatches), "
          f"{len(errors)} errors -> {OUT}")


if __name__ == '__main__':
    main()
