"""Review of the projection model (21.10.2026): season-ending report entries, in-season builds, rookie debutants and
season lengths."""
import json
import math
import random
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from scripts import availability_model as av
from scripts import projection_model as pm

CASES = json.loads(Path('tests/fixtures/season-ending-comments.json').read_text())['cases']
EVERY_SECOND_DAY = [(date(2026, 10, 20) + timedelta(days=2 * i)).isoformat() for i in range(80)]  # 80 listed of 82


def row(pid, season, i):
    return dict(player_id=pid, season=season, game_id=f'{season}-{i}', team='AAA', date=(date(season - 1, 10, 20) + timedelta(days=2 * i)).isoformat(),
                home=i % 2 == 0, result='W', minutes=30.0, pts=20, reb=5, ast=3, stl=1, blk=1, tov=2, pf=2, fgm=8, fga=16, ftm=3, fta=4)


def league(players=20, seed=3):
    rng = random.Random(seed); rows = []
    for s in range(2021, 2027):
        rows += [row('0', s, i) for i in range(82)]
        for p in range(1, players):
            i = 0
            while i < 82:
                if rng.random() < .02 + .002 * p: i += rng.choice([1, 2, 3, 6, 15]); continue
                rows.append(row(str(p), s, i)); i += 1
    return rows


class StubModel:
    def predict(self, x):
        return dict(perMinute=.6, minutes=30.0, share=.7, short=.02, rate=20.0, stats=None, ageAdjustment=0)


class StubRanges:
    def interval(self, p, x, games_scale=82):
        c = p['rate'] * p['share'] * games_scale
        return .5 * c, 1.5 * c, pm.Ranges.short_risk(p, games_scale)


