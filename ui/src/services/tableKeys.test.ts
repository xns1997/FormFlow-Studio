import assert from 'node:assert/strict';
import test from 'node:test';
import type { SrcSheetInfo, SrcTableEntry } from '../project/types';
import { applySheetKeyConfig, computeSheetKeyValidation, resolveSingleKeyField } from './tableKeys';

const sheet: SrcSheetInfo = {
  name: '商品档案',
  rowCount: 3,
  colCount: 3,
  headers: ['商品编号', '商品名称', '状态'],
  columns: [],
  preview: [
    { 商品编号: 'P-1', 商品名称: '鼠标', 状态: '上架' },
    { 商品编号: 'P-2', 商品名称: '键盘', 状态: '上架' },
    { 商品编号: 'P-3', 商品名称: '键盘', 状态: '下架' },
  ],
};

test('single-field key validates when values are unique and non-empty', () => {
  const result = computeSheetKeyValidation(sheet, ['商品编号']);
  assert.equal(result?.valid, true);
  assert.equal(result?.hasNulls, false);
  assert.equal(result?.duplicateCount, 0);
});

test('composite key can pass validation even when a single field repeats', () => {
  const result = computeSheetKeyValidation(sheet, ['商品名称', '状态']);
  assert.equal(result?.valid, true);
});

test('key validation fails on empty values and duplicate combinations', () => {
  const invalidSheet: SrcSheetInfo = {
    ...sheet,
    preview: [
      { 商品编号: 'P-1', 商品名称: '鼠标', 状态: '上架' },
      { 商品编号: '', 商品名称: '鼠标', 状态: '上架' },
      { 商品编号: 'P-1', 商品名称: '鼠标', 状态: '上架' },
    ],
  };
  const result = computeSheetKeyValidation(invalidSheet, ['商品编号']);
  assert.equal(result?.valid, false);
  assert.equal(result?.hasNulls, true);
  assert.equal(result?.duplicateCount, 1);
});

test('applySheetKeyConfig keeps only headers that exist on the sheet', () => {
  const result = applySheetKeyConfig(sheet, ['商品编号', '不存在字段', '商品编号']);
  assert.deepEqual(result.keyFields, ['商品编号']);
});

test('resolveSingleKeyField only returns a value for exactly one configured field', () => {
  const tables: SrcTableEntry[] = [{
    id: 'product_catalog',
    fileName: 'products.json',
    fileSize: 1,
    fileType: 'json',
    uploadedAt: '',
    dataHash: '',
    sheets: [
      { ...sheet, config: applySheetKeyConfig(sheet, ['商品编号']) },
      { ...sheet, name: '组合键', config: applySheetKeyConfig(sheet, ['商品名称', '状态']) },
    ],
  }];
  assert.equal(resolveSingleKeyField(tables, 'product_catalog', '商品档案'), '商品编号');
  assert.equal(resolveSingleKeyField(tables, 'product_catalog', '组合键'), undefined);
});
