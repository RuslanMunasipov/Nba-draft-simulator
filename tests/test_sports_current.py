import importlib.util
import json
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parent.parent / 'scripts' / 'collect_sports_current.py')
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)

INFO = '''<h1><b>Никола Йокич</b></h1><div>Команда <a>Денвер</a> (номер 15)</div><div>Амплуа Центровой</div>
<div>Текущая стоимость <b>3600</b></div><div>Первоначальная стоимость <b>3500</b></div><div>Выбрали 28.2% пользователей</div>
<select id="slt"><option value="1317725" >2025/2026</option><option value="2000001" >2026/2027</option></select>
<div id="calendar"><table class="stat-table"><tbody>
<tr><td class="name-td">23.10.2026<span class="sp">|</span>неделя 1</td><td><a>Оклахома-Сити</a></td><td><span> В гостях </span></td><td><b> : </b></td></tr>
<tr><td class="name-td">25.10.2026<span class="sp">|</span>неделя 1</td><td><a>Новый Орлеан</a></td><td><span> Дома </span></td><td><b>120 : 110</b></td></tr>
</tbody></table></div>'''
GAMES = '''<table class="stat-table small"><tr><td>Дата</td><td>Соперник</td><td></td><td>Счет</td><td>МИН</td><td>ФО</td><td>С</td></tr>
<tr><td>25.10.2026</td><td>Новый Орлеан</td><td>Д</td><td>120 : 110</td><td>36:10</td><td>48</td><td>3600</td></tr>
<tr><td>23.10.2026</td><td>Оклахома-Сити</td><td>Г</td><td>101 : 99</td><td>00:00</td><td>0</td><td>3500</td></tr>
<tr><td>13.04.2026</td><td>Сан-Антонио</td><td>Г</td><td>118 : 128</td><td>18:15</td><td>32</td><td>3500</td></tr></table>'''


