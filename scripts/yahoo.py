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


def secret(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise SystemExit(f'{name} is not set')
    return value


def crypt(data, decrypt=False):
    args = ['openssl', 'enc', '-aes-256-cbc', '-pbkdf2', '-salt', '-a', '-A', '-pass', 'env:YAHOO_CLIENT_SECRET'] + (['-d'] if decrypt else [])
    return subprocess.run(args, input=data, capture_output=True, check=True).stdout


def token_request(**fields):
    auth = base64.b64encode(f"{secret('YAHOO_CLIENT_ID')}:{secret('YAHOO_CLIENT_SECRET')}".encode()).decode()
    redirect = os.environ.get('YAHOO_REDIRECT_URI', '').strip() or 'oob'
    body = urllib.parse.urlencode({'redirect_uri': redirect, **fields}).encode()
    req = urllib.request.Request(TOKEN_URL, data=body, headers={'Authorization': 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        # Yahoo's explanation (invalid_grant, redirect mismatch, bad client) carries no secrets.
        raise SystemExit(f'Yahoo token request failed ({e.code}, redirect_uri={redirect}): {e.read().decode(errors="replace")[:500]}')


def clean_code(value):
    """The code alone, also when the whole redirect address or 'code=...' was pasted."""
    value = value.strip()
    if 'code=' in value:
        value = value.split('code=', 1)[1].split('&', 1)[0]
    return urllib.parse.unquote(value).strip()


def exchange(path):
    tokens = token_request(grant_type='authorization_code', code=clean_code(secret('YAHOO_CODE')))
    Path(path).write_bytes(crypt(tokens['refresh_token'].encode()))
    print('Yahoo connected: refresh token stored encrypted.')


def league_key():
    return 'nba.l.' + str(json.loads(CONFIG.read_text(encoding='utf-8'))['yahooLeague'])


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
    refresh = crypt(Path(token_path).read_bytes(), decrypt=True).decode()
    tokens = token_request(grant_type='refresh_token', refresh_token=refresh)
    if tokens.get('refresh_token') and tokens['refresh_token'] != refresh:
        Path(token_path).write_bytes(crypt(tokens['refresh_token'].encode()))

    def get(path):
        req = urllib.request.Request(API + path, headers={'Authorization': 'Bearer ' + tokens['access_token']})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.read()

    key = league_key()
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
    live = json.loads(Path(live_path).read_text(encoding='utf-8'))
    live['yahoo'] = {'league': key, 'fetchedAt': datetime.now(timezone.utc).isoformat(timespec='seconds'), 'teams': teams, 'transactions': transactions}
    Path(live_path).write_text(json.dumps(live, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Yahoo {key}: {len(teams)} teams, {sum(len(t["roster"]) for t in teams)} rostered players, {len(transactions)} transactions')


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == 'exchange':
        exchange(sys.argv[2])
    elif len(sys.argv) >= 4 and sys.argv[1] == 'collect':
        collect(sys.argv[2], sys.argv[3])
    else:
        raise SystemExit(__doc__)
