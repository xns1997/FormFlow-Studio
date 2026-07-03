import type { NodeExecutor } from '../types';

export const execute: NodeExecutor = (args, properties) => {
  const [_trigger, accept, multiple] = args;
  const acceptStr = (accept as string) || (properties.accept as string) || '.xlsx,.xls,.csv';
  const multi = (multiple as boolean) ?? (properties.multiple as boolean) ?? false;

  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = acceptStr;
    input.multiple = multi;
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve({ file: null, data: null, name: '', size: 0 }); return; }
      const readAs = (properties.readAs as string) || 'arrayBuffer';
      let data: ArrayBuffer | string | null = null;
      if (readAs === 'arrayBuffer') data = await file.arrayBuffer();
      else if (readAs === 'text') data = await file.text();
      else if (readAs === 'dataURL') data = await file.text();
      resolve({ file, data, name: file.name, size: file.size });
    };
    input.click();
  });
};
