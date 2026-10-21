"""Regression tests for the projection-model audit fixes (21.10.2026)."""
import json
import math
import random
import statistics
import unittest
from datetime import date, timedelta
from pathlib import Path
import numpy as np
from scripts import availability_model as av
from scripts import projection_model as pm


def game(pid, season, n, team='AAA', minutes=30.0, pts=20):
    return dict(player_id=pid, season=season, game_id=f'{season}-{team}-{n}', team=team, home=n % 2 == 0, result='W',
                minutes=minutes, pts=pts, reb=5, ast=3, stl=1, blk=1, tov=2, pf=2, fgm=8, fga=16, ftm=3, fta=4)


def dated(pid, season, i, team='AAA', start=None, step=2):
    start = start or date(season - 1, 10, 20)
    return dict(game(pid, season, i, team), date=(start + timedelta(days=step * i)).isoformat())


def league(seasons=range(2020, 2026), players=40, seed=3):
    """A full club calendar (the iron man '0') and players who miss games at random spells."""
    rng = random.Random(seed); rows = []
    for s in seasons:
        rows += [dated('0', s, i) for i in range(82)]
        for p in range(1, players):
            i = 0
            while i < 82:
                if rng.random() < .02 + .002 * p:
                    i += rng.choice([1, 1, 2, 3, 6, 15]); continue
                rows.append(dated(str(p), s, i)); i += 1
    return rows


class MissingBirthDateTests(unittest.TestCase):
    """222 people lacked a birth date (almost all players who left the league): the age effect was dropped for them."""
    def setUp(self):
        rows = []
        for pid, first in (('a', 2016), ('b', 2016), ('c', 2018), ('d', 2018), ('x', 2017), ('y', 2019)):
            rows += [game(pid, s, i) for s in range(first, 2027) for i in range(30)]
        seasons, team_games = pm.season_table(rows, lambda r: r['player_id'])
        births = {'a': '1995-01-01', 'b': '1995-07-01', 'c': '1994-01-01', 'd': '1996-01-01'}
        self.h = pm.History(seasons, team_games, births)
        names = {'a': 'Al A', 'b': 'Bo B', 'c': 'Cy C', 'd': 'Di D', 'x': 'Xu X', 'y': 'Yo Y'}
        self.h.impute_ages(names, {'al a': 2015, 'bo b': 2015, 'xu x': 2016})

    def test_drafted_player_gets_the_mean_age_after_the_draft(self):
        at_draft = statistics.mean([self.h.age('a', 2016), self.h.age('b', 2016)])
        self.assertAlmostEqual(self.h.age('x', 2017), at_draft)
        self.assertAlmostEqual(self.h.age('x', 2027), at_draft + 10)

    def test_undrafted_player_gets_the_mean_age_at_the_debut(self):
        # c and d debut after the first logged season (2016), undrafted
        self.assertAlmostEqual(self.h.age('y', 2019), statistics.mean([self.h.age('c', 2018), self.h.age('d', 2018)]))

    def test_official_draft_year_by_id_comes_before_the_name(self):
        names = {'a': 'Al A', 'b': 'Bo B', 'c': 'Cy C', 'd': 'Di D', 'x': 'Xu X', 'y': 'Hansen Yang'}
        self.h.impute_ages(names, {'al a': 2015, 'bo b': 2015, 'yang hansen': 2018}, {'y': 2018})
        at_draft = statistics.mean([self.h.age('a', 2016), self.h.age('b', 2016)])
        self.assertAlmostEqual(self.h.age('y', 2019), at_draft)  # the name differs, the id finds his draft

    def test_features_carry_an_age_and_the_imputation_flag(self):
        x = self.h.features('x', 2027)
        self.assertIsNotNone(x['age']); self.assertTrue(x['ageImputed'])
        self.assertFalse(self.h.features('a', 2027)['ageImputed'])

    def test_html_entities_in_draft_names_are_unescaped(self):
        years = pm.draft_years({'2024': [dict(name='Nikola Topi&#263;', overall=12)], '2023': [dict(name='Same Name', overall=1)], '2022': [dict(name='Same Name', overall=2)]})
        self.assertEqual(years[pm.normalize('Nikola Topić')], 2024)
        self.assertNotIn('same name', years)  # two classes: ambiguous, left out


