"""Collect verdicts of the cluster-verification runs (verify2) into verify2.json, keyed by cluster."""
import json,glob
W='/root/.claude/projects/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/subagents/workflows/'
RUNS=['wf_f9f9960f-ac0','wf_0bd91bc0-8ac','wf_a7958ca7-ba4']
out={};status={}
for run in RUNS:
    starts={};done=0;err=0
    try:lines=open(W+run+'/journal.jsonl').read().splitlines()
    except FileNotFoundError:continue
    for line in lines:
        e=json.loads(line)
        if e['type']=='started':starts[e['key']]=e['label']
        elif e['type']=='result':
            done+=1;lab=starts.get(e['key'],'?');r=e['result']
            if not lab.startswith('verify:') or not isinstance(r,dict):continue
            parts=lab[7:].split(':')
            if 'items' in r:
                for it in r['items']:out.setdefault(it['key'],[]).append(dict(lens='reproduce',**it))
            else:
                out.setdefault(parts[0],[]).append(dict(lens=parts[1] if len(parts)>1 else 'reproduce',**r))
        elif e['type']=='error':err+=1
    status[run]=dict(started=len(starts),done=done,errors=err)
json.dump(out,open('verify2.json','w'),ensure_ascii=False,indent=1)
json.dump(status,open('verify2-status.json','w'),indent=1)
print(json.dumps(status));print(len(out),'clusters with verdicts')
for k,v in out.items():print(k.ljust(32),[x['verdict']+'/'+x['severity'] for x in v])
