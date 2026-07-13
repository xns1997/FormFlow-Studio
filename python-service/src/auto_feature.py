#!/usr/bin/env python3
import json, sys
p=json.load(sys.stdin); rows=p.get('rows',[]); nums=[k for k,v in (rows[0] if rows else {}).items() if isinstance(v,(int,float))]
for row in rows:
  for i,a in enumerate(nums):
    for b in nums[i+1:]: row[f'{a}_x_{b}']=row[a]*row[b]
print(json.dumps({'rows':rows},ensure_ascii=False))
