"""Corroborate identities and expected NBA seasons using independent providers.
No model execution. Name matches alone never become verified mappings.
"""
import argparse,concurrent.futures,gzip,hashlib,json,re,urllib.parse,urllib.request
from datetime import datetime,timezone
from pathlib import Path
from build_default_database import normalize

def fetch(url,root):
 key=hashlib.sha256(url.encode()).hexdigest();meta_file=root/'requests'/(key+'.json')
 if meta_file.exists():
  meta=json.loads(meta_file.read_text());raw=gzip.decompress((root/meta['rawPath']).read_bytes())
  if hashlib.sha256(raw).hexdigest()!=meta['sha256']:raise ValueError('Raw checksum mismatch')
  return raw,meta
 with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0'}),timeout=15) as response:raw=response.read(12_000_001)
 if len(raw)>12_000_000:raise ValueError('Profile exceeds size limit')
 sha=hashlib.sha256(raw).hexdigest();path=Path('raw')/sha[:2]/(sha+'.gz');(root/path).parent.mkdir(parents=True,exist_ok=True);(root/path).write_bytes(gzip.compress(raw,mtime=0))
 meta=dict(sourceUrl=url,sha256=sha,rawPath=str(path),fetchedAt=datetime.now(timezone.utc).isoformat(),publishedAt=None)
 meta_file.parent.mkdir(parents=True,exist_ok=True);meta_file.write_text(json.dumps(meta));return raw,meta

