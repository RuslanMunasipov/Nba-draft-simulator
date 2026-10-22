"""Collection review 2 (21.10.2026, the league's Yahoo formula): a played game's FBL points come only from its own row's
box score, Sports.ru's ФО is kept as its own number and checked only once Sports.ru counts the game, tables without a box
score are refused, a player whose table could not be read keeps what was read before, a failed player's rows in the
watcher's merge are never an older collector's numbers, and a game played since the last snapshot keeps its tip-off
through an ESPN outage. Nothing here reaches the network."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

import scripts.season_watch as sw
import tests.test_collection_fixes as fixes

c = sw.sports
STATS = [7, 10, 2, 9, 8, 9, 4, 5, 3, 3, 2, 3, 28]


def maxey(fo='<span class="null">0</span>', stats=STATS, head=fixes.HEAD):
    """Maxey's real row of 21.10.2026 (page 2038002 read at 07:58Z and 08:46Z): at New York, won 106 : 100, 39:34. Its box
    score gives 26, as ESPN's does; Sports.ru had not counted it yet (ФО 0), counted it gives 26 + 3 (away win) + 1."""
    return fixes.table(fixes.row('21.10.2026', 'Нью-Йорк', 'Г', '100 : 106', '39:34', stats, fo, 2300), head=head)


def view(g):
    return g['points'], g['pointsSource'], g['sportsPoints'], g.get('result'), g.get('pointsCheck')


class BoxScoreOnlyTests(unittest.TestCase):
    def test_a_game_sports_ru_has_not_counted_is_scored_by_its_box_and_is_no_mismatch(self):
        games = c.parse_games(maxey())
        self.assertEqual(view(games[0]), (26, 'BOX', 0, 'W', 'UNCOUNTED'))
        summary = c.game_points_summary({'p': {'games': games}})
        self.assertEqual((summary['uncounted'], summary['mismatches'], summary['gamesWithoutBox'], summary['sources']), (1, 0, 0, {'BOX': 1}))
        # Counted: Sports.ru's 30 is the box score plus its +3 and its minutes point; 31 is a real disagreement.
        self.assertEqual(view(c.parse_games(maxey('30'))[0]), (26, 'BOX', 30, 'W', None))
        games = c.parse_games(maxey('31'))
        self.assertEqual(view(games[0]), (26, 'BOX', 31, 'W', 'MISMATCH'))
        self.assertEqual(c.game_points_summary({'p': {'games': games}})['mismatches'], 1)

    def test_a_sports_points_cell_that_is_no_number_never_drops_a_box_scored_game(self):
        self.assertEqual(view(c.parse_games(maxey('–'))[0]), (26, 'BOX', None, 'W', 'UNCOUNTED'))

    def test_without_a_readable_box_score_a_played_game_gets_no_points_never_sports_points_less_bonuses(self):
        renamed = fixes.HEAD.replace('<td>ПХ</td>', '<td>ПЕР</td>')
        # Before Sports.ru counts the game the old derivation gave -4, after it 26: both are Sports.ru's number, not FBL's.
        self.assertEqual(view(c.parse_games(maxey(head=renamed))[0]), (None, 'NO_BOX', 0, 'W', None))
        self.assertEqual(view(c.parse_games(maxey('30', head=renamed))[0]), (None, 'NO_BOX', 30, 'W', None))
        self.assertEqual(view(c.parse_games(maxey(stats=[''] * 13))[0]), (None, 'NO_BOX', 0, 'W', None))
        # Neither box score nor score (Jokic's away win, ФО 32): no FBL points and no result, never 31 with the bonus in.
        head = ''.join(f'<td>{h}</td>' for h in ['Дата', 'Соперник', '', 'МИН', 'ФО', 'С'])
        g = c.parse_games(fixes.table('<tr><td>24.10.2026</td><td>Сан-Антонио</td><td>Г</td><td>18:15</td><td>32</td><td>3500</td></tr>', head=head))[0]
        self.assertEqual(view(g), (None, 'NO_BOX', 32, None, None))
        # The old derivation (Sports.ru's points less its bonuses) is gone: the collector's only fbl_points is the official
        # formula (league owner, 22.10.2026), applied to the box score.
        self.assertIn(c.fbl_points.__module__, ('fbl_formula', 'scripts.fbl_formula'))

    def test_many_tables_without_a_box_score_are_a_layout_change_and_are_refused(self):
        clubs = fixes.clubs_of(30, 80)
        bare = c.parse_games(maxey(head=fixes.HEAD.replace('<td>ПХ</td>', '<td>ПЕР</td>')))
        good = c.parse_games(maxey())
        players = {str(i): {'games': copy.deepcopy(bare if i < 6 else good)} for i in range(100)}
        self.assertEqual(c.refuse_reason({}, players, clubs, '2026-10-21'), '6 game tables with played games but no readable box score; game table layout changed?')
        players['0'] = {'games': copy.deepcopy(good)}
        self.assertIsNone(c.refuse_reason({}, players, clubs, '2026-10-21'))
        # Sports.ru not having counted the games is no layout change.
        self.assertIsNone(c.refuse_reason({}, {str(i): {'games': copy.deepcopy(good)} for i in range(100)}, clubs, '2026-10-21'))


