export function execute(args: unknown[], properties: Record<string, unknown>): unknown {
  const inputPorts = parsePortDef(properties.inputPorts);
  const inputs: Record<string, unknown> = {};
  for (let i = 0; i < inputPorts.length; i++) {
    inputs[inputPorts[i].name] = args[i];
  }
  const code = String(properties.code || 'return null;');
  const fn = new Function('inputs', 'properties', code);
  const result = fn(inputs, properties);
  if (result && typeof result === 'object' && !Array.isArray(result)) return result;
  const outputPorts = parsePortDef(properties.outputPorts);
  if (outputPorts.length > 0) return { [outputPorts[0].name]: result };
  return { result };
}

function parsePortDef(raw: unknown): Array<{ name: string; label: string; type: string }> {
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((p: any) => p && typeof p.name === 'string').map((p: any) => ({
      name: p.name,
      label: p.label || p.name,
      type: p.type || 'any',
    }));
  } catch { return []; }
}