def resolve(player,root,official_index):
 result=dict(playerId=player['id'],name=player['name'],nbaId=player.get('nbaId'),originalEspnId=player.get('espnId'),status='UNRESOLVED',sources=[])
 try:
  player=dict(player)
  if not player.get('nbaId'):
   matches=official_index.get(normalize(player['name']),[])
   if len(matches)!=1:result['reason']='No unique official NBA player-index candidate';return result
   player['nbaId']=matches[0]['PERSON_ID'];result['nbaId']=player['nbaId'];result['nbaIndexCandidate']=matches[0]
  result['nbaId']=player['nbaId']
  slug=re.sub(r'[^a-z0-9]+','-',player['name'].lower()).strip('-')
  raw,meta=fetch('https://www.nba.com/player/'+str(player['nbaId'])+'/'+slug,root);result['sources'].append(meta)
  m=re.search(rb'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',raw,re.S)
  if not m:raise ValueError('Official NBA player JSON not found')
  info=json.loads(m[1])['props']['pageProps']['player']['info']
  if str(info['PERSON_ID'])!=str(player['nbaId']):raise ValueError('Official NBA ID mismatch')
  if normalize(info['DISPLAY_FIRST_LAST'])!=normalize(player['name']):raise ValueError('Official NBA name mismatch; requires alias review')
  birth=(info.get('BIRTHDATE') or '')[:10]
  result['nbaProfile']=dict(name=info['DISPLAY_FIRST_LAST'],birthDate=birth,fromYear=info.get('FROM_YEAR'),toYear=info.get('TO_YEAR'),seasons=info.get('SEASONS',[]),draftYear=info.get('DRAFT_YEAR'),draftRound=info.get('DRAFT_ROUND'),draftNumber=info.get('DRAFT_NUMBER'))
  result['expectedNBARegularEndYears']=sorted({int(code[1:])+1 for code in info.get('SEASONS',[]) if len(code)==5 and code[0]=='2' and code[1:].isdigit()})
  candidates=[str(player['espnId'])] if player.get('espnId') else []
  if not candidates:
   url='https://site.web.api.espn.com/apis/common/v3/search?'+urllib.parse.urlencode(dict(query=player['name'],limit=100,type='player',sport='basketball',league='nba'))
   raw,meta=fetch(url,root);result['sources'].append(meta);data=json.loads(raw)
   candidates=[str(p['id']) for p in data.get('items',[]) if p.get('league')=='nba' and normalize(p.get('displayName') or '')==normalize(player['name'])]
  if not player.get('espnId'):
   raw,meta=fetch('https://site.web.api.espn.com/apis/search/v2?'+urllib.parse.urlencode(dict(query=player['name'],limit=100)),root);result['sources'].append(meta)
   for group in json.loads(raw).get('results',[]):
    if group.get('type')!='player':continue
    for p in group.get('contents',[]):
     if p.get('sport')=='basketball' and normalize(p.get('displayName') or '')==normalize(player['name']):
      m=re.search(r'~a:(\d+)$',p.get('uid',''))
      if m:candidates.append(m.group(1))
   candidates=list(dict.fromkeys(candidates))
  result['candidateEspnIds']=candidates;matches=[]
  for eid in candidates:
   raw,meta=fetch('https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/athletes/'+eid,root);result['sources'].append(meta)
   p=json.loads(raw);p=p.get('athlete',p);dob=(p.get('dateOfBirth') or '')[:10]
   if birth and dob==birth and normalize(p.get('displayName') or '')==normalize(info['DISPLAY_FIRST_LAST']):matches.append(eid)
  if len(matches)==1:result.update(status='VERIFIED_NAME_DOB_NBA_ID',espnId=matches[0])
  else:result['reason']='No unique name + birth date corroboration across NBA and ESPN'
 except Exception as exc:result['reason']=str(exc)
 return result

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--catalog',type=Path,required=True);parser.add_argument('--output',type=Path,default=Path('.cache/identities'));parser.add_argument('--workers',type=int,default=3);args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
 data=json.loads(args.catalog.read_text());rows=[];official_index={}
 try:
  raw,meta=fetch('https://www.nba.com/players',args.output)
  marker=re.search(rb'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',raw,re.S)
  official_players=json.loads(marker[1]).get('props',{}).get('pageProps',{}).get('players',[]) if marker else []
 except Exception as exc:
  snapshot=json.loads(Path('data/official-nba-player-index.json').read_text());official_players=snapshot['players'];meta=dict(snapshot['source'],snapshotFallback=True,liveFetchError=str(exc))
 if official_players:
  for p in official_players:
   name=normalize((p.get('PLAYER_FIRST_NAME') or '')+' '+(p.get('PLAYER_LAST_NAME') or ''))
   official_index.setdefault(name,[]).append(p)
 historical=json.loads(Path('data/official-nba-historical-index.json').read_text())
 for pid,name in historical['players']:
  bucket=official_index.setdefault(normalize(name),[])
  if not any(str(p['PERSON_ID'])==str(pid) for p in bucket):bucket.append({'PERSON_ID':pid})
 (args.output/'official-index-source.json').write_text(json.dumps({'current':meta,'historical':historical['source']}))
 with (args.output/'identities.ndjson').open('w') as out:
  with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
   for row in pool.map(lambda p:resolve(p,args.output,official_index),data['players']):
    rows.append(row);out.write(json.dumps(row,ensure_ascii=False)+'\n');out.flush()
    if len(rows)%50==0:print(json.dumps(dict(processed=len(rows),verified=sum(r['status']=='VERIFIED_NAME_DOB_NBA_ID' for r in rows))),flush=True)
 report=dict(asOf=datetime.now(timezone.utc).isoformat(),catalogPlayers=len(rows),verified=sum(r['status']=='VERIFIED_NAME_DOB_NBA_ID' for r in rows),newlyResolved=sum(r['status']=='VERIFIED_NAME_DOB_NBA_ID' and not r['originalEspnId'] for r in rows),unresolved=[dict(playerId=r['playerId'],name=r['name'],reason=r.get('reason')) for r in rows if r['status']!='VERIFIED_NAME_DOB_NBA_ID'],limitations=['Official-profile season inventory still requires game/total reconciliation.','No mapping is made on name similarity alone.','Current catalog does not establish complete historical training population.'])
 (args.output/'coverage.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));(args.output/'verified-map.json').write_text(json.dumps([r for r in rows if r['status']=='VERIFIED_NAME_DOB_NBA_ID'],ensure_ascii=False))
 print('IDENTITY_REPORT_BEGIN'+json.dumps(report,ensure_ascii=False)+'IDENTITY_REPORT_END',flush=True)
if __name__=='__main__':main()
