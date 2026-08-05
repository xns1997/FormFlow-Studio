import { format as formatWithOxfmt } from 'oxfmt';

/** 格式化代码最大长度（200KB）。 */
export const MAX_FORMAT_CODE_LENGTH = 200 * 1024;
/** 支持格式化的语言集合。 */
export const FORMAT_LANGUAGES = new Set(['javascript', 'typescript', 'json']);

/**
 * 用 oxfmt（Oxc 格式化器）格式化代码。oxfmt 是 Node 原生 binding，
 * 浏览器端不可用，因此统一走服务端接口；失败时由调用方降级为不格式化。
 */
export async function formatCode(language: string, code: string): Promise<{ code: string }> {
  const normalized = String(language || '').toLowerCase();
  if (!FORMAT_LANGUAGES.has(normalized)) {
    throw new Error(`不支持的格式化语言：${language}`);
  }
  if (String(code).length > MAX_FORMAT_CODE_LENGTH) {
    throw new Error('代码长度超出 200KB 上限');
  }
  const extension = normalized === 'json' ? 'json' : 'js';
  const result = await formatWithOxfmt(`event.${extension}`, String(code), {});
  return { code: result.code };
}