class SportsCurrentTest(unittest.TestCase):
    def test_info(self):
        info = collector.parse_info(INFO)
        self.assertEqual((info['position'], info['price'], info['initialPrice'], info['club']), ('C', 3600, 3500, 'Денвер'))
        self.assertAlmostEqual(info['ownedShare'], 0.282)
        self.assertEqual(collector.season_id(INFO), '2000001')

    def test_calendar_keeps_sports_weeks(self):
        cal = collector.parse_calendar(INFO)
        self.assertEqual([(g['date'], g['week'], g['home'], g['score']) for g in cal],
                         [('2026-10-23', 1, False, None), ('2026-10-25', 1, True, '120:110')])
        self.assertEqual(collector.week_ranges([cal]), {'1': {'start': '2026-10-23', 'end': '2026-10-25'}})

    def test_weeks_follow_the_calendar_numbers_and_breaks(self):
        cal = [{'date': '2026-10-20', 'week': 1}, {'date': '2026-10-26', 'week': 1}, {'date': '2026-10-27', 'week': 2},
               {'date': '2026-11-02', 'week': 2}, {'date': '2026-12-04', 'week': 7}, {'date': '2026-12-13', 'week': 8}]
        self.assertEqual(collector.week_ranges([cal]), {'1': {'start': '2026-10-20', 'end': '2026-10-26'},
                                                       '2': {'start': '2026-10-27', 'end': '2026-11-02'},
                                                       '7': {'start': '2026-11-03', 'end': '2026-12-04'},
                                                       '8': {'start': '2026-12-05', 'end': '2026-12-13'}})

    def test_unreadable_score_is_not_zero(self):
        page = GAMES.replace('<td>36:10</td><td>48</td>', '<td>36:10</td><td>?</td>')
        games = collector.parse_games(page)
        # The played game stays, without points: this table has no box score and its ФО no number.
        self.assertEqual([(g['date'], g['points'], g.get('pointsSource'), g.get('sportsPoints')) for g in games],
                         [('2026-10-23', 0, None, None), ('2026-10-25', None, 'NO_BOX', None)])

    def test_roster_json_gives_exact_ids(self):
        raw = '{"players":[{"id":"1796991","club":"Торонто","amplua":"3","price":"2400","lock":"0","name":"Ленард"},{"id":"9","club":"Юта","amplua":"5","price":"1000","lock":"1","name":"Икс"}]}'
        self.assertEqual(collector.parse_roster(raw), [
            {'sportsId': '1796991', 'name': 'Ленард', 'club': 'Торонто', 'position': 'SF', 'price': 2400, 'locked': False},
            {'sportsId': '9', 'name': 'Икс', 'club': 'Юта', 'position': 'C', 'price': 1000, 'locked': True}])

    def test_layout_change_is_caught_by_quality(self):
        pool = [{'sportsId': str(i)} for i in range(10)]
        good = {str(i): {'price': 1000, 'position': 'C'} for i in range(10)}
        bare = {str(i): {'name': 'x', 'clubId': '1'} for i in range(10)}
        self.assertEqual(collector.quality(pool, good), (1.0, 1.0))
        self.assertEqual(collector.quality(pool, bare), (1.0, 0.0))

    def test_failed_or_shrunk_team_pages_keep_the_previous_entry(self):
        old = {'0': {'sportsTeamId': '1', 'balance': 200, 'transfersLeft': 3, 'journalReadAt': 't0',
                     'journal': [{'date': '2026-10-18', 'buy': {'name': 'A', 'price': 1}, 'sell': None},
                                 {'date': '2026-10-19', 'buy': {'name': 'B', 'price': 1}, 'sell': None}]},
               '1': {'sportsTeamId': '2', 'balance': 100, 'transfersLeft': 2, 'journal': []}}
        real_fetch, real_teams = collector.fetch, collector.TEAMS
        import json, tempfile
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'teams': {'0': '1', '1': '2'}}, f)
        def fake(url):
            if '/2.html' in url or '/2/' in url:
                raise RuntimeError('boom')
            if 'journal' in url:
                return '<td>Покупки</td><tbody></tbody>'
            if url.endswith('.json'):
                return '{"players":[]}'
            return '<table><tr><th>Баланс</th><td>150</td></tr><tr><th>Трансферы</th><td>3</td></tr></table>'
        collector.fetch, collector.TEAMS = fake, Path(f.name)
        try:
            errors = []
            teams = collector.collect_teams(old, errors)
        finally:
            collector.fetch, collector.TEAMS = real_fetch, real_teams
        self.assertEqual(len(teams['0']['journal']), 2)
        self.assertEqual(teams['0']['balance'], 150)
        self.assertTrue(teams['1']['stale'])
        self.assertEqual(len(errors), 2)
        # A failed read bounds nothing: the last good read stays the lower bound of the next deal's time.
        self.assertEqual(teams['0']['journalReadAt'], 't0')

    def test_a_re_paired_journal_with_fewer_rows_but_the_same_events_is_no_failed_read(self):
        # Stored: a sale and a purchase seen in two one-sided rows; the page now pairs them in one row.
        old = {'0': {'sportsTeamId': '1', 'journalReadAt': 't0', 'journal': [
            {'date': '2026-10-20', 'buy': None, 'sell': {'name': 'J', 'price': 1}, 'seenAt': 't1'},
            {'date': '2026-10-20', 'buy': {'name': 'O', 'price': 1}, 'sell': None, 'seenAt': 't2'}]}}
        real_fetch, real_teams = collector.fetch, collector.TEAMS
        import json, tempfile
        with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as f:
            json.dump({'teams': {'0': '1'}}, f)
        def fake(url):
            if 'journal' in url:
                return '<td>Покупки</td><tbody><tr><td>20.10.26</td><td>куплен O за 1</td><td>продан J за 1</td></tr></tbody>'
            if url.endswith('.json'):
                return '{"players":[]}'
            return '<table><tr><th>Баланс</th><td>150</td></tr><tr><th>Трансферы</th><td>3</td></tr></table>'
        collector.fetch, collector.TEAMS = fake, Path(f.name)
        try:
            errors = []
            teams = collector.collect_teams(old, errors)
        finally:
            collector.fetch, collector.TEAMS = real_fetch, real_teams
        self.assertEqual(errors, [])
        self.assertEqual(teams['0']['journal'], old['0']['journal'])
        self.assertNotEqual(teams['0']['journalReadAt'], 't0')

    def test_games_only_current_season(self):
        games = collector.parse_games(GAMES)
        # This table has no box score: the played row keeps Sports.ru's 48 and its result (home first: 120 : 110 at home,
        # a win) and gets no FBL points, never Sports.ru's less its bonuses.
        self.assertEqual([(g['date'], g['played'], g['points'], g['price']) for g in games],
                         [('2026-10-23', False, 0, 3500), ('2026-10-25', True, None, 3600)])
        self.assertEqual((games[1]['sportsPoints'], games[1]['result'], games[1]['pointsSource']), (48, 'W', 'NO_BOX'))

    def test_team_profile_and_journal(self):
        profile = """<h1><b>The Balkan Murderers</b></h1><table class="profile-table"><tr><th>Место</th><td>586 из 1280 </tr></table>
<table class="profile-table"><tr><th>Стоимость команды</th><td>19800</td></tr><tr><th>Баланс</th><td>200</td></tr><tr><th>Трансферы</th><td>2</td></tr></table>"""
        self.assertEqual(collector.parse_team(profile), {'name': 'The Balkan Murderers', 'value': 19800, 'balance': 200,
                                                          'transfersLeft': 2, 'place': 586, 'of': 1280})
        journal = """<thead><tr><td>Дата</td><td>Покупки</td><td>Продажи</td></tr></thead><tbody>
<tr><td class="bordR">25.10.26</td><td class="bordR">куплен Зайон за <span class="text-minus">2000</span></td><td class="">продан Рэндл за <span>1800</span></td></tr>
<tr><td class="bordR">18.10.26</td><td class="bordR">куплен Дж. Мюррэй за <span class="text-minus">2200</span></td><td class=""></td></tr></tbody>"""
        self.assertEqual(collector.parse_journal(journal), [
            {'date': '2026-10-18', 'buy': {'name': 'Дж. Мюррэй', 'price': 2200}, 'sell': None},
            {'date': '2026-10-25', 'buy': {'name': 'Зайон', 'price': 2000}, 'sell': {'name': 'Рэндл', 'price': 1800}}])



