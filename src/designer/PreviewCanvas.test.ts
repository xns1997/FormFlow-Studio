import assert from 'node:assert/strict';
import test from 'node:test';
import type { DesignComponent, SrcTableEntry } from '../project/types';
import { getPreviewInitialValue } from '../services/previewValues';

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
