/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
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
    return arr.filter((p: Record<string, unknown>) => p && typeof p.name === 'string').map((p: Record<string, unknown>) => ({
      name: p.name as string,
      label: (p.label || p.name) as string,
      type: (p.type || 'any') as string,
    }));
  } catch { return []; }
}
