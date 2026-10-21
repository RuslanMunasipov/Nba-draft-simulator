"""Forecast inputs: the ESPN stat parser, the injury report, club schedules, draft picks of debutants, and how apply()
combines ESPN with the model (games are the mean of the two, a known absence takes its club games out)."""
import importlib.util
import json
import math
import random
import statistics
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
import numpy as np
from scripts import availability_model as av
from scripts import projection_model as pm
from scripts.espn_context import parse_context
from scripts import espn_team_context as team_context

spec = importlib.util.spec_from_file_location('database', 'scripts/build_default_database.py')
database = importlib.util.module_from_spec(spec); spec.loader.exec_module(database)


def espn_record(stats):
    """One kona_player_info entry with a 60-game season projection; `stats` are season totals by ESPN stat id."""
    s = {'42': 60, **stats}
    return {'players': [{'player': {'id': 7, 'ownership': {}, 'stats': [{'seasonId': 2027, 'statSourceId': 1, 'statSplitTypeId': 0, 'scoringPeriodId': 0, 'stats': s,
            'averageStats': {k: s[k] / 60 for k in ('0', '3', '6') if k in s}}]}}]}


class ESPNParserTests(unittest.TestCase):
    # A non-shooting centre: no '17' (3PM), points = 2*FGM + FTM.
    CENTRE = {'0': 2 * 300 + 120, '1': 90, '2': 40, '3': 120, '6': 600, '11': 80, '13': 300, '14': 500, '15': 120, '16': 200, '40': 1800}

    def projection(self, stats):
        return parse_context(espn_record(stats), 'date')['7']['individualProjection']

    def test_a_centre_without_threes_keeps_his_projection(self):
        q = self.projection(self.CENTRE)
        self.assertIsNotNone(q)
        self.assertEqual(q['perGame']['threesMade'], 0); self.assertEqual(q['absentStatsReadAsZero'], ['threesMade'])
        self.assertEqual(q['componentSeasonTotal'], 720 + 600 + 120 + 40 + 90 - 200 - 80 - 160)

    def test_a_wing_without_blocks_reads_them_as_zero(self):
        stats = {**self.CENTRE, '17': 30, '0': 2 * 300 + 30 + 120}; del stats['1']
        q = self.projection(stats)
        self.assertEqual(q['perGame']['blocks'], 0); self.assertEqual(q['absentStatsReadAsZero'], ['blocks'])

    def test_an_absent_three_that_points_need_is_still_rejected(self):
        self.assertIsNone(self.projection({**self.CENTRE, '0': 2 * 300 + 120 + 50}))

    def test_required_stats_cannot_be_absent(self):
        for key in ('14', '40', '13', '6', '11'):  # a missing rebound or turnover total is a defect, not a zero
            stats = dict(self.CENTRE); del stats[key]
            self.assertIsNone(self.projection(stats), key)

    def test_a_present_optional_stat_must_be_valid(self):
        for bad in (-1, float('nan')):
            self.assertIsNone(self.projection({**self.CENTRE, '1': bad}))
            self.assertIsNone(self.projection({**self.CENTRE, '17': bad}))


