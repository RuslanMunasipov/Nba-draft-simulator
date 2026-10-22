"""The history the transfer backtest replays (data/sports-price-history.json, data/nba-injury-reports.json): complete
for its three seasons, Sports.ru's price rule as the collected prices show it, the injury reports expanded as collected."""
import json
import sys
from datetime import date, timedelta
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from collect_nba_injury_reports import load, SEASONS as INJURY_SEASONS, compact, CODES  # noqa: E402
from collect_sports_price_history import SEASONS as PRICE_SEASONS, parse  # noqa: E402
from fbl_formula import fbl_points  # noqa: E402
from minute_encoding import normalize_minutes  # noqa: E402

PRICES = json.loads((ROOT / 'data' / 'sports-price-history.json').read_text())


def test_prices_cover_three_seasons_with_a_price_after_every_game():
    assert set(PRICES['seasons']) == {'2023-24', '2024-25', '2025-26'} == set(PRICE_SEASONS)
    for season, v in PRICES['seasons'].items():
        assert len(v['players']) >= 300, season
        for p in v['players'].values():
            assert len(p['days']) == len(p['prices']) == len(p['played']) > 0
            assert p['days'] == sorted(p['days']) and set(p['played']) <= {'0', '1'}


def test_a_game_moves_the_price_by_its_fantasy_points_and_a_missed_one_not_at_all():
    """Sports.ru's rule, as the 2024/25 prices show it: the price after a game is the price before plus that game's
    fantasy points (about 1.05 x the FBL points of the official formula); a missed game (00:00) leaves it."""
    v = PRICES['seasons']['2024-25']
    start = date.fromisoformat(v['seasonStart'])
    rows, _ = normalize_minutes(pq.read_table(ROOT / 'data/raw/game_logs_2024-25.parquet').to_pylist(), 2025)
    fp = {(str(r['player_id']), str(r['game_date'])[:10]): fbl_points(r) for r in rows if r['minutes'] > 0}
    missed, changed, errs = 0, 0, []
    for pid, p in v['players'].items():
        for i in range(1, len(p['days'])):
            dp = p['prices'][i] - p['prices'][i - 1]
            if p['played'][i] == '0':
                missed += 1
                changed += dp != 0
                continue
            # Sports.ru files a US evening game under the next Moscow date.
            day = start + timedelta(p['days'][i])
            x = fp.get((pid, (day - timedelta(1)).isoformat()), fp.get((pid, day.isoformat())))
            if x is not None:
                errs.append(abs(dp - 1.045 * x))
    assert missed > 1000 and changed / missed < 0.01
    errs.sort()
    assert len(errs) > 15000 and errs[len(errs) // 2] <= 3, 'the median game moves the price within 3 of 1.045 x its FBL points'


def test_the_season_page_parser_reads_the_price_column(tmp_path):
    page = ('<table><tr><th>Первоначальная стоимость</th><td>3300</td></tr></table>'
            '<table class="stat-table small"><tr><td>Дата</td><td>МИН</td><td>ФО</td><td class="padR">С</td></tr>'
            '<tr><td>23.10.2024</td><td>36:10</td><td>40</td><td class="padR">3342</td></tr>'
            '<tr><td>25.10.2024</td><td>00:00</td><td>0</td><td class="padR">3342</td></tr></table>')
    opening, games = parse(page, date(2024, 10, 22))
    assert opening == 3300 and games == [(1, 3342, True), (3, 3342, False)]


def test_injury_reports_expand_as_collected_and_miss_only_all_star_breaks():
    reports = load()
    for season, (first, last) in INJURY_SEASONS.items():
        days = [d for d in reports if first <= d <= last]
        assert len(days) >= 165, season
    rows = [r for rs in reports.values() for r in rs]
    assert {r[2] for r in rows} == set(CODES)
    assert all(len(r) == 4 and r[0].isupper() and ' ' in r[1] for r in rows)
    data = json.loads((ROOT / 'data' / 'nba-injury-reports.json').read_text())
    assert all(d[5:7] == '02' for d in data['missing']), 'only All-Star breaks have no report'
    assert compact(reports)['reports'] == data['reports']
