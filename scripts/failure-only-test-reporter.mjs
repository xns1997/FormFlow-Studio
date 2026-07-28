import { relative } from 'node:path';

const workspace = process.cwd();

function location(data) {
  if (!data?.file) return '';
  const file = relative(workspace, data.file);
  return `${file}${data.line ? `:${data.line}${data.column ? `:${data.column}` : ''}` : ''}`;
}

function cleanStack(stack, message) {
  if (!stack) return [];
  return String(stack)
    .split('\n')
    .map((line) => line.trim())
    .filter((line, index) => {
      if (!line) return false;
      if (index === 0 && message && line.includes(message)) return false;
      return !line.includes('node:internal/')
        && !line.includes('node:async_hooks:')
        && !line.includes('node:diagnostics_channel:');
    })
    .slice(0, 3)
    .map((line) => line.length > 500 ? `${line.slice(0, 497)}...` : line);
}

function failureReason(error) {
  if (!error) return '未知错误';
  const cause = error.cause instanceof Error ? error.cause : error;
  const message = String(cause.message || error.message || cause).trim();
  const lines = message.split('\n').slice(0, 12);
  const compact = lines.join('\n');
  return compact.length > 1200 ? `${compact.slice(0, 1197)}...` : compact;
}

export default async function* failureOnlyReporter(source) {
  let failed = 0;
  const failedNames = new Set();

  for await (const event of source) {
    if (event.type !== 'test:fail') continue;

    const data = event.data || {};
    const error = data.details?.error;
    const reason = failureReason(error);
    const key = `${data.name}\n${reason}`;
    if (failedNames.has(key)) continue;
    failedNames.add(key);
    failed += 1;

    const at = location(data);
    yield `\nFAIL ${data.name}${at ? ` (${at})` : ''}\n`;
    yield `原因: ${reason}\n`;
    for (const line of cleanStack(error?.stack || error?.cause?.stack, reason)) {
      yield `  ${line}\n`;
    }
  }

  if (failed > 0) {
    yield `\n测试失败: ${failed}\n`;
  }
}
