#!/usr/bin/env python3
import json, os, sys, urllib.request
payload = json.load(sys.stdin)
request = urllib.request.Request((os.getenv('OPENAI_BASE_URL','https://api.openai.com/v1').rstrip('/') + '/chat/completions'), data=json.dumps({'model': payload.get('model', os.getenv('OPENAI_MODEL','gpt-4.1-mini')), 'messages':[{'role':'system','content':'Return read-only SQL only.'},{'role':'user','content':payload.get('question','')}]}).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+os.getenv('OPENAI_API_KEY','')})
print(json.loads(urllib.request.urlopen(request).read())['choices'][0]['message']['content'])
