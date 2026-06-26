import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, currentRow, totalRows] = args;
  const dir = (props.direction as string) || 'next';
  const cur = (currentRow as number) ?? 0;
  const total = (totalRows as number) ?? 0;
  let target = cur;
  let canNav = true;
  switch (dir) {
    case 'next': target = cur + 1; canNav = target < total; break;
    case 'prev': target = cur - 1; canNav = target >= 0; break;
    case 'first': target = 0; canNav = total > 0; break;
    case 'last': target = Math.max(0, total - 1); canNav = total > 0; break;
    case 'goto': target = Math.max(0, Math.min((props.targetRow as number) || 0, total - 1)); canNav = total > 0; break;
  }
  return { trigger: { event: 'navigate', direction: dir, targetRow: target, timestamp: Date.now() }, targetRow: target, canNavigate: canNav };
};
