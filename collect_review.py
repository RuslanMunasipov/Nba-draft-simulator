"""Collect the combined-diff review (3 runs): every finding with its verdict, into review-results.json."""
import json
W='/root/.claude/projects/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/subagents/workflows/'
RUNS=['wf_d5b2cffc-28f','wf_03eb5e36-c98','wf_117da8df-523']
reviews={};verdicts={}
for run in RUNS:
    starts={}
    try:lines=open(W+run+'/journal.jsonl').read().splitlines()
    except FileNotFoundError:continue
    for line in lines:
        e=json.loads(line)
        if e['type']=='started':starts[e['key']]=e['label']
        elif e['type']=='result' and isinstance(e['result'],dict):
            lab=starts.get(e['key'],'?')
            if lab.startswith('review:'):reviews[lab[7:]]=e['result']
            elif lab.startswith('verify:'):verdicts[lab[7:]]=e['result']
out=[]
for area,r in reviews.items():
    for i,f in enumerate(r['findings']):
        key=f"{area}:{f['title'][:40]}";v=verdicts.get(key)
        out.append(dict(id=f'R{len(out)+1:02d}',area=area,**f,verdict=v))
json.dump(dict(findings=out,checkedOk={a:r.get('checkedOk',[]) for a,r in reviews.items()}),open('review-results.json','w'),ensure_ascii=False,indent=1)
for f in out:print(f['id'],f['area'][:13].ljust(13),f['severity'][:4],(f['verdict'] or {}).get('verdict','UNVERIFIED')[:5],((f['verdict'] or {}).get('severity') or '')[:4],f['title'][:120])
print('areas reviewed',list(reviews))
