/// <reference lib="webworker" />

interface RegexTestRequest { id: string; pattern: string; flags?: string; samples: string[] }

self.onmessage = (event: MessageEvent<RegexTestRequest>) => {
  const { id, pattern, flags = '', samples } = event.data;
  try {
    const regex = new RegExp(pattern, flags);
    const results = samples.map((sample) => {
      regex.lastIndex = 0;
      const match = regex.exec(sample);
      return { sample, matched: !!match, match: match?.[0], groups: match?.slice(1) || [] };
    });
    self.postMessage({ id, results });
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
