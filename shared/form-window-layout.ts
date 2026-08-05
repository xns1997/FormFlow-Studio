/** 表单窗口内容坐标系标识：组件坐标始终相对内容区（窗口去掉标题/页脚与内边距后的区域）。 */
export const FORM_WINDOW_COORDINATE_SPACE = 'window-content-v1' as const;
/** 窗口标题栏固定高度。 */
export const FORM_WINDOW_HEADER_HEIGHT = 52;
/** 窗口页脚固定高度（showFooter=false 时为 0）。 */
export const FORM_WINDOW_FOOTER_HEIGHT = 64;
/** 窗口最小宽度。 */
export const FORM_WINDOW_MIN_WIDTH = 320;
/** 窗口最小高度。 */
export const FORM_WINDOW_MIN_HEIGHT = 240;

/** 窗口坐标系标识类型。 */
export type FormWindowCoordinateSpace = typeof FORM_WINDOW_COORDINATE_SPACE;

/** 窗口配置（位置、尺寸与可选 props）。 */
export interface FormWindowLike {
  x: number;
  y: number;
  width: number;
  height: number;
  props?: Record<string, unknown>;
}

/** 组件矩形：相对内容区的坐标与尺寸。 */
export interface ComponentRectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 窗口内边距（上/右/下/左）。 */
export interface WindowInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** 计算后的窗口布局：外框、标题栏、内容区、页脚与内边距。 */
export interface FormWindowLayout {
  outer: { x: number; y: number; width: number; height: number };
  header: { x: number; y: number; width: number; height: number };
  content: { x: number; y: number; width: number; height: number };
  footer: { x: number; y: number; width: number; height: number } | null;
  padding: WindowInsets;
}

function finite(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/** 归一化内边距配置：接受数字（四边相等）或 { all/top/right/bottom/left } 对象。 */
export function normalizeFormWindowPadding(value: unknown, fallback = 24): WindowInsets {
  if (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))) {
    const number = Math.max(0, finite(value, fallback));
    return { top: number, right: number, bottom: number, left: number };
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const all = Math.max(0, finite(record.all, fallback));
    return {
      top: Math.max(0, finite(record.top, all)),
      right: Math.max(0, finite(record.right, all)),
      bottom: Math.max(0, finite(record.bottom, all)),
      left: Math.max(0, finite(record.left, all)),
    };
  }
  return { top: fallback, right: fallback, bottom: fallback, left: fallback };
}

/** 由窗口配置计算完整布局：外框/标题/内容/页脚区域（含最小尺寸钳制）。 */
export function getFormWindowLayout(windowConfig: FormWindowLike): FormWindowLayout {
  const x = finite(windowConfig.x);
  const y = finite(windowConfig.y);
  const width = Math.max(FORM_WINDOW_MIN_WIDTH, finite(windowConfig.width, FORM_WINDOW_MIN_WIDTH));
  const height = Math.max(FORM_WINDOW_MIN_HEIGHT, finite(windowConfig.height, FORM_WINDOW_MIN_HEIGHT));
  const padding = normalizeFormWindowPadding(windowConfig.props?.padding, 24);
  const footerHeight = windowConfig.props?.showFooter === false ? 0 : FORM_WINDOW_FOOTER_HEIGHT;
  const contentX = x + padding.left;
  const contentY = y + FORM_WINDOW_HEADER_HEIGHT + padding.top;
  const contentWidth = Math.max(0, width - padding.left - padding.right);
  const contentHeight = Math.max(0, height - FORM_WINDOW_HEADER_HEIGHT - footerHeight - padding.top - padding.bottom);
  return {
    outer: { x, y, width, height },
    header: { x, y, width, height: FORM_WINDOW_HEADER_HEIGHT },
    content: { x: contentX, y: contentY, width: contentWidth, height: contentHeight },
    footer: footerHeight > 0
      ? { x, y: y + height - footerHeight, width, height: footerHeight }
      : null,
    padding,
  };
}

/** 内容区局部坐标 → 画布绝对坐标。 */
export function localToCanvasPoint(windowConfig: FormWindowLike, point: { x: number; y: number }) {
  const layout = getFormWindowLayout(windowConfig);
  return {
    x: layout.content.x + finite(point.x),
    y: layout.content.y + finite(point.y),
  };
}