def box_row(day, opponent, points, **extra):
    return {'date': day, 'opponent': opponent, 'home': False, 'minutes': '30:00', 'played': True, 'points': points, 'pointsSource': 'BOX', 'sportsPoints': 0, **extra}


class KeptGamesTests(unittest.TestCase):
    def previous(self, games, season=c.SEASON_LABEL):
        return {'season': season, 'collectedAt': '2026-10-21T08:00:00+00:00', 'players': {'1': {'games': games}, '2': {'games': []}}}

    def test_a_player_whose_table_could_not_be_read_keeps_the_previous_games(self):
        # An older collector's row (Sports.ru's ФО as points, no source) is kept without points; a DNP stays as it was.
        old = [box_row('2026-10-21', 'Нью-Йорк', 26), {'date': '2026-10-23', 'opponent': 'Бостон', 'home': True, 'minutes': '31:00', 'played': True, 'points': 30},
               {'date': '2026-10-25', 'opponent': 'Юта', 'home': True, 'minutes': '00:00', 'played': False, 'points': 0}]
        previous = self.previous(old)
        players = {'1': {'games': [], 'gameTable': 'UNREADABLE'}, '2': {'games': []}}
        self.assertEqual(c.keep_games(players, previous), ['1'])
        self.assertEqual([(g['date'], g['points'], g.get('pointsSource'), g.get('sportsPoints')) for g in players['1']['games']],
                         [('2026-10-21', 26, 'BOX', 0), ('2026-10-23', None, 'NO_BOX', 30), ('2026-10-25', 0, None, None)])
        self.assertEqual(players['1']['gamesKeptFrom'], '2026-10-21T08:00:00+00:00')
        self.assertEqual(previous['players']['1']['games'][1]['points'], 30, 'the previous snapshot is not changed')
        self.assertEqual(players['2'], {'games': []}, 'no played games before: nothing to keep')
        # Still unread at the next collection: the games keep the time they were read.
        again = {'1': {'games': []}}
        c.keep_games(again, {**self.previous(players['1']['games']), 'collectedAt': '2026-10-21T10:00:00+00:00', 'players': {'1': players['1']}})
        self.assertEqual(again['1']['gamesKeptFrom'], '2026-10-21T08:00:00+00:00')
        # Another season's snapshot is never kept.
        self.assertEqual(c.keep_games({'1': {'games': []}}, self.previous(old, '2025/2026')), [])

    def test_a_row_without_a_box_score_keeps_the_box_points_read_before(self):
        previous = self.previous([box_row('2026-10-21', 'Нью-Йорк', 26)])
        new = {**box_row('2026-10-23', 'Бостон', None), 'pointsSource': 'NO_BOX'}
        players = {'1': {'games': c.parse_games(maxey(head=fixes.HEAD.replace('<td>ПХ</td>', '<td>ПЕР</td>'))) + [new]}}
        self.assertEqual(c.keep_games(players, previous), [])
        g = players['1']['games'][0]
        self.assertEqual((g['points'], g['pointsSource'], g['pointsKeptFrom'], g['sportsPoints'], g['minutes']), (26, 'BOX', '2026-10-21T08:00:00+00:00', 0, '39:34'))
        # A row the previous snapshot did not have, or had without a box score, stays without points.
        self.assertEqual((players['1']['games'][1]['points'], players['1']['games'][1]['pointsSource']), (None, 'NO_BOX'))
        players = {'1': {'games': c.parse_games(maxey(head=fixes.HEAD.replace('<td>ПХ</td>', '<td>ПЕР</td>')))}}
        c.keep_games(players, self.previous([{**box_row('2026-10-21', 'Нью-Йорк', None), 'pointsSource': 'NO_BOX'}]))
        self.assertEqual(players['1']['games'][0]['pointsSource'], 'NO_BOX')


