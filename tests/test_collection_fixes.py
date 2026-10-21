"""Collection fixes of the 21.10.2026 audit: game points from each game's own row, the season-end cut, the quality guard
on games and calendars, tip-off times, the injury report kept through an ESPN outage, merging a full collection with
the watcher's later profile and roster, and the pre-season ∞ that a number read ends. Nothing here reaches the network."""
import json
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import scripts.season_watch as sw

c = sw.sports
HEAD = ''.join(f'<td>{h}</td>' for h in ['Дата', 'Соперник', '', 'Счет', 'МИН', '2О', 'В20', '3О', 'В3О', 'Ш', 'ВШ', 'ПБ', 'ПР', 'Ф', 'ПХ', 'П', 'БШ', 'О', 'ФО', 'С'])


def row(day, opponent, side, score, minutes, stats, fo, price=3500):
    """A Sports.ru game row: stats are 2О В20 3О В3О Ш ВШ ПБ ПР Ф ПХ П БШ О."""
    return '<tr>' + ''.join(f'<td>{x}</td>' for x in [day, opponent, side, score, minutes, *stats, fo, price]) + '</tr>'


def table(*rows, head=HEAD):
    return f'<table class="stat-table small"><tr>{head}</tr>' + ''.join(rows) + '</table>'


# Jokic's real 13.04.2026 row (away at San Antonio, 118 : 128, 18:15): FBL 28 (1 for the game played), Sports.ru 32
# with +2 for 10+ minutes and the +3 away win.
JOKIC = row('24.10.2026', 'Сан-Антонио', 'Г', '118 : 128', '18:15', [6, 10, 1, 2, 8, 8, 8, 1, 1, 0, 0, 1, 23], 32)
# A home loss under 10 minutes: 4 points of counting stats, 2 missed shots, a turnover, a foul, +1 for the game = 0.
CAMEO = row('26.10.2026', 'Мемфис', 'Д', '100 : 110', '09:59', [1, 2, 0, 1, 0, 0, 2, 0, 1, 0, 1, 0, 2], -3)


