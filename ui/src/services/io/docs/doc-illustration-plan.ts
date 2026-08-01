import type { DocBlock, DocDomain, DocEntry } from './catalog';
import { DOC_SCREENSHOTS, DOC_SPECIAL_SCREENSHOTS, type DocScreenshotEntry } from './doc-screenshots';

export interface ScreenshotFocus {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlannedScreenshot {
  src: string;
  label: string;
  alt: string;
  callout: string;
  focus: ScreenshotFocus;
}

export interface PlannedStepScreenshot extends PlannedScreenshot {
  sequence: number;
  instruction: string;
}

export interface DocIllustrationPlan {
  customizationId: string;
  hero: PlannedScreenshot;
  stepsByBlock: Record<string, PlannedStepScreenshot[]>;
}

type IllustrationEntry = DocScreenshotEntry & Partial<Pick<DocEntry, 'id' | 'kind' | 'blocks'>>;

const DOMAIN_FOCUS: Record<DocDomain, ScreenshotFocus> = {
  'getting-started': { x: 5, y: 13, width: 72, height: 48 },
  data: { x: 14, y: 18, width: 64, height: 67 },
  forms: { x: 15, y: 14, width: 64, height: 72 },
  behavior: { x: 0, y: 10, width: 61, height: 77 },
  workflows: { x: 18, y: 17, width: 61, height: 71 },
  templates: { x: 8, y: 10, width: 57, height: 78 },
  quality: { x: 1, y: 8, width: 96, height: 79 },
  delivery: { x: 14, y: 12, width: 65, height: 74 },
  controls: { x: 0, y: 12, width: 76, height: 76 },
  nodes: { x: 18, y: 17, width: 61, height: 71 },
  events: { x: 0, y: 10, width: 61, height: 77 },
  api: { x: 15, y: 18, width: 78, height: 69 },
};

function stableHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function domainFocus(domain: DocDomain): ScreenshotFocus {
  return { ...DOMAIN_FOCUS[domain] };
}

function instructionDomain(instruction: string, fallback: DocDomain): DocDomain {
  if (/质量|测试|Mock|error|warning|校验|诊断|回归/i.test(instruction)) return 'quality';
  if (/发布|交付|导出|下载|使用模式|打开结果|版本和影响/.test(instruction)) return 'delivery';
  if (/模板|字段映射|生成内容/.test(instruction)) return 'templates';
  if (/流程|节点|连接输入输出/.test(instruction)) return 'workflows';
  if (/行为|规则|联动|事件|lint/i.test(instruction)) return 'behavior';
  if (/表单|控件|填写|预览|编辑器|工作模式|数据绑定|必填|字段格式/.test(instruction)) return 'forms';
  if (/数据|导入|Sheet|表头|主键|字段类型|空值|重复值|筛选|分页|写回/i.test(instruction)) return 'data';
  if (/MCP|租户|权限|revision|幂等|令牌/i.test(instruction)) return 'api';
  if (/项目|空白/.test(instruction)) return 'getting-started';
  return fallback;
}

function instructionScreenshot(instruction: string, fallback: DocDomain) {
  if (/核对稳定 ID、数据主键、必填参数和连接端口/.test(instruction)) {
    return { domain: fallback, source: DOC_SCREENSHOTS[fallback] };
  }
  if (fallback === 'templates' && /选择需要的数据表|字段映射|生成内容|选择此模板/.test(instruction)) {
    if (/选择此模板/.test(instruction)) return { domain: 'templates' as const, source: DOC_SCREENSHOTS.templates };
    return {
      domain: 'templates' as const,
      source: DOC_SPECIAL_SCREENSHOTS['template-config'],
      focus: { x: 64, y: 14, width: 34, height: 75 },
    };
  }
  if (/Mock|测试运行|重新运行回归/.test(instruction)) {
    return {
      domain: 'quality' as const,
      source: DOC_SPECIAL_SCREENSHOTS['test-overview'],
      focus: { x: 25, y: 15, width: 50, height: 75 },
    };
  }
  if (/名称和用途/.test(instruction)) {
    return {
      domain: 'getting-started' as const,
      source: DOC_SPECIAL_SCREENSHOTS['project-details'],
      focus: { x: 23, y: 27, width: 55, height: 48 },
    };
  }
  if (/新建项目|空白项目/.test(instruction)) {
    return {
      domain: 'getting-started' as const,
      source: DOC_SPECIAL_SCREENSHOTS['project-create'],
      focus: { x: 22, y: 31, width: 56, height: 37 },
    };
  }
  if (/发布|阻断问题|版本和影响|项目包校验/.test(instruction)) {
    return {
      domain: 'delivery' as const,
      source: DOC_SPECIAL_SCREENSHOTS['release-check'],
      focus: { x: 26, y: 22, width: 48, height: 56 },
    };
  }
  const domain = instructionDomain(instruction, fallback);
  return { domain, source: DOC_SCREENSHOTS[domain] };
}

function instructionFocus(domain: DocDomain, instruction: string): ScreenshotFocus {
  if (domain === 'data') {
    if (/导入|数据工作区/.test(instruction)) return { x: 0, y: 9, width: 29, height: 44 };
    if (/Sheet|表头|样本|类型|查询|筛选|分页/.test(instruction)) return { x: 16, y: 17, width: 62, height: 68 };
    if (/主键|配置|保存|空值|重复值/.test(instruction)) return { x: 71, y: 13, width: 28, height: 72 };
  }
  if (domain === 'forms' || domain === 'controls') {
    if (/生成|控件/.test(instruction)) return { x: 0, y: 11, width: 25, height: 77 };
    if (/必填|绑定|格式/.test(instruction)) return { x: 77, y: 11, width: 22, height: 77 };
    if (/预览|填写/.test(instruction)) return { x: 16, y: 16, width: 62, height: 69 };
  }
  if (domain === 'behavior' || domain === 'events') {
    if (/规则|行为|联动/.test(instruction)) return { x: 0, y: 10, width: 29, height: 78 };
    if (/事件|field|controls|return|setValue|onForm|onField/i.test(instruction)) return { x: 15, y: 13, width: 61, height: 73 };
  }
  if (domain === 'workflows' || domain === 'nodes') {
    if (/创建|连接|节点|输入输出/.test(instruction)) return { x: 18, y: 17, width: 61, height: 72 };
    if (/绑定|事件|调用/.test(instruction)) return { x: 0, y: 10, width: 27, height: 77 };
  }
  if (domain === 'templates') {
    if (/数据表|字段映射|预览|应用/.test(instruction)) return { x: 62, y: 13, width: 36, height: 72 };
    if (/选择|搜索|模板中心/.test(instruction)) return { x: 8, y: 15, width: 55, height: 70 };
  }
  if (domain === 'quality') {
    if (/质量|error|warning|诊断/.test(instruction)) return { x: 1, y: 8, width: 96, height: 79 };
    if (/测试|Mock|回归/.test(instruction)) return { x: 0, y: 8, width: 65, height: 80 };
  }
  if (domain === 'delivery') {
    if (/导出|下载|结果/.test(instruction)) return { x: 14, y: 11, width: 65, height: 74 };
    if (/使用模式|真实操作/.test(instruction)) return { x: 0, y: 10, width: 78, height: 76 };
  }
  if (domain === 'api') return { x: 15, y: 18, width: 78, height: 69 };
  return domainFocus(domain);
}

function heroFocus(entry: IllustrationEntry): ScreenshotFocus {
  const context = [
    entry.title,
    ...(entry.blocks || []).flatMap((block) => [block.title, block.body || '']),
  ].join(' ');
  return instructionFocus(entry.domain, context);
}

export function extractInstructionSteps(block: Pick<DocBlock, 'title' | 'body' | 'examples'> & { id?: string }): string[] {
  const numberedText = [block.body || '', ...(block.examples || []).map((example) => example.code)].join('\n');
  const numbered = [...numberedText.matchAll(/(?:^|\n)\s*\d+[.、]\s*([^\n]+)/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (numbered.length > 0) return numbered;

  const ordinalTitle = block.title.match(/^第[一二三四五六七八九十百\d]+步[：:]\s*(.+)$/);
  if (ordinalTitle) {
    const detail = block.body?.trim();
    return [`${ordinalTitle[1].trim()}${detail ? `：${detail}` : ''}`];
  }

  const nodeUsage = block.body?.match(/^在画布中搜索(“[^”]+”)，连接类型兼容的端口，配置必填参数后再运行测试。?$/);
  if (nodeUsage) {
    return [
      `在画布中搜索${nodeUsage[1]}`,
      '连接类型兼容的端口',
      '配置必填参数',
      '运行测试',
    ];
  }

  if (block.title.includes('应用步骤') && block.body) {
    return [
      '在模板中心选择此模板',
      '选择需要的数据表',
      '完成字段映射',
      '预览生成内容后应用',
      '运行质量检查',
    ];
  }
  if (block.title.includes('如何使用') && block.body) {
    return [
      '确认适用范围和前置条件',
      '按文档顺序执行',
      '遇到错误时遵循确定性校验与安全门禁',
    ];
  }
  if (block.title.includes('步骤') && block.body?.trim()) return [block.body.trim()];
  return [];
}

export function buildDocIllustrationPlan(entry: IllustrationEntry): DocIllustrationPlan {
  const identity = entry.id || `${entry.domain}:${entry.title}`;
  const heroSource = DOC_SCREENSHOTS[entry.domain];
  const customizationId = `doc-shot-${stableHash(identity).toString(16).padStart(8, '0')}`;
  const hero: PlannedScreenshot = {
    ...heroSource,
    alt: `${entry.title}：${heroSource.label}中的相关功能界面`,
    callout: `${entry.title} · 功能位置`,
    focus: heroFocus(entry),
  };
  const stepsByBlock: Record<string, PlannedStepScreenshot[]> = {};

  for (const block of entry.blocks || []) {
    const instructions = extractInstructionSteps(block);
    if (instructions.length === 0) continue;
    stepsByBlock[block.id] = instructions.map((instruction, index) => {
      const { domain, source, focus } = instructionScreenshot(instruction, entry.domain);
      return {
        ...source,
        sequence: index + 1,
        instruction,
        alt: `${entry.title}，第 ${index + 1} 步“${instruction}”：${source.label}界面`,
        callout: `第 ${index + 1} 步 · ${instruction}`,
        focus: focus || instructionFocus(domain, instruction),
      };
    });
  }

  return { customizationId, hero, stepsByBlock };
}