class InjuryReportTests(unittest.TestCase):
    FEED = {'injuries': [{'displayName': 'X', 'injuries': [
        {'status': 'Out', 'shortComment': 'Furphy will miss time.', 'date': '2026-02-09T10:00Z',
         'athlete': {'displayName': 'Johnny Furphy', 'links': [{'href': 'https://www.espn.com/nba/player/_/id/5104000/johnny-furphy'}]},
         'details': {'returnDate': '2027-01-02', 'type': 'Knee', 'fantasyStatus': {'abbreviation': 'OUT'}}},
        {'status': 'Day-To-Day', 'shortComment': 'Questionable.', 'date': '2026-10-19T10:00Z', 'athlete': {'id': 42, 'displayName': 'Y'},
         'details': {'returnDate': '2026-10-22', 'fantasyStatus': {'abbreviation': 'GTD'}}}]}]}

    def test_report_keeps_return_date_fantasy_status_and_comment(self):
        report = database.report_injuries(self.FEED)
        self.assertEqual(report['5104000'][0]['returnDate'], '2027-01-02')
        self.assertEqual(report['5104000'][0]['fantasyStatus'], 'OUT')
        self.assertEqual(report['42'][0]['status'], 'Day-To-Day')
        self.assertIn('Furphy', report['5104000'][0]['comment'])

    def test_the_report_is_authoritative_and_the_roster_is_the_fallback(self):
        current = [{'espnId': '5104000', 'injuries': []}, {'espnId': '9', 'injuries': [{'status': 'Out', 'date': None}]}]
        self.assertEqual(database.merge_injuries(current, database.report_injuries(self.FEED)), 'INJURY_REPORT')
        self.assertEqual(current[0]['injuries'][0]['returnDate'], '2027-01-02'); self.assertEqual(current[1]['injuries'], [])
        kept = [{'espnId': '9', 'injuries': [{'status': 'Out', 'date': None}]}]
        self.assertEqual(database.merge_injuries(kept, None), 'ROSTER_ENDPOINT'); self.assertEqual(len(kept[0]['injuries']), 1)

    def test_espn_games_without_a_stat_projection_are_listed(self):
        players = [{'name': 'A', 'espnContext': {'projectedGames': 60, 'individualProjection': None}},
                   {'name': 'B', 'espnContext': {'projectedGames': 60, 'individualProjection': {'games': 60}}}, {'name': 'C'}]
        cov = database.espn_coverage(players, {'1': {}, '2': {}})
        self.assertEqual(cov['gamesWithoutIndividualProjection'], ['A']); self.assertEqual(cov['individualProjectionPlayers'], 1)


class ScheduleTests(unittest.TestCase):
    def test_tip_off_times_become_us_dates(self):
        payload = {'events': [{'date': '2026-10-23T01:30Z'}, {'date': '2026-10-24T23:00Z'}, {'name': 'no date'}, {'date': 'bad'}]}
        self.assertEqual(team_context.game_dates(payload), ['2026-10-22', '2026-10-24'])

    def test_short_or_failed_listings_are_left_out(self):
        full = {'events': [{'date': (date(2026, 10, 21) + timedelta(days=2 * i)).isoformat() + 'T23:00Z'} for i in range(80)]}
        def get(url):
            if '/1/' in url: return full
            if '/2/' in url: return {'events': full['events'][:10]}
            raise OSError('timeout')
        old = team_context.get; team_context.get = get
        try: out = team_context.schedule([{'id': 1, 'abbreviation': 'AAA'}, {'id': 2, 'abbreviation': 'BBB'}, {'id': 3, 'abbreviation': 'CCC'}])
        finally: team_context.get = old
        self.assertEqual(list(out), ['AAA']); self.assertEqual(len(out['AAA']), 80)


