import assert from 'node:assert/strict';
import test from 'node:test';
import { checkPortType } from '../../../nodes/port-types';
import {
  canonicalizeAreas,
  combineRangeAreas,
  createComplexRange,
  formatRangeAddress,
  getRangeAreas,
  getEditableRangeSources,
  intersectComplexRanges,
  parseRangeAddress,
} from './rangeGeometry';

test('complex range addresses preserve disjoint areas and quoted sheet names', () => {
  const address = formatRangeAddress([
    { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
    { startRow: 3, startCol: 3, endRow: 4, endCol: 4 },
  ], '销售 明细');
  assert.equal(address, "'销售 明细'!A1:B2,D4:E5");
  assert.deepEqual(parseRangeAddress(address), {
    sheetName: '销售 明细',
    areas: [
      { startRow: 0, startCol: 0, endRow: 1, endCol: 1 },
      { startRow: 3, startCol: 3, endRow: 4, endCol: 4 },
    ],
  });
});

test('canonicalization keeps an exact non-rectangular union without duplicate cells', () => {
  const areas = canonicalizeAreas([
    { startRow: 0, startCol: 0, endRow: 2, endCol: 0 },
    { startRow: 2, startCol: 0, endRow: 2, endCol: 2 },
  ]);
  const complex = createComplexRange(areas);
  assert.equal(complex.cellCount, 5);
  assert.equal(complex.areaCount, 2);
  assert.deepEqual(getRangeAreas(complex), areas);
  assert.equal(checkPortType('range', complex).valid, true);
});

test('intersection of complex ranges can return multiple disjoint areas', () => {
  const left = createComplexRange([
    { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
    { startRow: 0, startCol: 3, endRow: 2, endCol: 4 },
  ], { sheetName: 'Data' });
  const right = createComplexRange([
    { startRow: 1, startCol: 0, endRow: 1, endCol: 4 },
  ], { sheetName: 'Data' });
  const result = intersectComplexRanges(left, right);
  assert.equal(result.operation, 'intersection');
  assert.equal(result.areaCount, 2);
  assert.equal(result.cellCount, 4);
  assert.equal(result.address, 'Data!A2:B2,D2:E2');
});

test('empty intersections remain valid complex ranges', () => {
  const result = intersectComplexRanges(
    createComplexRange([{ startRow: 0, startCol: 0, endRow: 0, endCol: 0 }]),
    createComplexRange([{ startRow: 2, startCol: 2, endRow: 2, endCol: 2 }]),
  );
  assert.equal(result.areaCount, 0);
  assert.equal(result.address, '');
  assert.equal(checkPortType('range', result).valid, true);
});

test('ranges on different worksheets never intersect', () => {
  const result = intersectComplexRanges(
    createComplexRange([{ startRow: 0, startCol: 0, endRow: 2, endCol: 2 }], { sheetName: 'A' }),
    createComplexRange([{ startRow: 0, startCol: 0, endRow: 2, endCol: 2 }], { sheetName: 'B' }),
  );
  assert.equal(result.areaCount, 0);
});

test('intersection selections preserve editable source areas across save and reopen', () => {
  const sourceAreas = [
    { startRow: 0, startCol: 0, endRow: 3, endCol: 3 },
    { startRow: 2, startCol: 2, endRow: 5, endCol: 5 },
  ];
  const areas = combineRangeAreas(sourceAreas, 'intersection');
  const saved = {
    tableId: 'table', sheetName: 'Sheet1', operation: 'intersection' as const,
    sourceAreas, areas,
    startRow: areas[0].startRow, startCol: areas[0].startCol,
    endRow: areas[0].endRow, endCol: areas[0].endCol,
  };
  const reopenedSources = getEditableRangeSources(saved);
  assert.deepEqual(reopenedSources, sourceAreas);
  assert.deepEqual(combineRangeAreas(reopenedSources, saved.operation), areas);
  assert.deepEqual(areas, [{ startRow: 2, startCol: 2, endRow: 3, endCol: 3 }]);
});