class WatcherMergeTests(unittest.TestCase):
    def test_a_player_whose_page_failed_keeps_only_box_scored_points(self):
        old_row = {'date': '2026-10-21', 'opponent': 'Нью-Йорк', 'home': False, 'minutes': '39:34', 'played': True, 'points': 0, 'price': 2300}
        derived = {**box_row('2026-10-22', 'Юта', -4), 'pointsSource': 'ROW_SCORE', 'sportsPoints': 0, 'result': 'W'}
        cur = {'players': {'1': {'name': 'Макси', 'price': 2300, 'games': [old_row, derived, box_row('2026-10-23', 'Бостон', 25)]},
                           '9': {'name': 'Новый', 'fromRoster': True}, '2': {'name': 'B', 'price': 1}}, 'teams': {}}
        before = copy.deepcopy(cur)
        out = sw.merge_full({'players': {'2': {'name': 'B', 'price': 2, 'games': []}}, 'teams': {}}, cur)['players']
        self.assertEqual([(g['date'], g['points'], g['pointsSource'], g['sportsPoints']) for g in out['1']['games']],
                         [('2026-10-21', None, 'NO_BOX', 0), ('2026-10-22', None, 'NO_BOX', 0), ('2026-10-23', 25, 'BOX', 0)])
        self.assertEqual(out['1']['games'][1]['result'], 'W')
        self.assertIs(out['1']['stale'], True)
        self.assertEqual((out['9'], out['2']['price']), ({'name': 'Новый', 'fromRoster': True}, 2))
        self.assertEqual(cur, before, "the watcher's snapshot is not changed")

    def test_a_run_starting_from_an_older_collectors_snapshot_publishes_none_of_its_points(self):
        snap = {'players': {'1': {'games': [{'date': '2026-10-21', 'played': True, 'points': 30},
                                            {'date': '2026-10-22', 'played': False, 'points': 0}, box_row('2026-10-23', 'Бостон', 25)]}}}
        sw.unscore_old_rows(snap)
        self.assertEqual([(g['points'], g.get('pointsSource'), g.get('sportsPoints')) for g in snap['players']['1']['games']],
                         [(None, 'NO_BOX', 30), (0, None, None), (25, 'BOX', 0)])
        self.assertEqual(sw.unscore_old_rows({}), {})


class TipOfANewlyPlayedGameTests(unittest.TestCase):
    def test_a_game_played_since_the_last_snapshot_keeps_its_tip_through_an_espn_outage(self):
        # As main() runs them: the played game the calendar dropped comes back from the previous snapshot with its tip,
        # and the new player row takes it there, ESPN's schedules failing (snapshots N+1 and N+2).
        previous = {'season': c.SEASON_LABEL, 'clubs': {'Бостон': [{'date': '2026-12-25', 'opponent': 'Нью-Йорк', 'home': False, 'week': 9, 'tip': '2026-12-25T17:00:00+00:00'}]}}
        for _ in range(2):
            players = {'1': {'club': 'Бостон', 'games': [{'date': '2026-12-25', 'opponent': 'Нью-Йорк', 'home': False, 'played': True}]}}
            clubs = {'Бостон': [{'date': '2026-12-27', 'opponent': 'Юта', 'home': True, 'week': 10}]}
            c.keep_played(clubs, previous, players, '2026-12-26')
            c.add_tips(clubs, players, {}, previous)
            self.assertEqual(players['1']['games'][0]['tip'], '2026-12-25T17:00:00+00:00')
            previous = {'season': c.SEASON_LABEL, 'clubs': clubs, 'players': players}


INFO = '''<h1><b>{name}</b></h1><div>Команда <a>{club}</a> (номер 1)</div><div>Амплуа Центровой</div>
<div>Текущая стоимость <b>3600</b></div><div>Первоначальная стоимость <b>3500</b></div><div>Выбрали 28.2% пользователей</div>
<div id="calendar"><table class="stat-table"><tbody>
<tr><td class="name-td">26.10.2026<span class="sp">|</span>неделя 1</td><td><a>{opponent}</a></td><td><span> Дома </span></td><td><b> : </b></td></tr>
</tbody></table></div>'''
# Jokic's 20.10 game at San Antonio (a win 128 : 118, 18:15), not counted by Sports.ru yet: box score 28.
OPENING = fixes.row('20.10.2026', 'Сан-Антонио', 'Г', '118 : 128', '18:15', [6, 10, 1, 2, 8, 8, 8, 1, 1, 0, 0, 1, 23], 0)


