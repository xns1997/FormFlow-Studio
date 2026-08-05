import type { NodeExecutor } from '../types';

/** 节点执行入口：读取输入与属性，返回端口输出（可含副作用）。 */
export const execute: NodeExecutor = (args, props) => {
  const [worksheet, addr, type, vals] = args;
  const ws = worksheet as any;
  const addrStr = (addr as string) || (props.rangeAddress as string) || 'A1';
  const vType = (type as string) || (props.validationType as string) || 'list';
  const listVals = (vals as string) || (props.listValues as string) || '';
  const errMsg = (props.errorMessage as string) || '输入无效';

  if (!ws) return { worksheet: ws };
  if (!ws['!dataValidation']) ws['!dataValidation'] = [];

  ws['!dataValidation'].push({
    sqref: addrStr,
    type: vType,
    formula1: vType === 'list' ? `"${listVals}"` : listVals,
    error: errMsg,
    errorTitle: '验证错误',
    showErrorMessage: true,
  });

  return { worksheet: ws };
};
