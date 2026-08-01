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
  stepsByBlock: Record<string, PlannedStepScreenshot[]>;
}

type IllustrationEntry = DocScreenshotEntry & Partial<Pick<DocEntry, 'id' | 'kind' | 'blocks'>>;

const ENTRY_STEP_SCREENSHOTS: Record<string, Record<string, Array<{
  src: string;
  label: string;
  focus: ScreenshotFocus;
}>>> = {
  'task:understand-create': {
    steps: [
      { src: '/docs/screenshots/tasks/understand-create-01.png', label: '项目列表的新建入口', focus: { x: 82, y: 13, width: 15, height: 10 } },
      { src: '/docs/screenshots/tasks/understand-create-02.png', label: '创建项目的起始方式', focus: { x: 17, y: 24, width: 66, height: 55 } },
      { src: '/docs/screenshots/tasks/understand-create-03.png', label: '项目基础信息表单', focus: { x: 23, y: 27, width: 55, height: 48 } },
      { src: '/docs/screenshots/tasks/understand-create-04.png', label: '编辑器中的项目名称与工作模式', focus: { x: 0, y: 6, width: 100, height: 10 } },
    ],
  },
  'task:import-model': {
    steps: [
      { src: '/docs/screenshots/tasks/import-model-01.png', label: '空项目中的上传入口与数据工作区', focus: { x: 0, y: 9, width: 28, height: 28 } },
      { src: '/docs/screenshots/tasks/import-model-02.png', label: '已导入数据表的表头、样本值与字段类型', focus: { x: 15, y: 16, width: 84, height: 74 } },
      { src: '/docs/screenshots/tasks/import-model-03.png', label: '配置页中的 Key 勾选区域', focus: { x: 3, y: 20, width: 74, height: 33 } },
      { src: '/docs/screenshots/tasks/import-model-04.png', label: '返回数据表后用搜索确认当前结果', focus: { x: 0, y: 11, width: 80, height: 26 } },
    ],
  },
  'task:generate-design': {
    steps: [
      { src: '/docs/screenshots/tasks/generate-design-01.png', label: '选择字段并触发模板生成入口', focus: { x: 0, y: 18, width: 79, height: 18 } },
      { src: '/docs/screenshots/tasks/generate-design-02.png', label: '生成弹窗中的推荐模板和预览内容', focus: { x: 12, y: 14, width: 76, height: 77 } },
      { src: '/docs/screenshots/tasks/generate-design-03.png', label: '设计器中已选控件与右侧属性栏', focus: { x: 20, y: 21, width: 79, height: 64 } },
      { src: '/docs/screenshots/tasks/generate-design-04.png', label: '运行态表单中的真实填写入口', focus: { x: 22, y: 31, width: 56, height: 45 } },
    ],
  },
  'task:behavior-workflow': {
    steps: [
      { src: '/docs/screenshots/tasks/behavior-workflow-01.png', label: '规则页中已选中的规则代码与当前表单', focus: { x: 0, y: 13, width: 100, height: 79 } },
      { src: '/docs/screenshots/tasks/behavior-workflow-02.png', label: '流程页中的保存流程总览与节点连线', focus: { x: 0, y: 12, width: 100, height: 79 } },
      { src: '/docs/screenshots/tasks/behavior-workflow-03.png', label: '流程页中表单保存节点的字段映射与必填字段', focus: { x: 39, y: 12, width: 61, height: 80 } },
      { src: '/docs/screenshots/tasks/behavior-workflow-04.png', label: '测试样例面板中的覆盖率与失败用例', focus: { x: 26, y: 8, width: 48, height: 84 } },
    ],
  },
  'task:test-quality': {
    steps: [
      { src: '/docs/screenshots/tasks/test-quality-01.png', label: '自动测试样例中的覆盖率与样例总览', focus: { x: 27, y: 8, width: 47, height: 84 } },
      { src: '/docs/screenshots/tasks/test-quality-02.png', label: '运行全部后的测试样例结果列表与执行状态', focus: { x: 27, y: 24, width: 47, height: 67 } },
      { src: '/docs/screenshots/tasks/test-quality-03.png', label: '数据质量页中的质量分数、趋势和问题分布', focus: { x: 1, y: 4, width: 98, height: 88 } },
      { src: '/docs/screenshots/tasks/test-quality-04.png', label: '返回测试面板后确认最近运行时间与当前通过情况', focus: { x: 27, y: 8, width: 47, height: 84 } },
    ],
  },
  'task:use-export': {
    steps: [
      { src: '/docs/screenshots/tasks/use-export-01.png', label: '使用页中已打开的从业者档案编辑表单', focus: { x: 16, y: 12, width: 68, height: 64 } },
      { src: '/docs/screenshots/tasks/use-export-02.png', label: '数据页中搜索 W-0001 后收敛到 1 行的当前结果', focus: { x: 0, y: 11, width: 79, height: 84 } },
      { src: '/docs/screenshots/tasks/use-export-03.png', label: '筛选结果上方的导出结果入口', focus: { x: 53, y: 11, width: 22, height: 10 } },
      { src: '/docs/screenshots/tasks/use-export-04.png', label: '导出成功提示与当前结果范围', focus: { x: 83, y: 78, width: 16, height: 10 } },
    ],
  },
  'task:package-release': {
    steps: [
      { src: '/docs/screenshots/tasks/package-release-01.png', label: '发布门禁中的阻断数量与失败列表', focus: { x: 26, y: 21, width: 49, height: 56 } },
      { src: '/docs/screenshots/tasks/package-release-02.png', label: '自动测试样例中的失败用例与覆盖率总览', focus: { x: 26, y: 15, width: 49, height: 78 } },
      { src: '/docs/screenshots/tasks/package-release-03.png', label: '设置页发布分组中的导出格式、文件名和写回策略', focus: { x: 2, y: 10, width: 97, height: 61 } },
      { src: '/docs/screenshots/tasks/package-release-04.png', label: '保存后的交付策略与已保存状态', focus: { x: 62, y: 2, width: 37, height: 51 } },
    ],
  },
  'guide:template-usage-logic': {
    search: [
      { src: '/docs/screenshots/template-center.png', label: '模板中心中的搜索与模板选择区域', focus: { x: 8, y: 15, width: 55, height: 70 } },
    ],
    mapping: [
      { src: '/docs/screenshots/template-config.png', label: '模板配置向导中的数据表映射与结果预览区域', focus: { x: 64, y: 14, width: 34, height: 75 } },
    ],
    apply: [
      { src: '/docs/screenshots/quality-center.png', label: '应用后进入质量检查确认结果的页面', focus: { x: 1, y: 8, width: 96, height: 79 } },
    ],
  },
};

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