class CollectionRunTests(unittest.TestCase):
    """main() end to end on fake pages, ESPN down."""

    def run_main(self, previous, pages):
        tmp = Path(tempfile.mkdtemp())
        pool = [{'sportsId': sid, 'name': sid, 'club': club, 'clubId': sid} for sid, (club, _) in pages.items()]
        (tmp / 'prices.json').write_text(json.dumps({'players': pool}), encoding='utf-8')
        (tmp / 'additions.json').write_text(json.dumps({'players': []}), encoding='utf-8')
        (tmp / 'teams.json').write_text(json.dumps({'teams': {}}), encoding='utf-8')
        out = tmp / 'sports-current.json'
        out.write_text(json.dumps(previous, ensure_ascii=False), encoding='utf-8')

        def fake(url, compressed=False):
            if 'espn' in url:
                raise RuntimeError('ESPN down')
            return next((INFO.format(name=club, club=club, opponent='Юта') + games for sid, (club, games) in pages.items() if url.endswith(f'/{sid}.html')), None)
        saved = {k: getattr(c, k) for k in ('fetch', 'PRICES', 'ADDITIONS', 'TEAMS', 'OUT', 'MIN_CLUBS')}
        c.fetch, c.PRICES, c.ADDITIONS, c.TEAMS, c.OUT, c.MIN_CLUBS = fake, tmp / 'prices.json', tmp / 'additions.json', tmp / 'teams.json', out, 1
        try:
            c.main()
        finally:
            for k, v in saved.items():
                setattr(c, k, v)
        return json.loads(out.read_text(encoding='utf-8'))

    def test_box_points_kept_games_and_the_tip_of_a_dropped_game_are_published(self):
        previous = {'season': c.SEASON_LABEL, 'collectedAt': '2026-10-21T06:00:00+00:00',
                    'clubs': {'Денвер': [{'date': '2026-10-20', 'opponent': 'Сан-Антонио', 'home': False, 'week': 1, 'score': None, 'tip': '2026-10-20T01:30:00+00:00'}]},
                    'players': {'1': {'games': []}, '2': {'games': [box_row('2026-10-20', 'Детройт', 20),
                                                                     {'date': '2026-10-22', 'opponent': 'Юта', 'home': False, 'minutes': '25:00', 'played': True, 'points': 31}]}}}
        # Player 2's game table lost its ФО head.
        snap = self.run_main(previous, {'1': ('Денвер', fixes.table(OPENING)), '2': ('Бостон', fixes.table(OPENING).replace('<td>ФО</td>', '<td>ФО*</td>'))})
        jokic, brown = snap['players']['1'], snap['players']['2']
        self.assertEqual(view(jokic['games'][0]), (28, 'BOX', 0, 'W', 'UNCOUNTED'))
        # C04: the calendar no longer lists the played game and ESPN is down: the previous calendar's tip stands.
        self.assertEqual(jokic['games'][0]['tip'], '2026-10-20T01:30:00+00:00')
        self.assertEqual((snap['clubs']['Денвер'][0]['date'], snap['clubs']['Денвер'][0]['tip'], snap['clubs']['Денвер'][0]['gone']), ('2026-10-20', '2026-10-20T01:30:00+00:00', True))
        # C05: player 2's table is unreadable: his previous games stand, the older collector's row without points.
        self.assertEqual((brown['gameTable'], brown['gamesKeptFrom']), ('UNREADABLE', '2026-10-21T06:00:00+00:00'))
        self.assertEqual([(g['points'], g['pointsSource']) for g in brown['games']], [(20, 'BOX'), (None, 'NO_BOX')])
        self.assertIn({'sportsId': '2', 'error': 'game table unread; kept the games of 2026-10-21T06:00:00+00:00'}, snap['errors'])
        # Y08/Y11: the published formula is Yahoo's, 1 point per game played, on each row's box score.
        self.assertEqual(snap['gamePoints']['formula'], c.FORMULA)
        self.assertIn('+1 per game played', c.FORMULA)
        self.assertNotIn('+2', c.FORMULA)
        self.assertNotIn('scoreOrientation', snap['gamePoints'])
        self.assertEqual({k: snap['gamePoints'][k] for k in ('played', 'sources', 'gamesWithoutBox', 'uncounted', 'mismatches')},
                         {'played': 3, 'sources': {'BOX': 2, 'NO_BOX': 1}, 'gamesWithoutBox': 1, 'uncounted': 1, 'mismatches': 0})
        played = [g for p in snap['players'].values() for g in p['games'] if g['played']]
        self.assertTrue(all(g.get('pointsSource') in ('BOX', 'NO_BOX') for g in played), 'no published played row lacks a source')

    def test_tables_that_lost_the_box_score_are_refused_before_earlier_points_could_mask_them(self):
        # The previous snapshot scored the same game of every player: the guard sees the raw collection, not kept points.
        previous = {'season': c.SEASON_LABEL, 'collectedAt': '2026-10-21T06:00:00+00:00',
                    'players': {str(i): {'games': [box_row('2026-10-20', 'Сан-Антонио', 28)]} for i in range(6)}}
        bare = fixes.table(OPENING, head=fixes.HEAD.replace('<td>БШ</td>', '<td>Б</td>'))
        with self.assertRaises(SystemExit) as refused:
            self.run_main(previous, {str(i): ('Денвер', bare) for i in range(6)})
        self.assertIn('6 game tables with played games but no readable box score', str(refused.exception))


if __name__ == '__main__':
    unittest.main()
