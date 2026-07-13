import { useEffect, useState, useRef } from 'react';
import { Badge, Button, Drawer, Switch, Tabs, message } from 'antd';
import { request } from '../services/io/api';
import { getSession } from '../services/io/auth';

type Notice = { id: string; title: string; message: string; level: string; read: boolean; createdAt: string };

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notice[]>([]);
  const [settings, setSettings] = useState({ email: false, webhook: false, inApp: true });
  const wsRef = useRef<WebSocket | null>(null);

  async function refresh() { try { setItems(await request('/notifications')); } catch {} }

  useEffect(() => {
    refresh();
    const session = getSession();
    if (!session) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/ws/notifications`);
    wsRef.current = ws;

    ws.onopen = () => { ws.send(JSON.stringify({ type: 'auth', userId: session.user.id })); };
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'notification' && msg.data) {
          setItems((prev) => [msg.data, ...prev].slice(0, 200));
        }
      } catch {}
    };
    ws.onerror = () => {};
    ws.onclose = () => { wsRef.current = null; };

    return () => { ws.close(); };
  }, []);

  async function mark(item: Notice) {
    await request(`/notifications/${item.id}/read`, { method: 'PATCH', body: JSON.stringify({ read: true }) });
    setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, read: true } : n));
  }

  async function save(next: typeof settings) {
    setSettings(next);
    await request('/notifications/settings/current', { method: 'PUT', body: JSON.stringify(next) });
    message.success('通知设置已保存');
  }

  const unreadCount = items.filter((item) => !item.read).length;

  return <>
    <Badge count={unreadCount} size="small"><Button type="text" onClick={() => { setOpen(true); refresh(); }}>通知</Button></Badge>
    <Drawer title="通知中心" open={open} onClose={() => setOpen(false)} size="large">
      <Tabs items={[
        { key: 'list', label: '通知', children: <div className="notification-list">{items.map((item) => <button type="button" key={item.id} onClick={() => mark(item)} className={`notification-item ${item.read ? '' : 'notification-unread'}`}><strong>{item.title}</strong><span>{item.message} · {new Date(item.createdAt).toLocaleString()}</span></button>)}</div> },
        { key: 'settings', label: '设置', children: <div className="notification-settings"><label>站内信 <Switch checked={settings.inApp} onChange={(inApp) => save({ ...settings, inApp })}/></label><label>邮件 <Switch checked={settings.email} onChange={(email) => save({ ...settings, email })}/></label><label>Webhook <Switch checked={settings.webhook} onChange={(webhook) => save({ ...settings, webhook })}/></label></div> },
      ]}/>
    </Drawer>
  </>;
}
