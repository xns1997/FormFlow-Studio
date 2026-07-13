import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'http';
import type { Notification } from './notification';

type WsClient = { ws: WebSocket; userId?: string };

const clients = new Set<WsClient>();

export function initNotificationWs(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws/notifications' });

  wss.on('connection', (ws) => {
    const client: WsClient = { ws };
    clients.add(client);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.type === 'auth' && msg.userId) client.userId = msg.userId;
      } catch {}
    });

    ws.on('close', () => { clients.delete(client); });
    ws.on('error', () => { clients.delete(client); });
  });
}

export function broadcastNotification(notification: Notification) {
  const payload = JSON.stringify({ type: 'notification', data: notification });
  for (const client of clients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (notification.userId && client.userId && client.userId !== notification.userId) continue;
    client.ws.send(payload);
  }
}
