import importlib.util
import os
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('yahoo', Path(__file__).resolve().parent.parent / 'scripts' / 'yahoo.py')
yahoo = importlib.util.module_from_spec(spec)
spec.loader.exec_module(yahoo)

HEAD = '<?xml version="1.0"?><fantasy_content xmlns="http://fantasysports.yahooapis.com/fantasy/v2/base.rng">'
TEAMS = HEAD + '''<league><teams count="2">
<team><team_key>466.l.246081.t.1</team_key><name>The Balkan Murderers</name><managers><manager><nickname>Franky</nickname></manager></managers></team>
<team><team_key>466.l.246081.t.2</team_key><name>Saint P</name><managers><manager><nickname>Ivan</nickname></manager></managers></team>
</teams></league></fantasy_content>'''
ROSTER = HEAD + '''<team><roster><players count="1"><player><player_id>6014</player_id><name><full>Nikola Jokić</full></name>
<editorial_team_abbr>DEN</editorial_team_abbr></player></players></roster></team></fantasy_content>'''
TRANSACTIONS = HEAD + '''<league><transactions count="2">
<transaction><transaction_key>466.l.246081.tr.2</transaction_key><type>add/drop</type><status>successful</status><timestamp>1761700000</timestamp>
<players count="2">
<player><player_id>1</player_id><name><full>Zion Williamson</full></name><transaction_data><type>add</type><source_type>freeagents</source_type><destination_type>team</destination_type><destination_team_key>466.l.246081.t.1</destination_team_key></transaction_data></player>
<player><player_id>2</player_id><name><full>Julius Randle</full></name><transaction_data><type>drop</type><source_type>team</source_type><source_team_key>466.l.246081.t.1</source_team_key><destination_type>waivers</destination_type></transaction_data></player>
</players></transaction>
<transaction><transaction_key>466.l.246081.tr.1</transaction_key><type>drop</type><status>successful</status><timestamp>1761600000</timestamp>
<players count="1"><player><player_id>3</player_id><name><full>Keldon Johnson</full></name><transaction_data><type>drop</type><source_team_key>466.l.246081.t.2</source_team_key></transaction_data></player></players></transaction>
</transactions></league></fantasy_content>'''


class YahooTest(unittest.TestCase):
    def test_teams_and_roster(self):
        self.assertEqual(yahoo.parse_teams(TEAMS)[1], {'key': '466.l.246081.t.2', 'name': 'Saint P'})
        self.assertEqual(yahoo.parse_roster(ROSTER), [{'name': 'Nikola Jokić', 'yahooId': '6014', 'team': 'DEN'}])

    def test_transactions_oldest_first_with_moves(self):
        tr = yahoo.parse_transactions(TRANSACTIONS)
        self.assertEqual([t['key'] for t in tr], ['466.l.246081.tr.1', '466.l.246081.tr.2'])
        self.assertEqual(tr[1]['moves'], [
            {'name': 'Zion Williamson', 'yahooId': '1', 'kind': 'add', 'from': None, 'to': '466.l.246081.t.1'},
            {'name': 'Julius Randle', 'yahooId': '2', 'kind': 'drop', 'from': '466.l.246081.t.1', 'to': None}])

    def test_code_is_cut_from_a_pasted_address(self):
        self.assertEqual(yahoo.clean_code(' abc123 '), 'abc123')
        self.assertEqual(yahoo.clean_code('https://localhost:8080/?code=abc%2D123&state=x'), 'abc-123')

    def test_redirect_repeats_the_consent_request(self):
        self.assertEqual(yahoo.redirect_used('abc123'), 'oob')
        self.assertEqual(yahoo.redirect_used('https://localhost:8080/?code=x&state=https%3A%2F%2Flocalhost%3A8080'), 'https://localhost:8080')
        self.assertEqual(yahoo.redirect_used('https://localhost:8080/?code=x'), 'https://localhost:8080/')

    def test_user_leagues_give_the_exact_season_key(self):
        xml = HEAD + '''<users><user><games>
<game><game_key>454</game_key><leagues><league><league_key>454.l.246081</league_key><league_id>246081</league_id><name>Old</name></league></leagues></game>
<game><game_key>466</game_key><leagues><league><league_key>466.l.246081</league_key><league_id>246081</league_id><name>FBL</name></league></leagues></game>
</games></user></users></fantasy_content>'''
        self.assertEqual([k for k, i, _ in yahoo.parse_user_leagues(xml) if i == '246081'][-1], '466.l.246081')

    def test_app_not_approved_by_yahoo_is_named(self):
        body = ('<?xml version="1.0" encoding="UTF-8"?><error xmlns="http://www.yahooapis.com/v1/base.rng">'
                '<description>This application is not authorized to perform this action.</description><detail/></error>')
        self.assertEqual(yahoo.api_error('game/nba', 403, body), yahoo.NOT_APPROVED)
        other = body.replace('This application is not authorized to perform this action.', 'League not found')
        self.assertEqual(yahoo.api_error('league/x', 400, other), 'Yahoo API league/x: 400 League not found')

    def test_collect_records_why_yahoo_is_missing(self):
        import json, tempfile
        with tempfile.TemporaryDirectory() as d:
            live = Path(d) / 'live.json'
            live.write_text('{"players":[]}')
            original, yahoo.read_league = yahoo.read_league, lambda _: (_ for _ in ()).throw(SystemExit(yahoo.NOT_APPROVED))
            try:
                with self.assertRaises(SystemExit):
                    yahoo.collect(live, Path(d) / 'token.enc')
            finally:
                yahoo.read_league = original
            data = json.loads(live.read_text())
            self.assertEqual(data['players'], [])
            self.assertEqual(data['yahooStatus']['error'], 'not_approved')
            self.assertNotIn('yahoo', data)

    def test_token_is_stored_encrypted(self):
        os.environ['YAHOO_CLIENT_SECRET'] = 'test-secret'
        sealed = yahoo.crypt(b'refresh-token-value')
        self.assertNotIn(b'refresh-token-value', sealed)
        self.assertEqual(yahoo.crypt(sealed, decrypt=True), b'refresh-token-value')


if __name__ == '__main__':
    unittest.main()
