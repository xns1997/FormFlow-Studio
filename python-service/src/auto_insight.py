#!/usr/bin/env python3
import json, sys
rows=json.load(sys.stdin).get('rows',[]); fields=list(rows[0]) if rows else []
numeric={f:[float(r[f]) for r in rows if isinstance(r.get(f),(int,float))] for f in fields}
print(json.dumps({'rowCount':len(rows),'fields':fields,'summary':{f:{'min':min(v),'max':max(v),'avg':sum(v)/len(v)} for f,v in numeric.items() if v}},ensure_ascii=False))