class ShareRegressionTests(unittest.TestCase):
    """Survivor seasons (career logs before the complete league files) and the age term of the availability regression."""
    @staticmethod
    def example(t, share_last, share, age, pid):
        past = [dict(games=int(70 * share_last), minutes=30.0 * 70 * share_last, counting=500.0 * share_last, stats={k: 10.0 for k in pm.STAT_KEYS},
                     short=0, share=share_last, team='AAA') for _ in range(3)]
        x = dict(past=past, career=share_last, seasons=5, age=age, ageImputed=False)
        g = max(1, int(82 * share))
        y = dict(games=g, share=share, rate=20.0, minutes=30.0, perMinute=.6, short=0.0, stats={k: 10.0 * g / 70 for k in pm.STAT_KEYS})
        return dict(pid=pid, t=t, x=x, y=y)

    def test_survivor_seasons_get_their_own_level_and_forecasts_do_not(self):
        rng = random.Random(4); ex = []
        for t in range(2021, 2027):
            for i in range(80):
                last = rng.uniform(.3, 1); share = min(1, .2 + .7 * last + rng.gauss(0, .03) + (.05 if t < min(pm.SEASON_FILES) else 0))
                ex.append(self.example(t, last, share, rng.uniform(21, 36), f'{t}-{i}'))
        model = pm.Veteran(ex)
        self.assertTrue(model.survivor)
        self.assertAlmostEqual(model.report()['shareRegression']['survivorSeason'], .05, delta=.015)
        x = ex[0]['x']
        self.assertAlmostEqual(model.predict(x)['share'], float(np.dot(model.share_coef[:-1], model.share_features(x))), places=9)

    def test_no_indicator_without_a_complete_season(self):
        ex = [self.example(t, .8, .8, 27, f'{t}-{i}') for t in range(2018, 2024) for i in range(5)]
        self.assertFalse(pm.Veteran(ex).survivor)

    def test_age_term_is_clamped_like_the_age_curves(self):
        x = self.example(2026, .8, .8, 37, 'p')['x']; old = dict(x, age=41.8)
        self.assertEqual(pm.Veteran.share_features(x), pm.Veteran.share_features(old))
        self.assertEqual(len(pm.Veteran.share_features(x)), 7)  # one linear age term, no square


class ChainAnchorTests(unittest.TestCase):
    """An anchor at the season length (ESPN's 82) collapsed the pmf to 82-82; the scale floor keeps a spread."""
    @classmethod
    def setUpClass(cls):
        rows = league()
        seasons, team_games = pm.season_table(rows, lambda r: r['player_id'])
        cls.history = pm.History(seasons, team_games, {})
        cls.chain = av.Availability(av.spells(rows), cls.history, set(range(2020, 2026)))

    def test_a_target_at_the_season_length_keeps_a_spread(self):
        pmf, info = self.chain.distribution('5', 2026, mean=82, healthy=True)
        q10, q90 = av.quantiles(pmf, (.1, .9))
        self.assertLess(q10, 82); self.assertGreater(pmf[:72].sum(), .02)
        self.assertAlmostEqual(info['scale'], av.Availability.MIN_SCALE)
        self.assertLess(info['pmfMean'], 82)
        self.assertAlmostEqual(info['pmfMean'], float((pmf * np.arange(len(pmf))).sum()))

    def test_ordinary_targets_are_still_met(self):
        for target in (40.0, 70.0):
            _, info = self.chain.distribution('5', 2026, mean=target)
            self.assertAlmostEqual(info['pmfMean'], target, delta=.3)
            self.assertGreater(info['scale'], av.Availability.MIN_SCALE)

    def test_healthy_shift_never_passes_the_season_length(self):
        self.assertLessEqual(self.chain.healthy_mean('2', 2026, 81.5), 82)


