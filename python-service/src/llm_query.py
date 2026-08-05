#!/usr/bin/env python3
"""LLM 查询脚本：将自然语言问题转成只读 SQL 并返回。

标准输入：{"question": "..."}
环境变量：OPENAI_BASE_URL / OPENAI_MODEL / OPENAI_API_KEY
标准输出：SQL 文本
"""
import json, os, sys, urllib.request
payload = json.load(sys.stdin)
request = urllib.request.Request((os.getenv('OPENAI_BASE_URL','https://api.openai.com/v1').rstrip('/') + '/chat/completions'), data=json.dumps({'model': payload.get('model', os.getenv('OPENAI_MODEL','gpt-4.1-mini')), 'messages':[{'role':'system','content':'Return read-only SQL only.'},{'role':'user','content':payload.get('question','')}]}).encode(), headers={'Content-Type':'application/json','Authorization':'Bearer '+os.getenv('OPENAI_API_KEY','')})
print(json.loads(urllib.request.urlopen(request).read())['choices'][0]['message']['content'])