class InjuryHistoryTests(unittest.TestCase):
    def feed(self, kind='Ankle', detail='Sprain', ret='2026-11-01'):
        return {'injuries': [{'injuries': [{'status': 'Out', 'shortComment': 'x', 'date': '2026-10-19T10:00Z',
            'athlete': {'displayName': 'A B', 'links': [{'href': 'https://www.espn.com/nba/player/_/id/4017837/a-b'}]},
            'details': {'type': kind, 'detail': detail, 'side': 'Left', 'location': 'Leg', 'returnDate': ret}}]}]}

    def test_the_same_injury_extends_one_episode_and_a_new_one_starts_another(self):
        h = collector.update_injury_history(None, self.feed(), '2026-10-19T10:00:00+00:00')
        h = collector.update_injury_history(h, self.feed(ret='2026-11-05'), '2026-10-22T10:00:00+00:00')
        e = h['players']['4017837']['episodes']
        self.assertEqual(len(e), 1)
        self.assertEqual((e[0]['firstSeen'], e[0]['lastSeen'], e[0]['returnDate']), ('2026-10-19', '2026-10-22', '2026-11-05'))
        h = collector.update_injury_history(h, self.feed('Knee', 'Surgery'), '2026-10-23T10:00:00+00:00')
        h = collector.update_injury_history(h, self.feed(), '2026-12-20T10:00:00+00:00')  # a month later: a new ankle episode
        self.assertEqual([x['type'] for x in h['players']['4017837']['episodes']], ['Ankle', 'Knee', 'Ankle'])

if __name__ == '__main__':
    unittest.main()


