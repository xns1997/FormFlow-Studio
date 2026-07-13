type ParseMessage = { file: File; delimiter?: string; batchSize?: number };

function parseRecord(text: string, delimiter: string) {
  const values: string[] = []; let value = ''; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; } else quoted = !quoted;
    } else if (char === delimiter && !quoted) { values.push(value); value = ''; }
    else value += char;
  }
  values.push(value); return values;
}

self.onmessage = async (event: MessageEvent<ParseMessage>) => {
  const { file, delimiter = ',', batchSize = 1000 } = event.data;
  const reader = file.stream().getReader(); const decoder = new TextDecoder();
  let buffer = ''; let headers: string[] | undefined; let rows: Record<string, string>[] = []; let count = 0; let quoted = false;
  const flushLine = (line: string) => {
    if (!headers) { headers = parseRecord(line.replace(/^\uFEFF/, ''), delimiter); self.postMessage({ type: 'headers', headers }); return; }
    const values = parseRecord(line, delimiter); const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])); rows.push(row); count += 1;
    if (rows.length >= batchSize) { self.postMessage({ type: 'rows', rows, count }); rows = []; }
  };
  try {
    while (true) {
      const { value, done } = await reader.read(); buffer += decoder.decode(value, { stream: !done });
      let start = 0;
      for (let index = 0; index < buffer.length; index += 1) {
        const char = buffer[index];
        if (char === '"') { if (quoted && buffer[index + 1] === '"') index += 1; else quoted = !quoted; }
        if (char === '\n' && !quoted) { flushLine(buffer.slice(start, index).replace(/\r$/, '')); start = index + 1; }
      }
      buffer = buffer.slice(start);
      self.postMessage({ type: 'progress', loaded: file.size - (done ? 0 : buffer.length), total: file.size, count });
      if (done) break;
    }
    if (buffer) flushLine(buffer.replace(/\r$/, ''));
    if (rows.length) self.postMessage({ type: 'rows', rows, count });
    self.postMessage({ type: 'complete', headers: headers || [], rowCount: count });
  } catch (error) { self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) }); }
};

export {};
