export type FormEventEffectSource = 'system' | 'linkage' | 'script' | 'behavior' | 'flow';

export type FormEventEffect =
  | { kind: 'value'; field: string; value: unknown; source: FormEventEffectSource }
  | { kind: 'visible'; componentId: string; value: boolean; source: FormEventEffectSource }
  | { kind: 'disabled'; componentId: string; value: boolean; source: FormEventEffectSource }
  | { kind: 'required'; field: string; value: boolean; source: FormEventEffectSource };

function effectKey(effect: FormEventEffect) {
  return `${effect.kind}:${'field' in effect ? effect.field : effect.componentId}`;
}

export function createFormEventTransaction(options: {
  values: Record<string, unknown>;
  apply(effects: FormEventEffect[]): Promise<void>;
}) {
  const values = { ...options.values };
  const effects = new Map<string, FormEventEffect>();
  let aborted = false;
  let committed = false;
  const record = (effect: FormEventEffect) => effects.set(effectKey(effect), effect);
  return {
    getValue(field: string) { return values[field]; },
    values() { return { ...values }; },
    effects() { return [...effects.values()]; },
    setValue(field: string, value: unknown, source: FormEventEffectSource) {
      values[field] = value;
      record({ kind: 'value', field, value, source });
    },
    setVisible(componentId: string, value: boolean, source: FormEventEffectSource) {
      record({ kind: 'visible', componentId, value, source });
    },
    setDisabled(componentId: string, value: boolean, source: FormEventEffectSource) {
      record({ kind: 'disabled', componentId, value, source });
    },
    setRequired(field: string, value: boolean, source: FormEventEffectSource) {
      record({ kind: 'required', field, value, source });
    },
    abort() { aborted = true; effects.clear(); },
    async commit() {
      if (aborted || committed || effects.size === 0) return;
      committed = true;
      await options.apply([...effects.values()]);
    },
  };
}
