#!/usr/bin/env python3
"""The NBA's official injury reports of past regular seasons, one a day: what was known about each player before the
day's games, for the transfer-advice backtest (scripts/transfer_backtest_inputs.py), which had no injury report.

Source: the league's PDF of 5 PM ET on each date (the latest before most tip-offs),
  https://ak-static.cms.nba.com/referee/injury/Injury-Report_<date>_05PM.pdf   (to December 2025)
  https://ak-static.cms.nba.com/referee/injury/Injury-Report_<date>_05_00PM.pdf (since)
A report lists only the players of clubs playing that day or the next, so a player's status at a moment is his entry in
the latest report that lists his club. ESPN's feed, which the app reads, also has return dates and comments; the NBA's
report has neither, and the backtest says so.

Output data/nba-injury-reports.json: per date, rows [club tricode, name, status, reason] with the name and the reason
as indexes into `names` ("First Last") and `reasons` (shortened to its kind and body part); status O (out), D (doubtful)
or Q (questionable): probable and available players are dropped. load() expands it.
Usage: collect_nba_injury_reports.py [season ...] [--days YYYY-MM-DD,...]  (default: 2023-24 2024-25 2025-26, every day)
"""
import io
import json
import re
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'nba-injury-reports.json'
URL = 'https://ak-static.cms.nba.com/referee/injury/Injury-Report_{d}_{t}.pdf'
# Regular seasons: first and last day.
SEASONS = {'2023-24': ('2023-10-24', '2024-04-14'), '2024-25': ('2024-10-22', '2025-04-13'), '2025-26': ('2025-10-21', '2026-04-12')}
CLUBS = {'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN', 'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI',
         'Cleveland Cavaliers': 'CLE', 'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
         'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND', 'LA Clippers': 'LAC',
         'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL', 'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA',
         'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP', 'New York Knicks': 'NYK',
         'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL', 'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX',
         'Portland Trail Blazers': 'POR', 'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR',
         'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS'}
STATUS = {'Out', 'Doubtful', 'Questionable', 'Probable', 'Available'}
HEAD = ['Game', 'Time', 'Matchup', 'Team', 'Player', 'Current', 'Reason']
UA = 'Mozilla/5.0 (compatible; fbl-draft-simulator/1.0; research)'


def fetch(url):
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code in (403, 404):
                return None
        except Exception:  # noqa: BLE001
            pass
        time.sleep(2 * (attempt + 1))
    return None


def short(reason):
    """«Injury/Illness - Left Ankle; Sprain» → «Left Ankle; Sprain»; G League, rest and the like keep their words."""
    r = re.sub(r'\s+', ' ', reason).strip()
    return re.sub(r'^Injury/Illness\s*-\s*', '', r)


def parse(pdf_bytes):
    """Rows [club, "First Last", status, reason] of one report."""
    import pdfplumber  # only the collection needs it; load() does not
    rows = []
    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        cols = None
        club = None
        for page in pdf.pages:
            words = page.extract_words(x_tolerance=1)
            line = next((w['top'] for w in words if w['text'] == 'Matchup'), None)
            found = [w for w in words if w['text'] in HEAD and line is not None and abs(w['top'] - line) < 2]
            head = {w['text']: w['x0'] for w in found}
            if len(head) >= 6:
                cols = head
            if not cols:
                continue
            team_x, name_x, status_x, reason_x = cols['Team'], cols['Player'], cols['Current'], cols['Reason']
            # Below the column heads (repeated on some pages) and the page's title line.
            floor = max([w['bottom'] for w in found] if len(head) >= 6 else [60])
            body = [w for w in words if w['top'] > floor + 1 and not re.match(r'Page|Injury Report', w['text'])]
            lines = {}
            for w in body:
                lines.setdefault(round(w['top']), []).append(w)
            players, reasons = [], []
            for top, ws in sorted(lines.items()):
                ws.sort(key=lambda w: w['x0'])
                part = lambda lo, hi: ' '.join(w['text'] for w in ws if lo - 2 <= w['x0'] < hi - 2)
                team = part(team_x, name_x)
                name = part(name_x, status_x)
                status = part(status_x, reason_x)
                reason = part(reason_x, 10_000)
                if team in CLUBS:
                    club = CLUBS[team]
                if status in STATUS and ',' in name:
                    players.append(dict(top=top, club=club, name=name, status=status, reason=[]))
                elif reason and 'NOT YET SUBMITTED' not in reason:
                    reasons.append((top, reason))
                if status in STATUS and ',' in name and reason:
                    players[-1]['reason'].append((top, reason))
            # A reason that wraps sits on lines just above and below its player: each goes to the nearest player.
            for top, text in reasons:
                if players:
                    min(players, key=lambda p: abs(p['top'] - top))['reason'].append((top, text))
            for p in players:
                last, _, first = p['name'].partition(',')
                reason = short(' '.join(t for _, t in sorted(p['reason'])))
                if p['status'] != 'Available' and p['club']:
                    rows.append([p['club'], f'{first.strip()} {last.strip()}', p['status'], reason])
    return rows


CODES = {'Out': 'O', 'Doubtful': 'D', 'Questionable': 'Q'}


def compact(reports):
    names, reasons, out = {}, {}, {}
    for day, rows in sorted(reports.items()):
        out[day] = [[c, names.setdefault(n, len(names)), CODES[st], reasons.setdefault(r, len(reasons))]
                    for c, n, st, r in rows if st in CODES]
    return dict(names=list(names), reasons=list(reasons), reports=out)


def load(path=OUT):
    """{date: [[club, "First Last", status, reason], ...]} with the statuses spelled out."""
    d = json.loads(Path(path).read_text())
    full = {v: k for k, v in CODES.items()}
    return {day: [[c, d['names'][n], full[st], d['reasons'][r]] for c, n, st, r in rows] for day, rows in d['reports'].items()}


def report(day):
    for t in ('05PM', '05_00PM'):
        pdf = fetch(URL.format(d=day, t=t))
        if pdf:
            return day, t, parse(pdf)
    return day, None, None


def main():
    seasons = [a for a in sys.argv[1:] if a in SEASONS] or list(SEASONS)  # noqa: E501
    old = json.loads(OUT.read_text()) if OUT.exists() else {}
    if old:
        old['reports'] = load()
    days = []
    for s in seasons:
        a, b = (date.fromisoformat(x) for x in SEASONS[s])
        days += [(a + timedelta(n)).isoformat() for n in range((b - a).days + 1)]
    if '--days' in sys.argv:
        days = sys.argv[sys.argv.index('--days') + 1].split(',')
    reports = dict(old.get('reports', {}))
    missing = []
    with ThreadPoolExecutor(6) as ex:
        for n, (day, t, rows) in enumerate(ex.map(report, days), 1):
            if rows is None:
                missing.append(day)
            else:
                reports[day] = rows
            if n % 50 == 0:
                print(f'{n}/{len(days)}', flush=True)
    out = dict(source=URL.format(d='<date>', t='05PM|05_00PM'), capturedAt=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'),
               notes='The 5 PM ET report of each date; probable and available rows dropped. Only clubs playing that day are listed.',
               seasons=SEASONS, **compact(reports), missing=sorted(set(old.get('missing', [])) - set(reports) | set(missing)))
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('reports', len(reports), 'missing', len(out['missing']))


if __name__ == '__main__':
    main()
