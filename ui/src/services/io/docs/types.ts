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
    fields?: BehaviorReferenceField[];
    apis?: BehaviorApiReference[];
    shortcuts?: BehaviorReferenceShortcut[];
    examples?: BehaviorDocExample[];
  }>;
}
