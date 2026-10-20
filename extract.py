import json,glob,os,re
W='/root/.claude/projects/-home-user-Nba-draft-simulator/bb5a3e80-4ef5-52c7-bdfc-4c0abaeb739b/subagents/workflows/'
labels={}
audits=[];verdicts=[]
for d in sorted(glob.glob(W+'wf_*')):
    starts={}
    for line in open(d+'/journal.jsonl'):
        e=json.loads(line)
        if e['type']=='started':starts[e['key']]=e['label']
        elif e['type']=='result':
            lab=starts.get(e['key'],'?');r=e['result']
            if lab.startswith('audit:'):audits.append((lab[6:],r))
            elif lab.startswith('verify:'):verdicts.append((lab,r))
print(len(audits),len(verdicts))
out=[];n=0
for dim,r in audits:
    if not isinstance(r,dict):continue
    for f in r['findings']:
        n+=1;f=dict(f);f['dim']=dim;f['id']=f'F{n:03d}';out.append(f)
json.dump(out,open('findings.json','w'),ensure_ascii=False,indent=1)
json.dump([dict(label=l,**(v if isinstance(v,dict) else {'raw':v})) for l,v in verdicts],open('verdicts.json','w'),ensure_ascii=False,indent=1)
json.dump({dim:dict(verifiedCorrect=r.get('verifiedCorrect',[]),notChecked=r.get('notChecked',[])) for dim,r in audits if isinstance(r,dict)},open('coverage.json','w'),ensure_ascii=False,indent=1)
for f in out:print(f["id"],f['dim'][:22].ljust(22),f['severity'][:4],f['kind'][:12].ljust(12),f['title'][:150])
for l,v in verdicts:print(l[:90],v.get('verdict'),v.get('severity'))
