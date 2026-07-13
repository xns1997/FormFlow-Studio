#!/usr/bin/env python3
import json, sys
from collections import Counter

def report(rows, rules):
    issues = []
    seen = {}
    for index, row in enumerate(rows):
        for rule in rules:
            field, kind, value = rule['field'], rule['type'], row.get(rule['field'])
            invalid = kind == 'required' and value in (None, '')
            if kind == 'range':
                try: invalid = ('min' in rule and float(value) < rule['min']) or ('max' in rule and float(value) > rule['max'])
                except (TypeError, ValueError): invalid = True
            if kind == 'unique':
                invalid = value in seen.setdefault(field, set()); seen[field].add(value)
            if invalid: issues.append({'row': index, 'field': field, 'rule': kind})
    distribution = Counter(issue['rule'] for issue in issues)
    total = max(1, len(rows) * max(1, len(rules)))
    return {'score': round(max(0, 1 - len(issues) / total) * 100, 2), 'issues': issues, 'distribution': dict(distribution)}

if __name__ == '__main__':
    payload = json.load(sys.stdin)
    json.dump(report(payload.get('rows', []), payload.get('rules', [])), sys.stdout, ensure_ascii=False)