class AbsenceTests(unittest.TestCase):
    DATES = [(date(2026, 10, 21) + timedelta(days=2 * i)).isoformat() for i in range(80)]  # 80 listed of 82

    def test_report_entries_are_read_like_the_season_tab(self):
        self.assertEqual(pm.absence({'status': 'Out', 'fantasyStatus': 'OFS', 'returnDate': '2027-10-01'}), ('ending', '2027-10-01'))
        self.assertEqual(pm.absence({'status': 'Out', 'comment': 'He is expected to miss the 2026-27 season.'})[0], 'ending')
        self.assertEqual(pm.absence({'status': 'Out', 'fantasyStatus': 'OFS'}), ('ending', '9999-12-31'))
        self.assertEqual(pm.absence({'status': 'Out', 'fantasyStatus': 'OUT', 'returnDate': '2027-02-03'}), ('out', '2027-02-03'))
        self.assertEqual(pm.absence({'status': 'Suspension', 'returnDate': '2026-11-01'})[0], 'out')
        self.assertEqual(pm.absence({'status': 'Day-To-Day', 'fantasyStatus': 'GTD', 'returnDate': '2026-10-22'})[0], 'minor')
        self.assertEqual(pm.absence({'status': 'Out', 'fantasyStatus': 'GTD', 'returnDate': '2026-10-25'})[0], 'minor')

    def test_known_absence_blocks_club_games_up_to_the_return(self):
        blocked, until, healthy = pm.known_absence([{'status': 'Out', 'returnDate': '2026-11-20'}], '2026-10-15', self.DATES)
        self.assertEqual(until, '2026-11-20'); self.assertTrue(healthy)
        self.assertEqual(blocked, round(sum(d < '2026-11-20' for d in self.DATES) * 82 / 80))
        self.assertEqual(pm.known_absence([{'status': 'Out', 'fantasyStatus': 'OFS'}], '2026-10-15', self.DATES)[0], 82)
        self.assertEqual(pm.known_absence([{'status': 'Day-To-Day', 'fantasyStatus': 'GTD', 'returnDate': '2026-10-25'}], '2026-10-15'), (0, None, True))
        self.assertEqual(pm.known_absence([{'status': 'Out', 'date': '2026-10-10'}], '2026-10-15'), (0, None, False))  # no date: length unknown
        self.assertEqual(pm.known_absence([{'status': 'Out', 'returnDate': '2026-10-19'}], '2026-10-20'), (0, None, True))  # already back
        self.assertEqual(pm.known_absence([], '2026-10-15'), (0, None, True))

    def test_in_season_the_block_counts_from_today(self):
        before = sum(d < '2026-12-01' for d in self.DATES)
        self.assertEqual(pm.blocked_games('2026-12-01', '9999-12-31', self.DATES), 82 - round(before * 82 / 80))
        self.assertEqual(pm.blocked_games('2026-12-01', '2026-12-11', self.DATES), round(5 * 82 / 80))

    def test_without_a_schedule_the_season_is_spread_evenly(self):
        # Mark Williams: out until 3 February, about 47 of his club's 80 listed games come before it.
        self.assertIn(pm.blocked_games('2026-10-21', '2027-02-03'), range(48, 52))
        self.assertEqual(pm.blocked_games('2026-10-20', '2027-10-01'), 82)
        self.assertEqual(pm.blocked_games('2026-10-20', '2026-10-20'), 0)


class DraftPickTests(unittest.TestCase):
    DRAFTS = {'2019': [{'overall': 3, 'name': 'Old Pick'}], '2023': [{'overall': 56, 'name': 'Tarik Biberovi&#263;'}],
              '2025': [{'overall': 15, 'name': 'Thomas Sorber'}, {'overall': 40, 'name': 'Twice Named'}],
              '2026': [{'overall': 1, 'name': 'Top Pick'}, {'overall': 45, 'name': 'Twice Named'}]}

    def test_name_fallback_covers_recent_classes_and_drops_ambiguous_names(self):
        names = pm.draft_classes(self.DRAFTS)
        self.assertEqual(names['thomas sorber'], (2025, 15)); self.assertEqual(names['top pick'], (2026, 1))
        self.assertEqual(names['tarik biberovic'], (2023, 56))
        self.assertNotIn('twice named', names); self.assertNotIn('old pick', names)  # 2019 is outside the last five classes

    def test_an_earlier_drafted_debutant_gets_his_real_pick(self):
        index = {'1642850': {'DRAFT_YEAR': 2025, 'DRAFT_NUMBER': 15}, '5': {'DRAFT_YEAR': 2015, 'DRAFT_NUMBER': 9}}
        self.assertEqual(pm.draft_pick({'nbaId': 1642850, 'name': 'Thomas Sorber'}, index, {}, False), (2025, 15))
        self.assertEqual(pm.draft_pick({'nbaId': None, 'name': 'Top Pick'}, {}, pm.draft_classes(self.DRAFTS), False), (2026, 1))
        self.assertEqual(pm.draft_pick({'nbaId': 5, 'name': 'Veteran'}, index, {}, True), (None, None))  # played before: not a debutant
        self.assertEqual(pm.draft_pick({'nbaId': 6, 'name': 'Nobody'}, index, {}, False), (None, None))

    def test_basis_names_an_earlier_class(self):
        basis = pm.forecast_basis(None, None, {'pick': 15, 'draftYear': 2025}, None, False)
        self.assertIn('пик №15, драфт 2025', basis); self.assertNotIn('незадрафтованных', basis)
        self.assertNotIn('драфт 2026', pm.forecast_basis(None, None, {'pick': 3, 'draftYear': 2026}, None, False))

    def test_plural_of_games(self):
        self.assertEqual([pm.games_ru(n) for n in (1, 2, 5, 11, 21, 34)], ['1 матч', '2 матча', '5 матчей', '11 матчей', '21 матч', '34 матча'])


