"""Collect fix-agent results (branch, sha, issues, notes) from the four fix runs into fix-results.json."""
import json
W='/root/.claude/projects/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/subagents/workflows/'
RUNS=['wf_2a2b0d3e-b79','wf_b5b6bb25-075','wf_5d493399-715','wf_e0589d74-0e4']
out={}
for run in RUNS:
    starts={}
    try:lines=open(W+run+'/journal.jsonl').read().splitlines()
    except FileNotFoundError:continue
    for line in lines:
        e=json.loads(line)
        if e['type']=='started':starts[e['key']]=e['label']
        elif e['type']=='result' and isinstance(e['result'],dict):out[starts.get(e['key'],'?').replace('fix:','')]=e['result']
json.dump(out,open('fix-results.json','w'),ensure_ascii=False,indent=1)
for g,r in out.items():print(g.ljust(22),r['branch'],r['headSha'][:8],[(i['key'][:28],i['outcome']) for i in r['issues']])
