#!/usr/bin/env python3
"""Read the private FBL Yahoo league through the official Yahoo Fantasy API (read-only OAuth 2).

  yahoo.py exchange <token.enc>          one-time: trade the code from the Yahoo consent page for a refresh token
  yahoo.py collect <live.json> <token.enc>  add league teams, rosters and transactions to the season snapshot

Env: YAHOO_CLIENT_ID, YAHOO_CLIENT_SECRET, optional YAHOO_REDIRECT_URI (default oob) as GitHub secrets; YAHOO_CODE (exchange only).
The refresh token is stored only encrypted (AES-256, key = client secret), so the public repository never holds it in clear.
"""
import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CONFIG = ROOT / 'data' / 'fbl-sports-teams.json'
TOKEN_URL = 'https://api.login.yahoo.com/oauth2/get_token'
API = 'https://fantasysports.yahooapis.com/fantasy/v2/'
NS = {'y': 'http://fantasysports.yahooapis.com/fantasy/v2/base.rng'}
# Since July 2026 Yahoo answers every Fantasy resource, public game/nba included, with this 403 unless it approved the app.
# Consent and tokens still work, so pressing Agree again changes nothing.
NOT_APPROVED = ('Yahoo has not approved this app for the Fantasy API: tokens work, but every Fantasy resource answers 403 '
                '"This application is not authorized to perform this action". Apply at https://sports.yahoo.com/developer/access/, '
                'sign the agreement, then create a NEW app and submit its Client ID at '
                'https://sports.yahoo.com/developer/application-confirmation/. Re-consenting does not help.')


