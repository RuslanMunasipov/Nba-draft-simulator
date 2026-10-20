import importlib.util
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
        self.assertEqual([g['date'] for g in collector.parse_games(page)], ['2026-10-23'])

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
        old = {'0': {'sportsTeamId': '1', 'balance': 200, 'transfersLeft': 3, 'journal': [{'date': '2026-10-18'}, {'date': '2026-10-19'}]},
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

    def test_games_only_current_season(self):
        games = collector.parse_games(GAMES)
        self.assertEqual([(g['date'], g['played'], g['points'], g['price']) for g in games],
                         [('2026-10-23', False, 0, 3500), ('2026-10-25', True, 48, 3600)])

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
        # Sports.ru lists rows of one date in no stable order: a reordered journal keeps every row's stamps.
        c = {'date': '2026-10-19', 'buy': {'name': 'C', 'price': 3}, 'sell': None}
        known = collector.stamp_journal([a, c], [a, c, b], now='2026-10-20T10:00:00+00:00')
        moved = collector.stamp_journal(known, [c, b, a], now='2026-10-20T12:00:00+00:00')
        self.assertEqual([r.get('seenAt') for r in moved], [None, '2026-10-20T10:00:00+00:00', None])

    def test_unlimited_transfers_in_pre_season(self):
        team = collector.parse_team('<th>Баланс</th><td>200</td><th>Трансферы</th><td>∞</td>')
        self.assertEqual((team['balance'], team['transfersLeft'], team['transfersUnlimited']), (200, None, True))
        self.assertEqual(collector.parse_team('<th>Трансферы</th><td>2</td>')['transfersLeft'], 2)
        self.assertEqual(collector.parse_team('<th>Дедлайн</th>\n<td>20 октября, 21:30 </td>')['deadline'], '20 октября, 21:30')
