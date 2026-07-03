import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, protectOverride, passOverride] = args;
  const ws = worksheet as any;
  const doProtect = (protectOverride as boolean) ?? (props.protect as boolean) ?? true;
  const password = (passOverride as string) || (props.password as string) || '';
  if (!ws) return { worksheet: ws };

  ws['!protect'] = doProtect;
  if (doProtect && password) ws['!password'] = password;
  if (!doProtect) { delete ws['!protect']; delete ws['!password']; }

  return { worksheet: ws };
};