class JournalStampTests(unittest.TestCase):
    def test_new_rows_get_the_time_they_were_first_seen_and_known_rows_keep_theirs(self):
        a = {'date': '2026-10-19', 'buy': {'name': 'A', 'price': 1}, 'sell': None}
        b = {'date': '2026-10-20', 'buy': {'name': 'B', 'price': 2}, 'sell': {'name': 'C', 'price': 3}}
        self.assertEqual(collector.stamp_journal(None, [a]), [a])  # first sight: time unknown
        first = collector.stamp_journal([a], [a, b], now='2026-10-20T10:00:00+00:00')
        self.assertNotIn('seenAt', first[0])
        self.assertEqual(first[1]['seenAt'], '2026-10-20T10:00:00+00:00')
        again = collector.stamp_journal(first, [a, b], now='2026-10-20T11:00:00+00:00')
        self.assertEqual(again[1]['seenAt'], '2026-10-20T10:00:00+00:00')
        # The previous read without the row bounds the transfer from below (FBL transfer hours).
        bounded = collector.stamp_journal([a], [a, b], now='2026-10-20T10:00:00+00:00', after='2026-10-20T09:59:00+00:00')
        self.assertEqual(bounded[1]['seenAfter'], '2026-10-20T09:59:00+00:00')
        self.assertEqual(collector.stamp_journal(bounded, [a, b], now='2026-10-20T11:00:00+00:00', after='2026-10-20T10:59:00+00:00')[1]['seenAfter'], '2026-10-20T09:59:00+00:00')
        # Sports.ru lists rows of one date in no stable order: a reordered journal keeps every row's stamps (and a known
        # date its stored rows, in their order).
        c = {'date': '2026-10-19', 'buy': {'name': 'C', 'price': 3}, 'sell': None}
        known = collector.stamp_journal([a, c], [a, c, b], now='2026-10-20T10:00:00+00:00')
        moved = collector.stamp_journal(known, [c, b, a], now='2026-10-20T12:00:00+00:00')
        self.assertEqual([(r['buy']['name'], r.get('seenAt')) for r in moved], [('A', None), ('C', None), ('B', '2026-10-20T10:00:00+00:00')])

    def test_re_paired_rows_of_one_day_keep_their_time(self):
        r = lambda s, b: {'date': '2026-10-20', 'sell': {'name': s, 'price': 1}, 'buy': {'name': b, 'price': 1}}
        old = [{**r('J', 'O'), 'seenAt': 't1', 'seenAfter': 't0'}, {**r('K', 'E'), 'seenAt': 't1', 'seenAfter': 't0'}]
        out = collector.stamp_journal(old, [r('J', 'E'), r('K', 'O'), r('W', 'K')], now='t2', after='t1b')
        self.assertEqual([(x['seenAt'], x['seenAfter']) for x in out], [('t1', 't0'), ('t1', 't0'), ('t2', 't1b')])

    def test_a_day_re_paired_around_a_new_deal_keeps_the_earlier_pairing(self):
        r = lambda s, b: {'date': '2026-10-20', 'sell': {'name': s, 'price': 1}, 'buy': {'name': b, 'price': 1}}
        jo = {**r('J', 'O'), 'seenAt': 't1', 'seenAfter': 't0', 'sellSid': 'j', 'buySid': 'o'}
        # A new deal K→E: Sports.ru now shows the day as J→E and K→O. Neither row is a deal of its own: the old one stands
        # with its time and players, the new one is K→E, seen now.
        out = collector.stamp_journal([jo], [r('J', 'E'), r('K', 'O')], now='t2', after='t1b',
                                      old_roster=[{'sportsId': 'o', 'name': 'O'}, {'sportsId': 'k', 'name': 'K'}],
                                      new_roster=[{'sportsId': 'o', 'name': 'O'}, {'sportsId': 'e', 'name': 'E'}])
        self.assertEqual(out, [jo, {**r('K', 'E'), 'seenAt': 't2', 'seenAfter': 't1b', 'sellSid': 'k', 'buySid': 'e'}])
        # Read again as the page pairs it, or paired back: nothing changes.
        self.assertEqual(collector.stamp_journal(out, [r('J', 'E'), r('K', 'O')], now='t3'), out)
        self.assertEqual(collector.stamp_journal(out, [r('K', 'E'), r('J', 'O')], now='t3'), out)
        # A third deal L→M shown re-paired again (J→M, L→E, K→O): the two known deals stand, L→M is new.
        third = collector.stamp_journal(out, [r('J', 'M'), r('L', 'E'), r('K', 'O')], now='t4', after='t3b')
        self.assertEqual([(x['sell']['name'], x['buy']['name'], x['seenAt']) for x in third], [('J', 'O', 't1'), ('K', 'E', 't2'), ('L', 'M', 't4')])
        # Rows whose sale and purchase are both new keep Sports.ru's pairing; other dates are untouched.
        other = {'date': '2026-10-19', 'sell': {'name': 'X', 'price': 1}, 'buy': {'name': 'Y', 'price': 1}, 'seenAt': 't'}
        both = collector.stamp_journal([other, jo], [{k: other[k] for k in ('date', 'sell', 'buy')}, r('J', 'O'), r('P', 'Q')], now='t2')
        self.assertEqual([(x['sell']['name'], x['buy']['name'], x['seenAt']) for x in both], [('X', 'Y', 't'), ('J', 'O', 't1'), ('P', 'Q', 't2')])

    def test_a_day_whose_old_event_vanished_or_whose_new_events_do_not_pair_follows_the_page(self):
        r = lambda s, b: {'date': '2026-10-20', 'sell': s and {'name': s, 'price': 1}, 'buy': b and {'name': b, 'price': 1}}
        jo = {**r('J', 'O'), 'seenAt': 't1', 'seenAfter': 't0'}
        # O is gone from the page (a misread or a reversal): the day is stamped as the page pairs it, event by event.
        out = collector.stamp_journal([jo], [r('J', 'E')], now='t2', after='t1b')
        self.assertEqual(out, [{**r('J', 'E'), 'seenAt': 't2', 'seenAfter': 't1b'}])
        # A new sale without a new purchase to pair it with.
        out = collector.stamp_journal([jo], [r('K', 'O'), r('J', None)], now='t2', after='t1b')
        self.assertEqual([(x['sell']['name'], x['buy'] and x['buy']['name'], x['seenAt']) for x in out], [('K', 'O', 't2'), ('J', None, 't1')])

    def test_one_sided_rows_are_kept_and_stamped_but_never_paired(self):
        r = lambda s, b: {'date': '2026-10-20', 'sell': s and {'name': s, 'price': 1}, 'buy': b and {'name': b, 'price': 1}}
        draft, jo = r(None, 'D'), {**r('J', 'O'), 'seenAt': 't1'}
        # A new draft purchase F and a new deal K→E, the day shown as D, J→E, K→O, F.
        out = collector.stamp_journal([draft, jo], [r(None, 'D'), r('J', 'E'), r('K', 'O'), r(None, 'F')], now='t2')
        self.assertEqual([(x['sell'] and x['sell']['name'], x['buy']['name'], x.get('seenAt')) for x in out],
                         [(None, 'D', None), ('J', 'O', 't1'), (None, 'F', 't2'), ('K', 'E', 't2')])
        # A sale seen alone, then paired by Sports.ru with a later purchase: the day follows the page, the deal is new.
        out = collector.stamp_journal([{**r('J', None), 'seenAt': 't1'}], [r('J', 'O')], now='t2')
        self.assertEqual(out, [{**r('J', 'O'), 'seenAt': 't2'}])

    def test_the_exact_players_of_a_new_deal_are_pinned_from_the_roster_change(self):
        r = lambda s, b, sp=1500, bp=1800: {'date': '2026-10-20', 'sell': {'name': s, 'price': sp}, 'buy': {'name': b, 'price': bp}}
        old_roster = [{'sportsId': '9', 'name': 'Сабонис', 'price': 2100}]
        new_roster = [{'sportsId': 'd1', 'name': 'Уайт', 'price': 1800}]
        out = collector.stamp_journal([r('A', 'B')], [r('A', 'B'), r('Сабонис', 'Уайт', 2100)], now='t2', old_roster=old_roster, new_roster=new_roster)
        self.assertEqual((out[1]['sellSid'], out[1]['buySid']), ('9', 'd1'))
        # Re-paired later, the ids stay with their events.
        again = collector.stamp_journal(out, [r('A', 'B'), r('Сабонис', 'Уайт', 2100)], now='t3')
        self.assertEqual((again[1]['sellSid'], again[1]['buySid'], again[1]['seenAt']), ('9', 'd1', 't2'))

    def test_unlimited_transfers_in_pre_season(self):
        team = collector.parse_team('<th>Баланс</th><td>200</td><th>Трансферы</th><td>∞</td>')
        self.assertEqual((team['balance'], team['transfersLeft'], team['transfersUnlimited']), (200, None, True))
        self.assertEqual(collector.parse_team('<th>Трансферы</th><td>2</td>')['transfersLeft'], 2)
        self.assertEqual(collector.parse_team('<th>Дедлайн</th>\n<td>20 октября, 21:30 </td>')['deadline'], '20 октября, 21:30')