class GamePointsFromTheRowTests(unittest.TestCase):
    def test_the_box_score_gives_fbl_points_and_the_row_score_checks_them(self):
        games = c.parse_games(table(JOKIC, CAMEO, row('27.10.2026', 'Юта', 'Г', '99 : 98', '10:00', [1, 2, 0, 1, 0, 0, 2, 0, 1, 0, 1, 0, 2], -1)))
        self.assertEqual([(g['points'], g['sportsPoints'], g['result'], g['pointsSource']) for g in games],
                         [(28, 32, 'W', 'BOX'), (0, -3, 'L', 'BOX'), (0, -1, 'L', 'BOX')])
        self.assertFalse(any('pointsCheck' in g for g in games))

    def test_a_row_whose_sports_points_are_not_fbl_plus_the_bonus_is_flagged_and_counted(self):
        bad = row('28.10.2026', 'Юта', 'Д', '120 : 100', '30:00', [0] * 12 + [10], 20)
        games = c.parse_games(table(JOKIC, bad))
        self.assertEqual((games[1]['points'], games[1]['pointsCheck']), (11, 'MISMATCH'))
        summary = c.game_points_summary({'p': {'games': games}})
        self.assertEqual((summary['played'], summary['mismatches'], summary['gamesWithResult'], summary['gamesWithoutBox']), (2, 1, 2, 0))

    def test_rows_after_the_yahoo_window_are_dropped_by_date_not_by_zero_points(self):
        self.assertEqual(c.SEASON_END, '2027-04-12')  # data/league-rules.json yahoo.scoringEnd 2027-04-11 (US) + 1 day
        last = row('12.04.2027', 'Портленд', 'Д', '110 : 100', '20:00', [0] * 13, 0)
        playin = row('15.04.2027', 'Портленд', 'Д', '110 : 114', '38:43', [5, 9, 1, 3, 2, 2, 5, 4, 2, 1, 1, 0, 15], 0)
        self.assertEqual([g['date'] for g in c.parse_games(table(last, playin))], ['2027-04-12'])
        self.assertIsNone(c.season_end('/nonexistent/league-rules.json'))

    def test_without_box_columns_a_played_row_has_no_fbl_points_whatever_the_score_says(self):
        # Sports.ru's points less its result bonus and its minutes point are no FBL points (Yahoo formula only, 21.10.2026):
        # the row keeps Sports.ru's number and the result, and gets none.
        head = ''.join(f'<td>{h}</td>' for h in ['Дата', 'Соперник', '', 'Счет', 'МИН', 'ФО', 'С'])
        g = c.parse_games(table('<tr><td>24.10.2026</td><td>Сан-Антонио</td><td>Г</td><td>118 : 128</td><td>18:15</td><td>32</td><td>3500</td></tr>', head=head))[0]
        self.assertEqual((g['points'], g['pointsSource'], g['sportsPoints'], g['result']), (None, 'NO_BOX', 32, 'W'))
        bare = ''.join(f'<td>{h}</td>' for h in ['Дата', 'Соперник', '', 'МИН', 'ФО', 'С'])
        players = {'p': {'games': c.parse_games(table('<tr><td>24.10.2026</td><td>Сан-Антонио</td><td>Г</td><td>18:15</td><td>32</td><td>3500</td></tr>', head=bare))}}
        g = players['p']['games'][0]
        self.assertEqual((g['points'], g['pointsSource'], g['sportsPoints'], 'result' in g), (None, 'NO_BOX', 32, False))
        self.assertEqual({k: c.game_points_summary(players)[k] for k in ('played', 'gamesWithoutBox', 'sources')}, {'played': 1, 'gamesWithoutBox': 1, 'sources': {'NO_BOX': 1}})

    def test_row_points_stand_without_any_calendar(self):
        players = {'p': {'games': c.parse_games(table(JOKIC))}}
        self.assertEqual((players['p']['games'][0]['points'], players['p']['games'][0]['pointsSource']), (28, 'BOX'))

    def test_real_2025_26_rows_match_sports_points_minus_the_bonus(self):
        # A sample of real 2025/26 rows (Sports.ru «В20» spelling): home first, the bonus is +2/+3 for a home/away win, and
        # Sports.ru's +2 for 10+ minutes is FBL's +1.
        rows = [row('09.04.2026', 'Мемфис', 'Д', '136 : 119', '31:02', [5, 7, 0, 1, 4, 5, 16, 10, 0, 2, 2, 0, 14], 38),
                row('11.04.2026', 'Оклахома-Сити', 'Д', '127 : 107', '00:00', [0] * 13, 0)]
        games = c.parse_games(table(*rows), season_start='2025-10-01')
        self.assertEqual([(g['played'], g['points'], g.get('pointsCheck')) for g in games], [(True, 35, None), (False, 0, None)])


def clubs_of(n, rows, start='2026-10-22'):
    return {f'c{i}': [{'date': (date.fromisoformat(start) + timedelta(days=d)).isoformat(), 'opponent': 'x', 'home': True, 'week': 1}
                      for d in range(rows)] for i in range(n)}


def players_with(played, n=10):
    return {str(i): {'games': [{'date': '2026-10-22', 'played': k < played} for k in range(10)]} for i in range(n)}


