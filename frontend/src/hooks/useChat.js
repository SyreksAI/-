// frontend/src/hooks/useChat.js
import { useState, useEffect, useRef, useCallback } from 'react';
import { get } from '../utils/api';
import websocketService from '../services/websocket';

export function useChat(user, selectedChat, setMessages) {
  const [isConnected, setIsConnected] = useState(false);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  /**
   * Загрузка истории чата
   */
  const loadChatHistory = useCallback(async (chatId) => {
    if (!user?.id || chatId === 'general') return;
    try {
      const data = await get(`/api/messages/history/${chatId}`, {
        'X-User-ID': String(user.id)
      });
      
      if (data.length > 0) {
        const normalized = data.map(msg => ({
          id: msg.id,
          chatId: msg.chat_id || msg.chatId,
          userId: msg.user_id || msg.userId,
          username: msg.username,
          name: msg.user_name || msg.name,
          text: msg.text,
          isSystem: msg.is_system || msg.isSystem || false,
          timestamp: msg.timestamp,
          files: msg.files || []
        }));
        setMessages(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          return [...prev, ...normalized.filter(msg => !existingIds.has(msg.id))];
        });
      }
    } catch (error) {
      console.error('Error loading chat history:', error);
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
    // Новое сообщение или история
    if (data.type === 'new_message' || data.type === 'history') {
      const rawMsg = data.message;
      const msg = {
        id: rawMsg.id,
        chatId: rawMsg.chat_id || rawMsg.chatId || 'general',
        userId: rawMsg.user_id || rawMsg.userId,
        username: rawMsg.username,
        name: rawMsg.name || rawMsg.user_name,
        text: rawMsg.text,
        isSystem: rawMsg.is_system || rawMsg.isSystem || false,
        timestamp: rawMsg.timestamp,
        files: rawMsg.files || []
      };
      
      setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);

      if (data.type === 'new_message' && msg.chatId !== selectedChat && msg.userId !== user?.id) {
        setUnreadCounts(prev => ({ ...prev, [msg.chatId]: (prev[msg.chatId] || 0) + 1 }));
        if (!msg.isSystem && addNotification) {
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
      setMessages(prev => prev.map(m => 
        m.id === data.message_id 
          ? { ...m, text: data.new_text, edited: true }
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
    
    // Ошибки
    if (data.type === 'error') {
      if (addNotification) {
        addNotification(`❌ ${data.message}`, 'error', 5000);
      }
    }
  }, [selectedChat, user, setMessages]);

  // Авто-скролл при новых сообщениях
  useEffect(() => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [setMessages]);

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
    loadChatHistory,
    sendMessage,
    editMessage,
    deleteMessage,
    sendTyping,
    handleNewMessage,
    messagesEndRef
  };
}