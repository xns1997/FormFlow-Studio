import { useEffect, useState } from 'react';
import { Button, Drawer, Input } from 'antd';
import { request } from '../services/io/api';
import { getSession } from '../services/io/auth';

type Comment = {
  id: string;
  projectId: string;
  targetType: string;
  targetId: string;
  userId: string;
  username: string;
  content: string;
  parentId?: string;
  createdAt: string;
  updatedAt?: string;
};

export function CommentThread({ projectId, targetType, targetId, open, onClose }: {
  projectId: string;
  targetType: 'node' | 'cell' | 'workflow';
  targetId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const session = getSession();

  async function refresh() {
    try {
      const data = await request(`/comments?projectId=${projectId}&targetType=${targetType}&targetId=${targetId}`);
      setComments(data);
    } catch {}
  }

  useEffect(() => { if (open) { refresh(); setNewComment(''); setReplyTo(null); } }, [open, projectId, targetType, targetId]);

  async function submit() {
    if (!newComment.trim() || !session) return;
    try {
      await request('/comments', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          targetType,
          targetId,
          content: newComment.trim(),
          parentId: replyTo || undefined,
        }),
      });
      setNewComment('');
      setReplyTo(null);
      await refresh();
    } catch {}
  }

  async function remove(id: string) {
    try {
      await request(`/comments/${id}`, { method: 'DELETE' });
      await refresh();
    } catch {}
  }

  const rootComments = comments.filter((c) => !c.parentId);
  const replies = (parentId: string) => comments.filter((c) => c.parentId === parentId);

  return (
    <Drawer title="评论" open={open} onClose={onClose} width={400}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {rootComments.length === 0 && <p style={{ color: '#999' }}>暂无评论</p>}
        {rootComments.map((c) => (
          <div key={c.id} style={{ background: '#fafafa', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <strong style={{ fontSize: 13 }}>{c.username}</strong>
              <span style={{ fontSize: 12, color: '#999' }}>{new Date(c.createdAt).toLocaleString()}</span>
            </div>
            <p style={{ margin: 0, fontSize: 14 }}>{c.content}</p>
            <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
              <Button size="small" type="link" onClick={() => setReplyTo(c.id)}>回复</Button>
              {session?.user.id === c.userId && (
                <Button size="small" type="link" danger onClick={() => remove(c.id)}>删除</Button>
              )}
            </div>
            {replies(c.id).map((r) => (
              <div key={r.id} style={{ marginLeft: 16, marginTop: 8, padding: 8, background: '#f0f0f0', borderRadius: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <strong style={{ fontSize: 12 }}>{r.username}</strong>
                  <span style={{ fontSize: 11, color: '#999' }}>{new Date(r.createdAt).toLocaleString()}</span>
                </div>
                <p style={{ margin: 0, fontSize: 13 }}>{r.content}</p>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 16, borderTop: '1px solid #eee', paddingTop: 12 }}>
        {replyTo && (
          <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
            回复评论 <Button size="small" type="link" onClick={() => setReplyTo(null)}>取消</Button>
          </div>
        )}
        <Input.TextArea
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          placeholder="添加评论..."
          rows={3}
          disabled={!session}
        />
        <Button
          type="primary"
          style={{ marginTop: 8, width: '100%' }}
          onClick={submit}
          disabled={!newComment.trim() || !session}
        >
          发送
        </Button>
      </div>
    </Drawer>
  );
}