class QualityGuardTests(unittest.TestCase):
    def test_a_lost_calendar_is_refused(self):
        good, today = clubs_of(30, 80), '2026-10-21'
        previous = {'season': c.SEASON_LABEL, 'clubs': good, 'players': players_with(0)}
        self.assertIsNone(c.refuse_reason(previous, players_with(0), good, today))  # today's live state: pre-season
        self.assertIn('calendars of only 0 clubs', c.refuse_reason(previous, players_with(0), {}, today))
        self.assertIn('calendars of only 0 clubs', c.refuse_reason({}, players_with(0), {}, today))
        self.assertIn('upcoming calendar games fell', c.refuse_reason(previous, players_with(0), clubs_of(30, 40), today))
        # Past games a calendar drops are no loss: only games after today count.
        self.assertIsNone(c.refuse_reason(previous, players_with(0), clubs_of(30, 70, '2026-11-01'), '2026-10-31'))
        # After the regular season a calendar may be empty.
        self.assertIsNone(c.refuse_reason({'season': c.SEASON_LABEL, 'clubs': {}}, players_with(0), {}, '2027-04-20'))
        self.assertEqual(c.parse_calendar('<div id="calendar"><table><tr><td>23.10.2026<span class="sp">|</span>тур 1</td></tr></table>'), [])

    def test_a_game_table_that_lost_its_games_is_refused(self):
        clubs = clubs_of(30, 80)
        previous = {'season': c.SEASON_LABEL, 'clubs': clubs, 'players': players_with(10)}
        self.assertIn('played games of the same players fell from 100 to 0', c.refuse_reason(previous, players_with(0), clubs, '2026-10-21'))
        self.assertIsNone(c.refuse_reason(previous, {**players_with(10, 9), '9': {'games': []}}, clubs, '2026-10-21'))  # 90 of 100
        # Players missing from this collection (a failed page) are no loss; another season's snapshot is not compared.
        self.assertIsNone(c.refuse_reason(previous, players_with(10, 5), clubs, '2026-10-21'))
        self.assertIsNone(c.refuse_reason({**previous, 'season': '2025/2026'}, players_with(0), clubs, '2026-10-21'))

    def test_game_tables_without_points_or_minutes_are_refused(self):
        page = table(JOKIC).replace('<td>ФО</td>', '<td>ФО*</td>')
        self.assertEqual(c.parse_games(page), [])
        self.assertTrue(c.unreadable_games(page))
        self.assertFalse(c.unreadable_games(table(JOKIC)))
        self.assertFalse(c.unreadable_games(table(head=HEAD.replace('<td>ФО</td>', ''))))  # no games yet
        real = c.fetch
        c.fetch = lambda url, compressed=False: page
        try:
            _, info, _ = c.collect({'sportsId': '1'})
        finally:
            c.fetch = real
        self.assertEqual(info['gameTable'], 'UNREADABLE')
        players = {str(i): {'gameTable': 'UNREADABLE'} if i < 6 else {} for i in range(100)}
        self.assertIn('6 game tables', c.refuse_reason({}, players, clubs_of(30, 80), '2026-10-21'))
        self.assertIsNone(c.refuse_reason({}, {**players, '0': {}}, clubs_of(30, 80), '2026-10-21'))


def event(tip, home, away, valid=True):
    return {'date': tip, 'timeValid': valid, 'competitions': [{'timeValid': valid, 'competitors': [
        {'homeAway': 'home', 'team': {'abbreviation': home}}, {'homeAway': 'away', 'team': {'abbreviation': away}}]}]}


