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

    def test_token_is_stored_encrypted(self):
        os.environ['YAHOO_CLIENT_SECRET'] = 'test-secret'
        sealed = yahoo.crypt(b'refresh-token-value')
        self.assertNotIn(b'refresh-token-value', sealed)
        self.assertEqual(yahoo.crypt(sealed, decrypt=True), b'refresh-token-value')


if __name__ == '__main__':
    unittest.main()
