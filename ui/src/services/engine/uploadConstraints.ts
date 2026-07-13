export interface UploadConstraints {
  accept?: string;
  maxFileSizeMb?: number;
  maxCount?: number;
  minImageWidth?: number;
  maxImageWidth?: number;
  minImageHeight?: number;
  maxImageHeight?: number;
}

export interface UploadCandidate { name: string; size: number; type: string }

function matchesAccept(file: UploadCandidate, accept: string) {
  const rules = accept.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
  if (!rules.length) return true;
  const name = file.name.toLowerCase(); const type = file.type.toLowerCase();
  return rules.some((rule) => rule === '*/*' || (rule.endsWith('/*') && type.startsWith(rule.slice(0, -1))) || (rule.startsWith('.') && name.endsWith(rule)) || type === rule);
}

export function validateUploadCandidate(file: UploadCandidate, currentCount: number, constraints: UploadConstraints): string | null {
  if (constraints.accept && !matchesAccept(file, constraints.accept)) return `文件类型不符合 ${constraints.accept}`;
  if (constraints.maxFileSizeMb && file.size > constraints.maxFileSizeMb * 1024 * 1024) return `单文件不能超过 ${constraints.maxFileSizeMb} MB`;
  if (constraints.maxCount && currentCount >= constraints.maxCount) return `最多上传 ${constraints.maxCount} 个文件`;
  return null;
}

export function validateImageDimensions(width: number, height: number, constraints: UploadConstraints): string | null {
  if (constraints.minImageWidth && width < constraints.minImageWidth) return `图片宽度不能小于 ${constraints.minImageWidth}px`;
  if (constraints.maxImageWidth && width > constraints.maxImageWidth) return `图片宽度不能大于 ${constraints.maxImageWidth}px`;
  if (constraints.minImageHeight && height < constraints.minImageHeight) return `图片高度不能小于 ${constraints.minImageHeight}px`;
  if (constraints.maxImageHeight && height > constraints.maxImageHeight) return `图片高度不能大于 ${constraints.maxImageHeight}px`;
  return null;
}
