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
        self.assertEqual(collector.week_ranges([cal]), {'1': {'start': '2026-10-19', 'end': '2026-10-25'}})

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


if __name__ == '__main__':
    unittest.main()