class Build(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        rows = league(); seasons, team_games = pm.season_table(rows, lambda r: r['player_id'])
        cls.history = pm.History(seasons, team_games, {}); cls.history.spells = av.spells(rows)
        cls.chain = av.Availability(cls.history.spells, cls.history, set(range(2021, 2027)))
        rr = [dict(pick=k, rate=20 - 3 * math.log(k), minutes=30 - 4 * math.log(k), share=.9 - .1 * math.log(k), games=50, perMinuteStats=None) for k in range(1, 61)]
        cls.rookies = pm.Rookie(rr); cls.rookies.residuals = pm.Rookie(rr).errors(rr).residuals
        cls.tmp = tempfile.TemporaryDirectory(); tmp = Path(cls.tmp.name)
        (tmp / 'ctx.json').write_text(json.dumps({'schedule': {'AAA': EVERY_SECOND_DAY}}))

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def build(self, today, injuries, pid='8'):
        tmp = Path(self.tmp.name); saved = pm.TEAM_CONTEXT, pm.AVAILABILITY_LENGTHS
        pm.TEAM_CONTEXT, pm.AVAILABILITY_LENGTHS = tmp / 'ctx.json', tmp / 'lengths.json'
        try:
            data = dict(generatedAt=today + 'T02:00:00+00:00', players=[dict(id=pid, nbaId=pid, name='Player', team='AAA', currentRosterStatus='SOURCE_REPORTED', injuries=injuries)])
            pm.apply(data, self.history, StubModel(), StubRanges(), self.rookies, {}, {}, lambda r: (.4, 1.6), self.chain)
        finally:
            pm.TEAM_CONTEXT, pm.AVAILABILITY_LENGTHS = saved
        return data['players'][0]['forecast']


class SeasonEndingWordingTests(Build):
    """R31: the build read the report differently from src/season.js seasonEnding."""
    def test_the_shared_cases(self):
        for c in CASES:
            self.assertEqual(pm.season_ending(c), c['ending'], c['comment'])
            self.assertEqual(pm.absence(c)[0] == 'ending', c['ending'], c['comment'])

    def test_a_placeholder_return_date_does_not_end_the_block(self):
        furphy = CASES[0]; self.assertEqual(furphy['returnDate'], '2027-01-02')
        blocked, until, _ = pm.known_absence([furphy], '2026-10-15', EVERY_SECOND_DAY)
        self.assertEqual((blocked, until), (82, '9999-12-31'))
        f = self.build('2026-10-15', [furphy])
        self.assertEqual((f['games'], f['meanSeason'], f['seasonCeiling']), (0, 0, 0))
        self.assertTrue(f['knownAbsence']['seasonEnding']); self.assertIsNone(f['knownAbsence']['returnDate'])
        self.assertIn('вне игры до конца сезона', f['basis'])
        # A return date after the season is kept as ESPN gives it.
        self.assertEqual(self.build('2026-10-15', [CASES[1]])['knownAbsence']['returnDate'], '2027-10-01')

    def test_a_past_season_ending_injury_keeps_the_return_date(self):
        past = next(c for c in CASES if 'work back from' in c['comment'])
        f = self.build('2026-10-15', [past])
        self.assertFalse(f['knownAbsence']['seasonEnding']); self.assertEqual(f['knownAbsence']['returnDate'], '2026-10-23')
        self.assertGreater(f['games'], 40)


class InSeasonBuildTests(Build):
    """R30, R32: from the second day of the season the club games already played counted as playable after the block."""
    def test_an_undated_season_ending_entry_builds(self):
        for day in ('2026-10-20', '2026-10-22', '2027-01-10'):
            f = self.build(day, [{'status': 'Out', 'fantasyStatus': 'OFS'}])
            self.assertEqual(f['games'], 0, day); self.assertTrue(f['knownAbsence']['seasonEnding'], day)
            self.assertIsNone(f['knownAbsence']['returnDate']); self.assertIn('вне игры до конца сезона', f['basis'])
        absence = dict(returnDate=None, seasonEnding=False, blockedGames=5)
        self.assertIn('вне игры до конца сезона', pm.forecast_basis(None, True, {}, absence, False))

    def test_out_for_the_season_stays_out_as_the_season_goes(self):
        for day in ('2026-10-22', '2026-11-20', '2027-01-01', '2027-02-15'):
            f = self.build(day, [{'status': 'Out', 'fantasyStatus': 'OFS', 'returnDate': '2027-07-01'}])
            a = f['knownAbsence']
            self.assertEqual((f['games'], a['gamesLeft']), (0, 0), day); self.assertTrue(a['seasonEnding'], day)
            self.assertEqual(a['blockedGames'], pm.blocked_games(day, '9999-12-31', EVERY_SECOND_DAY), day)  # the games from today
            self.assertEqual(f['availability']['gamesRange'], [0, 0])

    def test_a_dated_absence_leaves_the_games_after_the_return(self):
        out = [{'status': 'Out', 'fantasyStatus': 'OUT', 'returnDate': '2026-12-15'}]
        after = pm.blocked_games('2026-12-15', '9999-12-31', EVERY_SECOND_DAY)
        before = self.build('2026-10-15', out)
        self.assertEqual(before['knownAbsence']['gamesLeft'], 82 - before['knownAbsence']['blockedGames'])  # before the season: unchanged
        for day in ('2026-10-15', '2026-11-20', '2026-12-10'):
            f = self.build(day, out); a = f['knownAbsence']
            self.assertEqual(a['gamesLeft'], after, day)
            self.assertAlmostEqual(f['games'], before['games'], msg=day)
            self.assertLessEqual(f['availability']['gamesRange'][1], after)
        self.assertEqual(self.build('2026-12-10', out)['knownAbsence']['blockedGames'], pm.blocked_games('2026-12-10', '2026-12-15', EVERY_SECOND_DAY))


class RookieDebutantTests(unittest.TestCase):
    """R38: a player whose career logs were never collected counted as an undrafted debutant (Patty Mills, 2009)."""
    def test_an_undrafted_debutant_needs_collected_logs(self):
        s = lambda name, games: dict(name=name, games=games, minutes=12.0, rate=5.0, perMinuteStats={k: .1 for k in pm.STAT_KEYS})
        league = {201988: s('Patty Mills', 32), 1641871: s('Duop Reath', 68)}
        first = {'201988': 2024, '1641871': 2024}  # Mills's earlier seasons are not in the logs
        names = lambda rows: {r['name'] for r in rows if not r['pick']}
        self.assertEqual(names(pm.rookie_rows({}, {2024: (league, {})}, {}, first)), {'Patty Mills', 'Duop Reath'})
        self.assertEqual(names(pm.rookie_rows({}, {2024: (league, {})}, {}, first, {'1641871'})), {'Duop Reath'})


class SeasonLengthTests(unittest.TestCase):
    """R40: the healthy-start prediction and the chain must use one season length (2019/20: 72 without club calendars)."""
    def test_one_length_per_season(self):
        for t in range(2002, 2028):
            self.assertEqual(pm.season_length(t), av.season_games(t), t)
        self.assertEqual(pm.season_length(2020), 72)


if __name__ == '__main__':
    unittest.main()