class LoggedAbsenceTests(unittest.TestCase):
    """'Здоровье по логам' showed hazards scaled to the forecast games; the card now gets the player's own rates."""
    @classmethod
    def setUpClass(cls):
        rows = league()
        seasons, team_games = pm.season_table(rows, lambda r: r['player_id'])
        cls.history = pm.History(seasons, team_games, {})
        cls.table = av.spells(rows)
        cls.chain = av.Availability(cls.table, cls.history, set(range(2020, 2026)))

    def test_hazards_return_the_decayed_own_counts(self):
        _, _, info = self.chain.hazards('30', 2026)
        ns = nl = e = 0.0
        for lag in range(1, 6):
            o = self.table.get(('30', 2026 - lag))
            if o:
                s, l, g = av.counts(o); w = .6 ** (lag - 1); ns += w * s; nl += w * l; e += w * g
        self.assertAlmostEqual(info['ownShort'], ns); self.assertAlmostEqual(info['ownLong'], nl); self.assertAlmostEqual(info['availableGames'], e)

    def test_card_gets_own_rates_and_the_forecast_scale(self):
        old = pm.TARGET; pm.TARGET = 2026
        try:
            _, info = self.chain.distribution('30', 2026, mean=50.0)
            hs, _, h = self.chain.hazards('30', 2026)
            data = dict(players=[dict(id='30', forecast=dict(version=4, availability=dict(hazards=[info['shortHazard'], info['longHazard']]))),
                                 dict(id='99', forecast=dict(version=4, availability=None))])
            pm.absence_history(data, self.chain)
        finally:
            pm.TARGET = old
        a = data['players'][0]['forecast']['availability']
        self.assertAlmostEqual(a['ownShortPer82'], 82 * h['ownShort'] / h['availableGames'])
        self.assertAlmostEqual(a['forecastScale'], info['scale'])
        self.assertAlmostEqual(a['availableGames'], h['availableGames'])

    def test_too_few_available_games_give_no_own_rate(self):
        rows = [dated('0', 2025, i) for i in range(82)] + [dated('7', 2025, i) for i in range(10)]
        seasons, team_games = pm.season_table(rows, lambda r: r['player_id'])
        chain = av.Availability(av.spells(rows), pm.History(seasons, team_games, {}), {2025})
        old = pm.TARGET; pm.TARGET = 2026
        try:
            data = dict(players=[dict(id='7', forecast=dict(version=4, availability=dict(hazards=[.05, .02])))])
            pm.absence_history(data, chain)
        finally:
            pm.TARGET = old
        a = data['players'][0]['forecast']['availability']
        self.assertIsNone(a['ownShortPer82']); self.assertIsNone(a['ownLongPer82']); self.assertLess(a['availableGames'], pm.OWN_MIN_GAMES)


class CovidSeasonTests(unittest.TestCase):
    """2019/20: the eight clubs left out of the bubble stopped on 11 March after 64-67 games."""
    def test_a_complete_non_bubble_calendar_is_not_rebuilt_from_days(self):
        start = date(2019, 10, 23)
        rows = [dated('0', 2020, i, 'ATL', start) for i in range(65)] + [dated('9', 2020, i, 'LAL', start, 3) for i in range(72)]
        played = [i for i in range(65) if i not in (20, 21, 22)]
        rows += [dated('7', 2020, i, 'ATL', start) for i in played]
        o = av.spells(rows)[('7', 2020)]
        self.assertEqual(o['end'], 0)  # played the club's last game: no phantom 37-game end spell
        self.assertEqual([g for g in o['gaps'] if g], [3])
        self.assertEqual(o['games'] + o['start'] + o['end'] + sum(o['gaps']), 65)

    def test_exhibition_teams_are_listed(self):
        self.assertTrue({'EAST', 'WEST', 'LEB', 'GIA', 'USA', 'WORLD'} <= pm.EXHIBITION)
        self.assertFalse({'SEA', 'NJ', 'GS', 'NO'} & pm.EXHIBITION)


class TeammateTests(unittest.TestCase):
    def test_pairs_are_players_of_the_same_club_in_that_season(self):
        rows = [game('1', 2026, 0, 'BOS'), game('2', 2026, 0, 'BOS'), game('3', 2026, 0, 'NY'), game('4', 2026, 0, 'NY'),
                game('1', 2025, 0, 'BOS'), game('2', 2025, 0, 'MIA'), game('3', 2025, 0, 'BOS'), game('4', 2025, 0, 'MIA')]
        seasons, team_games = pm.season_table(rows, lambda r: r['player_id'])
        h = pm.History(seasons, team_games, {})
        fw = [(dict(pid=pid, t=2026, x=dict(past=[dict(team=past)]), y=dict(rate=10.0 + i, games=10)), dict(rate=10.0, share=.1))
              for i, (pid, past) in enumerate((('1', 'BOS'), ('2', 'MIA'), ('3', 'BOS'), ('4', 'MIA')))]
        self.assertEqual(pm.teammate_correlation(fw, h)['pairs'], 2)  # BOS 1-2 and NY 3-4, not last season's clubs

    def test_main_club_ties_do_not_depend_on_the_hash_seed(self):
        rows = [game('1', 2026, 0, 'NY'), game('1', 2026, 1, 'BOS')]
        seasons, _ = pm.season_table(rows, lambda r: r['player_id'])
        self.assertEqual(seasons[('1', 2026)]['team'], 'BOS')