class EspnBoxScoreTests(unittest.TestCase):
    LABELS = ['MIN', 'PTS', 'FG', '3PT', 'FT', 'REB', 'AST', 'TO', 'STL', 'BLK', 'OREB', 'DREB', 'PF', '+/-']

    def summary(self):
        # Paul George, 20.10.2026: the NBA's line (5 fouls); Sports.ru's game table had 4.
        return {'boxscore': {'players': [{'team': {'abbreviation': 'BOS'}, 'statistics': [{'labels': self.LABELS, 'athletes': [
            {'athlete': {'id': '4251'}, 'stats': ['31', '38', '12-21', '7-12', '7-8', '5', '3', '3', '5', '0', '0', '5', '5', '+9']},
            {'athlete': {'id': '9'}, 'didNotPlay': True, 'stats': []}]}]}]}}

    def test_espn_lines_read_every_player_who_took_the_floor(self):
        lines = collector.espn_lines(self.summary())
        self.assertEqual(list(lines), ['4251'])
        self.assertEqual(collector.fbl_points(lines['4251']), 31)

    def test_minutes_are_espns_unless_sports_ru_agrees_within_a_minute(self):
        lines = collector.espn_lines(self.summary())
        cache = {'events': {'1': {'tip': '2026-10-20T23:00:00+00:00', 'day': '2026-10-21', 'teams': ['BOS', 'DET'], 'players': lines}}}
        row = lambda minutes: {'s1': {'games': [{'date': '2026-10-21', 'opponent': 'Детройт', 'played': True, 'points': 32, 'pointsSource': 'BOX', 'minutes': minutes}]}}
        bad, good = row('57:00'), row('31:12')
        collector.apply_espn(bad, cache, {'s1': '4251'});collector.apply_espn(good, cache, {'s1': '4251'})
        self.assertEqual((bad['s1']['games'][0]['minutes'], bad['s1']['games'][0]['sportsMinutes']), ('31', '57:00'))
        self.assertEqual(good['s1']['games'][0]['minutes'], '31:12')
        self.assertNotIn('sportsMinutes', good['s1']['games'][0])

    def test_the_collector_scores_an_espn_box_score_as_the_awards_archive_did(self):
        # tests/game-points-consistency.test.js holds the site's overlay and the awards bot to the same golden points.
        fixtures = Path(__file__).parent / 'fixtures'
        summary = json.loads((fixtures / 'espn-summary-401909088.json').read_text(encoding='utf-8'))
        golden = json.loads((fixtures / 'espn-points-golden.json').read_text(encoding='utf-8'))['points']
        self.assertEqual({a: collector.fbl_points(line) for a, line in collector.espn_lines(summary).items()}, golden)

    def test_finished_games_are_indexed_by_moscow_date_and_clubs(self):
        sched = {'BOS': {'events': [
            {'id': '1', 'date': '2026-10-20T23:00Z', 'competitions': [{'status': {'type': {'completed': True}}, 'competitors': [{'team': {'abbreviation': 'DET'}}, {'team': {'abbreviation': 'BOS'}}]}]},
            {'id': '2', 'date': '2026-10-23T23:00Z', 'competitions': [{'status': {'type': {'completed': False}}, 'competitors': [{'team': {'abbreviation': 'NY'}}, {'team': {'abbreviation': 'BOS'}}]}]}]}}
        self.assertEqual(collector.finished_games(sched), {'1': {'tip': '2026-10-20T23:00:00+00:00', 'day': '2026-10-21', 'teams': ['BOS', 'DET']}})

    def test_rows_take_espn_box_scores_and_keep_sports_numbers_beside(self):
        cache = {'events': {'1': {'tip': '2026-10-20T23:00:00+00:00', 'day': '2026-10-21', 'teams': ['BOS', 'DET'], 'players': collector.espn_lines(self.summary())}}}
        players = {'s1': {'games': [{'date': '2026-10-21', 'opponent': 'Детройт', 'played': True, 'points': 32, 'pointsSource': 'BOX'},
                                    {'date': '2026-10-23', 'opponent': 'Нью-Йорк', 'played': True, 'points': 10, 'pointsSource': 'BOX'}]},
                   's2': {'games': [{'date': '2026-10-21', 'opponent': 'Бостон', 'played': True, 'points': 7, 'pointsSource': 'BOX'}]}}
        scored, report = collector.apply_espn(players, cache, {'s1': '4251', 's2': '77'})
        self.assertEqual(scored, 1)
        george = players['s1']['games']
        self.assertEqual((george[0]['points'], george[0]['pointsSource'], george[0]['sportsBoxPoints'], george[0]['espnEvent']), (31, 'ESPN', 32, '1'))
        # Sports.ru's game table is a check only (league owner, 22.10.2026): a game ESPN has not read waits for it.
        self.assertEqual((george[1]['points'], george[1]['pointsSource'], george[1]['espnStatus'], george[1]['sportsBoxPoints']), (None, 'AWAITING_ESPN', 'GAME_NOT_READ', 10))
        s2 = players['s2']['games'][0]
        self.assertEqual((s2['points'], s2['pointsSource'], s2['espnStatus']), (None, 'AWAITING_ESPN', 'NO_LINE'))
        self.assertEqual([(r['sportsId'], r['espn'], r['sports']) for r in report], [('s1', 31, 32), ('s2', None, 7)])

    def test_a_player_without_a_reviewed_id_is_found_by_his_box_score_and_espn_only_games_are_added(self):
        lines = collector.espn_lines(self.summary())
        cache = {'events': {'1': {'tip': '2026-10-20T23:00:00+00:00', 'day': '2026-10-21', 'teams': ['BOS', 'DET'], 'players': lines},
                            '2': {'tip': '2026-10-22T23:00:00+00:00', 'day': '2026-10-23', 'teams': ['BOS', 'NY'], 'players': lines}}}
        players = {'new': {'name': 'Джордж', 'games': [{'date': '2026-10-21', 'opponent': 'Детройт', 'played': True, 'points': 31, 'pointsSource': 'BOX', 'minutes': lines['4251']['min']}]}}
        scored, report = collector.apply_espn(players, cache, {})
        self.assertEqual((players['new']['espnId'], players['new']['espnIdSource']), ('4251', 'BOX_MATCH'))
        games = players['new']['games']
        self.assertEqual([(g['date'], g['points'], g['pointsSource']) for g in games], [('2026-10-21', 31, 'ESPN'), ('2026-10-23', 31, 'ESPN')])
        self.assertEqual(games[1]['sportsRow'], False)
        self.assertEqual(report[-1]['differs'], ['missing at Sports.ru'])

    def test_the_cache_reads_new_and_recent_finals_only(self):
        from datetime import datetime, timezone
        now = datetime(2026, 10, 30, tzinfo=timezone.utc)
        games = {'old': {'tip': '2026-10-20T23:00:00+00:00', 'day': '2026-10-21', 'teams': ['BOS', 'DET']},
                 'new': {'tip': '2026-10-29T23:00:00+00:00', 'day': '2026-10-30', 'teams': ['NY', 'PHI']}}
        cache = {'events': {'old': {**games['old'], 'players': {'1': {}}}}}
        asked = []
        real = collector.fetch
        collector.fetch = lambda url, compressed=False: asked.append(url) or __import__('json').dumps(self.summary())
        try:
            self.assertEqual(collector.update_box_cache(cache, games, now), 1)
        finally:
            collector.fetch = real
        self.assertEqual(asked, [collector.SUMMARY_URL.format(id='new')])
        self.assertIn('4251', cache['events']['new']['players'])
        self.assertEqual(cache['events']['old']['players'], {'1': {}}, 'an old final is not read again')

