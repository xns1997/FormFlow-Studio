export type {
  BehaviorDocScope,
  BehaviorReferenceField,
  BehaviorApiReference,
  BehaviorDocExample,
  BehaviorReferenceShortcut,
  BehaviorEventDocEntry,
  BehaviorTopicDocEntry,
  FlowNodePortDoc,
  FlowNodePropertyDoc,
} from './docs/types';

export {
  sharedContextFields,
  controlOnlyContextFields,
  scriptOnlyContextFields,
  flowParameterShortcuts,
  scriptApis,
  controlApis,
  mergeContextFields,
  createEventDoc,
} from './docs/shared';

export { scriptEventDocs } from './docs/event-docs-script';
export { controlEventDocs } from './docs/event-docs-control';
export { behaviorTopicDocs } from './docs/topic-docs';
export { docSections, getDocSection, getDocSectionByPath, type DocSection } from './docs/sections';
export { overviewDocs } from './docs/overview-docs';
export { formDesignDocs, formDesignCategories } from './docs/form-design-docs';
export { flowNodeDocs, flowNodeCategories } from './docs/flow-node-docs';
export { backendDocs } from './docs/backend-docs';

import type { BehaviorDocScope, BehaviorEventDocEntry } from './docs/types';
import { sharedContextFields, flowParameterShortcuts, scriptApis, controlApis } from './docs/shared';
import { scriptEventDocs } from './docs/event-docs-script';
import { controlEventDocs } from './docs/event-docs-control';
import { behaviorTopicDocs } from './docs/topic-docs';

/** 行为事件参考文档条目（编辑器补全与文档页共用）。 */
export const behaviorEventDocs: BehaviorEventDocEntry[] = [
  ...scriptEventDocs,
  ...controlEventDocs,
];

/** 按 slug 查找行为文档条目。 */
export function getBehaviorDocBySlug(slug: string | undefined) {
  if (!slug) return undefined;
  return behaviorEventDocs.find((item) => item.slug === slug) || behaviorTopicDocs.find((item) => item.slug === slug);
}

/** 按事件名与作用域查找事件文档。 */
export function getBehaviorEventDoc(eventName: string | undefined, scope?: BehaviorDocScope) {
  if (!eventName) return undefined;
  return behaviorEventDocs.find((item) => item.eventName === eventName && (!scope || item.scope === scope));
}

/** 按作用域列出事件文档。 */
export function getBehaviorDocsByScope(scope: BehaviorDocScope) {
  return behaviorEventDocs.filter((item) => item.scope === scope);
}

/** 事件详情字段类型（用于补全提示）。 */
export function getEventDetailType(eventName: string, scope: BehaviorDocScope = 'control') {
  return getBehaviorEventDoc(eventName, scope)?.detailType || 'Record<string, unknown>';
}

/** 事件上下文快捷引用（ctx.event / ctx.field 等）。 */
export function getEventReferenceShortcuts(eventName: string, scope: BehaviorDocScope = 'control') {
  return getBehaviorEventDoc(eventName, scope)?.referenceShortcuts || [];
}

/** 全部事件共享的上下文字段。 */
export function getSharedContextFields() {
  return sharedContextFields;
}

/** 流程参数快捷引用。 */
export function getFlowParameterShortcuts() {
  return flowParameterShortcuts;
}

/** 脚本 API 列表（方法/值）。 */
export function getScriptApis() {
  return scriptApis;
}

/** 控件 API 列表。 */
export function getControlApis() {
  return controlApis;
}