def row(pid, season, i, team='AAA'):
    return dict(player_id=pid, season=season, game_id=f'{season}-{i}', team=team, date=(date(season - 1, 10, 20) + timedelta(days=2 * i)).isoformat(),
                home=i % 2 == 0, result='W', minutes=30.0, pts=20, reb=5, ast=3, stl=1, blk=1, tov=2, pf=2, fgm=8, fga=16, ftm=3, fta=4)


def league(seasons=range(2021, 2027), players=30, seed=3):
    """A full club calendar (the iron man '0'), players who miss games at random spells, and '99' with five recent games."""
    rng = random.Random(seed); rows = []
    for s in seasons:
        rows += [row('0', s, i) for i in range(82)]
        for p in range(1, players):
            i = 0
            while i < 82:
                if rng.random() < .02 + .002 * p:
                    i += rng.choice([1, 1, 2, 3, 6, 15]); continue
                rows.append(row(str(p), s, i)); i += 1
    rows += [row('99', 2024, i) for i in range(40)] + [row('99', 2026, i) for i in range(5)]
    return rows


class StubModel:
    STATS = dict(pts=14, reb=6, ast=3, stl=1, blk=1, tov=2, pf=2, fgm=5, fga=11, ftm=3, fta=4)
    def predict(self, x):
        return dict(perMinute=.6, minutes=30.0, share=.7, short=.02, rate=20.0, stats=dict(self.STATS), ageAdjustment=0)


class StubRanges:
    def interval(self, p, x, games_scale=82):
        c = p['rate'] * p['share'] * games_scale
        return .5 * c, 1.5 * c, pm.Ranges.short_risk(p, games_scale)


