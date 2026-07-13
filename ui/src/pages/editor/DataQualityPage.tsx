import { useMemo } from 'react';
import { Card, Col, Progress, Row, Table, Typography } from 'antd';
import { useProjectStore } from '../../project/store';
export function DataQualityPage() {
  const project = useProjectStore((state) => state.project); const rows = project?.srcTable[0]?.sheets[0]?.preview || []; const headers = project?.srcTable[0]?.sheets[0]?.headers || [];
  const report = useMemo(() => {
    const issues: Array<{ key: string; field: string; type: string; count: number }> = [];
    headers.forEach((field) => { const empty = rows.filter((row) => row[field] == null || row[field] === '').length; if (empty) issues.push({ key: `${field}:required`, field, type: '空值', count: empty }); const values = rows.map((row) => String(row[field] ?? '')); const duplicate = values.length - new Set(values).size; if (duplicate) issues.push({ key: `${field}:unique`, field, type: '重复值', count: duplicate }); });
    const totalChecks = Math.max(1, rows.length * headers.length * 2); return { issues, score: Math.max(0, Math.round((1 - issues.reduce((sum, issue) => sum + issue.count, 0) / totalChecks) * 10000) / 100) };
  }, [rows, headers]);
  const trend = useMemo(() => { const key = `formflow.quality.${project?.config.id}`; let values: number[] = []; try { values = JSON.parse(localStorage.getItem(key) || '[]'); } catch {} values = [...values.slice(-11), report.score]; localStorage.setItem(key, JSON.stringify(values)); return values; }, [project?.config.id, report.score]);
  return <div className="governance-page"><Typography.Title level={4}>数据质量</Typography.Title><Row gutter={16}><Col span={8}><Card><Progress type="dashboard" percent={report.score}/></Card></Col><Col span={16}><Card title="质量趋势"><div className="quality-trend">{trend.map((value, index) => <i key={index} style={{ height: `${Math.max(3, value)}%` }} title={String(value)}/>)}</div></Card></Col></Row><Card title="问题分布"><Table rowKey="key" dataSource={report.issues} pagination={false} columns={[{ title: '字段', dataIndex: 'field' }, { title: '问题', dataIndex: 'type' }, { title: '数量', dataIndex: 'count' }]}/></Card></div>;
}
