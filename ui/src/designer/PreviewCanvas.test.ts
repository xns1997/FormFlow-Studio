import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent, SrcTableEntry } from '../project/types';
import { getPreviewInitialValue, getPreviewInitializationSignature } from '../services/display/previewValues';

const component: DesignComponent = {
  id: 'name', type: 'input', x: 0, y: 0, width: 100, height: 40,
  props: {
    defaultValue: '默认名',
    tableBinding: { tableId: 'employee', sheetName: '员工档案', keyField: '员工编号', keyValue: 'E-1', column: '姓名' },
  },
};

const tables = [{
  id: 'employee', fileName: 'employee.json', fileSize: 1, fileType: 'json', uploadedAt: '', dataHash: '',
  sheets: [{
    name: '员工档案', rowCount: 1, colCount: 2, headers: ['员工编号', '姓名'],
    columns: [], preview: [{ 员工编号: 'E-1', 姓名: '持久化姓名' }],
  }],
}] satisfies SrcTableEntry[];

test('preview initial values prefer the persisted metadata row over design defaults', () => {
  assert.equal(getPreviewInitialValue(component, tables), '持久化姓名');
  assert.equal(getPreviewInitialValue({ ...component, props: { defaultValue: '回退值' } }, tables), '回退值');
});

test('preview initial values can fall back to sheet single-key config when binding omits keyField', () => {
  const keyDrivenComponent: DesignComponent = {
    ...component,
    props: {
      defaultValue: '默认名',
      tableBinding: { tableId: 'employee', sheetName: '员工档案', keyValue: 'E-1', column: '姓名' },
    },
  };
  const keyedTables = [{
    ...tables[0],
    sheets: [{
      ...tables[0].sheets[0],
      config: {
        id: 'employee:员工档案',
        tableName: 'employee / 员工档案',
        keyFields: ['员工编号'],
        columnWidths: {},
        frozenColumns: 0,
        frozenRows: 0,
        defaultSort: null,
        hiddenColumns: [],
        lockedColumns: [],
        columnDescriptions: {},
        columnTags: {},
        headerHeight: 36,
        rowHeight: 28,
        alternateRowColor: true,
        showGridLines: true,
        autoFitColumns: true,
        filterEnabled: true,
        sortEnabled: true,
        groupByColumn: null,
      },
    }],
  }] satisfies SrcTableEntry[];
  assert.equal(getPreviewInitialValue(keyDrivenComponent, keyedTables), '持久化姓名');
});

test('preview initial values use structured defaults for new control types', () => {
  assert.deepEqual(getPreviewInitialValue({
    id: 'tags', type: 'tagInput', x: 0, y: 0, width: 100, height: 40, props: {},
  }, tables), []);
  assert.deepEqual(getPreviewInitialValue({
    id: 'range', type: 'dateRange', x: 0, y: 0, width: 100, height: 40, props: {},
  }, tables), { start: '', end: '' });
  assert.deepEqual(getPreviewInitialValue({
    id: 'files', type: 'upload', x: 0, y: 0, width: 100, height: 40, props: {},
  }, tables), []);
});

test('preview passes text control content into runtime values', () => {
  const text: DesignComponent = {
    id: 'summary', type: 'text', x: 0, y: 0, width: 180, height: 36,
    fieldBinding: 'summary',
    props: { content: '等待生成结果' },
  };

  assert.equal(getPreviewInitialValue(text, tables), '等待生成结果');
  assert.notEqual(
    getPreviewInitializationSignature(text),
    getPreviewInitializationSignature({ ...text, props: { ...text.props, content: '生成完成' } }),
  );
});
