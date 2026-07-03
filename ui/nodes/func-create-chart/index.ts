import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, props) => {
  const [worksheet, rangeOverride, titleOverride] = args;
  const ws = worksheet as any;
  const dataRange = (rangeOverride as string) || (props.dataRange as string) || 'A1:C10';
  const title = (titleOverride as string) || (props.title as string) || '';
  const chartType = (props.chartType as string) || 'bar';
  if (!ws) return { worksheet: ws, chartName: '' };

  if (!ws['!charts']) ws['!charts'] = [];
  const chartName = `Chart${ws['!charts'].length + 1}`;
  ws['!charts'].push({
    name: chartName,
    type: chartType,
    dataRange,
    title,
    width: (props.width as number) || 480,
    height: (props.height as number) || 320,
  });

  return { worksheet: ws, chartName };
};
