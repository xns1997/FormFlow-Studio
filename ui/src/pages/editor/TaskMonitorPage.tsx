import { useEffect, useState } from 'react';
import { Button, Drawer, Progress, Space, Table, Tag, Typography } from 'antd';
import { taskApi } from '../../services/io/api';
type Task = { id: string; name: string; state: string; progress: number; createdAt: string; startedAt?: string; finishedAt?: string; error?: string; logs: { at: string; message: string }[] };
const colors: Record<string, string> = { queued: 'default', running: 'processing', completed: 'success', failed: 'error', cancelled: 'warning' };
export function TaskMonitorPage() {
  const [tasks, setTasks] = useState<Task[]>([]); const [selected, setSelected] = useState<Task>();
  async function refresh() { try { setTasks(await taskApi.list()); } catch { /* server may be offline */ } }
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 2000); return () => clearInterval(timer); }, []);
  return <div className="task-monitor-page"><Space className="task-monitor-toolbar"><Typography.Title level={4}>任务执行</Typography.Title><Button onClick={refresh}>刷新</Button></Space>
    <Table rowKey="id" dataSource={tasks} pagination={{ pageSize: 20 }} onRow={(task) => ({ onClick: () => setSelected(task) })} columns={[
      { title: '任务', dataIndex: 'name' }, { title: '状态', dataIndex: 'state', render: (state) => <Tag color={colors[state]}>{state}</Tag> },
      { title: '进度', dataIndex: 'progress', render: (value) => <Progress percent={value} size="small" /> },
      { title: '创建时间', dataIndex: 'createdAt', render: (value) => new Date(value).toLocaleString() },
      { title: '耗时', render: (_, task) => task.startedAt ? `${Math.max(0, new Date(task.finishedAt || Date.now()).getTime() - new Date(task.startedAt).getTime())} ms` : '-' },
      { title: '错误', dataIndex: 'error', ellipsis: true },
    ]} />
    <Drawer title={selected?.name} open={Boolean(selected)} onClose={() => setSelected(undefined)} size="large">{selected?.logs.map((entry, index) => <div key={`${entry.at}-${index}`} className="task-log"><time>{new Date(entry.at).toLocaleTimeString()}</time><span>{entry.message}</span></div>)}</Drawer>
  </div>;
}
