"""Apply the dated Sports.ru catalog through reviewed IDs, never fuzzy names."""
import json, unicodedata
from pathlib import Path

def apply(data, catalog, crosswalk, additions=None):
    prices = {p['sportsId']: p for p in catalog['players']}
    if len(prices) != catalog['count']:
        raise ValueError('Invalid Sports.ru price catalog')
    # Players who reached the Sports.ru market after the catalog date, each dated by its own capture.
    origin = {key: catalog for key in prices}
    for p in (additions or {}).get('players', []):
        if p['sportsId'] in prices:
            raise ValueError('Market addition already in the catalog: ' + p['sportsId'])
        prices[p['sportsId']], origin[p['sportsId']] = p, additions
    if any(not isinstance(p['price'], (int, float)) or p['price'] <= 0 for p in prices.values()):
        raise ValueError('Invalid Sports.ru price catalog')
    positions={'1':'PG','2':'SG','3':'SF','4':'PF','5':'C'}
    if any(str(p.get('sportsPosition')) not in positions for p in prices.values()):
        raise ValueError('Unknown Sports.ru position code')
    entries = crosswalk['players']
    if len({p['sportsId'] for p in entries}) != len(entries):
        raise ValueError('Duplicate Sports.ru crosswalk ID')
    by_espn = {str(p['espnId']): p for p in entries if p.get('espnId')}
    by_nba = {str(p['nbaId']): p for p in entries if p.get('nbaId')}
    for key in ['espnId','nbaId']:
        values=[str(p[key]) for p in entries if p.get(key)]
        if len(values)!=len(set(values)):raise ValueError('Ambiguous identity '+key)
    def identity_name(name):
        return ''.join(c.lower() for c in unicodedata.normalize('NFKD',name) if c.isalnum())
    matched = []
    for player in data['players']:
        player.update(yahooPositions=player.get('yahooPositions',list(player['positions'])),
                      yahooPositionStatus=player.get('yahooPositionStatus',player.get('positionStatus')))
        player.pop('yahooPositionSource',None)
        player.update(price=None, priceStatus='MISSING',positions=[],positionStatus='MISSING',positionSource=None,positionProvider=None)
        espn=by_espn.get(str(player.get('espnId')));nba=by_nba.get(str(player.get('nbaId')))
        if espn and nba and espn['sportsId']!=nba['sportsId']:raise ValueError('Conflicting ESPN/NBA identity')
        entry = espn or nba
        if not entry:
            continue
        source = prices.get(entry['sportsId'])
        if not source:
            raise ValueError('Crosswalk references a missing Sports.ru ID')
        if identity_name(entry['name'])!=identity_name(player['name']):raise ValueError('Identity name mismatch: '+player['name'])
        if entry['sportsName']!=source['name'] or entry['sportsClub']!=source['club']:raise ValueError('Sports.ru identity mismatch')
        dated = origin[entry['sportsId']]
        player.update(positions=[positions[str(source['sportsPosition'])]],positionStatus='SPORTS_RU_VERIFIED',
                      positionSource=dated['source'],positionCheckedAt=dated['capturedAt'],positionProvider='Sports.ru',
                      price=source['price'], priceStatus='VERIFIED', sportsId=source['sportsId'],
                      sportsName=source['name'], priceSource='Sports.ru',
                      priceCheckedAt=dated['capturedAt'], sportsClub=source['club'])
        matched.append(source['sportsId'])
    if len(set(matched)) != len(matched):
        raise ValueError('A Sports.ru price matched multiple NBA players')
    data.update(priceMode='ON', cap=20000,positionAuthority='Sports.ru')
    report = dict(source=catalog['source'], capturedAt=catalog['capturedAt'], catalogPlayers=len(prices),
                  matchedPlayers=len(matched), eligiblePricedPlayers=sum(bool(p['positions']) and p['priceStatus']=='VERIFIED' for p in data['players']),
                  missingEligiblePrices=[dict(id=p['id'], name=p['name']) for p in data['players'] if p.get('yahooPositions') and p['priceStatus']!='VERIFIED'],
                  unmatchedSportsPlayers=[p for key,p in prices.items() if key not in set(matched)],
                  limitation='Dated Sports.ru prices and draft positions. Yahoo positions are stored separately and cannot expand Sports.ru roster eligibility.')
    data['priceAudit'] = report
    data['sportsPositionAudit'] = dict(source=catalog['source'],checkedAt=catalog['capturedAt'],matchedPlayers=len(matched),authority='Sports.ru')
    return report

if __name__ == '__main__':
    path = Path('public/data/default-draft.json')
    data = json.loads(path.read_text())
    report = apply(data, json.loads(Path('data/sports-prices-2026-10-17.json').read_text()), json.loads(Path('data/sports-player-map.json').read_text()),
                   json.loads(Path('data/sports-market-additions.json').read_text()))
    if report['eligiblePricedPlayers'] < 200:
        raise ValueError('Insufficient verified Sports.ru players')
    path.write_text(json.dumps(data, ensure_ascii=False))
    Path('public/data/price-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
