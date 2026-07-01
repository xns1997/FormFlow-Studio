/**
 * Vite expands these globs at build time. Keeping them in a dedicated module lets
 * the execution engine fall back cleanly when it is exercised directly in Node.
 */
export const schemaModules = import.meta.glob<Record<string, any>>([
  './func-*/schema.json',
  './behavior-*/schema.json',
  './generic-*/schema.json',
  './ml-*/schema.json',
  './xlsx-read/schema.json',
  './xlsx-json-to-sheet/schema.json',
  './xlsx-aoa-to-sheet/schema.json',
  './xlsx-sheet-to-json/schema.json',
  './xlsx-sheet-add-json/schema.json',
  './xlsx-sheet-add-aoa/schema.json',
  './xlsx-sheet-get-cell/schema.json',
  './xlsx-sheet-to-formulae/schema.json',
  './xlsx-book-new/schema.json',
  './xlsx-book-append-sheet/schema.json',
  './xlsx-sheet-set-array-formula/schema.json',
  './xlsx-cell-set-hyperlink/schema.json',
  './xlsx-cell-set-internal-link/schema.json',
  './xlsx-format-cell/schema.json',
], {
  eager: true,
  import: 'default',
});

export const funcExecutorModules = import.meta.glob<Record<string, any>>('./func-*/index.ts', {
  eager: true,
});
