import { useCallback, useEffect, useRef, useState } from 'react';
import type { editor } from 'monaco-editor';
import type { EntityJsonKind } from './registry';
import type { JsonSchema } from './validator';
import { firstSchemaViolation, validateJsonSchema } from './validator';
import { lintEntityJson, type SemanticContext, type SemanticIssue } from './semantic';

export interface JsonModeEntry {
  text: string;
  parseError: string;
  structuralErrors: string[];
  semanticIssues: SemanticIssue[];
  dirty: boolean;
}

export interface JsonModeOptions {
  kind: EntityJsonKind;
  entityKey: string;
  committed: unknown;
  semanticContext: SemanticContext;
  /** 额外结构 schema（属性级编辑器使用；实体级为 null）。 */
  structuralSchema?: JsonSchema | null;
  onApply: (value: unknown) => void;
}

export function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return '{}';
  }
}

function parseDraft(text: string): { value?: unknown; error?: string } {
  try {
    return { value: JSON.parse(text) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'JSON 格式无效' };
  }
}

function lintText(kind: EntityJsonKind, text: string, schema: JsonSchema | null, ctx: SemanticContext): { structural: string[]; semantic: SemanticIssue[] } {
  const { value, error } = parseDraft(text);
  if (error || value === undefined) return { structural: [], semantic: [] };
  const structural = schema ? validateJsonSchema(value, schema).map((violation) => `${violation.path}：${violation.message}`) : [];
  const semantic = lintEntityJson(kind, value, ctx);
  return { structural, semantic };
}

function createEntry(kind: EntityJsonKind, committed: unknown, schema: JsonSchema | null, ctx: SemanticContext): JsonModeEntry {
  const text = stringifyJson(committed);
  const linted = lintText(kind, text, schema, ctx);
  return {
    text,
    parseError: '',
    structuralErrors: linted.structural,
    semanticIssues: linted.semantic,
    dirty: false,
  };
}

/**
 * 实体 JSON 模式草稿状态机：
 * - 可视化改动实时推送 JSON（未编辑过草稿时）；
 * - JSON 草稿必须通过结构校验才能应用或切回可视化；
 * - 语义问题仅警告，不阻断。
 */
export function useJsonModeEditor(options: JsonModeOptions) {
  const { kind, entityKey, committed, semanticContext, structuralSchema = null, onApply } = options;
  const key = `${kind}:${entityKey}`;
  const draftsRef = useRef(new Map<string, JsonModeEntry>());
  const [mode, setMode] = useState<'visual' | 'json'>('visual');
  const [entry, setEntry] = useState<JsonModeEntry>(() => createEntry(kind, committed, structuralSchema, semanticContext));
  const onApplyRef = useRef(onApply);
  onApplyRef.current = onApply;
  const semanticContextRef = useRef(semanticContext);
  semanticContextRef.current = semanticContext;
  const schemaRef = useRef(structuralSchema);
  schemaRef.current = structuralSchema;
  const committedRef = useRef(committed);
  committedRef.current = committed;

  useEffect(() => {
    const existing = draftsRef.current.get(key);
    setEntry(existing ? { ...existing } : createEntry(kind, committed, structuralSchema, semanticContext));
  }, [key]);

  // 可视化 → JSON 实时推送：草稿未被手动编辑时同步 committed 的最新值。
  useEffect(() => {
    if (mode !== 'visual') return;
    setEntry((current) => {
      if (current.dirty || current.parseError) return current;
      const nextText = stringifyJson(committed);
      if (nextText === current.text) return current;
      const linted = lintText(kind, nextText, structuralSchema, semanticContext);
      return { ...current, text: nextText, structuralErrors: linted.structural, semanticIssues: linted.semantic };
    });
  }, [committed, mode, kind, entityKey, structuralSchema, semanticContext]);

  const saveDraft = useCallback((next: JsonModeEntry) => {
    draftsRef.current.set(key, next);
    setEntry(next);
  }, [key]);

  const enterJson = useCallback(() => {
    setMode((current) => {
      if (current === 'json') return current;
      const existing = draftsRef.current.get(key);
      setEntry(existing ? { ...existing } : createEntry(kind, committedRef.current, schemaRef.current, semanticContextRef.current));
      return 'json';
    });
  }, [key, kind]);

  const setDraftText = useCallback((text: string) => {
    const { value, error } = parseDraft(text);
    const linted = lintText(kind, text, schemaRef.current, semanticContextRef.current);
    saveDraft({
      text,
      parseError: error || '',
      // 文本变更后旧结构标记作废，等待 Monaco 重新校验
      structuralErrors: error ? [] : linted.structural,
      semanticIssues: linted.semantic,
      dirty: true,
    });
    return value;
  }, [kind, saveDraft]);

  const updateStructuralMarkers = useCallback((markers: editor.IMarker[]) => {
    const errors = markers
      .filter((marker) => marker.severity === 8) // monaco.MarkerSeverity.Error === 8
      .map((marker) => `${marker.message}`)
      .filter(Boolean);
    const current = draftsRef.current.get(key);
    if (!current) return;
    const unique = [...new Set(errors)];
    if (JSON.stringify(unique) !== JSON.stringify(current.structuralErrors)) {
      saveDraft({ ...current, structuralErrors: unique });
    }
  }, [key, saveDraft]);

  const isValid = entry.parseError === '' && entry.structuralErrors.length === 0;

  const applyEntry = useCallback((target: JsonModeEntry): boolean => {
    const { value, error } = parseDraft(target.text);
    if (error || value === undefined || target.structuralErrors.length > 0) return false;
    onApplyRef.current(value);
    draftsRef.current.delete(key);
    const next = createEntry(kind, value, schemaRef.current, semanticContextRef.current);
    draftsRef.current.set(key, next);
    setEntry(next);
    return true;
  }, [key, kind]);

  const applyJson = useCallback((): boolean => {
    const current = draftsRef.current.get(key) || entry;
    return applyEntry(current);
  }, [applyEntry, entry, key]);

  const exitToVisual = useCallback((): boolean => {
    if (mode !== 'json') return true;
    const current = draftsRef.current.get(key) || entry;
    if (current.parseError || current.structuralErrors.length > 0) return false;
    const applied = applyEntry(current);
    if (applied) setMode('visual');
    return applied;
  }, [applyEntry, entry, key, mode]);

  const discardJson = useCallback(() => {
    const next = createEntry(kind, committedRef.current, schemaRef.current, semanticContextRef.current);
    draftsRef.current.set(key, next);
    setEntry(next);
  }, [key, kind]);

  return {
    mode,
    entry,
    isValid,
    enterJson,
    exitToVisual,
    applyJson,
    discardJson,
    setDraftText,
    updateStructuralMarkers,
  };
}