class TipTests(unittest.TestCase):
    def schedules(self):
        # BOS@DET at 22:00 Moscow on 20.10, PHI@NY at 02:00 Moscow on 21.10 (the US evening of 20.10).
        return {'DET': {'events': [event('2026-10-20T19:00Z', 'DET', 'BOS')]},
                'NY': {'events': [event('2026-10-20T23:00Z', 'NY', 'PHI'), event('2026-10-23T23:30Z', 'NY', 'BOS', valid=False)]}}

    def clubs(self):
        return {'Детройт': [{'date': '2026-10-20', 'opponent': 'Бостон', 'home': True}],
                'Нью-Йорк': [{'date': '2026-10-21', 'opponent': 'Филадельфия', 'home': True},
                             {'date': '2026-10-24', 'opponent': 'Бостон', 'home': True}],
                'Филадельфия': [{'date': '2026-10-21', 'opponent': 'Нью-Йорк', 'home': False}]}

    def test_calendar_games_and_player_rows_get_the_tip_by_moscow_date_and_clubs(self):
        clubs = self.clubs()
        players = {'1': {'games': [{'date': '2026-10-21', 'opponent': 'Филадельфия', 'home': True, 'played': True}]},
                   # A traded player's row: no calendar of his club has it, the opponent's only game that day does.
                   '2': {'games': [{'date': '2026-10-20', 'opponent': 'Детройт', 'home': False, 'played': True}]}}
        self.assertEqual(c.add_tips(clubs, players, self.schedules()), 3)
        self.assertEqual(clubs['Детройт'][0]['tip'], '2026-10-20T19:00:00+00:00')
        self.assertEqual(clubs['Нью-Йорк'][0]['tip'], clubs['Филадельфия'][0]['tip'])
        self.assertEqual(clubs['Нью-Йорк'][0]['tip'], '2026-10-20T23:00:00+00:00')
        self.assertNotIn('tip', clubs['Нью-Йорк'][1])  # ESPN has no time for it yet
        self.assertEqual(players['1']['games'][0]['tip'], '2026-10-20T23:00:00+00:00')
        self.assertEqual(players['2']['games'][0]['tip'], '2026-10-20T19:00:00+00:00')

    def test_without_espn_the_previous_tips_stay_and_nothing_fails(self):
        previous = {'clubs': self.clubs(), 'players': {'1': {'games': [{'date': '2026-11-01', 'opponent': 'Юта', 'tip': '2026-11-01T00:00:00+00:00'}]}}}
        c.add_tips(previous['clubs'], {}, self.schedules())
        clubs, players = self.clubs(), {'1': {'games': [{'date': '2026-11-01', 'opponent': 'Юта', 'home': True}]}}
        self.assertEqual(c.add_tips(clubs, players, {}, previous), 3)
        self.assertEqual(clubs['Детройт'][0]['tip'], '2026-10-20T19:00:00+00:00')
        self.assertEqual(players['1']['games'][0]['tip'], '2026-11-01T00:00:00+00:00')
        real = c.fetch
        def boom(url, compressed=False):
            raise RuntimeError('ESPN down')
        c.fetch = boom
        try:
            self.assertEqual(c.espn_schedules(), {})
        finally:
            c.fetch = real


class InjuryOutageTests(unittest.TestCase):
    def test_a_failed_fetch_keeps_the_previous_report_for_three_days(self):
        now = '2026-10-21T12:00:00+00:00'
        old = {'espnInjuries': {'fetchedAt': '2026-10-21T10:00:00+00:00', 'injuries': [{'injuries': [{'status': 'Out'}]}]}}
        self.assertEqual(c.keep_injuries({'fetchedAt': now}, old, now), ({'fetchedAt': now}, True))
        self.assertEqual(c.keep_injuries(None, old, now), (old['espnInjuries'], False))
        self.assertEqual(c.keep_injuries(None, {'espnInjuries': {'fetchedAt': '2026-10-18T11:00:00+00:00'}}, now), (None, False))
        self.assertEqual(c.keep_injuries(None, {}, now), (None, False))

    def test_an_empty_report_is_a_broken_feed(self):
        real = c.fetch
        c.fetch = lambda url, compressed=False: json.dumps({'injuries': [{'displayName': 'Boston Celtics', 'injuries': []}]})
        try:
            self.assertIsNone(c.espn_injuries())
        finally:
            c.fetch = real


INFO = '''<h1><b>Никола Йокич</b></h1><div>Команда <a>Денвер</a> (номер 15)</div><div>Амплуа Центровой</div>
<div>Текущая стоимость <b>3600</b></div><div>Первоначальная стоимость <b>3500</b></div><div>Выбрали 28.2% пользователей</div>
<div id="calendar"><table class="stat-table"><tbody>
<tr><td class="name-td">24.10.2026<span class="sp">|</span>неделя 1</td><td><a>Сан-Антонио</a></td><td><span> В гостях </span></td><td><b>118 : 128</b></td></tr>
<tr><td class="name-td">26.10.2026<span class="sp">|</span>неделя 1</td><td><a>Мемфис</a></td><td><span> Дома </span></td><td><b> : </b></td></tr>
</tbody></table></div>'''


