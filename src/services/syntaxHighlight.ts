// 简单的 JS 语法高亮

const KEYWORDS = /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|delete|void|null|undefined|true|false|NaN|Infinity)\b/g;
const STRINGS = /(["'`])(?:(?!\1|\\).|\\.)*?\1/g;
const COMMENTS = /\/\/.*$|\/\*[\s\S]*?\*\//gm;
const NUMBERS = /\b\d+\.?\d*\b/g;
const FUNCTIONS = /\b([a-zA-Z_$][\w$]*)\s*(?=\()/g;
const PROPERTIES = /\.([a-zA-Z_$][\w$]*)/g;

export interface HighlightToken {
  type: 'keyword' | 'string' | 'comment' | 'number' | 'function' | 'property' | 'text';
  value: string;
}

export function highlightJS(code: string): HighlightToken[] {
  const tokens: HighlightToken[] = [];
  let remaining = code;
  let pos = 0;

  const patterns: Array<{ type: HighlightToken['type']; regex: RegExp }> = [
    { type: 'comment', regex: /\/\/.*$|\/\*[\s\S]*?\*\//m },
    { type: 'string', regex: /(["'`])(?:(?!\1|\\).|\\.)*?\1/ },
    { type: 'number', regex: /\b\d+\.?\d*([eE][+-]?\d+)?\b/ },
    { type: 'keyword', regex: /\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|this|class|extends|import|export|default|from|async|await|try|catch|finally|throw|typeof|instanceof|in|of|yield|delete|void|null|undefined|true|false|NaN|Infinity)\b/ },
    { type: 'function', regex: /\b([a-zA-Z_$][\w$]*)\s*(?=\()/ },
  ];

  while (remaining.length > 0) {
    let earliest = -1;
    let earliestType: HighlightToken['type'] = 'text';
    let earliestMatch = '';

    for (const { type, regex } of patterns) {
      const m = regex.exec(remaining);
      if (m && (earliest === -1 || m.index < earliest)) {
        earliest = m.index;
        earliestType = type;
        earliestMatch = m[0];
      }
    }

    if (earliest === -1) {
      tokens.push({ type: 'text', value: remaining });
      break;
    }

    if (earliest > 0) tokens.push({ type: 'text', value: remaining.slice(0, earliest) });
    tokens.push({ type: earliestType, value: earliestMatch });
    remaining = remaining.slice(earliest + earliestMatch.length);
  }

  return tokens;
}

export function getKeywordClass(type: HighlightToken['type']): string {
  switch (type) {
    case 'keyword': return 'hl-keyword';
    case 'string': return 'hl-string';
    case 'comment': return 'hl-comment';
    case 'number': return 'hl-number';
    case 'function': return 'hl-function';
    default: return '';
  }
}
