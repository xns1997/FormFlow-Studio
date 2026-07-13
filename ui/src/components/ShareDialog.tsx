import { useEffect, useState } from 'react';
import { Button, Drawer, Input, Select, Space, Tag, message } from 'antd';
import { request } from '../services/io/api';

type Member = { userId: string; username: string; role: 'owner' | 'member'; grants: string[] };
type User = { id: string; username: string; role: string };

const GRANT_OPTIONS = [
  { value: 'view', label: '查看' },
  { value: 'edit', label: '编辑' },
  { value: 'run', label: '运行' },
  { value: 'manage', label: '管理' },
];

export function ShareDialog({ projectId, projectName, open, onClose }: {
  projectId: string;
  projectName: string;
  open: boolean;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedGrants, setSelectedGrants] = useState<string[]>(['view']);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    try {
      const [memberList, userList] = await Promise.all([
        request(`/projects/${projectId}/members`),
        request('/users').catch(() => []),
      ]);
      setMembers(memberList);
      setUsers(userList);
    } catch {}
  }

  useEffect(() => { if (open) { refresh(); setSelectedUserId(''); setSelectedGrants(['view']); } }, [open, projectId]);

  async function invite() {
    if (!selectedUserId) { message.warning('请选择用户'); return; }
    setLoading(true);
    try {
      await request(`/projects/${projectId}/invite`, {
        method: 'POST',
        body: JSON.stringify({ userId: selectedUserId, grants: selectedGrants }),
      });
      message.success('邀请已发送');
      setSelectedUserId('');
      setSelectedGrants(['view']);
      await refresh();
    } catch (e: any) {
      message.error(e?.message || '邀请失败');
    } finally { setLoading(false); }
  }

  async function removeMember(userId: string) {
    try {
      await request(`/projects/${projectId}/members/${userId}`, { method: 'DELETE' });
      message.success('已移除成员');
      await refresh();
    } catch (e: any) {
      message.error(e?.message || '移除失败');
    }
  }

  const availableUsers = users.filter((u) => !members.some((m) => m.userId === u.id));

  return (
    <Drawer title={`共享设置 · ${projectName}`} open={open} onClose={onClose} width={480}>
      <div style={{ marginBottom: 16 }}>
        <Space.Compact style={{ width: '100%' }}>
          <Select
            style={{ flex: 1 }}
            placeholder="选择要邀请的用户"
            value={selectedUserId || undefined}
            onChange={setSelectedUserId}
            options={availableUsers.map((u) => ({ value: u.id, label: u.username }))}
          />
          <Select
            mode="multiple"
            style={{ minWidth: 200 }}
            placeholder="权限"
            value={selectedGrants}
            onChange={setSelectedGrants}
            options={GRANT_OPTIONS}
            maxTagCount={2}
          />
          <Button type="primary" onClick={invite} loading={loading} disabled={!selectedUserId}>
            邀请
          </Button>
        </Space.Compact>
      </div>

      <div>
        <h4 style={{ marginBottom: 8 }}>当前成员</h4>
        {members.length === 0 ? (
          <p style={{ color: '#999' }}>暂无成员</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {members.map((m) => (
              <div key={m.userId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#fafafa', borderRadius: 6 }}>
                <div>
                  <strong>{m.username}</strong>
                  {m.role === 'owner' && <Tag color="blue" style={{ marginLeft: 8 }}>所有者</Tag>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {m.grants.map((g) => <Tag key={g}>{GRANT_OPTIONS.find((o) => o.value === g)?.label || g}</Tag>)}
                  {m.role !== 'owner' && (
                    <Button size="small" danger onClick={() => removeMember(m.userId)}>移除</Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Drawer>
  );
}
