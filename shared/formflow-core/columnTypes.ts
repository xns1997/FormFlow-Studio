import type { FieldType } from './behaviorDsl/types';

/**
 * Single source of truth for the column-type vocabulary: alias normalization,
 * DSL field-type derivation, and control-type mapping. Server tools, rule
 * linting, form generators, and form-scaffold inference all consume this
 * module instead of re-implementing the mapping.
 */
export const COLUMN_TYPE_ALIASES: Readonly<Record<string, string>> = {
  text: 'string',
  integer: 'number',
  float: 'number',
  double: 'number',
  bool: 'boolean',
  datetime: 'date',
};

export type ColumnDataType = 'string' | 'number' | 'boolean' | 'date' | 'enum' | 'unknown';

/** Lowercases and maps aliases (integer/float/double → number, …); unknown values pass through. */
export function normalizeColumnType(type: unknown): string {
  const value = String(type ?? '').toLowerCase();
  return COLUMN_TYPE_ALIASES[value] || value;
}

/** Column dataType (aliases included) → DSL static field type; unmappable values become unknown. */
export function columnDataTypeToFieldType(dataType: unknown): FieldType {
  switch (normalizeColumnType(dataType)) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'date': return 'date';
    case 'enum':
    case 'string':
    case 'text': return 'string';
    default: return 'unknown';
  }
}

export type ColumnControlType = 'input' | 'textarea' | 'number' | 'datePicker' | 'switch' | 'select';

/**
 * Column dataType → control type. When the caller cannot populate select
 * options (e.g. generated fields without sample data), pass
 * `{ noSelectOptions: true }` so enum degrades to a plain text input.
 */
export function columnDataTypeToControlType(dataType: unknown, options: { noSelectOptions?: boolean } = {}): ColumnControlType {
  switch (normalizeColumnType(dataType)) {
    case 'number': return 'number';
    case 'date': return 'datePicker';
    case 'boolean': return 'switch';
    case 'enum': return options.noSelectOptions ? 'input' : 'select';
    default: return 'input';
  }
}

/** Distinct enum/sample values as string options, shared by form generators. */
export function columnSelectOptions(column: { enum?: unknown[]; sampleValues?: unknown[] } | undefined): string[] {
  return [...new Set([...(column?.enum || []), ...(column?.sampleValues || [])].map(String))];
}
