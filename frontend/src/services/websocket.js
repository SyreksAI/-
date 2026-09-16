// src/services/websocket.js
import { getStoredAuthToken } from '../utils/authToken';

class WebSocketService {
  constructor() {
    this.ws = null;
    this.userId = null;
    this.isConnected = false;
    this.messageHandlers = [];
    this.connectedUsers = new Set();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.reconnectTimer = null;
  }

  connect(userId) {
    if (
      this.ws &&
      this.userId === userId &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    const token = getStoredAuthToken();
    if (!token) {
      console.error('❌ WebSocket: отсутствует token');
      return;
    }

    this.userId = userId;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/${userId}?token=${encodeURIComponent(token)}`;
    console.log(`🔌 Connecting to WebSocket: ${protocol}//${host}/ws/${userId}`);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notify({ type: 'connection_status', status: 'connected' });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'online_users') {
            this.connectedUsers = new Set(data.users.map(String));
          }
          if (data.type === 'user_status' || data.type === 'user_status_changed') {
            const userId = String(data.user_id);
            if (data.status === 'online') {
              this.connectedUsers.add(userId);
            } else {
              this.connectedUsers.delete(userId);
            }
          }
          this.notify(data);
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      };

      this.ws.onclose = () => {
        this.isConnected = false;
        this.connectedUsers.delete(this.userId);
        this.notify({ type: 'connection_status', status: 'disconnected' });
        this.reconnect();
      };

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket error:', error);
        this.isConnected = false;
      };
    } catch (error) {
      console.error('❌ Connection error:', error);
      this.reconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.connectedUsers.delete(this.userId);
  }

  reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    this.reconnectTimer = setTimeout(() => {
      if (this.userId) {
        this.connect(this.userId);
      }
    }, delay);
  }

  sendMessage(data) {
    if (!this.isConnected || !this.ws) {
      return false;
    }

    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      return false;
    }
  }

  requestHistory(chatId, { beforeId, limit = 100 } = {}) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws) {
        reject(new Error('WebSocket не подключён'));
        return;
      }

      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
        fn(value);
      };

      const handler = (data) => {
        if (data.type === 'history_complete' && data.chat_id === chatId) {
          finish(resolve, data.count || 0);
        } else if (data.type === 'error') {
          finish(reject, new Error(data.message || 'Ошибка загрузки истории'));
        }
      };

      this.messageHandlers.push(handler);

      const payload = {
        type: 'get_history',
        chat_id: chatId,
        limit,
      };
      if (beforeId) payload.before_id = beforeId;

      if (!this.sendMessage(payload)) {
        finish(reject, new Error('Не удалось отправить запрос истории'));
        return;
      }

      const timer = setTimeout(() => {
        finish(reject, new Error('Таймаут загрузки истории'));
      }, 15000);
    });
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
    // Новый подписчик мог пропустить onopen — синхронизируем статус
    if (this.isConnected) {
      try {
        handler({ type: 'connection_status', status: 'connected' });
      } catch (error) {
        console.error('Error replaying connection status:', error);
      }
    }
    return () => {
      this.messageHandlers = this.messageHandlers.filter((h) => h !== handler);
    };
  }

  notify(data) {
    this.messageHandlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error('❌ Error in message handler:', error);
      }
    });
  }

  isUserConnected(userId) {
    return this.connectedUsers.has(String(userId));
  }

  getConnectedUsers() {
    return Array.from(this.connectedUsers);
  }
}

const websocketService = new WebSocketService();

if (typeof window !== 'undefined') {
  window.websocketService = websocketService;
}

export default websocketService;
