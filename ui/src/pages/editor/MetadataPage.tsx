import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Table, Typography, message } from 'antd';
import { useProjectStore } from '../../project/store';
import { request } from '../../services/io/api';
type FieldMeta = { description?: string; type?: string; tags?: string[] };
export function MetadataPage() {
  const project = useProjectStore((state) => state.project); const [fields, setFields] = useState<Record<string, FieldMeta>>({});
  const projectId = project?.config.id; const columns = useMemo(() => (project?.srcTable || []).flatMap((table) => table.sheets.flatMap((sheet) => sheet.headers.map((field) => ({ key: `${table.id}:${sheet.name}:${field}`, table: table.fileName, sheet: sheet.name, field })))), [project]);
  useEffect(() => { if (projectId) request(`/metadata/${projectId}`).then((data) => setFields(data.fields || {})).catch(() => {}); }, [projectId]);
  const patch = (key: string, value: FieldMeta) => setFields((current) => ({ ...current, [key]: { ...current[key], ...value } }));
  async function save() { if (!projectId) return; await request(`/metadata/${projectId}`, { method: 'PUT', body: JSON.stringify({ fields }) }); message.success('元数据已保存'); }
  return <div className="governance-page"><div className="governance-title"><Typography.Title level={4}>数据字典</Typography.Title><Button type="primary" onClick={save}>保存</Button></div><Table rowKey="key" dataSource={columns} pagination={{ pageSize: 20 }} columns={[{ title: '数据表', dataIndex: 'table' }, { title: 'Sheet', dataIndex: 'sheet' }, { title: '字段', dataIndex: 'field' }, { title: '类型', render: (_, row) => <Select value={fields[row.key]?.type} onChange={(type) => patch(row.key, { type })} options={['string','number','date','boolean','enum'].map((value) => ({ value }))} style={{ width: 110 }}/> }, { title: '描述', render: (_, row) => <Input value={fields[row.key]?.description} onChange={(event) => patch(row.key, { description: event.target.value })}/> }, { title: '标签', render: (_, row) => <Input value={(fields[row.key]?.tags || []).join(',')} onChange={(event) => patch(row.key, { tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })}/> }]}/></div>;
}