class CollectionRunTests(unittest.TestCase):
    """main() end to end on fake pages: ESPN's injuries fail, its schedules answer for one club."""

    def run_main(self, previous, schedule):
        tmp = Path(tempfile.mkdtemp())
        (tmp / 'prices.json').write_text(json.dumps({'players': [{'sportsId': '1', 'name': 'Йокич', 'club': 'Денвер', 'clubId': '1'}]}), encoding='utf-8')
        (tmp / 'additions.json').write_text(json.dumps({'players': []}), encoding='utf-8')
        (tmp / 'teams.json').write_text(json.dumps({'teams': {}}), encoding='utf-8')
        out = tmp / 'sports-current.json'
        out.write_text(json.dumps(previous, ensure_ascii=False), encoding='utf-8')

        def fake(url, compressed=False):
            if 'injuries' in url:
                raise RuntimeError('ESPN down')
            if '/schedule' in url:
                return schedule(url)
            return INFO + table(JOKIC, CAMEO) if 'player/info' in url else None
        saved = {k: getattr(c, k) for k in ('fetch', 'PRICES', 'ADDITIONS', 'TEAMS', 'OUT', 'MIN_CLUBS', 'PAUSE')}
        c.fetch, c.PRICES, c.ADDITIONS, c.TEAMS, c.OUT, c.MIN_CLUBS = fake, tmp / 'prices.json', tmp / 'additions.json', tmp / 'teams.json', out, 1
        try:
            c.main()
        finally:
            for k, v in saved.items():
                setattr(c, k, v)
        return json.loads(out.read_text(encoding='utf-8')), tmp

    def previous(self):
        at = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat(timespec='seconds')
        return {'season': 'older', 'espnInjuries': {'source': c.INJURY_URL, 'fetchedAt': at, 'injuries': [{'displayName': 'X', 'injuries': [{'status': 'Out'}]}]}}

    def test_an_espn_outage_keeps_the_last_report_flagged_and_tips_and_points_are_published(self):
        sa = {'events': [event('2026-10-24T00:30Z', 'SA', 'DEN')]}
        previous = self.previous()
        snap, tmp = self.run_main(previous, lambda url: json.dumps(sa) if '/sa/' in url else None)
        self.assertIs(snap['espnInjuriesOk'], False)
        self.assertEqual(snap['espnInjuries'], previous['espnInjuries'])
        self.assertEqual(snap['espnInjuriesAt'], previous['espnInjuries']['fetchedAt'])
        self.assertFalse((tmp / 'injury-history.json').exists())  # a kept report is no new observation
        self.assertTrue(any('ESPN injuries unavailable; kept the report' in e['error'] for e in snap['errors']))
        self.assertEqual(snap['clubs']['Денвер'][0]['tip'], '2026-10-24T00:30:00+00:00')
        self.assertNotIn('tip', snap['clubs']['Денвер'][1])
        self.assertEqual(snap['players']['1']['games'][0]['tip'], '2026-10-24T00:30:00+00:00')
        self.assertEqual((snap['tips']['clubs'], snap['tips']['games'], snap['tips']['of']), (1, 1, 2))
        self.assertEqual({k: snap['gamePoints'][k] for k in ('played', 'gamesWithResult', 'gamesWithoutBox', 'uncounted', 'mismatches')},
                         {'played': 2, 'gamesWithResult': 2, 'gamesWithoutBox': 0, 'uncounted': 0, 'mismatches': 0})
        self.assertEqual([g['points'] for g in snap['players']['1']['games']], [28, 0])

    def test_failing_schedules_never_fail_the_collection(self):
        def boom(url):
            raise RuntimeError('timeout')
        snap, _ = self.run_main(self.previous(), boom)
        self.assertEqual(snap['tips']['games'], 0)
        self.assertTrue(any('ESPN schedules of 0 of 30 clubs' in e['error'] for e in snap['errors']))
        self.assertEqual(len(snap['players']), 1)


