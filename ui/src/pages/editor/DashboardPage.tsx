import { useEffect, useMemo, useState } from 'react';
import { Button, Select, Space } from 'antd';
import type { Layout } from 'react-grid-layout';
import { DashboardGrid, type DashboardWidget } from '../../components/DashboardGrid';
import { useProjectStore } from '../../project/store';
import { dashboardInteractions } from '../../services/display/dashboardInteractions';
const types = ['sankey', 'heatmap', 'radar', 'funnel', 'map', 'tree'] as const;
export function DashboardPage() {
  const project = useProjectStore((state) => state.project); const table = project?.srcTable[0]; const sheet = table?.sheets[0];
  const rows = sheet?.preview || []; const headers = sheet?.headers || [];
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]); const [type, setType] = useState<(typeof types)[number]>('funnel');
  const [layout, setLayout] = useState<Layout>([]);
  const storageKey = `formflow.dashboard.${project?.config.id || 'unknown'}`;
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(storageKey) || 'null'); if (saved) { setWidgets(saved.widgets || []); setLayout(saved.layout || []); } } catch { /* ignore invalid local dashboard */ }
  }, [storageKey]);
  useEffect(() => { if (project?.config.id) localStorage.setItem(storageKey, JSON.stringify({ widgets, layout })); }, [storageKey, widgets, layout, project?.config.id]);
  const defaults = useMemo(() => ({ dimension: headers[0] || '', metric: headers.find((header) => rows.some((row) => typeof row[header] === 'number')) || headers[1] || headers[0] || '' }), [headers, rows]);
  function add() { const id = `widget_${Date.now()}`; setWidgets((items) => [...items, { id, title: `${type} · ${defaults.dimension}`, type, ...defaults }]); setLayout((items) => [...items, { i: id, x: items.length % 2 * 6, y: Infinity, w: 6, h: 4 }]); }
  return <div className="dashboard-page"><Space className="dashboard-toolbar"><Select value={type} onChange={setType} options={types.map((value) => ({ value, label: value }))}/><Button type="primary" onClick={add} disabled={!rows.length}>添加图表</Button><Button onClick={() => dashboardInteractions.clear()}>清除筛选</Button></Space><DashboardGrid widgets={widgets} rows={rows} layout={layout} onLayoutChange={setLayout}/></div>;
}
