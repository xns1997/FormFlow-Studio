// 行为导入导出服务 — JSON 序列化

import type { BehaviorFile } from '../project/types';

export interface BehaviorExportData {
  version: '1.0';
  exportedAt: string;
  behaviors: BehaviorFile[];
}

export function exportBehaviors(behaviors: BehaviorFile[]): string {
  const data: BehaviorExportData = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    behaviors,
  };
  return JSON.stringify(data, null, 2);
}

export function importBehaviors(json: string): { behaviors: BehaviorFile[]; errors: string[] } {
  const errors: string[] = [];
  let behaviors: BehaviorFile[] = [];

  try {
    const data = JSON.parse(json);

    // 支持直接数组格式
    if (Array.isArray(data)) {
      behaviors = data;
    }
    // 支持导出格式
    else if (data.version && data.behaviors) {
      behaviors = data.behaviors;
    }
    // 支持单个行为
    else if (data.id && data.name && data.event) {
      behaviors = [data];
    }
    else {
      errors.push('无法识别的文件格式');
      return { behaviors, errors };
    }
  } catch (e) {
    errors.push(`JSON 解析失败: ${e instanceof Error ? e.message : String(e)}`);
    return { behaviors, errors };
  }

  // 验证和清理
  const validBehaviors: BehaviorFile[] = [];
  for (const bh of behaviors) {
    if (!bh.id || !bh.name || !bh.event) {
      errors.push(`跳过无效行为: ${JSON.stringify(bh).slice(0, 50)}`);
      continue;
    }
    validBehaviors.push({
      id: bh.id,
      name: bh.name,
      event: bh.event,
      code: bh.code || '',
      priority: bh.priority ?? 10,
      enabled: bh.enabled ?? true,
      createdAt: bh.createdAt || new Date().toISOString(),
      updatedAt: bh.updatedAt || new Date().toISOString(),
    });
  }

  return { behaviors: validBehaviors, errors };
}

export function downloadBehaviors(behaviors: BehaviorFile[], filename?: string): void {
  const json = exportBehaviors(behaviors);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `behaviors_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}