class MergeAndProfileTests(unittest.TestCase):
    def test_merge_keeps_the_watchers_later_profile_and_roster(self):
        a = {'date': '2026-10-21', 'buy': {'name': 'A', 'price': 1}, 'sell': None}
        deal = {'date': '2026-10-21', 'sell': {'name': 'Сабонис', 'price': 2100}, 'buy': {'name': 'Хартенштайн', 'price': 1700}, 'seenAt': 't3'}
        full = {'teams': {'0': {'profileReadAt': 't1', 'rosterReadAt': 't1', 'balance': 200, 'transfersLeft': 3, 'transfersUnlimited': True,
                                'roster': [{'sportsId': '9', 'name': 'Сабонис'}], 'journal': [a], 'journalReadAt': 't1'}}}
        cur = {'teams': {'0': {'profileReadAt': 't3', 'rosterReadAt': 't3', 'balance': 600, 'transfersLeft': 2,
                               'roster': [{'sportsId': '7', 'name': 'Хартенштайн'}], 'journal': [a, deal], 'journalReadAt': 't4'}}}
        out = sw.merge_full(json.loads(json.dumps(full)), cur)['teams']['0']
        self.assertEqual((out['balance'], out['transfersLeft'], out['roster'][0]['name'], out['profileReadAt']), (600, 2, 'Хартенштайн', 't3'))
        self.assertNotIn('transfersUnlimited', out)  # the later read had a number
        self.assertEqual(out['journal'], [a, deal])
        # The collection read later (or the watcher's copy has no stamp): the collection's profile and roster stand.
        for mine in ({**cur['teams']['0'], 'profileReadAt': 't0', 'rosterReadAt': 't0'}, {k: v for k, v in cur['teams']['0'].items() if not k.endswith('ReadAt')}):
            out = sw.merge_full(json.loads(json.dumps(full)), {'teams': {'0': mine}})['teams']['0']
            self.assertEqual((out['balance'], out['transfersLeft'], out['roster'][0]['name'], out['profileReadAt']), (200, 3, 'Сабонис', 't1'))

    def test_the_watcher_stamps_its_profile_and_roster_reads_and_a_number_ends_the_pre_season_infinity(self):
        real = sw.sports.fetch
        pages = {'profile': '<th>Баланс</th><td>600</td><th>Трансферы</th><td>2</td>'}
        def fetch(url, compressed=False):
            if url == sw.sports.ROSTER_URL.format(id='s0'):
                return json.dumps({'players': [{'id': '7', 'name': 'Хартенштайн', 'club': 'Оклахома-Сити', 'amplua': '5', 'price': '1700', 'lock': '0'}]})
            if url == sw.sports.TEAM_URL.format(id='s0'):
                if pages['profile'] is None:
                    raise RuntimeError('timeout')
                return pages['profile']
            return None
        row = lambda n: {'date': '2026-10-21', 'buy': {'name': n, 'price': 1700}, 'sell': {'name': 'X', 'price': 1500}}
        sw.sports.fetch = fetch
        try:
            snap = {'players': {}, 'teams': {'0': {'journal': [row('A')], 'journalReadAt': 't0', 'balance': 100, 'transfersUnlimited': True, 'profileReadAt': 'old'}}}
            sw.apply(snap, {'0': [row('A'), row('Хартенштайн')]}, ['0'], {'0': 's0'}, 't1')
            t = snap['teams']['0']
            self.assertEqual((t['balance'], t['transfersLeft']), (600, 2))
            self.assertNotIn('transfersUnlimited', t)
            self.assertGreater(t['profileReadAt'], '2026')
            self.assertEqual(t['rosterReadAt'], t['profileReadAt'])
            # ∞ again: kept. A failed profile read changes neither the profile nor its stamp.
            pages['profile'] = '<th>Баланс</th><td>600</td><th>Трансферы</th><td>∞</td>'
            sw.apply(snap, {'0': [row('A'), row('Хартенштайн'), row('B')]}, ['0'], {'0': 's0'}, 't2')
            self.assertIs(snap['teams']['0']['transfersUnlimited'], True)
            snap['teams']['0']['profileReadAt'] = 'stamp'
            pages['profile'] = None
            sw.apply(snap, {'0': [row('A'), row('Хартенштайн'), row('B'), row('C')]}, ['0'], {'0': 's0'}, 't3')
            self.assertEqual((snap['teams']['0']['profileReadAt'], snap['teams']['0']['balance']), ('stamp', 600))
        finally:
            sw.sports.fetch = real

    def test_the_full_collection_stamps_its_profile_and_roster_reads(self):
        real_fetch, real_teams = c.fetch, c.TEAMS
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'teams': {'0': '1', '1': '2'}}, f)
        def fake(url, compressed=False):
            if 'journal' in url:
                return '<td>Покупки</td><tbody></tbody>'
            if url.endswith('.json'):
                return '{"players":[{"id":"7","name":"A","club":"Юта","amplua":"5","price":"1000","lock":"0"}]}'
            # Team 1's profile lost its balance (a layout change): its old values and their stamp stay.
            return '<h1>T</h1>' if '/2.html' in url else '<th>Баланс</th><td>150</td><th>Трансферы</th><td>3</td>'
        c.fetch, c.TEAMS = fake, Path(f.name)
        try:
            teams = c.collect_teams({'1': {'balance': 90, 'transfersLeft': 1, 'profileReadAt': 'old', 'journal': []}}, [])
        finally:
            c.fetch, c.TEAMS = real_fetch, real_teams
        self.assertEqual(teams['0']['profileReadAt'], teams['0']['journalReadAt'])
        self.assertEqual(teams['0']['rosterReadAt'], teams['0']['journalReadAt'])
        self.assertEqual((teams['1']['balance'], teams['1']['profileReadAt']), (90, 'old'))
        self.assertEqual(teams['1']['rosterReadAt'], teams['1']['journalReadAt'])


