"""Apply the dated Sports.ru catalog through reviewed IDs, never fuzzy names."""
import json
from pathlib import Path

def apply(data, catalog, crosswalk):
    prices = {p['sportsId']: p for p in catalog['players']}
    if len(prices) != catalog['count'] or any(not isinstance(p['price'], (int, float)) or p['price'] <= 0 for p in prices.values()):
        raise ValueError('Invalid Sports.ru price catalog')
    entries = crosswalk['players']
    if len({p['sportsId'] for p in entries}) != len(entries):
        raise ValueError('Duplicate Sports.ru crosswalk ID')
    by_espn = {str(p['espnId']): p for p in entries if p.get('espnId')}
    by_nba = {str(p['nbaId']): p for p in entries if p.get('nbaId')}
    matched = []
    for player in data['players']:
        player.update(price=None, priceStatus='MISSING')
        entry = by_espn.get(str(player.get('espnId'))) or by_nba.get(str(player.get('nbaId')))
        if not entry:
            continue
        source = prices.get(entry['sportsId'])
        if not source:
            raise ValueError('Crosswalk references a missing Sports.ru ID')
        player.update(price=source['price'], priceStatus='VERIFIED', sportsId=source['sportsId'],
                      sportsName=source['name'], priceSource=catalog['source'],
                      priceCheckedAt=catalog['capturedAt'], sportsClub=source['club'])
        matched.append(source['sportsId'])
    if len(set(matched)) != len(matched):
        raise ValueError('A Sports.ru price matched multiple NBA players')
    data.update(priceMode='ON', cap=20000)
    report = dict(source=catalog['source'], capturedAt=catalog['capturedAt'], catalogPlayers=len(prices),
                  matchedPlayers=len(matched), eligiblePricedPlayers=sum(bool(p['positions']) and p['priceStatus']=='VERIFIED' for p in data['players']),
                  missingEligiblePrices=[dict(id=p['id'], name=p['name']) for p in data['players'] if p['positions'] and p['priceStatus']!='VERIFIED'],
                  unmatchedSportsPlayers=[p for key,p in prices.items() if key not in set(matched)],
                  limitation='Dated Sports.ru prices; unknown prices block selection. Yahoo positions are never replaced by Sports.ru positions.')
    data['priceAudit'] = report
    return report

if __name__ == '__main__':
    path = Path('public/data/default-draft.json')
    data = json.loads(path.read_text())
    report = apply(data, json.loads(Path('data/sports-prices-2026-10-17.json').read_text()), json.loads(Path('data/sports-player-map.json').read_text()))
    if report['eligiblePricedPlayers'] < 200:
        raise ValueError('Insufficient priced Yahoo-eligible players')
    path.write_text(json.dumps(data, ensure_ascii=False))
    Path('public/data/price-audit.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
