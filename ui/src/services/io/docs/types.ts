export type BehaviorDocScope = 'script' | 'control';

export interface BehaviorReferenceField {
  name: string;
  type: string;
  description: string;
}

export interface BehaviorApiReference {
  name: string;
  signature: string;
  description: string;
}

export interface BehaviorDocExample {
  title: string;
  code: string;
}

export interface BehaviorReferenceShortcut {
  path: string;
  description: string;
}

export interface BehaviorEventDocEntry {
  id: string;
  eventName: string;
  slug: string;
  title: string;
  category: string;
  scope: BehaviorDocScope;
  summary: string;
  triggerWhen: string;
  contextFields: BehaviorReferenceField[];
  detailFields: BehaviorReferenceField[];
  apis: BehaviorApiReference[];
  suggestions: string[];
  examples: BehaviorDocExample[];
  relatedEvents: string[];
  tags?: string[];
  detailType?: string;
  referenceShortcuts?: BehaviorReferenceShortcut[];
}

export interface BehaviorTopicDocEntry {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category?: string;
  sections: Array<{
    title: string;
    body?: string;
    /** 指向 markdown 文件名（相对于 docs/markdown/），运行时通过 marked 渲染 */
    markdownBody?: string;
    fields?: BehaviorReferenceField[];
    apis?: BehaviorApiReference[];
    shortcuts?: BehaviorReferenceShortcut[];
    examples?: BehaviorDocExample[];
    /** 自动生成的端口定义（流程节点文档专用） */
    ports?: { inputs: FlowNodePortDoc[]; outputs: FlowNodePortDoc[] };
    /** 自动生成的参数表（流程节点文档专用） */
    properties?: FlowNodePropertyDoc[];
  }>;
}

/** 流程节点端口文档 */
export interface FlowNodePortDoc {
  name: string;
  label: string;
  type: string;
  direction: 'input' | 'output' | 'both';
  required?: boolean;
  description: string;
  defaultValue?: unknown;
  enum?: string[];
}

/** 流程节点参数文档 */
export interface FlowNodePropertyDoc {
  name: string;
  label: string;
  type: string;
  defaultValue?: unknown;
  required?: boolean;
  description: string;
  enum?: string[];
  min?: number;
  max?: number;
}
