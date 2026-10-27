import json,statistics as st,collections,sys
rows=[json.loads(l) for l in open('results.jsonl')]
orc=json.load(open('oracle.json'))
# random baseline
import itertools
pos=sorted({r['ply'] for r in rows})
g=collections.defaultdict(list)
for r in rows: g[(r['model'],r['arm'])].append(r)
print(f"{'model':36}{'arm':6}{'ok':>4}{'err':>4}{'meanCPL':>8}{'medCPL':>7}{'best%':>6}{'<=30%':>6}{'blun%':>6}{'ms':>6}{'in_tok':>7}{'cost$':>9}")
for (m,a),rs in sorted(g.items()):
    ok=[r for r in rs if 'cpl' in r]; er=len(rs)-len(ok)
    c=[r['cpl'] for r in ok]
    ill=sum(1 for r in ok if not r['legal'])
    print(f"{m:36}{a:6}{len(ok):4}{er:4}{st.mean(c):8.0f}{st.median(c):7.0f}{100*sum(x==0 for x in c)/len(c):6.0f}{100*sum(x<=30 for x in c)/len(c):6.0f}{100*sum(x>=200 for x in c)/len(c):6.0f}{st.mean(r['ms'] for r in ok):6.0f}{st.mean(r['usage']['input_tokens'] for r in ok):7.0f}{sum(r['usage']['cost'] or 0 for r in ok):9.5f}")
# random baseline
import random
allc=[];best=[];le30=[];bl=[]
for p in orc.values():
    v=list(p['cpl'].values()); allc.append(sum(v)/len(v)); best.append(sum(x==0 for x in v)/len(v)); le30.append(sum(x<=30 for x in v)/len(v)); bl.append(sum(x>=200 for x in v)/len(v))
print(f"{'RANDOM (expected)':36}{'':6}{'':4}{'':4}{st.mean(allc):8.0f}{'':7}{100*st.mean(best):6.0f}{100*st.mean(le30):6.0f}{100*st.mean(bl):6.0f}")
print('total cost', sum((r.get('usage') or {}).get('cost') or 0 for r in rows))
print('errors:', collections.Counter((r['model'],r['arm'],r.get('status')) for r in rows if 'cpl' not in r))