class ApplyTests(unittest.TestCase):
    """apply() on a synthetic league with the real absence chain and rookie model."""
    @classmethod
    def setUpClass(cls):
        rows = league()
        seasons, team_games = pm.season_table(rows, lambda r: r['player_id'])
        cls.history = pm.History(seasons, team_games, {})
        cls.history.spells = av.spells(rows)
        cls.chain = av.Availability(cls.history.spells, cls.history, set(range(2021, 2027)))
        rookie_rows = [dict(pick=k, rate=20 - 3 * math.log(k), minutes=30 - 4 * math.log(k), share=.9 - .1 * math.log(k), games=50, perMinuteStats=None) for k in range(1, 61)]
        rookie_rows += [dict(pick=None, rate=4 + i % 3, minutes=10, share=.2 + .05 * (i % 3), games=10, perMinuteStats=None) for i in range(6)]
        cls.rookies = pm.Rookie(rookie_rows); cls.rookies.residuals = pm.Rookie(rookie_rows).errors(rookie_rows).residuals
        espn = dict(origin='ESPN_INDIVIDUAL', meanPerGame=24.0, games=70.0, minutes=32.0, components=dict(personalFouls=-2.0))
        out = [{'status': 'Out', 'fantasyStatus': 'OUT', 'returnDate': '2027-02-03', 'comment': 'Labrum surgery.'}]
        cls.players = [
            dict(id='5', nbaId='5', name='Healthy Vet', team='AAA', currentRosterStatus='SOURCE_REPORTED', injuries=[]),
            dict(id='6', nbaId='6', name='Espn Vet', team='AAA', currentRosterStatus='SOURCE_REPORTED', injuries=[], forecast=dict(espn)),
            dict(id='7', nbaId='7', name='Out Vet', team='AAA', currentRosterStatus='SOURCE_REPORTED', injuries=out),
            dict(id='8', nbaId='8', name='Season Over', team='AAA', currentRosterStatus='SOURCE_REPORTED', injuries=[{'status': 'Out', 'fantasyStatus': 'OFS', 'returnDate': '2027-10-01'}]),
            dict(id='9', nbaId='9', name='Espn Out', team='AAA', currentRosterStatus='SOURCE_REPORTED', injuries=out, forecast=dict(espn)),
            dict(id='10', nbaId='10', name='Day To Day', team='AAA', currentRosterStatus='SOURCE_REPORTED', injuries=[{'status': 'Day-To-Day', 'fantasyStatus': 'GTD', 'returnDate': '2026-10-22'}]),
            dict(id='11', nbaId='11', name='Free Agent', team=None, currentRosterStatus='NOT_IN_CURRENT_SOURCE', injuries=[]),
            dict(id='99', nbaId='99', name='Few Games', team='AAA', currentRosterStatus='SOURCE_REPORTED', injuries=[], forecast=dict(origin='EMPIRICAL_ROLE_PRIOR', gameFloor=3.83, gameCeiling=17.58)),
            dict(id='1642850', nbaId='1642850', name='Thomas Sorber', team='OKC', currentRosterStatus='SOURCE_REPORTED', isRookie=True, injuries=[]),
            dict(id='espn:1', nbaId=None, name='Hurt Rookie', team='AAA', currentRosterStatus='SOURCE_REPORTED', isRookie=True, injuries=out),
            dict(id='espn:2', nbaId=None, name='Gone Rookie', team='AAA', currentRosterStatus='SOURCE_REPORTED', isRookie=True, injuries=[{'status': 'Out', 'fantasyStatus': 'OFS'}]),
        ]
        cls.tmp = tempfile.TemporaryDirectory(); tmp = Path(cls.tmp.name)
        saved = pm.TEAM_CONTEXT, pm.AVAILABILITY_LENGTHS
        pm.TEAM_CONTEXT, pm.AVAILABILITY_LENGTHS = tmp / 'none.json', tmp / 'lengths.json'
        try:
            cls.data = dict(generatedAt='2026-10-15T02:00:00+00:00', players=json.loads(json.dumps(cls.players)))
            cls.counts = pm.apply(cls.data, cls.history, StubModel(), StubRanges(), cls.rookies, {'1642850': {'DRAFT_YEAR': 2025, 'DRAFT_NUMBER': 15}},
                                  {'hurt rookie': (2026, 5)}, lambda rate: (.4, 1.6), cls.chain)
            # The same with a club schedule in the team context.
            (tmp / 'ctx.json').write_text(json.dumps({'schedule': {'AAA': [(date(2026, 10, 21) + timedelta(days=2 * i)).isoformat() for i in range(80)]}}))
            pm.TEAM_CONTEXT = tmp / 'ctx.json'
            cls.scheduled = dict(generatedAt='2026-10-15T02:00:00+00:00', players=json.loads(json.dumps(cls.players[2:3])))
            pm.apply(cls.scheduled, cls.history, StubModel(), StubRanges(), cls.rookies, {}, {}, lambda rate: (.4, 1.6), cls.chain)
        finally:
            pm.TEAM_CONTEXT, pm.AVAILABILITY_LENGTHS = saved
        cls.f = {p['name']: p['forecast'] for p in cls.data['players']}

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_espn_games_are_the_mean_of_espn_and_the_model(self):
        f = self.f['Espn Vet']; model = self.chain.healthy_mean('6', 2027, .7 * 82, 82)
        self.assertEqual(f['origin'], 'ESPN_MODEL_COMBINED'); self.assertEqual(f['gamesBasis'], 'MEAN_ESPN_MODEL')
        self.assertAlmostEqual(f['games'], (model + 70) / 2)
        self.assertAlmostEqual(f['sources']['model']['games'], model); self.assertEqual(f['sources']['espn']['games'], 70)
        self.assertAlmostEqual(f['meanPerGame'], (20 + 24) / 2); self.assertAlmostEqual(f['meanSeason'], f['meanPerGame'] * f['games'])
        self.assertIn('средние ESPN и модели по карьере', f['basis'])
        self.assertAlmostEqual(f['availability']['unconditionalGames'], .7 * 82)
        self.assertEqual(self.f['Healthy Vet']['gamesBasis'], 'MODEL')

    def test_a_healthy_start_and_a_day_to_day_entry_shift_the_same_way(self):
        for name, pid in (('Healthy Vet', '5'), ('Day To Day', '10')):
            f = self.f[name]
            self.assertTrue(f['availability']['healthyNow'], name)
            self.assertAlmostEqual(f['games'], self.chain.healthy_mean(pid, 2027, .7 * 82, 82))
            self.assertIsNone(f['knownAbsence'])

    def test_a_known_absence_leaves_only_the_games_after_the_return(self):
        f = self.f['Out Vet']; a = f['knownAbsence']; left = a['gamesLeft']
        self.assertEqual(a['blockedGames'], pm.blocked_games('2026-10-20', '2027-02-03')); self.assertEqual(a['counted'], 'EVEN_SPREAD')
        self.assertEqual(left, 82 - a['blockedGames']); self.assertEqual(a['returnDate'], '2027-02-03')
        self.assertLessEqual(f['games'], left); self.assertLessEqual(f['availability']['gamesRange'][1], left)
        self.assertFalse(f['availability']['healthyNow'])
        self.assertAlmostEqual(f['availability']['unconditionalGames'], .7 * 82)  # the post-return share for the season tab
        self.assertAlmostEqual(f['games'], self.chain.healthy_mean('7', 2027, .7 * left, left))  # healthy start after the return
        self.assertIn('пропустит', f['basis']); self.assertIn('до 03.02', f['basis'])
        self.assertEqual(self.scheduled['players'][0]['forecast']['knownAbsence']['counted'], 'CLUB_SCHEDULE')

    def test_block_then_healthy_start_equals_the_chain_started_inside_the_spell(self):
        p = {}; R = 50
        pm.after_return(p, self.chain, '7', 20.0, R, 57.4)
        hs, hl, _ = self.chain.hazards('7', 2027); c = p['availability']['scale']
        p0 = np.zeros(83); p0[R] = 1
        self.assertAlmostEqual(self.chain._mean(hs * c, hl * c, p0, 82), 20.0, delta=.3)
        self.assertAlmostEqual(float((p['gamesPmf'] * np.arange(83)).sum()), 20.0, delta=.3)
        self.assertEqual(float(p['gamesPmf'][83 - R:].sum()), 0.0)
        self.assertAlmostEqual(p['availability']['replacedGames'] - (R - av.REPLACE_DELAY), self.chain.distribution('7', 2027, mean=20.0, L=32, healthy=True)[1]['replacedGames'])

    def test_out_for_the_season_means_no_games(self):
        f = self.f['Season Over']
        self.assertEqual(f['games'], 0); self.assertEqual(f['meanSeason'], 0); self.assertEqual(f['seasonCeiling'], 0)
        self.assertEqual(f['availability']['gamesRange'], [0, 0]); self.assertAlmostEqual(f['shortSeasonRisk'], 1)
        self.assertTrue(f['knownAbsence']['seasonEnding']); self.assertEqual(f['knownAbsence']['returnDate'], '2027-10-01')
        self.assertIn('вне игры до конца сезона', f['basis'])
        p = {}; pm.after_return(p, self.chain, '8', 0.0, 82, 57.4)
        self.assertEqual(p['availability']['replacedGames'], 82 - av.REPLACE_DELAY)

    def test_espn_games_are_capped_by_a_known_absence(self):
        f = self.f['Espn Out']; left = f['knownAbsence']['gamesLeft']
        self.assertEqual(f['sources']['espn']['games'], left); self.assertEqual(f['sources']['espn']['projectedGames'], 70)
        self.assertAlmostEqual(f['games'], (f['sources']['model']['games'] + left) / 2); self.assertLessEqual(f['games'], left)
        self.assertLessEqual(f['availability']['gamesRange'][1], left)
        self.assertLess(f['availability']['hazards'][0] + f['availability']['hazards'][1], .45)  # no inflated hazards to absorb the block

    def test_players_off_every_roster_are_labelled_conditional(self):
        f = self.f['Free Agent']
        self.assertTrue(f['conditionalOnRoster']); self.assertIn('нет в действующем ростере NBA', f['basis'])
        self.assertFalse(f['availability']['healthyNow'])
        self.assertFalse(self.f['Healthy Vet']['conditionalOnRoster'])

    def test_game_range_never_comes_from_the_old_role_prior(self):
        f = self.f['Few Games']
        self.assertAlmostEqual(f['gameCeiling'], f['meanPerGame'] * 1.6); self.assertAlmostEqual(f['gameFloor'], f['meanPerGame'] * .4)

    def test_earlier_drafted_and_injured_rookies(self):
        f = self.f['Thomas Sorber']
        self.assertEqual(f['origin'], 'DRAFT_PICK_MODEL'); self.assertEqual((f['draftPick'], f['draftYear']), (15, 2025))
        self.assertAlmostEqual(f['games'], self.rookies.predict(15)['share'] * 82); self.assertIn('пик №15, драфт 2025', f['basis'])
        hurt = self.f['Hurt Rookie']; left = hurt['knownAbsence']['gamesLeft']
        self.assertEqual(hurt['draftPick'], 5); self.assertAlmostEqual(hurt['games'], self.rookies.predict(5)['share'] * left)
        self.assertLessEqual(hurt['seasonFloor'], hurt['meanSeason']); self.assertGreaterEqual(hurt['seasonCeiling'], hurt['meanSeason'])
        self.assertAlmostEqual(hurt['knownAbsence']['unconditionalGames'], self.rookies.predict(5)['share'] * 82)
        gone = self.f['Gone Rookie']
        self.assertEqual((gone['games'], gone['seasonCeiling'], gone['shortSeasonRisk']), (0, 0, 1.0))


