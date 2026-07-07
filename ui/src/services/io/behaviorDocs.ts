export type {
  BehaviorDocScope,
  BehaviorReferenceField,
  BehaviorApiReference,
  BehaviorDocExample,
  BehaviorReferenceShortcut,
  BehaviorEventDocEntry,
  BehaviorTopicDocEntry,
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

import type { BehaviorDocScope, BehaviorEventDocEntry, BehaviorTopicDocEntry } from './docs/types';
import { sharedContextFields, flowParameterShortcuts, scriptApis, controlApis } from './docs/shared';
import { scriptEventDocs } from './docs/event-docs-script';
import { controlEventDocs } from './docs/event-docs-control';
import { behaviorTopicDocs } from './docs/topic-docs';

export const behaviorEventDocs: BehaviorEventDocEntry[] = [
  ...scriptEventDocs,
  ...controlEventDocs,
];

export function getBehaviorDocBySlug(slug: string | undefined) {
  if (!slug) return undefined;
  return behaviorEventDocs.find((item) => item.slug === slug) || behaviorTopicDocs.find((item) => item.slug === slug);
}

export function getBehaviorEventDoc(eventName: string | undefined, scope?: BehaviorDocScope) {
  if (!eventName) return undefined;
  return behaviorEventDocs.find((item) => item.eventName === eventName && (!scope || item.scope === scope));
}

export function getBehaviorDocsByScope(scope: BehaviorDocScope) {
  return behaviorEventDocs.filter((item) => item.scope === scope);
}

export function getEventDetailType(eventName: string, scope: BehaviorDocScope = 'control') {
  return getBehaviorEventDoc(eventName, scope)?.detailType || 'Record<string, unknown>';
}

export function getEventReferenceShortcuts(eventName: string, scope: BehaviorDocScope = 'control') {
  return getBehaviorEventDoc(eventName, scope)?.referenceShortcuts || [];
}

export function getSharedContextFields() {
  return sharedContextFields;
}

export function getFlowParameterShortcuts() {
  return flowParameterShortcuts;
}

export function getScriptApis() {
  return scriptApis;
}

export function getControlApis() {
  return controlApis;
}