def secret(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise SystemExit(f'{name} is not set')
    return value


def crypt(data, decrypt=False):
    args = ['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-salt', '-a', '-A', '-pass', 'env:YAHOO_CLIENT_SECRET'] + (['-d'] if decrypt else [])
    return subprocess.run(args, input=data, capture_output=True, check=True).stdout


def token_request(redirect=None, **fields):
    auth = base64.b64encode(f"{secret('YAHOO_CLIENT_ID')}:{secret('YAHOO_CLIENT_SECRET')}".encode()).decode()
    redirect = redirect or os.environ.get('YAHOO_REDIRECT_URI', '').strip() or 'oob'
    body = urllib.parse.urlencode({'redirect_uri': redirect, **fields}).encode()
    req = urllib.request.Request(TOKEN_URL, data=body, headers={'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        # Yahoo's explanation (invalid_grant, redirect mismatch, bad client) carries no secrets.
        raise TokenError(f'Yahoo token request failed ({e.code}): {e.read().decode(errors="replace")[:500]}') from None


class TokenError(Exception):
    pass


def clean_code(value):
    """The code alone, also when the whole redirect address or 'code=...' was pasted."""
    value = value.strip()
    if 'code=' in value:
        value = value.split('code=', 1)[1].split('&', 1)[0]
    return urllib.parse.unquote(value).strip()


def pasted_code():
    """The workflow input, read from the event payload so it never appears in the step's printed environment."""
    value = os.environ.get('YAHOO_CODE', '')
    event = os.environ.get('GITHUB_EVENT_PATH')
    if not value and event and Path(event).exists():
        value = json.loads(Path(event).read_text()).get('inputs', {}).get('code', '')
    if not value.strip():
        raise SystemExit('No Yahoo code given')
    print(f'::add-mask::{value.strip()}')
    return value.strip()


def redirect_used(pasted):
    """The token request must repeat the redirect of the consent request. The app's helper sends it as `state`;
    a bare code means Yahoo showed the code on its own page, i.e. the oob flow."""
    if 'state=' in pasted:
        return urllib.parse.unquote(pasted.split('state=', 1)[1].split('&', 1)[0]) or 'oob'
    if pasted.startswith('http'):
        return pasted.split('?', 1)[0]
    return 'oob'


def exchange(path):
    pasted = pasted_code()
    # One exact attempt: a failed exchange voids the code at Yahoo.
    try:
        tokens = token_request(redirect=redirect_used(pasted), grant_type='authorization_code', code=clean_code(pasted))
    except TokenError as e:
        raise SystemExit(f'{e}\nGet a fresh code (Agree again) and run the workflow within a few minutes.')
    print('Yahoo sign-in OK, token received. Checking Fantasy API access…')
    # Fail here, not two hours later, when Yahoo refuses the app or the account is not in the league.
    leagues = parse_user_leagues(api_get(tokens['access_token'], 'users;use_login=1/games;game_codes=nba/leagues'))
    print('NBA leagues visible to this account:', ', '.join(f'{i} ({n})' for _, i, n in leagues) or 'none')
    if league_id() not in [i for _, i, _ in leagues]:
        raise SystemExit(f'League {league_id()} is not among them: sign in to Yahoo with the account that plays in it.')
    Path(path).write_bytes(crypt(tokens['refresh_token'].encode()))
    print('Yahoo connected: refresh token stored encrypted.')


def api_get(access_token, path):
    req = urllib.request.Request(API + path, headers={'Authorization': 'Bearer ' + access_token})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()
    except urllib.error.HTTPError as e:
        raise SystemExit(api_error(path, e.code, e.read().decode(errors='replace'))) from None


def api_error(path, code, body):
    if code == 403 and 'not authorized' in body:
        return NOT_APPROVED
    try:
        reason = text(ET.fromstring(body), '{http://www.yahooapis.com/v1/base.rng}description') or body[:300]
    except ET.ParseError:
        reason = body[:300]
    return f'Yahoo API {path}: {code} {reason}'


def league_id():
    return str(json.loads(CONFIG.read_text(encoding='utf-8'))['yahooLeague'])


def parse_user_leagues(xml):
    """League keys of the signed-in user, newest season last: [(league_key, league_id, name)]."""
    root = ET.fromstring(xml)
    return [(text(l, 'y:league_key'), text(l, 'y:league_id'), text(l, 'y:name')) for l in root.iter(f"{{{NS['y']}}}league")]


def text(node, path):
    found = node.find(path, NS)
    return found.text.strip() if found is not None and found.text else None


def parse_teams(xml):
    root = ET.fromstring(xml)
    # Manager nicknames stay out: the snapshot is published in a public repository.
    return [{'key': text(t, 'y:team_key'), 'name': text(t, 'y:name')} for t in root.iter(f"{{{NS['y']}}}team")]


def parse_roster(xml):
    root = ET.fromstring(xml)
    return [{'name': text(p, 'y:name/y:full'), 'yahooId': text(p, 'y:player_id'), 'team': text(p, 'y:editorial_team_abbr')}
            for p in root.iter(f"{{{NS['y']}}}player")]


def parse_transactions(xml):
    """Completed add/drop and trade moves, oldest first: {key, type, timestamp, moves:[{name, kind, from, to}]}."""
    root = ET.fromstring(xml)
    out = []
    for t in root.iter(f"{{{NS['y']}}}transaction"):
        if text(t, 'y:status') not in (None, 'successful'):
            continue
        moves = []
        for p in t.iter(f"{{{NS['y']}}}player"):
            d = p.find('y:transaction_data', NS)
            if d is None:
                continue
            moves.append({'name': text(p, 'y:name/y:full'), 'yahooId': text(p, 'y:player_id'), 'kind': text(d, 'y:type'),
                          'from': text(d, 'y:source_team_key'), 'to': text(d, 'y:destination_team_key')})
        out.append({'key': text(t, 'y:transaction_key'), 'type': text(t, 'y:type'), 'timestamp': int(text(t, 'y:timestamp') or 0), 'moves': moves})
    return sorted(out, key=lambda x: x['timestamp'])


def collect(live_path, token_path):
    live = json.loads(Path(live_path).read_text(encoding='utf-8'))
    try:
        live['yahoo'] = read_league(token_path)
    except SystemExit as e:
        # The page shows why Yahoo is missing instead of offering the connect steps again.
        message = str(e.code)
        live['yahooStatus'] = {'checkedAt': now(), 'error': 'not_approved' if message == NOT_APPROVED else 'failed', 'message': message[:500]}
        raise
    finally:
        Path(live_path).write_text(json.dumps(live, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    y = live['yahoo']
    print(f'Yahoo {y["league"]}: {len(y["teams"])} teams, {sum(len(t["roster"]) for t in y["teams"])} rostered players, {len(y["transactions"])} transactions')


def now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def read_league(token_path):
    refresh = crypt(Path(token_path).read_bytes(), decrypt=True).decode()
    try:
        tokens = token_request(grant_type='refresh_token', refresh_token=refresh)
    except TokenError as e:
        raise SystemExit(str(e))
    if tokens.get('refresh_token') and tokens['refresh_token'] != refresh:
        Path(token_path).write_bytes(crypt(tokens['refresh_token'].encode()))

    def get(path):
        return api_get(tokens['access_token'], path)

    # The exact key (<season game id>.l.<league id>) comes from the account's own leagues: the bare 'nba' alias
    # can still point to last season, where this league id belongs to someone else.
    wanted = league_id()
    mine = [k for k, i, _ in parse_user_leagues(get('users;use_login=1/games;game_codes=nba/leagues')) if i == wanted]
    if not mine:
        raise SystemExit(f'League {wanted} is not among the leagues of the connected Yahoo account.')
    key = max(mine, key=lambda k: int(k.split('.')[0]) if k.split('.')[0].isdigit() else 0)
    teams = parse_teams(get(f'league/{key}/teams'))
    for team in teams:
        team['roster'] = parse_roster(get(f"team/{team['key']}/roster/players"))
    transactions, start = [], 0
    while True:
        page = parse_transactions(get(f'league/{key}/transactions;types=add,drop,trade;start={start};count=25'))
        transactions += page
        if len(page) < 25:
            break
        start += 25
    transactions = sorted({t['key']: t for t in transactions}.values(), key=lambda x: x['timestamp'])
    return {'league': key, 'fetchedAt': now(), 'teams': teams, 'transactions': transactions}


def main():
    if len(sys.argv) >= 3 and sys.argv[1] == 'exchange':
        exchange(sys.argv[2])
    elif len(sys.argv) >= 4 and sys.argv[1] == 'collect':
        collect(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)


if __name__ == '__main__':
    sys.stdout.reconfigure(line_buffering=True)
    try:
        main()
    except SystemExit as e:
        # An annotation on the run page: the season collector continues on error and would otherwise look green.
        if isinstance(e.code, str) and os.environ.get('GITHUB_ACTIONS'):
            print('::error title=Yahoo Fantasy API::' + e.code.replace('%', '%25').replace('\n', '%0A'))
        raise