/** 画布绝对坐标 → 内容区局部坐标。 */
export function canvasToLocalPoint(windowConfig: FormWindowLike, point: { x: number; y: number }) {
  const layout = getFormWindowLayout(windowConfig);
  return {
    x: finite(point.x) - layout.content.x,
    y: finite(point.y) - layout.content.y,
  };
}

/** 组件矩形局部坐标 → 画布坐标（保留其余字段）。 */
export function localToCanvasRect<T extends ComponentRectLike>(windowConfig: FormWindowLike, component: T): T {
  const point = localToCanvasPoint(windowConfig, component);
  return { ...component, x: point.x, y: point.y };
}

/** 组件矩形画布坐标 → 局部坐标（保留其余字段）。 */
export function canvasToLocalRect<T extends ComponentRectLike>(windowConfig: FormWindowLike, component: T): T {
  const point = canvasToLocalPoint(windowConfig, component);
  return { ...component, x: point.x, y: point.y };
}

/** 钳制组件坐标/尺寸为非负值。 */
export function clampComponentToContent<T extends ComponentRectLike>(component: T): T {
  return {
    ...component,
    x: Math.max(0, finite(component.x)),
    y: Math.max(0, finite(component.y)),
    width: Math.max(0, finite(component.width)),
    height: Math.max(0, finite(component.height)),
  };
}

/** Grow only: the configured window never shrinks as a side effect of content changes. */
export function growFormWindowToFit<T extends FormWindowLike>(
  windowConfig: T,
  components: ComponentRectLike[],
): T {
  const padding = normalizeFormWindowPadding(windowConfig.props?.padding, 24);
  const footerHeight = windowConfig.props?.showFooter === false ? 0 : FORM_WINDOW_FOOTER_HEIGHT;
  const maxRight = Math.max(0, ...components.map((component) => Math.max(0, finite(component.x)) + Math.max(0, finite(component.width))));
  const maxBottom = Math.max(0, ...components.map((component) => Math.max(0, finite(component.y)) + Math.max(0, finite(component.height))));
  const requiredWidth = Math.max(FORM_WINDOW_MIN_WIDTH, padding.left + maxRight + padding.right);
  const requiredHeight = Math.max(
    FORM_WINDOW_MIN_HEIGHT,
    FORM_WINDOW_HEADER_HEIGHT + padding.top + maxBottom + padding.bottom + footerHeight,
  );
  return {
    ...windowConfig,
    width: Math.max(finite(windowConfig.width, FORM_WINDOW_MIN_WIDTH), requiredWidth),
    height: Math.max(finite(windowConfig.height, FORM_WINDOW_MIN_HEIGHT), requiredHeight),
  };
}

/**
 * Convert legacy canvas-absolute components into the canonical form-content space.
 * When content would become negative, expand the window towards top/left so every
 * component keeps its canvas position while canonical local coordinates stay >= 0.
 */
export function migrateCanvasComponentsToWindowLocal<
  W extends FormWindowLike,
  C extends ComponentRectLike,
>(windowConfig: W, components: C[]): { formWindow: W; components: C[] } {
  const layout = getFormWindowLayout(windowConfig);
  const raw = components.map((component) => ({
    ...component,
    x: finite(component.x) - layout.content.x,
    y: finite(component.y) - layout.content.y,
  }));
  const minX = Math.min(0, ...raw.map((component) => finite(component.x)));
  const minY = Math.min(0, ...raw.map((component) => finite(component.y)));
  const shiftX = -minX;
  const shiftY = -minY;
  const localComponents = raw.map((component) => ({
    ...component,
    x: finite(component.x) + shiftX,
    y: finite(component.y) + shiftY,
  })) as C[];
  const expanded = {
    ...windowConfig,
    x: finite(windowConfig.x) - shiftX,
    y: finite(windowConfig.y) - shiftY,
    width: finite(windowConfig.width, FORM_WINDOW_MIN_WIDTH) + shiftX,
    height: finite(windowConfig.height, FORM_WINDOW_MIN_HEIGHT) + shiftY,
  } as W;
  return {
    formWindow: growFormWindowToFit(expanded, localComponents),
    components: localComponents,
  };
}
