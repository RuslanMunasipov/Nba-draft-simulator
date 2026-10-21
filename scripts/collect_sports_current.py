#!/usr/bin/env python3
"""Collect the live Sports.ru fantasy state of every player in the transfer pool.

Source: the public Sports.ru fantasy player popup (no login needed)
  https://www.sports.ru/fantasy/basketball/player/info/150/<sportsId>.html
It shows the current and initial price, the role ("Амплуа"), the share of
Sports.ru users who own the player, the club calendar with official fantasy
week numbers and, once the season has started, the per-game table of the
current season with the official fantasy points ("ФО") and the price after
each game ("С"). Nothing is estimated here. ESPN adds the injury report and the tip-off time of every calendar game
(its team schedules).

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
    from fbl_formula import GAME_PLAYED, sports_participation
except ImportError:
    from scripts.fbl_formula import GAME_PLAYED, sports_participation

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
# Where a played game's points come from: its own row (box score, or Sports.ru's points minus the result bonus of the
# row's score), the club calendar's score, or nowhere yet (Sports.ru's points, bonus included).
ROW_SOURCES = ('BOX', 'ROW_SCORE')


def box_points(cs, col, minutes):
    """FBL points of a game from its own box score: PTS+REB+AST+STL+BLK-(FGA-FGM)-(FTA-FTM)-2*TOV-PF, plus 1 for the game
    played (Yahoo GP, league settings 21.10.2026). None when a column is missing or unreadable."""
    v = {}
    for key, names in BOX.items():
        i = next((col[n] for n in names if n in col), None)
        x = number(cs[i]) if i is not None and len(cs) > i else None
        if x is None:
            return None
        v[key] = x
    misses = v['fga2'] + v['fga3'] - v['fgm2'] - v['fgm3'] + v['fta'] - v['ftm']
    return v['pts'] + v['reb'] + v['ast'] + v['stl'] + v['blk'] - misses - 2 * v['tov'] - v['pf'] + GAME_PLAYED


def row_points(game, cs, col):
    """A played game's FBL points from its own row, read at the same moment as Sports.ru's points (no calendar of another
    page, no orientation vote): the box score when the table has it, else Sports.ru's points minus the team result bonus
    of the row's score, which is written home side first («118 : 128» away is a win), and minus the extra point Sports.ru
    gives for 10+ minutes (FBL counts 1 per game played). With both, each checks the other: Sports.ru's points are FBL's
    plus that bonus and that point; a row where they differ is marked MISMATCH (the box score stands, it is the league's
    formula). A row with neither is left to the club calendars (fbl_points)."""
    base = game['points']
    i = next((col[n] for n in ('Счет', 'Счёт') if n in col), None)
    score = parse_score(cs[i]) if i is not None and len(cs) > i else None
    won = None if not score or score[0] == score[1] else (score[0] > score[1] if game['home'] else score[1] > score[0])
    box = box_points(cs, col, game['minutes'])
    game['sportsPoints'] = base
    if won is not None:
        game['result'] = 'W' if won else 'L'
    if box is not None:
        game['points'], game['pointsSource'] = round(box, 2), 'BOX'
        if won is not None and round(base - box, 2) != result_bonus(game['home'], won) + minutes_extra(game['minutes']):
            game['pointsCheck'] = 'MISMATCH'
    elif won is not None:
        game['points'], game['pointsSource'] = round(base - result_bonus(game['home'], won) - minutes_extra(game['minutes']), 2), 'ROW_SCORE'
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
        points = number(cs[col['ФО']])
        if points is None and played:
            continue  # an unreadable score is left out, never counted as zero
        game = {'date': day, 'opponent': cs[1], 'home': cs[2].startswith('Д'), 'minutes': minutes if played else '00:00',
                'points': points or 0, 'played': played}
        if played:
            row_points(game, cs, col)
        if 'С' in col and len(cs) > col['С']:
            price = number(cs[col['С']])
            if price is not None:
                game['price'] = int(price)
        games.append(game)
    games.sort(key=lambda g: g['date'])
    return games


def parse_score(text):
    """A calendar score as two numbers in the order written ('112:104', an overtime mark ignored); None before the game."""
    m = re.search(r'(\d+)\s*:\s*(\d+)', text or '')
    return (int(m.group(1)), int(m.group(2))) if m else None


def score_orientation(clubs):
    """How club calendars write a score: 'own' (the club's points first) or 'home' (the home side first). Each finished
    game is in both clubs' calendars: written the same way in both it is home-first, mirrored it is own-first. None until
    games are played."""
    votes = {'own': 0, 'home': 0}
    for club, games in clubs.items():
        for g in games:
            mine = parse_score(g.get('score'))
            other = next((x for x in clubs.get(g['opponent'], []) if x['date'] == g['date'] and x['opponent'] == club), None)
            theirs = parse_score((other or {}).get('score'))
            if not mine or not theirs or mine[0] == mine[1]:
                continue
            if theirs == mine[::-1]:
                votes['own'] += 1
            elif theirs == mine:
                votes['home'] += 1
    return max(votes, key=votes.get) if any(votes.values()) else None


def minutes_extra(minutes):
    """What Sports.ru's minutes rule adds over FBL's 1 per game played: +1 for 10 minutes or more («MM:SS»)."""
    m = re.match(r'(\d+)', minutes or '')
    return sports_participation(int(m.group(1)) if m else 0) - GAME_PLAYED


def result_bonus(home, won):
    """Sports.ru's team result bonus: +2/+3 for a home/away win, -3/-2 for a home/away loss."""
    return (2 if home else 3) if won else (-3 if home else -2)


def fbl_points(players, clubs):
    """FBL points of the played games their own row could not convert (row_points: a table without box score and score).
    FBL scores on Yahoo with Sports.ru's counting terms, 1 point per game played and no team result bonus: Sports.ru's
    points of the game minus its extra point for 10+ minutes and minus the bonus of the result, read from the score in the club's
    calendar (the club that met that opponent that day, home or away as the game row says, so a traded player is matched
    too). Sports.ru's own number stays as sportsPoints; a game whose result is in no calendar either keeps Sports.ru's
    number less the minutes point, with its result bonus and without a result, marked pointsSource SPORTS_WITH_BONUS and
    counted in gamePoints."""
    orientation = score_orientation(clubs)
    index = {(g['date'], g['opponent'], bool(g.get('home'))): g for games in clubs.values() for g in games}
    scored = 0
    for info in players.values():
        for g in info.get('games') or []:
            if not g.get('played') or g.get('pointsSource') in ROW_SOURCES:
                continue
            base = g.get('sportsPoints', g.get('points'))
            score = parse_score((index.get((g['date'], g.get('opponent'), bool(g.get('home')))) or {}).get('score'))
            if orientation is None or not score or score[0] == score[1]:
                # Without a result only the minutes point can come off: the result bonus stays in.
                g['sportsPoints'] = base
                g['points'] = round(base - minutes_extra(g.get('minutes')), 2)
                g['pointsSource'] = 'SPORTS_WITH_BONUS'
                g.pop('result', None)
                continue
            a, b = score
            won = a > b if orientation == 'own' or g.get('home') else b > a
            g['sportsPoints'] = base
            g['points'] = round(base - result_bonus(bool(g.get('home')), won) - minutes_extra(g.get('minutes')), 2)
            g['result'] = 'W' if won else 'L'
            g['pointsSource'] = 'CALENDAR'
            scored += 1
    return orientation, scored


def game_points_summary(players):
    """What the published game points rest on: played games by source, those whose result is known, those still with
    Sports.ru's result bonus (no result anywhere yet) and the rows whose box score and Sports.ru's points disagree."""
    games = [g for p in players.values() for g in p.get('games') or [] if g.get('played')]
    sources = Counter(g.get('pointsSource', 'SPORTS_WITH_BONUS') for g in games)
    return {'played': len(games), 'sources': dict(sorted(sources.items())), 'gamesWithResult': sum(1 for g in games if g.get('result')),
            'gamesWithoutResult': sources.get('SPORTS_WITH_BONUS', 0),
            'mismatches': sum(1 for g in games if g.get('pointsCheck') == 'MISMATCH'), 'seasonEnd': SEASON_END}


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
    points or minutes. Each is a page layout change; published, it would turn every forecast or every standing to 0."""
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
            entry = {'sportsTeamId': sid, **parse_team(profile), 'journal': parse_journal(journal)}
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
    today = (datetime.now(timezone.utc) + timedelta(hours=3)).date().isoformat()
    reason = refuse_reason(previous, players, clubs, today)
    if reason:
        raise SystemExit(f'Sports.ru {reason} Refusing to publish.')
    keep_played(clubs, previous, players, today)
    unreadable = sum(1 for p in players.values() if p.get('gameTable') == 'UNREADABLE')
    if unreadable:
        errors.append({'error': f'{unreadable} game tables without points or minutes'})
    fresh_injuries = espn_injuries()
    orientation, _ = fbl_points(players, clubs)
    schedules, tipped = {}, 0
    try:
        schedules = espn_schedules()
        tipped = add_tips(clubs, players, schedules, previous)
    except Exception as e:  # noqa: BLE001
        # A tip-off time is never worth a failed collection: the games keep their dates.
        print(f'tip-off times: {e}')
    if len(schedules) < len(set(ESPN_ABBR.values())):
        errors.append({'error': f'ESPN schedules of {len(schedules)} of {len(set(ESPN_ABBR.values()))} clubs read; other tip-off times kept from the previous snapshot'})
    points = game_points_summary(players)
    if points['gamesWithoutResult'] or points['mismatches']:
        errors.append({'error': f"{points['gamesWithoutResult']} played games still carry Sports.ru's result bonus (no result found), "
                                f"{points['mismatches']} box scores disagree with Sports.ru's points"})
    out = {'source': BASE_URL.format(t=TOURNAMENT, pid='<sportsId>'), 'season': SEASON_LABEL,
           'collectedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'weeks': week_ranges(clubs.values()), 'clubs': clubs, 'players': players, 'teams': teams, 'errors': errors,
           # Game points are FBL's, from each game row's box score (or Sports.ru's points minus the result bonus of the
           # row's or the calendar's score); sportsPoints keeps Sports.ru's.
           'gamePoints': {'formula': 'FBL: PTS+REB+AST+STL+BLK-(FGA-FGM)-(FTA-FTM)-2*TOV-PF, +2 for 10+ minutes, else +1',
                          'scoreOrientation': orientation, **points},
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
          f"({points['gamesWithoutResult']} without a result, {points['mismatches']} mismatches), {len(errors)} errors -> {OUT}")


if __name__ == '__main__':
    main()
