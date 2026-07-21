import { useEffect, useState } from 'react';
import { Button, Drawer, Input, Select, Space, Tag, message } from 'antd';
import { request } from '../services/io/api';
import { getSession } from '../services/io/auth';

type ApprovalNode = {
  id: string;
  type: 'approve' | 'reject' | 'condition' | 'notify';
  label: string;
  assigneeType: 'user' | 'role' | 'expression';
  assigneeValue: string;
  conditionExpression?: string;
  timeoutHours?: number;
  timeoutAction?: 'approve' | 'reject' | 'notify';
  nextNodes: string[];
};

type ApprovalInstance = {
  id: string;
  projectId: string;
  title: string;
  initiatorId: string;
  initiatorName: string;
  currentNodeId: string;
  status: string;
  nodes: ApprovalNode[];
  history: Array<{ nodeId: string; action: string; userId: string; username: string; comment?: string; timestamp: string }>;
  createdAt: string;
};

export function ApprovalWorkflowDesigner({ projectId, open, onClose }: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [instances, setInstances] = useState<ApprovalInstance[]>([]);
  const [selectedInstance, setSelectedInstance] = useState<ApprovalInstance | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [nodes, setNodes] = useState<ApprovalNode[]>([]);
  const [actionComment, setActionComment] = useState('');
  const session = getSession();

  async function refresh() {
    try {
      const data = await request(`/approvals?projectId=${projectId}`);
      setInstances(data);
    } catch {}
  }

  useEffect(() => { if (open) { refresh(); setSelectedInstance(null); setNewTitle(''); setNodes([]); } }, [open, projectId]);

  function addNode(type: ApprovalNode['type']) {
    const id = `node_${Date.now()}`;
    setNodes((prev) => [...prev, {
      id,
      type,
      label: type === 'approve' ? '审批' : type === 'reject' ? '拒绝' : type === 'condition' ? '条件' : '通知',
      assigneeType: 'user',
      assigneeValue: '',
      nextNodes: [],
    }]);
  }

  function updateNode(id: string, patch: Partial<ApprovalNode>) {
    setNodes((prev) => prev.map((n) => n.id === id ? { ...n, ...patch } : n));
  }

  function removeNode(id: string) {
    setNodes((prev) => prev.filter((n) => n.id !== id).map((n) => ({
      ...n,
      nextNodes: n.nextNodes.filter((nextId) => nextId !== id),
    })));
  }

  function linkNodes(fromId: string, toId: string) {
    setNodes((prev) => prev.map((n) => n.id === fromId ? { ...n, nextNodes: [...new Set([...n.nextNodes, toId])] } : n));
  }

  async function createApproval() {
    if (!newTitle.trim() || nodes.length === 0 || !session) return;
    try {
      await request('/approvals', {
        method: 'POST',
        body: JSON.stringify({ projectId, title: newTitle.trim(), nodes }),
      });
      message.success('审批已创建');
      setNewTitle('');
      setNodes([]);
      await refresh();
    } catch (e: any) {
      message.error(e?.message || '创建失败');
    }
  }

  async function act(instanceId: string, action: 'approve' | 'reject') {
    try {
      await request(`/approvals/${instanceId}/action`, {
        method: 'POST',
        body: JSON.stringify({ action, comment: actionComment || undefined }),
      });
      message.success(action === 'approve' ? '已通过' : '已拒绝');
      setActionComment('');
      await refresh();
      setSelectedInstance(null);
    } catch (e: any) {
      message.error(e?.message || '操作失败');
    }
  }

  const statusColors: Record<string, string> = { pending: 'processing', approved: 'success', rejected: 'error', timeout: 'warning', cancelled: 'default' };

  return (
    <Drawer title="审批工作流" open={open} onClose={onClose} width={600}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ background: '#fafafa', borderRadius: 8, padding: 16 }}>
          <h4 style={{ margin: '0 0 8px' }}>发起审批</h4>
          <Space.Compact style={{ width: '100%' }}>
            <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="审批标题" />
            <Button type="primary" onClick={createApproval} disabled={!newTitle.trim() || nodes.length === 0}>发起</Button>
          </Space.Compact>
          <div style={{ marginTop: 8, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <Button size="small" onClick={() => addNode('approve')}>+ 审批节点</Button>
            <Button size="small" onClick={() => addNode('reject')}>+ 拒绝节点</Button>
            <Button size="small" onClick={() => addNode('condition')}>+ 条件节点</Button>
            <Button size="small" onClick={() => addNode('notify')}>+ 通知节点</Button>
          </div>
          {nodes.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {nodes.map((n, i) => (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: '#fff', borderRadius: 4, border: '1px solid #eee' }}>
                  <Tag>{i + 1}</Tag>
                  <Input size="small" value={n.label} onChange={(e) => updateNode(n.id, { label: e.target.value })} style={{ width: 100 }} />
                  <Select size="small" value={n.assigneeType} onChange={(v) => updateNode(n.id, { assigneeType: v })} style={{ width: 80 }} options={[{ value: 'user', label: '用户' }, { value: 'role', label: '角色' }]} />
                  <Input size="small" value={n.assigneeValue} onChange={(e) => updateNode(n.id, { assigneeValue: e.target.value })} placeholder="ID" style={{ width: 100 }} />
                  {i < nodes.length - 1 && <Button size="small" type="link" onClick={() => linkNodes(n.id, nodes[i + 1].id)}>→</Button>}
                  <Button size="small" danger onClick={() => removeNode(n.id)}>×</Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px' }}>审批记录</h4>
          {instances.length === 0 ? (
            <p style={{ color: '#999' }}>暂无审批</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {instances.map((inst) => (
                <div key={inst.id} role="button" tabIndex={0} aria-pressed={selectedInstance?.id === inst.id} style={{ padding: 12, background: 'var(--panel-soft)', borderRadius: 8, cursor: 'pointer' }} onClick={() => setSelectedInstance(inst)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedInstance(inst); } }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{inst.title}</strong>
                    <Tag color={statusColors[inst.status]}>{inst.status}</Tag>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    发起人: {inst.initiatorName} · {new Date(inst.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedInstance && (
          <div style={{ background: '#f0f5ff', borderRadius: 8, padding: 16 }}>
            <h4 style={{ margin: '0 0 8px' }}>{selectedInstance.title}</h4>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              当前节点: {selectedInstance.nodes.find((n) => n.id === selectedInstance.currentNodeId)?.label || '-'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {selectedInstance.history.map((h, i) => (
                <div key={i} style={{ fontSize: 12 }}>
                  <Tag>{h.action}</Tag> {h.username} · {new Date(h.timestamp).toLocaleString()}
                  {h.comment && <span style={{ color: '#666' }}> - {h.comment}</span>}
                </div>
              ))}
            </div>
            {selectedInstance.status === 'pending' && session && (
              <Space>
                <Input size="small" value={actionComment} onChange={(e) => setActionComment(e.target.value)} placeholder="审批意见（可选）" style={{ width: 200 }} />
                <Button size="small" type="primary" onClick={() => act(selectedInstance.id, 'approve')}>通过</Button>
                <Button size="small" danger onClick={() => act(selectedInstance.id, 'reject')}>拒绝</Button>
              </Space>
            )}
          </div>
        )}
      </div>
    </Drawer>
  );
}
