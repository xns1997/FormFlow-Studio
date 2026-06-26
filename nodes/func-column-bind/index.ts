import type { NodeExecutor } from '../types';
export const execute: NodeExecutor = (args, props) => {
  const [trigger, uiValue, dataValue] = args;
  const dir = (props.direction as string) || 'twoWay';
  const formatter = props.formatter as string || '';
  const parser = props.parser as string || '';
  let outUI = uiValue;
  let outData = dataValue;
  if (dir === 'dataToUi' || dir === 'twoWay') {
    if (formatter) { try { outUI = new Function('v', `return (${formatter})(v)`)(dataValue); } catch {} }
    else outUI = dataValue;
  }
  if (dir === 'uiToData' || dir === 'twoWay') {
    if (parser) { try { outData = new Function('v', `return (${parser})(v)`)(uiValue); } catch {} }
    else outData = uiValue;
  }
  return { trigger: { event: 'bind', direction: dir, timestamp: Date.now() }, uiValue: outUI, dataValue: outData };
};
