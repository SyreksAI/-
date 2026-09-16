// frontend/src/hooks/useChat.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { get } from '../utils/api';
import websocketService from '../services/websocket';
import { mergeChatMessages, normalizeChatMessage, upsertLiveMessage } from '../utils/chatMessage';

export function useChat(user, selectedChat, setMessages) {
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  /**
   * Загрузка истории чата
   */
  const loadChatHistory = useCallback(async (chatId, { beforeId, limit = 100 } = {}) => {
    if (!user?.id || !chatId) return 0;

    if (websocketService.isConnected) {
      try {
        return await websocketService.requestHistory(chatId, { beforeId, limit });
      } catch (error) {
        if (error.message === 'Доступ запрещен') {
          return 0;
        }
        console.warn('WS history fallback to REST:', error.message);
      }
    }

    try {
      const params = new URLSearchParams({ limit: String(limit) });
      if (beforeId) params.set('before_id', String(beforeId));
      const data = await get(`/api/messages/history/${chatId}?${params}`);

      if (data.length > 0) {
        const normalized = data.map((msg) => normalizeChatMessage({
          ...msg,
          user_name: msg.user_name || msg.name,
        }));
        setMessages((prev) => mergeChatMessages(prev, normalized));
      }
      return data.length;
    } catch (error) {
      console.error('Error loading chat history:', error);
      return 0;
    }
  }, [user, setMessages]);

  /**
   * Отправка сообщения
   */
  const sendMessage = useCallback((text, files = []) => {
    if (!user || !isConnected) return false;
    
    const messageData = {
      type: 'message',
      text: text.trim(),
      chat_id: selectedChat
    };
    
    if (files.length > 0) {
      messageData.files = files;
    }
    
    return websocketService.sendMessage(messageData);
  }, [user, isConnected, selectedChat]);

  /**
   * Редактирование сообщения
   */
  const editMessage = useCallback((messageId, newText) => {
    if (!user || !isConnected) return false;
    
    const messageData = {
      type: 'edit_message',
      message_id: messageId,
      text: newText.trim(),
      chat_id: selectedChat
    };
    
    return websocketService.sendMessage(messageData);
  }, [user, isConnected, selectedChat]);

  /**
   * Удаление сообщения
   */
  const deleteMessage = useCallback((messageId) => {
    if (!user || !isConnected) return false;
    
    const messageData = {
      type: 'delete_message',
      message_id: messageId,
      chat_id: selectedChat
    };
    
    return websocketService.sendMessage(messageData);
  }, [user, isConnected, selectedChat]);

  /**
   * Отправка статуса "печатает..." с дебаунсом
   */
  const sendTyping = useCallback(() => {
    if (!user || !isConnected) return;
    
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    
    const messageData = {
      type: 'typing',
      chat_id: selectedChat
    };
    websocketService.sendMessage(messageData);
    
    typingTimeoutRef.current = setTimeout(() => {
      typingTimeoutRef.current = null;
    }, 3000);
  }, [user, isConnected, selectedChat]);

  /**
   * Обработка входящих сообщений
   */
  const handleNewMessage = useCallback((data, addNotification) => {
    if (data.type === 'history_batch') {
      const incoming = (data.messages || []).map((item) => normalizeChatMessage(item));
      if (incoming.length > 0) {
        setMessages((prev) => mergeChatMessages(prev, incoming));
      }
      return;
    }

    // Новое сообщение или история
    if (data.type === 'new_message' || data.type === 'history') {
      const msg = normalizeChatMessage(data.message);

      setMessages((prev) => (
        data.type === 'new_message'
          ? upsertLiveMessage(prev, msg)
          : mergeChatMessages(prev, [msg])
      ));

      if (
        data.type === 'new_message'
        && !msg.isSystem
        && msg.chatId !== selectedChat
        && msg.userId !== user?.id
      ) {
        setUnreadCounts(prev => ({ ...prev, [msg.chatId]: (prev[msg.chatId] || 0) + 1 }));
        if (addNotification) {
          addNotification(`💬 ${msg.username}: ${msg.text.substring(0, 30)}...`, 'message', 5000);
        }
      }
    }
    
    // Сообщение удалено
    if (data.type === 'message_deleted') {
      setMessages(prev => prev.filter(m => m.id !== data.message_id));
      if (addNotification) {
        addNotification('🗑️ Сообщение удалено', 'info', 2000);
      }
    }
    
    // Сообщение отредактировано
    if (data.type === 'message_edited') {
      const edited = data.message || {};
      const messageId = edited.id ?? data.message_id;
      const newText = edited.text ?? data.new_text;
      if (!messageId) return;

      setMessages(prev => prev.map(m =>
        m.id === messageId
          ? { ...m, text: newText, edited: true }
          : m
      ));
      if (addNotification) {
        addNotification('✏️ Сообщение отредактировано', 'info', 2000);
      }
    }
    
    // Статус "печатает..."
    if (data.type === 'typing') {
      setTypingUsers(prev => ({
        ...prev,
        [data.user_id]: Date.now()
      }));
    }
    
    // Статус подключения
    if (data.type === 'connection_status') {
      setIsConnected(data.status === 'connected');
    }
    
    // Уведомления
    if (data.type === 'notification') {
      if (data.notification_type === 'subscription_request') {
        const { follower_name, follower_username } = data.data;
        const name = follower_name || follower_username || 'Пользователь';
        if (addNotification) {
          addNotification(`🔔 ${name} хочет подписаться на вас!`, 'subscription', 7000);
        }
      }
    }
    
    // Ошибки (кроме ожидаемого отказа доступа к истории чата)
    if (data.type === 'error' && data.message !== 'Доступ запрещен') {
      if (addNotification) {
        addNotification(`❌ ${data.message}`, 'error', 5000);
      }
    }
  }, [selectedChat, user, setMessages]);

  // Очистка старых статусов "печатает..."
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setTypingUsers(prev => {
        const updated = {};
        Object.entries(prev).forEach(([userId, timestamp]) => {
          if (now - timestamp < 3000) {
            updated[userId] = timestamp;
          }
        });
        return updated;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);

  // Очистка таймаута при размонтировании
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    setIsConnected,
    unreadCounts,
    setUnreadCounts,
    typingUsers,
    setTypingUsers,
    loadChatHistory,
    sendMessage,
    editMessage,
    deleteMessage,
    sendTyping,
    handleNewMessage,
    messagesEndRef
  };
}