// src/services/websocket.js

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
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('WebSocket already connected');
      return;
    }

    this.userId = userId;
    
    // ✅ ИСПРАВЛЕНО: используем порт 8000 (как в FastAPI)
    // Если ваш сервер на 8080, оставьте 8080, но убедитесь что сервер слушает этот порт
    const WS_PORT = process.env.REACT_APP_WS_PORT || 8000;
    const wsUrl = `ws://localhost:${WS_PORT}/ws/${userId}`;
    console.log(`🔌 Connecting to WebSocket: ${wsUrl}`);

    try {
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('✅ WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.notify({
          type: 'connection_status',
          status: 'connected'
        });
        // Отправляем приветственное сообщение для получения истории
        this.sendMessage({
          type: 'get_history',
          chat_id: 'general'
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📩 Received:', data);
          
          if (data.type === 'online_users') {
            this.connectedUsers = new Set(data.users);
          }
          
          if (data.type === 'user_status') {
            if (data.status === 'online') {
              this.connectedUsers.add(data.user_id);
            } else {
              this.connectedUsers.delete(data.user_id);
            }
          }
          
          this.notify(data);
        } catch (error) {
          console.error('❌ Error parsing message:', error);
        }
      };

      this.ws.onclose = () => {
        console.log('❌ WebSocket disconnected');
        this.isConnected = false;
        this.connectedUsers.delete(this.userId);
        this.notify({
          type: 'connection_status',
          status: 'disconnected'
        });
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
      console.log('❌ Max reconnect attempts reached');
      return;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    console.log(`🔄 Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      if (this.userId) {
        this.connect(this.userId);
      }
    }, delay);
  }

  sendMessage(data) {
    if (!this.isConnected || !this.ws) {
      console.error('❌ WebSocket not connected');
      return false;
    }

    try {
      this.ws.send(JSON.stringify(data));
      console.log('📤 Sending message:', data);
      return true;
    } catch (error) {
      console.error('❌ Error sending message:', error);
      return false;
    }
  }

  onMessage(handler) {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  notify(data) {
    this.messageHandlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error('❌ Error in message handler:', error);
      }
    });
  }

  isConnected() {
    return this.isConnected;
  }

  isUserConnected(userId) {
    return this.connectedUsers.has(userId);
  }

  getConnectedUsers() {
    return Array.from(this.connectedUsers);
  }
}

const websocketService = new WebSocketService();

if (typeof window !== 'undefined') {
  window.websocketService = websocketService;
  console.log('✅ websocketService добавлен в window');
}

export default websocketService;