class PlayedCalendarTests(unittest.TestCase):
    """Sports.ru's calendar lists only games still to come: played games must stay, or the week and season facts lose them."""
    def cal(self, *games):
        return [{'date': d, 'opponent': o, 'home': h, 'score': None, 'week': w} for d, o, h, w in games]

    def test_played_games_stay_with_their_week_and_the_opening_night_is_rebuilt_from_player_rows(self):
        previous = {'season': c.SEASON_LABEL, 'clubs': {'Бостон': self.cal(('2026-10-24', 'Нью-Йорк', True, 1), ('2026-10-27', 'Майами', False, 2),
                                                                         ('2026-10-30', 'Юта', True, 2))}}
        # 28.10: the 24.10 game is played and the 30.10 one was moved to 05.11; the opening night (20.10) was never listed.
        clubs = {'Бостон': self.cal(('2026-10-27', 'Майами', False, 2), ('2026-11-05', 'Юта', True, 3))}
        rows = lambda club, n, *games: {f'{club}{i}': {'club': club, 'games': [{'date': d, 'opponent': o, 'home': h, 'played': True} for d, o, h in games]} for i in range(n)}
        players = {**rows('Бостон', 14, ('2026-10-20', 'Детройт', False), ('2026-10-24', 'Нью-Йорк', True)),
                   **rows('Бостон', 1, ('2026-10-21', 'Орландо', True)),        # one traded player's old club: not Boston's game
                   **rows('Детройт', 3, ('2026-10-22', 'Бостон', True))}        # a club without a calendar is left alone
        self.assertEqual(c.keep_played(clubs, previous, players, '2026-10-28'), 2)
        self.assertEqual([(g['date'], g.get('week'), g.get('gone', False)) for g in clubs['Бостон']],
                         [('2026-10-20', 1, True), ('2026-10-24', 1, True), ('2026-10-27', 2, False), ('2026-11-05', 3, False)])
        self.assertEqual(c.week_ranges(clubs.values())['1'], {'start': '2026-10-20', 'end': '2026-10-24'})
        self.assertEqual(c.keep_played(clubs, {**previous, 'clubs': clubs}, players, '2026-10-28'), 0, 'a second run adds nothing')
        self.assertEqual(c.keep_played({'Бостон': []}, {'season': 'older', 'clubs': previous['clubs']}, {}, '2026-10-28'), 0)


if __name__ == '__main__':
    unittest.main()