def invariants(players):
    """Checks on a database built by this apply(): returns the list of violations."""
    bad = []; ceilings = {}
    for p in players:
        f = p.get('forecast') or {}
        if f.get('version') != 4: continue
        # One game ceiling across many per-game levels is a constant prior, not a per-level P90 (17.58 had 190 players).
        name = p['name']; ceilings.setdefault(round(f['gameCeiling'], 2), set()).add(round(f['meanPerGame'], 1))
        if f.get('conditionalOnRoster') != (p.get('currentRosterStatus') != 'SOURCE_REPORTED'): bad.append(('conditional', name))
        if f['origin'] == 'ESPN_MODEL_COMBINED':
            s = f['sources']
            if f.get('gamesBasis') != 'MEAN_ESPN_MODEL' or abs(f['games'] - (s['model']['games'] + s['espn']['games']) / 2) > 1e-6: bad.append(('mean', name))
        a = f.get('knownAbsence')
        if a:
            if f['games'] > a['gamesLeft'] + 1e-6: bad.append(('games after return', name))
            if f.get('availability') and f['availability']['gamesRange'][1] > a['gamesLeft']: bad.append(('range after return', name))
        if (p.get('espnContext') or {}).get('projectedGames') and not (p.get('espnContext') or {}).get('individualProjection'): bad.append(('espn games only', name))
    bad += [('shared ceiling', c) for c, rates in ceilings.items() if len(rates) > 5]
    return bad


class BuiltDatabaseTests(unittest.TestCase):
    """The built catalog, once it comes from this apply() (it carries gamesBasis)."""
    def test_invariants(self):
        path = Path('public/data/default-draft.json')
        players = json.loads(path.read_text())['players'] if path.exists() else []
        if not any('gamesBasis' in (p.get('forecast') or {}) for p in players): raise unittest.SkipTest('needs a catalog built by this apply()')
        self.assertEqual(invariants(players), [])


if __name__ == '__main__':
    unittest.main()