export function extractInstructionSteps(block: Pick<DocBlock, 'title' | 'body' | 'examples'> & { id?: string }): string[] {
  const numberedText = [block.body || '', ...(block.examples || []).map((example) => example.code)].join('\n');
  const numbered = [...numberedText.matchAll(/(?:^|\n)\s*\d+[.、]\s*([^\n]+)/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (numbered.length > 0) return numbered;

  const ordinalTitle = block.title.match(/^第\s*[一二三四五六七八九十百\d]+\s*步[：:]\s*(.+)$/);
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
  const customizationId = `doc-shot-${stableHash(identity).toString(16).padStart(8, '0')}`;
  const stepsByBlock: Record<string, PlannedStepScreenshot[]> = {};

  for (const block of entry.blocks || []) {
    const instructions = extractInstructionSteps(block);
    if (instructions.length === 0) continue;
    stepsByBlock[block.id] = instructions.map((instruction, index) => {
      const explicitScreenshot = entry.id ? ENTRY_STEP_SCREENSHOTS[entry.id]?.[block.id]?.[index] : undefined;
      if (explicitScreenshot) {
        return {
          ...explicitScreenshot,
          sequence: index + 1,
          instruction,
          alt: `${entry.title}，第 ${index + 1} 步“${instruction}”：${explicitScreenshot.label}界面`,
          callout: `第 ${index + 1} 步 · ${instruction}`,
        };
      }
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

  return { customizationId, stepsByBlock };
}
