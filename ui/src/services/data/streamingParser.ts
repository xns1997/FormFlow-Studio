export type StreamingParseResult = { headers: string[]; rows: Record<string, string>[]; rowCount: number };
export function parseCsvStreaming(file: File, onProgress?: (loaded: number, total: number, rows: number) => void): Promise<StreamingParseResult> {
  const worker = new Worker(new URL('./streamingParser.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    let headers: string[] = []; const rows: Record<string, string>[] = [];
    worker.onmessage = (event) => {
      if (event.data.type === 'headers') headers = event.data.headers;
      if (event.data.type === 'rows') rows.push(...event.data.rows);
      if (event.data.type === 'progress') onProgress?.(event.data.loaded, event.data.total, event.data.count);
      if (event.data.type === 'complete') { worker.terminate(); resolve({ headers, rows, rowCount: event.data.rowCount }); }
      if (event.data.type === 'error') { worker.terminate(); reject(new Error(event.data.error)); }
    };
    worker.onerror = (error) => { worker.terminate(); reject(error); };
    worker.postMessage({ file });
  });
}