class RookieRowTests(unittest.TestCase):
    """Draft picks were joined to league logs by name only: played picks counted as 0-game picks and again as undrafted."""
    def league(self):
        s = lambda name, games: dict(name=name, games=games, minutes=20.0, rate=10.0, perMinuteStats={k: .1 for k in pm.STAT_KEYS})
        return {1641842: s('Ronald Holland II', 81), 1642000: s('Nikola Topić', 30), 1630000: s('Lonzo Ball', 35),
                1643000: s('Earlier Pick', 20), 1644000: s('True Debutant', 12)}

    def test_picks_match_by_nba_id_and_unescaped_name(self):
        drafts = {'2024': [dict(name='Ron Holland', overall=5), dict(name='Nikola Topi&#263;', overall=12)], '2022': [dict(name='Earlier Pick', overall=40)]}
        index = {'1641842': dict(DRAFT_YEAR=2024, DRAFT_NUMBER=5)}
        rows = pm.rookie_rows(drafts, {2025: (self.league(), {})}, index, {'1630000': 2018})
        picks = {r['pick']: r for r in rows if r['pick']}
        self.assertEqual(picks[5]['games'], 81); self.assertEqual(picks[12]['games'], 30)
        undrafted = {r['name'] for r in rows if not r['pick']}
        self.assertEqual(undrafted, {'True Debutant'})  # not Holland again, not a returning veteran, not an earlier pick

    def test_index_pick_of_an_earlier_class_is_not_an_undrafted_debutant(self):
        index = {'1643000': dict(DRAFT_YEAR=2023, DRAFT_NUMBER=40)}
        rows = pm.rookie_rows({'2024': []}, {2025: ({1643000: self.league()[1643000]}, {})}, index, {})
        self.assertEqual(rows, [])


class EvaluateBiasTests(unittest.TestCase):
    def test_holdout_reports_mean_errors_by_age_and_rank(self):
        rng = random.Random(2); ex = []
        for t in (2024, 2025, 2026):
            for i in range(60):
                a = ShareRegressionTests.example(t, rng.uniform(.4, 1), rng.uniform(.3, 1), rng.uniform(20, 38), f'{t}-{i}')
                a['y']['rate'] = rng.uniform(5, 30); ex.append(a)
        model = pm.Veteran([e for e in ex if e['t'] < 2026])
        fw = [(e, model.predict(e['x'])) for e in ex if e['t'] < 2026]
        ranges = pm.Ranges(fw)
        test = [e for e in ex if e['t'] == 2026]
        h = pm.evaluate(model, ranges, test)
        rows = [(e['y']['rate'] * e['y']['games'], (p := model.predict(e['x']))['rate'] * p['share'] * pm.season_length(2026)) for e in test]
        self.assertAlmostEqual(h['seasonBias'], statistics.mean(a - c for a, c in rows))
        self.assertTrue({'gamesBias', 'perGameBias', 'seasonBiasByAge', 'perGameBiasByRank', 'coverageByGroup', 'unconditional', 'intervalScore', 'meanWidth'} <= set(h))
        self.assertEqual(sum(v['players'] for v in h['seasonBiasByAge'].values()), len(test))


class SlotValueTextTests(unittest.TestCase):
    def test_replacement_method_names_the_one_game_probability(self):
        import inspect
        src = inspect.getsource(pm.slot_values)
        self.assertNotIn("healthy player\\'s chance to play", src)
        self.assertIn('plays the next game', src)


class ProductionDataTests(unittest.TestCase):
    """Checks on the committed career logs (skipped where the raw files are not checked out)."""
    @classmethod
    def setUpClass(cls):
        if not pm.CAREER.exists() or not Path('public/data/default-draft.json').exists():
            raise unittest.SkipTest('needs the career logs and the built catalog')
        cls.h = pm.load()
        cls.current = pm.current_roster(None)

    def test_almost_every_transition_has_an_age(self):
        ex = pm.examples_for(self.h, range(pm.TEST - 5, pm.TEST + 1), self.current)
        self.assertLess(statistics.mean(e['x']['age'] is None for e in ex), .02)

    def test_current_players_without_a_birth_date_get_an_age(self):
        for pid in ('1627832', '1642905'):  # Fred VanVleet, Yang Hansen
            if pid in self.h.first:self.assertIsNotNone(self.h.features(pid, pm.TARGET)['age'])

    def test_no_phantom_covid_end_spells(self):
        ends = [o['end'] for (pid, s), o in self.h.spells.items() if s == 2020]
        self.assertLess(statistics.mean(35 <= e <= 40 for e in ends), .01)


if __name__ == '__main__':
    unittest.main()
