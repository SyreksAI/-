// frontend/src/pages/Forum.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import websocketService from '../services/websocket';
import NotificationToast from '../components/NotificationToast';
import { post, get, put, del } from '../utils/api';
import ImageModal from '../components/ImageModal';
import { formatTime, formatDate, formatFileSize, getFileIcon, getFileColor } from '../utils/helpers';
import { useFiles } from '../hooks/useFiles';
import { useChat } from '../hooks/useChat';
import { MESSAGES } from '../utils/messages';

function Forum() {
  const navigate = useNavigate();

  // ===== ОСНОВНЫЕ СОСТОЯНИЯ =====
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState([]);
  const [selectedChat, setSelectedChat] = useState('general');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResultsGroups, setSearchResultsGroups] = useState([]);

  // ===== СОСТОЯНИЯ ПОДПИСОК =====
  const [subscriptionStatuses, setSubscriptionStatuses] = useState({});
  const [pendingSubscriptions, setPendingSubscriptions] = useState([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mutualSubscriptions, setMutualSubscriptions] = useState({});

  // ===== СОСТОЯНИЯ ЧАТОВ =====
  const [pinnedChats, setPinnedChats] = useState([]);
  const [customChatNames, setCustomChatNames] = useState({});
  const [contextMenu, setContextMenu] = useState(null);
  const [messageContextMenu, setMessageContextMenu] = useState(null);

  // ===== МОДАЛЬНЫЕ ОКНА =====
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalFiles, setImageModalFiles] = useState([]);
  const [imageModalIndex, setImageModalIndex] = useState(0);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [searchUser, setSearchUser] = useState('');
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedGroupMembers, setSelectedGroupMembers] = useState([]);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [groupInfoTab, setGroupInfoTab] = useState('members');
  const [showRenameModal, setShowRenameModal] = useState(null);
  const [newChatName, setNewChatName] = useState('');
  const [actionMenuPos, setActionMenuPos] = useState(null);

  // ===== РЕДАКТИРОВАНИЕ =====
  const [editingMessage, setEditingMessage] = useState(null);

  // ===== ПОДЕЛИТЬСЯ =====
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareMessage, setShareMessage] = useState(null);
  const [selectedContacts, setSelectedContacts] = useState([]);
  const [shareSearchQuery, setShareSearchQuery] = useState('');
  const [shareActiveTab, setShareActiveTab] = useState('all');

  // ===== ОТВЕТ НА СООБЩЕНИЕ =====
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState(null);

  // ===== УВЕДОМЛЕНИЯ =====
  const [notifications, setNotifications] = useState([]);
  const [showBrowserPermission, setShowBrowserPermission] = useState(false);

  // ===== REFS =====
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const addButtonRef = useRef(null);
  const messageListRef = useRef(null);

  // ===== ХУКИ =====
  const {
    selectedFiles,
    uploadProgress,
    isUploading,
    filePreviews,
    getFileUrl,
    uploadFiles,
    handleFileSelect,
    removeFile,
    clearFiles
  } = useFiles(user, selectedChat);

  const {
    isConnected,
    setIsConnected,
    unreadCounts,
    setUnreadCounts,
    typingUsers,
    loadChatHistory,
    sendMessage: chatSendMessage,
    editMessage,
    deleteMessage,
    sendTyping,
    handleNewMessage,
    messagesEndRef
  } = useChat(user, selectedChat, setMessages);

  // ===== УВЕДОМЛЕНИЯ =====
  const addNotification = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, message, type, duration }]);
    setTimeout(() => setNotifications(prev => prev.filter(n => n.id !== id)), duration);
  }, []);

  // ===== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ =====
  const loadAllUsers = useCallback(async () => {
    try {
      const data = await get('/api/users/');
      setUsers(data);
      localStorage.setItem('users', JSON.stringify(data));
    } catch (error) {
      console.error('Error loading users:', error);
      addNotification(MESSAGES.LOAD_ERROR, 'error');
    }
  }, [addNotification]);

  // ===== ПОДПИСКИ =====
  const loadPendingSubscriptions = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const data = await get(`/api/users/${userId}/pending-subscriptions`, {
        'X-User-ID': String(userId)
      });
      setPendingSubscriptions(Array.isArray(data) ? data : []);
      setNotificationCount(data.length);
    } catch (error) {
      console.error('Error loading pending subscriptions:', error);
    }
  }, []);

  const loadAllSubscriptionStatuses = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const data = await get(`/api/users/${userId}/subscriptions`, {
        'X-User-ID': String(userId)
      });

      const statuses = {};
      data.forEach(sub => { statuses[sub.following_id] = sub.status; });
      setSubscriptionStatuses(statuses);
      localStorage.setItem('subscriptionStatuses', JSON.stringify(statuses));
    } catch (error) {
      console.error('Error loading subscription statuses:', error);
    }
  }, []);

  const checkSubscriptionStatus = useCallback(async (targetUserId, currentUserId) => {
    const uid = currentUserId || user?.id;
    if (!uid || !targetUserId || subscriptionStatuses[targetUserId] === 'approved') return;
    try {
      const data = await get(`/api/users/subscriptions/status/${targetUserId}`, {
        'X-User-ID': String(uid)
      });

      setSubscriptionStatuses(prev => {
        const updated = { ...prev, [targetUserId]: data.status };
        localStorage.setItem('subscriptionStatuses', JSON.stringify(updated));
        return updated;
      });
    } catch (error) {
      console.error('Status check error:', error);
    }
  }, [user, subscriptionStatuses]);

  const handleSubscribe = useCallback(async (targetUserId) => {
    if (!user?.id) return;
    
    // Проверяем текущий статус
    const currentStatus = subscriptionStatuses[targetUserId] || 'none';
    
    if (currentStatus === 'approved') {
      addNotification('Вы уже подписаны на этого пользователя', 'info', 3000);
      return;
    }
    
    if (currentStatus === 'pending') {
      addNotification('Запрос на подписку уже отправлен', 'info', 3000);
      return;
    }

    try {
      await post('/api/users/subscribe',
        { following_id: targetUserId },
        { 'X-User-ID': String(user.id) }
      );

      setSubscriptionStatuses(prev => ({ ...prev, [targetUserId]: 'pending' }));

      const foundUser = users.find(u => u.id === targetUserId);
      if (foundUser && !selectedUsers.some(u => u.id === targetUserId)) {
        const updated = [...selectedUsers, foundUser];
        setSelectedUsers(updated);
        localStorage.setItem('userChats', JSON.stringify(updated));
      }
      addNotification(MESSAGES.SUBSCRIPTION_REQUESTED, 'info', 3000);
    } catch (error) {
      console.error('Subscribe error:', error);
      if (error.response && error.response.data && error.response.data.detail) {
        // Если ошибка говорит, что уже подписан или запрос отправлен
        if (error.response.data.detail.includes('уже подписаны') || 
            error.response.data.detail.includes('already subscribed')) {
          setSubscriptionStatuses(prev => ({ ...prev, [targetUserId]: 'approved' }));
          addNotification('Вы уже подписаны на этого пользователя', 'info', 3000);
        } else if (error.response.data.detail.includes('Запрос уже отправлен')) {
          setSubscriptionStatuses(prev => ({ ...prev, [targetUserId]: 'pending' }));
          addNotification('Запрос на подписку уже отправлен', 'info', 3000);
        } else {
          addNotification(`${MESSAGES.SUBSCRIPTION_ERROR}: ${error.response.data.detail}`, 'error', 4000);
        }
      } else {
        addNotification(MESSAGES.SUBSCRIPTION_ERROR, 'error', 4000);
      }
    }
  }, [user, users, selectedUsers, subscriptionStatuses, addNotification]);

  const handleApproveSubscription = useCallback(async (subscriptionId, followerId) => {
    if (!user?.id) return;
    try {
      await put(`/api/users/subscriptions/${subscriptionId}/approve`, {}, {
        'X-User-ID': String(user.id)
      });

      setPendingSubscriptions(prev => prev.filter(s => s.id !== subscriptionId));
      setNotificationCount(prev => Math.max(0, prev - 1));

      const follower = users.find(u => u.id === followerId);
      if (follower && !selectedUsers.some(u => u.id === followerId)) {
        setSelectedUsers(prev => {
          const updated = [...prev, follower];
          localStorage.setItem('userChats', JSON.stringify(updated));
          return updated;
        });
      }

      setSelectedChat(`private_${Math.min(user.id, followerId)}_${Math.max(user.id, followerId)}`);
      setShowNotifications(false);
      addNotification(MESSAGES.SUBSCRIPTION_APPROVED, 'success', 4000);
    } catch (error) {
      addNotification(`${MESSAGES.SUBSCRIPTION_ERROR}: ${error.message || ''}`, 'error', 4000);
    }
  }, [user, users, selectedUsers, addNotification]);

  // ===== ЧАТЫ =====
  const getChats = useCallback(() => {
    if (!user) return [{ id: 'general', name: 'Общий чат', icon: 'fas fa-users', type: 'public' }];

    const privateChats = [];
    const groupChats = [];

    selectedUsers.forEach(u => {
      if (u.isGroup) {
        groupChats.push({
          id: u.id,
          name: u.name,
          icon: 'fas fa-users',
          type: 'group',
          creatorId: u.creatorId,
          members: u.members,
          isPinned: pinnedChats.includes(u.id),
          createdAt: u.createdAt || new Date().toISOString()
        });
      } else if (u.id !== user.id) {
        const chatId = `private_${Math.min(user.id, u.id)}_${Math.max(user.id, u.id)}`;
        privateChats.push({
          id: chatId,
          name: customChatNames[chatId] || u.name,
          originalName: u.name,
          icon: 'fas fa-user',
          type: 'private',
          userId: u.id,
          isPinned: pinnedChats.includes(chatId),
          createdAt: u.addedAt || new Date().toISOString()
        });
      }
    });

    const pinnedPriv = privateChats.filter(c => c.isPinned);
    const notPinnedPriv = privateChats.filter(c => !c.isPinned);
    const pinnedGrp = groupChats.filter(c => c.isPinned);
    const notPinnedGrp = groupChats.filter(c => !c.isPinned);

    const sortByDate = (a, b) => {
      return new Date(b.createdAt) - new Date(a.createdAt);
    };

    const pinnedChatsList = [...pinnedPriv, ...pinnedGrp].sort(sortByDate);
    const notPinnedChatsList = [...notPinnedPriv, ...notPinnedGrp].sort(sortByDate);

    return [
      { id: 'general', name: 'Общий чат', icon: 'fas fa-users', type: 'public' },
      ...pinnedChatsList,
      ...notPinnedChatsList
    ];
  }, [user, selectedUsers, pinnedChats, customChatNames]);

  const chats = getChats();
  const currentChat = chats.find(c => c.id === selectedChat);

  const getTargetUserId = useCallback(() => {
    if (!selectedChat || !selectedChat.startsWith('private_') || !user?.id) return null;
    const parts = selectedChat.split('_');
    return parts.length === 3 ? (parts[1] === String(user.id) ? parseInt(parts[2]) : parseInt(parts[1])) : null;
  }, [selectedChat, user]);

  const targetUserId = getTargetUserId();

  const getLastMessage = useCallback((chatId) => {
    const msgs = messages.filter(m => m.chatId === chatId && !m.isSystem);
    if (msgs.length > 0) {
      const last = msgs[msgs.length - 1];
      return { user: last.username || 'Unknown', text: last.text };
    }
    return null;
  }, [messages]);

  const isUserOnline = useCallback((userId) => {
    if (!userId) return false;
    const userFound = users.find(u => u.id === userId);
    if (userFound) {
      return userFound.is_online === true;
    }
    try {
      if (typeof websocketService.isUserConnected === 'function') {
        return websocketService.isUserConnected(userId);
      }
    } catch (e) { }
    return false;
  }, [users]);

  // ===== ИНИЦИАЛИЗАЦИЯ =====
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const currentUser = JSON.parse(localStorage.getItem('currentUser'));
    if (currentUser && currentUser.id) {
      setUser(currentUser);

      try {
        if (typeof websocketService.isConnected === 'function') {
          if (!websocketService.isConnected()) {
            websocketService.connect(currentUser.id);
          }
        } else {
          websocketService.connect(currentUser.id);
        }
      } catch (error) {
        console.error('Ошибка подключения WebSocket:', error);
      }

      const loadData = async () => {
        await loadPendingSubscriptions(currentUser.id);
        await loadAllSubscriptionStatuses(currentUser.id);
        await loadAllUsers();
      };
      loadData();

      const savedChats = JSON.parse(localStorage.getItem('userChats') || '[]');
      setSelectedUsers(savedChats);

      savedChats.forEach(chat => {
        if (!chat.isGroup) {
          const chatId = `private_${Math.min(currentUser.id, chat.id)}_${Math.max(currentUser.id, chat.id)}`;
          loadChatHistory(chatId);
        } else {
          loadChatHistory(chat.id);
        }
      });

      setPinnedChats(JSON.parse(localStorage.getItem('pinnedChats') || '[]'));
      setCustomChatNames(JSON.parse(localStorage.getItem('customChatNames') || '{}'));
    }
    const targetChat = localStorage.getItem('selectedChat');
    setSelectedChat(targetChat || 'general');
    localStorage.removeItem('selectedChat');
  }, [loadAllUsers, loadPendingSubscriptions, loadAllSubscriptionStatuses, loadChatHistory]);

  // ===== WEBSOCKET =====
  useEffect(() => {
    let isMounted = true;

    const handleMessage = (data) => {
      if (!isMounted) return;

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
          files: rawMsg.files || [],
          reply_to: rawMsg.reply_to || null
        };
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);

        if (data.type === 'new_message' && msg.chatId !== selectedChat && msg.userId !== user?.id) {
          setUnreadCounts(prev => ({ ...prev, [msg.chatId]: (prev[msg.chatId] || 0) + 1 }));
          if (!msg.isSystem) {
            addNotification(`${msg.username}: ${msg.text.substring(0, 30)}...`, 'message', 5000);
          }
        }
      } else if (data.type === 'connection_status') {
        setIsConnected(data.status === 'connected');
      } else if (data.type === 'notification') {
        if (data.notification_type === 'subscription_request') {
          const { follower_id, follower_name, follower_username, subscription_id } = data.data;
          const name = follower_name || follower_username || 'Пользователь';
          setPendingSubscriptions(prev => {
            if (prev.some(s => s.follower_id === follower_id)) return prev;
            return [...prev, {
              id: subscription_id,
              follower_id,
              follower_name: name,
              follower_username,
              created_at: new Date().toISOString()
            }];
          });
          setNotificationCount(prev => prev + 1);
          addNotification(`${name} хочет подписаться на вас`, 'subscription', 7000);
        } else if (data.notification_type === 'subscription_approved') {
          const { following_id, follower_id } = data.data;
          setSubscriptionStatuses(prev => {
            const updated = { ...prev, [following_id]: 'approved', [follower_id]: 'approved' };
            localStorage.setItem('subscriptionStatuses', JSON.stringify(updated));
            return updated;
          });
          setMutualSubscriptions(prev => ({ ...prev, [follower_id]: true, [following_id]: true }));
          addNotification(MESSAGES.SUBSCRIPTION_APPROVED, 'success', 4000);
        } else if (data.notification_type === 'group_added') {
          const { group, added_by } = data.data;
          const savedChats = JSON.parse(localStorage.getItem('userChats') || '[]');
          if (!savedChats.some(c => c.id === group.id)) {
            savedChats.push(group);
            localStorage.setItem('userChats', JSON.stringify(savedChats));
            setSelectedUsers(savedChats);
            addNotification(`Вас добавили в группу "${group.name}" пользователем ${added_by}`, 'success', 5000);
            loadChatHistory(group.id);
          }
        }
      } else if (data.type === 'error') {
        addNotification(data.message, 'error', 5000);
      }
    };

    try {
      if (typeof websocketService.onMessage === 'function') {
        const unsubscribe = websocketService.onMessage(handleMessage);
        return () => {
          isMounted = false;
          if (typeof unsubscribe === 'function') unsubscribe();
        };
      }
    } catch (error) {
      console.error('Ошибка подписки на WebSocket сообщения:', error);
    }
  }, [selectedChat, user]);

  // ===== ПОИСК =====
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      // Показываем поиск только если есть запрос
      if (searchQuery.length >= 2) {
        setSearchLoading(true);
        setShowSearchResults(true);
        
        try {
          // Поиск пользователей
          const usersRes = await fetch(`/api/users/search?q=${searchQuery}`, {
            headers: { 'X-User-ID': String(user?.id || '') }
          });
          
          let users = [];
          if (usersRes.ok) {
            users = await usersRes.json();
          }
          
          // Поиск групп (только если пользователь в них состоит)
          const groupsRes = await fetch(`/api/groups/search?q=${searchQuery}`, {
            headers: { 'X-User-ID': String(user?.id || '') }
          });
          
          let groups = [];
          if (groupsRes.ok) {
            groups = await groupsRes.json();
          }
          
          // Сортируем пользователей: сначала те, с кем есть подписка
          const sortedUsers = users.sort((a, b) => {
            const statusA = subscriptionStatuses[a.id] || 'none';
            const statusB = subscriptionStatuses[b.id] || 'none';
            if (statusA === 'approved' && statusB !== 'approved') return -1;
            if (statusB === 'approved' && statusA !== 'approved') return 1;
            return 0;
          });
          
          // Объединяем результаты
          const combined = [
            ...sortedUsers.map(u => ({ ...u, _type: 'user' })),
            ...groups.map(g => ({ ...g, _type: 'group' }))
          ];
          
          setSearchResults(combined);
          setSearchResultsGroups(groups);
          
          // Обновляем список пользователей (для других целей)
          setUsers(prev => {
            const updated = [...prev];
            users.forEach(u => {
              if (!updated.some(existing => existing.id === u.id)) {
                updated.push(u);
              }
            });
            return updated;
          });
          
        } catch (error) {
          console.error('Search error:', error);
          setSearchResults([]);
        } finally {
          setSearchLoading(false);
        }
      } else {
        // Если запрос меньше 2 символов — скрываем результаты
        setShowSearchResults(false);
        setSearchResults([]);
      }
    }, 300); // Задержка 300ms для debounce
    
    return () => clearTimeout(delayDebounce);
  }, [searchQuery, user, subscriptionStatuses]);

  // ===== ОБРАБОТЧИКИ ДЛЯ МЕНЮ СООБЩЕНИЯ =====
  const handleMessageMenuToggle = useCallback((e, msg) => {
    e.stopPropagation();
    setMessageContextMenu({
      x: e.clientX,
      y: e.clientY,
      message: msg
    });
  }, []);

  // ===== ЗАКРЫТИЕ КОНТЕКСТНОГО МЕНЮ =====
  const closeMessageContextMenu = useCallback(() => {
    setMessageContextMenu(null);
  }, []);

  // ===== ПЕРЕСЛАТЬ/ПОДЕЛИТЬСЯ =====
  const openShareModal = useCallback((msg) => {
    setShareMessage(msg);
    setSelectedContacts([]);
    setShareSearchQuery('');
    setShareActiveTab('all');
    setShareModalOpen(true);
    closeMessageContextMenu();
  }, [closeMessageContextMenu]);

  const toggleContactForShare = useCallback((contactId) => {
    setSelectedContacts(prev =>
      prev.includes(contactId)
        ? prev.filter(id => id !== contactId)
        : [...prev, contactId]
    );
  }, []);

  // ===== ПОЛУЧЕНИЕ ВСЕХ КОНТАКТОВ ДЛЯ ПОДЕЛИТЬСЯ =====
  const getShareableContacts = useCallback(() => {
    // Все пользователи (кроме текущего)
    const usersList = selectedUsers
      .filter(u => !u.isGroup && u.id !== user?.id)
      .map(u => ({
        ...u,
        _type: 'user',
        displayName: u.name,
        subtitle: `@${u.username}`,
        avatar: 'fas fa-user-circle'
      }));

    // Все группы
    const groupsList = selectedUsers
      .filter(u => u.isGroup)
      .map(g => ({
        ...g,
        _type: 'group',
        displayName: g.name,
        subtitle: `${g.members?.length || 0} участников`,
        avatar: 'fas fa-users'
      }));

    // Объединяем и сортируем по имени
    return [...usersList, ...groupsList].sort((a, b) =>
      a.displayName.localeCompare(b.displayName)
    );
  }, [selectedUsers, user]);

  const handleShareToContacts = useCallback(() => {
    if (!shareMessage || selectedContacts.length === 0) {
      addNotification(MESSAGES.EMPTY_CONTACTS, 'warning', 2000);
      return;
    }

    let successCount = 0;

    selectedContacts.forEach(contactId => {
      // Ищем контакт среди пользователей и групп
      const contact = selectedUsers.find(u => u.id === contactId);
      if (!contact) return;

      let chatId;
      let isGroup = false;

      if (contact.isGroup) {
        // ✅ Это группа — используем ID группы как chat_id
        chatId = contact.id;
        isGroup = true;
      } else {
        // Это пользователь — создаём приватный чат
        chatId = `private_${Math.min(user.id, contact.id)}_${Math.max(user.id, contact.id)}`;
      }

      const shareData = {
        type: 'message',
        text: shareMessage.text || '',
        chat_id: chatId,
        files: shareMessage.files || [],
        is_shared: true,
        original_sender: shareMessage.username || user.name,
        original_chat: shareMessage.chatId || 'unknown',
        is_group: isGroup  // ✅ Добавляем флаг, что это группа
      };

      if (websocketService.sendMessage(shareData)) {
        successCount++;
      }
    });

    addNotification(`Сообщение отправлено ${successCount} получателям`, 'success', 3000);
    setShareModalOpen(false);
    setShareMessage(null);
    setSelectedContacts([]);
    setShareActiveTab('all');
  }, [shareMessage, selectedContacts, selectedUsers, user, addNotification]);

  // ===== КОПИРОВАТЬ ТЕКСТ =====
  const handleCopyMessage = useCallback((msg) => {
    if (msg.text) {
      navigator.clipboard?.writeText(msg.text).then(() => {
        addNotification(MESSAGES.COPY_SUCCESS, 'success', 2000);
      }).catch(() => {
        const textarea = document.createElement('textarea');
        textarea.value = msg.text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        addNotification(MESSAGES.COPY_SUCCESS, 'success', 2000);
      });
    }
    closeMessageContextMenu();
  }, [addNotification, closeMessageContextMenu]);

  // ===== НАЧАТЬ РЕДАКТИРОВАНИЕ =====
  const handleEditMessage = useCallback((msg) => {
    if (msg.userId !== user?.id) return;

    if (replyToMessage) {
      setReplyToMessage(null);
    }

    setEditingMessage({
      id: msg.id,
      text: msg.text || '',
      chatId: msg.chatId || selectedChat
    });
    setNewMessage(msg.text || '');
    inputRef.current?.focus();
    closeMessageContextMenu();
  }, [user, selectedChat, replyToMessage, closeMessageContextMenu]);

  // ===== ОТМЕНА РЕДАКТИРОВАНИЯ =====
  const cancelEdit = useCallback(() => {
    setEditingMessage(null);
    setNewMessage('');
    inputRef.current?.focus();
  }, []);

  // ===== ОТПРАВИТЬ РЕДАКТИРОВАНИЕ =====
  const submitEdit = useCallback(() => {
    if (!editingMessage) return;

    const newText = newMessage.trim();
    if (!newText || newText === editingMessage.text) {
      cancelEdit();
      return;
    }

    const editData = {
      type: 'edit_message',
      message_id: editingMessage.id,
      chat_id: editingMessage.chatId || selectedChat,
      text: newText
    };

    if (websocketService.sendMessage(editData)) {
      setMessages(prev => prev.map(m =>
        m.id === editingMessage.id
          ? { ...m, text: newText, edited: true }
          : m
      ));
      addNotification(MESSAGES.MESSAGE_EDITED, 'success', 2000);
    } else {
      addNotification(MESSAGES.EDIT_ERROR, 'error', 3000);
    }
    cancelEdit();
  }, [editingMessage, newMessage, selectedChat, addNotification, cancelEdit]);

  // ===== УДАЛИТЬ СООБЩЕНИЕ =====
  const handleDeleteMessage = useCallback((msg) => {
    if (!msg.id) return;
    if (!window.confirm(MESSAGES.MESSAGE_DELETE_CONFIRM)) return;

    const deleteData = {
      type: 'delete_message',
      message_id: msg.id,
      chat_id: msg.chatId || selectedChat
    };

    if (websocketService.sendMessage(deleteData)) {
      setMessages(prev => prev.filter(m => m.id !== msg.id));
      addNotification(MESSAGES.MESSAGE_DELETED, 'info', 2000);
    } else {
      addNotification(MESSAGES.DELETE_ERROR, 'error', 3000);
    }
    closeMessageContextMenu();
  }, [selectedChat, addNotification, closeMessageContextMenu]);

  // ===== ОТВЕТИТЬ НА СООБЩЕНИЕ =====
  const handleReplyMessage = useCallback((msg) => {
    if (!msg.id) return;

    if (editingMessage) {
      setEditingMessage(null);
      setNewMessage('');
    }

    setReplyToMessage({
      id: msg.id,
      text: msg.text || 'сообщение',
      username: msg.username || msg.name || 'Пользователь',
      userId: msg.userId
    });
    inputRef.current?.focus();
    closeMessageContextMenu();
    addNotification(MESSAGES.REPLY_STARTED, 'info', 2000);
  }, [editingMessage, addNotification, closeMessageContextMenu]);

  // ===== ОТМЕНА ОТВЕТА =====
  const cancelReply = useCallback(() => {
    setReplyToMessage(null);
  }, []);

  // ===== ОБРАБОТЧИКИ ФАЙЛОВ =====
  const handleDownloadFile = useCallback((file) => {
    if (!file) return;
    const url = file.url || file.path;
    if (url && url !== '#') {
      const link = document.createElement('a');
      link.href = url;
      link.download = file.originalName || file.name || 'file';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addNotification(MESSAGES.FILE_UPLOAD_SUCCESS(1), 'success', 2000);
    }
  }, [addNotification]);

  const handleForwardFile = useCallback(() => {
    addNotification('Функция пересылки будет добавлена позже', 'info', 3000);
  }, [addNotification]);

  const handlePinFile = useCallback(() => {
    addNotification('Файл закреплён (в разработке)', 'info', 3000);
  }, [addNotification]);

  const handleDeleteFile = useCallback(() => {
    if (window.confirm(MESSAGES.MESSAGE_DELETE_CONFIRM)) {
      addNotification(MESSAGES.MESSAGE_DELETED, 'info', 3000);
    }
  }, [addNotification]);

  // ===== ПРОСМОТР ФОТО/ВИДЕО =====
  const openImageViewer = useCallback((files, index) => {
    const mediaFiles = files.filter(file => {
      const isImage = file.isImage ||
        (file.type && file.type.startsWith('image/')) ||
        (file.name && /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(file.name));
      const isVideo = file.isVideo ||
        (file.type && file.type.startsWith('video/')) ||
        (file.name && /\.(mp4|avi|mov|wmv|flv|mkv|webm)$/i.test(file.name));
      return isImage || isVideo;
    });

    if (mediaFiles.length === 0) return;

    setImageModalFiles(mediaFiles);
    setImageModalIndex(Math.min(index, mediaFiles.length - 1));
    setImageModalOpen(true);
  }, []);

  const closeImageViewer = useCallback(() => {
    setImageModalOpen(false);
    setImageModalFiles([]);
    setImageModalIndex(0);
  }, []);

  const prevImage = useCallback(() => {
    setImageModalIndex(prev => prev > 0 ? prev - 1 : imageModalFiles.length - 1);
  }, [imageModalFiles.length]);

  const nextImage = useCallback(() => {
    setImageModalIndex(prev => prev < imageModalFiles.length - 1 ? prev + 1 : 0);
  }, [imageModalFiles.length]);

  // ===== ОТПРАВКА СООБЩЕНИЯ =====
  const sendMessage = useCallback(async (e) => {
    e.preventDefault();

    if (!user || !isConnected) {
      addNotification(MESSAGES.NOT_CONNECTED, 'error', 3000);
      return;
    }
    if (!newMessage.trim() && selectedFiles.length === 0) {
      addNotification(MESSAGES.EMPTY_MESSAGE, 'warning', 2000);
      return;
    }

    if (editingMessage) {
      submitEdit();
      return;
    }

    // Если есть файлы
    if (selectedFiles.length > 0) {
      const uploadedFiles = await uploadFiles(selectedFiles);

      const messageData = {
        type: 'message',
        text: newMessage.trim() || '',
        chat_id: selectedChat,
        files: uploadedFiles.map(f => ({
          originalName: f.originalName,
          name: f.serverName || f.name,
          url: f.path || f.url,
          type: f.type,
          size: f.size,
          isImage: f.isImage || (f.type && f.type.startsWith('image/')),
          isVideo: f.isVideo || (f.type && f.type.startsWith('video/')),
          isAudio: f.isAudio || (f.type && f.type.startsWith('audio/'))
        }))
      };

      if (replyToMessage) {
        messageData.reply_to = {
          message_id: replyToMessage.id,
          text: replyToMessage.text,
          username: replyToMessage.username,
          user_id: replyToMessage.userId
        };
      }

      // Отправляем через WebSocket с callback для обработки ответа
      const result = websocketService.sendMessage(messageData);
      
      if (result) {
        // Очищаем поля сразу после отправки
        setNewMessage('');
        clearFiles();
        setReplyToMessage(null);
        setEditingMessage(null);
        setUnreadCounts(prev => ({ ...prev, [selectedChat]: 0 }));
        addNotification(MESSAGES.FILE_UPLOAD_SUCCESS(uploadedFiles.length), 'success', 3000);
      }
      return;
    }

    // Только текст
    const messageData = {
      type: 'message',
      text: newMessage.trim(),
      chat_id: selectedChat
    };

    if (replyToMessage) {
      messageData.reply_to = {
        message_id: replyToMessage.id,
        text: replyToMessage.text,
        username: replyToMessage.username,
        user_id: replyToMessage.userId
      };
    }

    if (currentChat?.type === 'private') {
      messageData.recipient_id = targetUserId;
    }

    // Отправляем через WebSocket с callback для обработки ответа
    const result = websocketService.sendMessage(messageData);
    
    if (result) {
      setNewMessage('');
      setReplyToMessage(null);
      setEditingMessage(null);
      setUnreadCounts(prev => ({ ...prev, [selectedChat]: 0 }));
    } else {
      addNotification(MESSAGES.SEND_ERROR, 'error', 3000);
    }
  }, [user, isConnected, newMessage, selectedFiles, selectedChat, currentChat, targetUserId, uploadFiles, clearFiles, addNotification, editingMessage, submitEdit, replyToMessage]);

// ===== КОНТЕКСТНОЕ МЕНЮ ДЛЯ ЧАТА =====
  const handleContextMenu = useCallback((e, chat) => {
    e.preventDefault();
    e.stopPropagation();

    if (chat.id === 'general') return;

    const isCreator = chat.type === 'group' && chat.creatorId === user?.id;

    setContextMenu({
      chatId: chat.id,
      chatName: chat.name,
      originalName: chat.originalName || chat.name,
      x: e.clientX,
      y: e.clientY,
      isPinned: chat.isPinned,
      type: chat.type,
      isCreator: isCreator,
      isGroup: chat.type === 'group',
      members: chat.members || []
    });
  }, [user]);

  const handleDeleteChat = useCallback(() => {
    if (!contextMenu) return;
    const chatId = contextMenu.chatId;
    const chatToRemove = selectedUsers.find(u => {
      if (u.isGroup) return u.id === chatId;
      const expectedChatId = `private_${Math.min(user.id, u.id)}_${Math.max(user.id, u.id)}`;
      return expectedChatId === chatId;
    });

    if (!chatToRemove) return;

    const updated = selectedUsers.filter(u => u.id !== chatToRemove.id);
    setSelectedUsers(updated);
    localStorage.setItem('userChats', JSON.stringify(updated));

    if (pinnedChats.includes(chatId)) {
      const newPinned = pinnedChats.filter(id => id !== chatId);
      setPinnedChats(newPinned);
      localStorage.setItem('pinnedChats', JSON.stringify(newPinned));
    }

    if (customChatNames[chatId]) {
      const newNames = { ...customChatNames };
      delete newNames[chatId];
      setCustomChatNames(newNames);
      localStorage.setItem('customChatNames', JSON.stringify(newNames));
    }

    if (selectedChat === chatId) {
      setSelectedChat('general');
    }
    setContextMenu(null);
    addNotification('Чат удален из списка', 'info', 3000);
  }, [contextMenu, selectedUsers, user, pinnedChats, customChatNames, selectedChat, addNotification]);

  const handleTogglePin = useCallback(() => {
    if (!contextMenu) return;
    const chatId = contextMenu.chatId;
    if (pinnedChats.includes(chatId)) {
      const newPinned = pinnedChats.filter(id => id !== chatId);
      setPinnedChats(newPinned);
      localStorage.setItem('pinnedChats', JSON.stringify(newPinned));
      addNotification(MESSAGES.CHAT_UNPINNED, 'info', 2000);
    } else {
      if (pinnedChats.length >= 5) {
        addNotification(MESSAGES.MAX_PINNED, 'warning', 3000);
        return;
      }
      const newPinned = [...pinnedChats, chatId];
      setPinnedChats(newPinned);
      localStorage.setItem('pinnedChats', JSON.stringify(newPinned));
      addNotification(MESSAGES.CHAT_PINNED, 'success', 2000);
    }
    setContextMenu(null);
  }, [contextMenu, pinnedChats, addNotification]);

  const handleOpenRenameModal = useCallback(() => {
    if (!contextMenu) return;
    setNewChatName(contextMenu.chatName);
    setShowRenameModal(contextMenu.chatId);
    setContextMenu(null);
  }, [contextMenu]);

  const handleRenameSubmit = useCallback((e) => {
    e.preventDefault();
    if (!showRenameModal) return;
    const trimmed = newChatName.trim();
    if (!trimmed) return addNotification(MESSAGES.RENAME_ERROR, 'error', 3000);

    const updated = { ...customChatNames, [showRenameModal]: trimmed };
    setCustomChatNames(updated);
    localStorage.setItem('customChatNames', JSON.stringify(updated));
    addNotification(MESSAGES.RENAME_SUCCESS, 'success', 2000);
    setShowRenameModal(null);
    setNewChatName('');
  }, [showRenameModal, newChatName, customChatNames, addNotification]);

  // ===== ГРУППЫ =====
  const handleLeaveGroup = useCallback(async (groupId) => {
    if (!user) return;
    const group = selectedUsers.find(u => u.isGroup && u.id === groupId);
    if (!group) return;
    if (!window.confirm(MESSAGES.GROUP_LEAVE_CONFIRM(group.name))) return;

    try {
      await del(`/api/groups/${groupId}/remove-member`, {
        'X-User-ID': String(user.id)
      });

      const updated = selectedUsers.filter(u => u.id !== groupId);
      setSelectedUsers(updated);
      localStorage.setItem('userChats', JSON.stringify(updated));

      if (pinnedChats.includes(groupId)) {
        const newPinned = pinnedChats.filter(id => id !== groupId);
        setPinnedChats(newPinned);
        localStorage.setItem('pinnedChats', JSON.stringify(newPinned));
      }

      if (selectedChat === groupId) {
        setSelectedChat('general');
      }

      addNotification(MESSAGES.GROUP_LEFT(group.name), 'info', 3000);
    } catch (error) {
      addNotification(MESSAGES.GROUP_LEAVE_ERROR, 'error', 4000);
    }
  }, [user, selectedUsers, pinnedChats, selectedChat, addNotification]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    if (!user) return;
    const group = selectedUsers.find(u => u.isGroup && u.id === groupId);
    if (!group) return;
    if (group.creatorId !== user.id) {
      addNotification('Только создатель может удалить группу', 'error', 3000);
      return;
    }
    if (!window.confirm(MESSAGES.GROUP_DELETE_CONFIRM)) return;

    try {
      await del(`/api/groups/${groupId}`, {
        'X-User-ID': String(user.id)
      });

      const updated = selectedUsers.filter(u => u.id !== groupId);
      setSelectedUsers(updated);
      localStorage.setItem('userChats', JSON.stringify(updated));

      if (pinnedChats.includes(groupId)) {
        const newPinned = pinnedChats.filter(id => id !== groupId);
        setPinnedChats(newPinned);
        localStorage.setItem('pinnedChats', JSON.stringify(newPinned));
      }

      if (selectedChat === groupId) {
        setSelectedChat('general');
      }

      addNotification(MESSAGES.GROUP_DELETED(group.name), 'info', 3000);
    } catch (error) {
      addNotification(MESSAGES.GROUP_DELETE_ERROR, 'error', 4000);
    }
  }, [user, selectedUsers, pinnedChats, selectedChat, addNotification]);

  const handleCreateGroupSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      return addNotification(MESSAGES.EMPTY_GROUP_NAME, 'error', 3000);
    }
    if (selectedGroupMembers.length === 0) {
      return addNotification(MESSAGES.EMPTY_GROUP_MEMBERS, 'error', 3000);
    }

    try {
      const newGroup = await post('/api/groups/create',
        {
          name: newGroupName.trim(),
          member_ids: selectedGroupMembers.map(u => u.id)
        },
        { 'X-User-ID': String(user.id) }
      );

      const updatedChats = [...selectedUsers, newGroup];
      setSelectedUsers(updatedChats);
      localStorage.setItem('userChats', JSON.stringify(updatedChats));

      const sysMsg1 = {
        type: 'message',
        text: `Группа "${newGroup.name}" создана`,
        chat_id: newGroup.id,
        is_system: true
      };
      websocketService.sendMessage(sysMsg1);

      selectedGroupMembers.forEach(member => {
        const memberUser = users.find(u => u.id === member);
        const sysMsg2 = {
          type: 'message',
          text: `${user.name} добавил(а) ${memberUser ? memberUser.name : 'пользователя'} в группу`,
          chat_id: newGroup.id,
          is_system: true
        };
        websocketService.sendMessage(sysMsg2);
      });

      setSelectedChat(newGroup.id);
      setShowCreateGroupModal(false);
      setActionMenuPos(null);
      setNewGroupName('');
      setSelectedGroupMembers([]);

      addNotification(MESSAGES.GROUP_CREATED(newGroup.name), 'success', 3000);
    } catch (error) {
      addNotification(MESSAGES.GROUP_CREATE_ERROR, 'error', 5000);
    }
  }, [user, newGroupName, selectedGroupMembers, selectedUsers, users, addNotification]);

  // ===== ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ =====
  const handleAddUser = useCallback(async (selectedUser) => {
    if (selectedUser.id === user?.id) return;

    // Проверяем, есть ли уже в чатах
    const alreadyExists = selectedUsers.some(u => u.id === selectedUser.id);
    
    // Добавляем пользователя в список чатов
    if (!alreadyExists) {
      const updated = [...selectedUsers, selectedUser];
      setSelectedUsers(updated);
      localStorage.setItem('userChats', JSON.stringify(updated));
      addNotification(`Чат с ${selectedUser.name} добавлен`, 'success', 3000);
    }

    // Открываем чат
    const chatId = `private_${Math.min(user.id, selectedUser.id)}_${Math.max(user.id, selectedUser.id)}`;
    setSelectedChat(chatId);
    setSearchQuery('');
    setShowSearchResults(false);
    setShowAddUserModal(false);

    try {
      // Проверяем статус подписки
      const statusData = await get(`/api/users/subscriptions/status/${selectedUser.id}`, {
        'X-User-ID': String(user.id)
      });
      
      const currentStatus = statusData.status || 'none';
      setSubscriptionStatuses(prev => ({ ...prev, [selectedUser.id]: currentStatus }));

      // Если подписки нет — отправляем запрос
      if (currentStatus === 'none') {
        await post('/api/users/subscribe',
          { following_id: selectedUser.id },
          { 'X-User-ID': String(user.id) }
        );
        setSubscriptionStatuses(prev => ({ ...prev, [selectedUser.id]: 'pending' }));
        addNotification(`Запрос на подписку отправлен пользователю ${selectedUser.name}`, 'info', 3000);
      } else if (currentStatus === 'pending') {
        addNotification(`Запрос на подписку уже отправлен пользователю ${selectedUser.name}`, 'info', 3000);
      } else if (currentStatus === 'approved') {
        addNotification(`Вы уже подписаны на ${selectedUser.name}`, 'success', 3000);
      } else if (currentStatus === 'rejected') {
        // Если был отклонён — пробуем снова
        await post('/api/users/subscribe',
          { following_id: selectedUser.id },
          { 'X-User-ID': String(user.id) }
        );
        setSubscriptionStatuses(prev => ({ ...prev, [selectedUser.id]: 'pending' }));
        addNotification(`Запрос на подписку отправлен повторно пользователю ${selectedUser.name}`, 'info', 3000);
      }
    } catch (error) {
      console.error('Ошибка подписки:', error);
      // Показываем понятную ошибку
      if (error.response && error.response.data && error.response.data.detail) {
        addNotification(`Ошибка: ${error.response.data.detail}`, 'error', 4000);
      } else {
        addNotification(MESSAGES.SUBSCRIPTION_ERROR, 'error');
      }
    }
  }, [user, selectedUsers, addNotification]);

  // ===== АВТО-СКРОЛЛ ПРИ НОВЫХ СООБЩЕНИЯХ =====
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages]);

  // Добавьте после setSelectedChat
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [selectedChat]);

  // ===== ВЫХОД =====
  const handleLogout = useCallback(() => {
    localStorage.removeItem('currentUser');
    websocketService.disconnect();
    navigate('/login');
  }, [navigate]);

  // ===== МЕНЮ ДЕЙСТВИЙ =====
  const toggleActionMenu = useCallback((e) => {
    e.stopPropagation();
    if (actionMenuPos) setActionMenuPos(null);
    else {
      const rect = addButtonRef.current.getBoundingClientRect();
      setActionMenuPos({ top: rect.top - 160, left: rect.left - 180 });
    }
  }, [actionMenuPos]);

  const toggleGroupMember = useCallback((u) => {
    if (selectedGroupMembers.find(m => m.id === u.id)) {
      setSelectedGroupMembers(prev => prev.filter(m => m.id !== u.id));
    } else {
      setSelectedGroupMembers(prev => [...prev, u]);
    }
  }, [selectedGroupMembers]);

  // ===== РЕНДЕР СООБЩЕНИЙ =====
  const renderMessages = useCallback(() => {
    const chatMessages = messages
      .filter(m => m.chatId === selectedChat)
      .sort((a, b) => {
        // ✅ Сортировка по времени + ID для стабильности
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        
        // Сначала по времени (старые сверху)
        if (timeA !== timeB) return timeA - timeB;
        
        // Если время одинаковое, сортируем по ID (числовое сравнение)
        const idA = parseInt(a.id) || 0;
        const idB = parseInt(b.id) || 0;
        return idA - idB;
      });

    if (chatMessages.length === 0) {
      return <div className="chat-empty"><i className="fas fa-comment-dots"></i><p>{MESSAGES.NO_MESSAGES}</p></div>;
    }

    let lastDate = '';
    return chatMessages.map((msg, index) => {
      const msgDate = formatDate(msg.timestamp);
      const showDate = msgDate !== lastDate;
      lastDate = msgDate;
      const isOwn = msg.userId === user?.id;
      const isSystem = msg.isSystem;

      const isForwarded = msg.forward && msg.forward.is_shared;
      const forwardSender = isForwarded ? msg.forward.original_sender : null;
      const forwardText = isForwarded ? msg.forward.original_text : null;

      return (
        <React.Fragment key={msg.id || index}>
          {showDate && <div className="chat-date-divider"><span>{msgDate}</span></div>}

          <div
            className={`chat-message ${isOwn ? 'own' : ''} ${isSystem ? 'system' : ''} ${highlightedMessageId === msg.id ? 'highlighted' : ''}`}
            data-message-id={msg.id}
          >
            {!isOwn && !isSystem && <div className="chat-message-avatar"><i className="fas fa-user-circle"></i></div>}
            <div className="chat-message-content">
              <div className="chat-message-bubble" style={{ position: 'relative' }}>

                {!isSystem && (
                  <div className={`message-hover-actions ${isOwn ? 'own' : ''}`}>
                    <button
                      className="message-hover-btn message-share-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        openShareModal(msg);
                      }}
                      title="Поделиться"
                    >
                      <i className="fas fa-share-alt"></i>
                    </button>
                    <button
                      className="message-hover-btn message-menu-btn"
                      onClick={(e) => handleMessageMenuToggle(e, msg)}
                      title="Ещё"
                    >
                      <i className="fas fa-ellipsis-v"></i>
                    </button>
                  </div>
                )}

                {!isOwn && !isSystem && (
                  <Link to={`/profile/${msg.userId}`} className="chat-message-sender" style={{ textDecoration: 'none', color: '#7c3aed', fontWeight: '600' }}>
                    {msg.username || msg.name}
                  </Link>
                )}

                <div className="chat-message-text">
                  {msg.reply_to && (
                    <div
                      className="message-reply-quote"
                      onClick={() => {
                        const replyMsgId = msg.reply_to.message_id;
                        setHighlightedMessageId(replyMsgId);

                        const element = document.querySelector(`[data-message-id="${replyMsgId}"]`);
                        if (element) {
                          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }

                        setTimeout(() => {
                          setHighlightedMessageId(null);
                        }, 3000);
                      }}
                    >
                      <div className="reply-quote-sender">
                        <i className="fas fa-reply"></i>
                        <span>{msg.reply_to.username}</span>
                      </div>
                      <div className="reply-quote-text">{msg.reply_to.text}</div>
                    </div>
                  )}

                  {isForwarded && (
                    <div className="message-forward-block">
                      <div className="forward-header">
                        <span className="forward-label">Переслано от:</span>
                        <span className="forward-sender">{forwardSender}</span>
                      </div>
                      <div className="forward-content">
                        {forwardText || msg.text}
                      </div>
                    </div>
                  )}

                  {msg.text && !isForwarded && <div className="message-text-content">{msg.text}</div>}

                  {msg.files && msg.files.length > 0 && (
                    <div className="message-files">
                      {msg.files.map((file, idx) => {
                        if (file._type === 'forward_metadata') return null;
                        
                        const fileUrl = getFileUrl(file);

                        const isImage =
                          file.isImage === true ||
                          (file.type && file.type.startsWith('image/')) ||
                          (file.name && /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(file.name)) ||
                          (file.originalName && /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(file.originalName));

                        const isVideo =
                          file.isVideo === true ||
                          (file.type && file.type.startsWith('video/')) ||
                          (file.name && /\.(mp4|avi|mov|wmv|flv|mkv|webm)$/i.test(file.name));

                        const isAudio =
                          file.isAudio === true ||
                          (file.type && file.type.startsWith('audio/')) ||
                          (file.name && /\.(mp3|wav|flac|aac|ogg|wma)$/i.test(file.name));

                        if (isImage) {
                          const imgSrc = file.preview || fileUrl;
                          return (
                            <div
                              key={idx}
                              className="message-file-image"
                              onClick={() => openImageViewer(msg.files, idx)}
                            >
                              <img
                                src={imgSrc}
                                alt=""
                                className="message-image-thumb"
                                loading="lazy"
                                crossOrigin="anonymous"
                                onError={(e) => {
                                  console.error('Ошибка загрузки фото:', imgSrc);
                                  e.target.src = imgSrc.replace(/%20/g, ' ');
                                }}
                              />
                            </div>
                          );
                        }

                        if (isVideo) {
                          return (
                            <div key={idx} className="message-file-video">
                              <video src={fileUrl} controls preload="metadata" className="message-video-player">
                                Ваш браузер не поддерживает видео
                              </video>
                            </div>
                          );
                        }

                        if (isAudio) {
                          return (
                            <div key={idx} className="message-file-audio">
                              <audio src={fileUrl} controls className="message-audio-player">
                                Ваш браузер не поддерживает аудио
                              </audio>
                            </div>
                          );
                        }

                        return (
                          <div key={idx} className="message-file">
                            <i className="fas fa-file"></i>
                            <a href={fileUrl} target="_blank" rel="noopener noreferrer" className="file-link">
                              {file.name || file.originalName || 'Файл'}
                            </a>
                            {file.size && <span className="file-size">({formatFileSize(file.size)})</span>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {!msg.text && (!msg.files || msg.files.length === 0) && (
                    <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>пустое сообщение</span>
                  )}
                </div>

                <div className="chat-message-time">{formatTime(msg.timestamp)}</div>
              </div>
            </div>
          </div>
        </React.Fragment>
      );
    });
  }, [messages, selectedChat, user, openShareModal, handleMessageMenuToggle, getFileUrl, openImageViewer, highlightedMessageId]);

  const getUserById = useCallback((id) => {
    return users.find(u => u.id === id) || { name: 'Неизвестный', username: 'unknown' };
  }, [users]);

  // ===== ЗАКРЫТИЕ КОНТЕКСТНОГО МЕНЮ ПО КЛИКУ ВНЕ =====
  useEffect(() => {
    if (!messageContextMenu) return;

    const handleClickOutside = (e) => {
      const menu = document.querySelector('.message-context-menu');
      if (menu && !menu.contains(e.target)) {
        closeMessageContextMenu();
      }
    };

    const handleScroll = () => {
      closeMessageContextMenu();
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('scroll', handleScroll, true);
    };
  }, [messageContextMenu, closeMessageContextMenu]);

  // ===== JSX =====
  return (
    <div className="chat-app">
      {/* Сайдбар */}
      <div className={`chat-sidebar ${isMobileMenuOpen ? 'open' : ''}`}>
        <div className="chat-sidebar-header">
          <button className="chat-back" onClick={() => navigate(-1)}><i className="fas fa-arrow-left"></i></button>
          <img className="logo_chat" src="/logo_min.png" alt="logo" />
          <h3>Forum</h3>
          <button className="chat-mobile-close" onClick={() => setIsMobileMenuOpen(false)}><i className="fas fa-times"></i></button>
        </div>

        <div className="chat-sidebar-search">
          <i className="fas fa-search"></i>
          <input ref={searchInputRef} type="text" placeholder="Поиск по @username..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>

        {showSearchResults && searchQuery.length >= 2 && (
          <div className="search-results-dropdown">
            {searchLoading && (
              <div className="search-loading">
                <i className="fas fa-spinner fa-spin"></i> Поиск...
              </div>
            )}
            
            {!searchLoading && searchResults.length === 0 && (
              <div className="search-empty">
                <i className="fas fa-search"></i>
                <p>Пользователей не найдено</p>
              </div>
            )}
            
            {!searchLoading && searchResults.length > 0 && (
              <div className="search-results-list">
                {searchResults.map(item => {
                  const isGroup = item._type === 'group';
                  const isApproved = subscriptionStatuses[item.id] === 'approved';
                  const isPending = subscriptionStatuses[item.id] === 'pending';
                  const isNone = !subscriptionStatuses[item.id] || subscriptionStatuses[item.id] === 'none';
                  
                  // Пропускаем себя
                  if (!isGroup && item.id === user?.id) return null;
                  
                  // Проверяем, есть ли уже в чатах
                  const isInChats = selectedUsers.some(u => u.id === item.id);
                  
                  return (
                    <div 
                      key={item.id} 
                      className="search-result-item"
                      onClick={() => {
                        if (isGroup) {
                          // Если это группа
                          if (!isInChats) {
                            const updated = [...selectedUsers, item];
                            setSelectedUsers(updated);
                            localStorage.setItem('userChats', JSON.stringify(updated));
                            setSelectedChat(item.id);
                            setSearchQuery('');
                            setShowSearchResults(false);
                          }
                        } else {
                          // Если это пользователь
                          handleAddUser(item);
                          setSearchQuery('');
                          setShowSearchResults(false);
                        }
                      }}
                    >
                      <div className="search-result-info">
                        <div className={`search-result-avatar ${isGroup ? 'group-avatar' : ''}`}>
                          <i className={isGroup ? 'fas fa-users' : 'fas fa-user-circle'}></i>
                        </div>
                        <div className="search-result-details">
                          <div className="search-result-username">
                            {isGroup ? item.name : item.username}
                            {isGroup && (
                              <span className="search-result-group-badge">Группа</span>
                            )}
                          </div>
                          <div className="search-result-name">
                            {isGroup 
                              ? `${item.memberCount || 0} участников`
                              : item.name
                            }
                          </div>
                        </div>
                      </div>
                      
                      <div className="search-result-actions">
                        {isInChats ? (
                          <span className="search-result-btn btn-subscribed">
                            <i className="fas fa-check"></i> В чатах
                          </span>
                        ) : isGroup ? (
                          <span className="search-result-btn btn-add">
                            <i className="fas fa-plus"></i> Добавить
                          </span>
                        ) : isApproved ? (
                          <span className="search-result-btn btn-subscribed">
                            <i className="fas fa-check"></i> Подписан
                          </span>
                        ) : isPending ? (
                          <span className="search-result-btn btn-pending">
                            <i className="fas fa-clock"></i> Ожидает
                          </span>
                        ) : (
                          <span className="search-result-btn btn-subscribe">
                            <i className="fas fa-user-plus"></i> Подписаться
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {user && (
          <div className="notification-btn-wrapper">
            <button className="notification-btn" onClick={() => setShowNotifications(true)}>
              <i className="fas fa-bell"></i><span>Уведомления</span>
              {notificationCount > 0 && <span className="notification-badge">{notificationCount}</span>}
            </button>
          </div>
        )}

        <div className="chat-sidebar-list">
          {chats.map(chat => {
            const lastMsg = getLastMessage(chat.id);
            const unread = unreadCounts[chat.id] || 0;
            return (
              <div key={chat.id} className={`chat-contact ${selectedChat === chat.id ? 'active' : ''}`}
                onClick={() => { setSelectedChat(chat.id); setUnreadCounts(prev => ({ ...prev, [chat.id]: 0 })); setIsMobileMenuOpen(false); }}
                onContextMenu={(e) => handleContextMenu(e, chat)}>
                <div className="chat-contact-avatar"><i className={chat.icon}></i></div>
                <div className="chat-contact-info" style={{ flex: 1, minWidth: 0 }}>
                  <div className="chat-contact-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '8px' }}>{chat.name}</span>
                    {chat.isPinned && <i className="fas fa-thumbtack" style={{ color: '#7c3aed', fontSize: '0.85rem', transform: 'rotate(45deg)', flexShrink: 0 }} title="Закреплено"></i>}
                  </div>
                  {lastMsg ? (
                    <div className="chat-contact-lastmsg">{lastMsg.user}: {lastMsg.text.length > 30 ? lastMsg.text.substring(0, 30) + '...' : lastMsg.text}</div>
                  ) : chat.type === 'private' || chat.type === 'group' ? (
                    <div className="chat-contact-lastmsg" style={{ fontStyle: 'italic', color: '#94a3b8' }}>Начните общение</div>
                  ) : (
                    <div className="chat-contact-lastmsg" style={{ color: '#94a3b8' }}>Общий чат</div>
                  )}
                </div>
                {unread > 0 && <div className="chat-contact-unread">{unread}</div>}
              </div>
            );
          })}
        </div>

        {user && (
          <button ref={addButtonRef} className="btn-add-user-chat" onClick={toggleActionMenu} title="Действия">
            <i className="fas fa-plus"></i>
          </button>
        )}

        <div className="footer">
          {user ? (
            <>
              <img src="/user_logo_one.png" alt="user" className="user_logo" />
              <div className="user-info">
                <Link to="/profile" className="username-link"><h3 className="username">{user.name}</h3></Link>
                <button className="logout-btn" onClick={handleLogout} title="Выйти"><i className="fas fa-sign-out-alt"></i></button>
              </div>
            </>
          ) : <Link to="/login"><h3 className="username">Войти</h3></Link>}
        </div>
      </div>

      {/* POPOVER МЕНЮ */}
      {actionMenuPos && (
        <div className="action-popover-menu" style={{ position: 'fixed', top: `${actionMenuPos.top}px`, left: `${actionMenuPos.left}px`, zIndex: 10000, background: '#ffffff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)', padding: '6px 0', minWidth: '200px', animation: 'contextFadeIn 0.15s ease' }} onClick={(e) => e.stopPropagation()}>
          <div className="context-menu-item" onClick={() => { setShowCreateGroupModal(true); setActionMenuPos(null); }} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#1a1a2e', transition: '0.2s', fontWeight: 500 }}>
            <i className="fas fa-users" style={{ fontSize: '0.9rem', color: '#3b82f6', width: '18px', textAlign: 'center' }}></i><span>Создать группу</span>
          </div>
          <div className="context-menu-item" onClick={() => { setActionMenuPos(null); setTimeout(() => searchInputRef.current?.focus(), 100); }} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#1a1a2e', transition: '0.2s', fontWeight: 500 }}>
            <i className="fas fa-search" style={{ fontSize: '0.9rem', color: '#10b981', width: '18px', textAlign: 'center' }}></i><span>Найти друга</span>
          </div>
          <div className="context-menu-item" onClick={() => { setShowAddUserModal(true); setActionMenuPos(null); }} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#1a1a2e', transition: '0.2s', fontWeight: 500 }}>
            <i className="fas fa-user-plus" style={{ fontSize: '0.9rem', color: '#7c3aed', width: '18px', textAlign: 'center' }}></i><span>Добавить в чат</span>
          </div>
        </div>
      )}

      {/* ИНФОРМАЦИЯ О ГРУППЕ */}
      {showGroupInfo && currentChat?.type === 'group' && (
        <div className="modal-overlay" style={{ background: 'rgba(0, 0, 0, 0.1)', backdropFilter: 'none' }} onClick={() => setShowGroupInfo(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <div className="modal-header" style={{ justifyContent: 'center', position: 'relative' }}>
              <h3 style={{ margin: 0 }}>Информация о группе</h3>
              <button className="modal-close" onClick={() => setShowGroupInfo(false)} style={{ position: 'absolute', right: '16px', top: '16px' }}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body" style={{ padding: '0' }}>
              <div style={{ textAlign: 'center', padding: '24px 20px', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', margin: '0 auto 12px' }}>
                  <i className="fas fa-users"></i>
                </div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#1a1a2e', margin: '0 0 4px' }}>{currentChat.name}</h2>
                <p style={{ fontSize: '0.9rem', color: '#64748b', margin: 0 }}>{currentChat.members.length} участников</p>
              </div>
              <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
                {['members', 'media', 'admins'].map(tab => (
                  <button key={tab} onClick={() => setGroupInfoTab(tab)} style={{ flex: 1, padding: '14px', border: 'none', background: 'transparent', fontSize: '0.9rem', fontWeight: 600, color: groupInfoTab === tab ? '#7c3aed' : '#64748b', borderBottom: groupInfoTab === tab ? '2px solid #7c3aed' : 'none', cursor: 'pointer', transition: '0.2s' }}>
                    {tab === 'members' ? 'Участники' : tab === 'media' ? 'Медиа' : 'Администраторы'}
                  </button>
                ))}
              </div>
              <div style={{ maxHeight: '300px', overflowY: 'auto', padding: '12px' }}>
                {groupInfoTab === 'members' && currentChat.members.map(memberId => {
                  const u = getUserById(memberId);
                  const isAdmin = memberId === currentChat.creatorId;
                  return (
                    <div key={memberId} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '8px', transition: '0.2s' }} onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7c3aed', fontSize: '1.1rem' }}>
                        <i className="fas fa-user"></i>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1a1a2e' }}>{u.name}</div>
                        <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>@{u.username}</div>
                      </div>
                      {isAdmin && <span style={{ fontSize: '0.7rem', background: '#ede9fe', color: '#7c3aed', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>Создатель</span>}
                    </div>
                  );
                })}
                {groupInfoTab === 'media' && (
                  <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                    <i className="fas fa-images" style={{ fontSize: '2.5rem', marginBottom: '12px', display: 'block', opacity: 0.5 }}></i>
                    <p>{MESSAGES.NO_MEDIA}</p>
                  </div>
                )}
                {groupInfoTab === 'admins' && (
                  <div style={{ padding: '12px' }}>
                    {(() => {
                      const admin = getUserById(currentChat.creatorId);
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px', borderRadius: '8px', background: '#f8fafc' }}>
                          <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>
                            <i className="fas fa-crown"></i>
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: '#1a1a2e' }}>{admin.name}</div>
                            <div style={{ fontSize: '0.8rem', color: '#7c3aed', fontWeight: 500 }}>Администратор группы</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* СОЗДАНИЕ ГРУППЫ */}
      {showCreateGroupModal && (
        <div className="modal-overlay" style={{ background: 'rgba(0, 0, 0, 0.1)', backdropFilter: 'none' }} onClick={() => setShowCreateGroupModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h3><i className="fas fa-users"></i> Создать группу</h3>
              <button className="modal-close" onClick={() => setShowCreateGroupModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleCreateGroupSubmit}>
              <div className="modal-body">
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Название группы</label>
                  <input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} autoFocus maxLength={30} placeholder="Например: Проект IT" style={{ width: '100%', padding: '10px 14px', background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.95rem', outline: 'none' }} />
                </div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '8px', fontWeight: 500 }}>Выберите участников:</label>
                <div style={{ maxHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '8px' }}>
                  {users.filter(u => u.id !== user?.id).map(u => {
                    const isSelected = selectedGroupMembers.some(m => m.id === u.id);
                    return (
                      <div key={u.id} onClick={() => toggleGroupMember(u)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '8px', cursor: 'pointer', background: isSelected ? '#ede9fe' : 'transparent', transition: '0.2s' }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '4px', border: `2px solid ${isSelected ? '#7c3aed' : '#cbd5e1'}`, background: isSelected ? '#7c3aed' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {isSelected && <i className="fas fa-check" style={{ color: 'white', fontSize: '0.7rem' }}></i>}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{u.name}</div>
                          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>@{u.username}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreateGroupModal(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
                <button type="submit" style={{ padding: '10px 20px', background: '#7c3aed', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-check"></i> Создать</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* КОНТЕКСТНОЕ МЕНЮ ДЛЯ ЧАТА */}
      {contextMenu && (
        <div className="context-menu" style={{ position: 'fixed', top: `${contextMenu.y}px`, left: `${contextMenu.x}px`, zIndex: 10000, background: '#ffffff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)', padding: '6px 0', minWidth: '200px', animation: 'contextFadeIn 0.15s ease' }} onClick={(e) => e.stopPropagation()}>
          <div className="context-menu-item" onClick={handleTogglePin} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#1a1a2e', transition: '0.2s', fontWeight: 500 }}>
            <i className={`fas ${contextMenu.isPinned ? 'fa-times' : 'fa-thumbtack'}`} style={{ fontSize: '0.9rem', color: '#7c3aed', width: '18px', textAlign: 'center' }}></i>
            <span>{contextMenu.isPinned ? 'Открепить' : 'Закрепить'}</span>
          </div>

          {(contextMenu.type === 'private' || (contextMenu.type === 'group' && contextMenu.isCreator)) && (
            <div className="context-menu-item" onClick={handleOpenRenameModal} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#1a1a2e', transition: '0.2s', fontWeight: 500 }}>
              <i className="fas fa-pen" style={{ fontSize: '0.9rem', color: '#3b82f6', width: '18px', textAlign: 'center' }}></i>
              <span>Переименовать</span>
            </div>
          )}

          {contextMenu.isGroup && (
            <>
              {!contextMenu.isCreator && (
                <div className="context-menu-item delete" onClick={() => {
                  const groupId = contextMenu.chatId;
                  setContextMenu(null);
                  handleLeaveGroup(groupId);
                }} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#ef4444', transition: '0.2s', fontWeight: 500 }}>
                  <i className="fas fa-sign-out-alt" style={{ fontSize: '0.9rem', color: '#ef4444', width: '18px', textAlign: 'center' }}></i>
                  <span>Выйти из группы</span>
                </div>
              )}
              {contextMenu.isCreator && (
                <div className="context-menu-item delete" onClick={() => {
                  const groupId = contextMenu.chatId;
                  setContextMenu(null);
                  handleDeleteGroup(groupId);
                }} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#ef4444', transition: '0.2s', fontWeight: 500 }}>
                  <i className="fas fa-trash" style={{ fontSize: '0.9rem', color: '#ef4444', width: '18px', textAlign: 'center' }}></i>
                  <span>Удалить группу</span>
                </div>
              )}
            </>
          )}

          {contextMenu.type === 'private' && (
            <div className="context-menu-item delete" onClick={handleDeleteChat} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.9rem', color: '#ef4444', transition: '0.2s', fontWeight: 500 }}>
              <i className="fas fa-trash" style={{ fontSize: '0.9rem', color: '#ef4444', width: '18px', textAlign: 'center' }}></i>
              <span>Удалить чат</span>
            </div>
          )}
        </div>
      )}

      {/* ПЕРЕИМЕНОВАНИЕ */}
      {showRenameModal && (
        <div className="modal-overlay" onClick={() => setShowRenameModal(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-pen"></i> Переименовать чат</h3>
              <button className="modal-close" onClick={() => setShowRenameModal(null)}><i className="fas fa-times"></i></button>
            </div>
            <form onSubmit={handleRenameSubmit}>
              <div className="modal-body">
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#64748b', marginBottom: '6px', fontWeight: 500 }}>Новое имя чата</label>
                <input type="text" value={newChatName} onChange={(e) => setNewChatName(e.target.value)} autoFocus maxLength={40} style={{ width: '100%', padding: '12px 16px', background: '#f8fafc', border: '2px solid #e2e8f0', borderRadius: '10px', fontSize: '0.95rem', color: '#1a1a2e', outline: 'none', transition: '0.3s' }} />
                <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '8px' }}>Имя видно только вам. Исходное имя: <strong>{chats.find(c => c.id === showRenameModal)?.originalName}</strong></p>
              </div>
              <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowRenameModal(null)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>Отмена</button>
                <button type="submit" style={{ padding: '10px 20px', background: '#7c3aed', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}><i className="fas fa-check"></i> Сохранить</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ */}
      {showAddUserModal && (
        <div className="modal-overlay" onClick={() => setShowAddUserModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-user-plus"></i> Добавить пользователя</h3>
              <button className="modal-close" onClick={() => setShowAddUserModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              <div className="modal-search">
                <i className="fas fa-search"></i>
                <input type="text" placeholder="Поиск пользователей..." value={searchUser} onChange={(e) => setSearchUser(e.target.value)} />
              </div>
              <div className="modal-user-list">
                {users.filter(u => u.id !== user?.id && !selectedUsers.some(su => su.id === u.id) && (u.name.toLowerCase().includes(searchUser.toLowerCase()) || u.username.toLowerCase().includes(searchUser.toLowerCase()))).map(u => (
                  <div key={u.id} className="modal-user-item">
                    <div className="modal-user-info">
                      <div className="modal-user-avatar"><i className="fas fa-user-circle"></i></div>
                      <div className="modal-user-details">
                        <div className="modal-user-name">{u.name}</div>
                        <div className="modal-user-email">@{u.username}</div>
                      </div>
                    </div>
                    <button className="btn-add-user" onClick={() => handleAddUser(u)}><i className="fas fa-plus"></i> Добавить</button>
                  </div>
                ))}
                {users.filter(u => u.id !== user?.id && !selectedUsers.some(su => su.id === u.id) && (u.name.toLowerCase().includes(searchUser.toLowerCase()) || u.username.toLowerCase().includes(searchUser.toLowerCase()))).length === 0 && (
                  <div className="modal-empty"><p>{MESSAGES.NO_CONTACTS}</p></div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* УВЕДОМЛЕНИЯ */}
      {showNotifications && (
        <div className="modal-overlay" onClick={() => setShowNotifications(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3><i className="fas fa-bell"></i> Уведомления</h3>
              <button className="modal-close" onClick={() => setShowNotifications(false)}><i className="fas fa-times"></i></button>
            </div>
            <div className="modal-body">
              {pendingSubscriptions.length === 0 ? (
                <div className="modal-empty"><p>{MESSAGES.NO_NOTIFICATIONS}</p></div>
              ) : (
                <div className="notification-list">
                  {pendingSubscriptions.map(sub => (
                    <div key={sub.id} className="notification-item">
                      <div className="notification-info">
                        <div className="notification-avatar"><i className="fas fa-user-circle"></i></div>
                        <div className="notification-details">
                          <div className="notification-name">{sub.follower_name}</div>
                          <div className="notification-text">хочет подписаться на вас</div>
                        </div>
                      </div>
                      <button className="btn-approve-subscription" onClick={() => handleApproveSubscription(sub.id, sub.follower_id)}><i className="fas fa-check"></i> Одобрить</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ОСНОВНАЯ ОБЛАСТЬ ЧАТА */}
      <div className="chat-main">
        <div className="chat-header">
          <button className="chat-menu-toggle" onClick={() => setIsMobileMenuOpen(true)}><i className="fas fa-bars"></i></button>
          <div className="chat-header-info">
            <div className="chat-header-avatar"><i className={currentChat?.icon || 'fas fa-user'}></i></div>
            <div className="chat-header-text">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                {currentChat?.isPinned && <i className="fas fa-thumbtack" style={{ color: '#7c3aed', fontSize: '0.9rem', transform: 'rotate(45deg)' }}></i>}
                {currentChat?.type === 'group' ? (
                  <span onClick={() => setShowGroupInfo(true)} style={{ cursor: 'pointer', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#7c3aed'} onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'} title="Информация о группе">
                    {currentChat?.name || 'Группа'}
                  </span>
                ) : currentChat?.type === 'private' && currentChat?.userId ? (
                  <Link to={`/profile/${currentChat.userId}`} style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', gap: '8px', transition: 'color 0.2s' }} onMouseEnter={(e) => e.currentTarget.style.color = '#7c3aed'} onMouseLeave={(e) => e.currentTarget.style.color = 'inherit'} title="Перейти в профиль">
                    {currentChat?.name || 'Чат'}
                  </Link>
                ) : (currentChat?.name || 'Чат')}
              </h3>
              <span className="chat-online">
                <span className={`online-dot ${isConnected ? 'active' : ''}`}></span>
                {currentChat?.type === 'private' && (
                  <>
                    {isUserOnline(targetUserId) ? (
                      <span style={{ color: '#22c55e', fontWeight: 500 }}> {MESSAGES.ONLINE}</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}> {MESSAGES.OFFLINE}</span>
                    )}
                  </>
                )}
                {currentChat?.type === 'group' && (
                  <>  {currentChat?.members?.length || 0} участников</>
                )}
                {currentChat?.type === 'public' && (
                  <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}> Общий чат</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className="chat-messages" ref={messageListRef}>
          {renderMessages()}
          <div ref={null} />
        </div>

        {/* БЛОК ОТВЕТА НА СООБЩЕНИЕ */}
        {replyToMessage && (
          <div className="reply-message-bar">
            <div className="reply-message-info">
              <i className="fas fa-reply"></i>
              <span className="reply-message-label">Ответ на:</span>
              <span className="reply-message-sender">{replyToMessage.username}</span>
              <span className="reply-message-text">{replyToMessage.text}</span>
            </div>
            <button className="reply-message-cancel" onClick={cancelReply} title="Отменить ответ">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        {/* БЛОК РЕДАКТИРОВАНИЯ */}
        {editingMessage && (
          <div className="edit-message-bar">
            <div className="edit-message-info">
              <i className="fas fa-pen"></i>
              <span className="edit-message-label">Редактирование:</span>
              <span className="edit-message-text">{editingMessage.text}</span>
            </div>
            <button className="edit-message-cancel" onClick={cancelEdit} title="Отменить редактирование">
              <i className="fas fa-times"></i>
            </button>
          </div>
        )}

        {/* ПРЕВЬЮ ФАЙЛОВ */}
        {selectedFiles.length > 0 && (
          <div className="file-preview-container">
            {selectedFiles.map((file, index) => {
              const isImage = file.type && file.type.startsWith('image/');
              return (
                <div key={index} className="file-preview-item">
                  {isImage && filePreviews[index] ? (
                    <div className="file-preview-image-wrapper">
                      <img src={filePreviews[index]} alt={file.name} className="file-preview-image" />
                    </div>
                  ) : (
                    <div className="file-preview-icon" style={{ color: getFileColor(file) }}>
                      <i className={`fas ${getFileIcon(file)}`}></i>
                      <span className="file-preview-name">{file.name}</span>
                    </div>
                  )}
                  {!isUploading && uploadProgress[index] !== -1 && (
                    <button type="button" className="file-remove-btn" onClick={() => removeFile(index)}>
                      <i className="fas fa-times"></i>
                    </button>
                  )}
                  {uploadProgress[index] !== undefined && uploadProgress[index] < 100 && uploadProgress[index] >= 0 && (
                    <div className="file-upload-progress">
                      <div className="file-progress-bar" style={{ width: `${uploadProgress[index]}%` }}></div>
                    </div>
                  )}
                  {uploadProgress[index] === -1 && (
                    <div className="file-upload-error">
                      <i className="fas fa-times-circle"></i>
                      <span>Ошибка</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ПОЛЕ ВВОДА */}
        <div className="chat-input-area">
          {user ? (
            <form className="chat-input-form" onSubmit={sendMessage}>
              <div className="chat-input-wrapper">
                <button type="button" className="chat-attach-btn" onClick={() => fileInputRef.current.click()} title="Прикрепить файлы" disabled={isUploading}>
                  <i className="fas fa-paperclip"></i>
                </button>
                <input type="file" ref={fileInputRef} multiple accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.7z,.txt,.mp3,.wav,.flac,.mp4,.avi,.mov,.png,.jpg,.jpeg,.gif,.svg" style={{ display: 'none' }} onChange={handleFileSelect} disabled={isUploading} />
                <input
                  ref={inputRef}
                  type="text"
                  className="chat-input"
                  placeholder={
                    editingMessage ? 'Редактирование сообщения...' :
                      replyToMessage ? 'Введите ответ...' :
                        (selectedFiles.length > 0 ? 'Добавить текст к файлам...' : 'Введите сообщение...')
                  }
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={() => sendTyping()}
                  disabled={!isConnected || isUploading}
                />
                <button type="submit" className="chat-send-btn" disabled={(!newMessage.trim() && selectedFiles.length === 0) || !isConnected || isUploading}>
                  {editingMessage ? <i className="fas fa-check"></i> : (isUploading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>)}
                </button>
              </div>
            </form>
          ) : (
            <div className="chat-login-hint">
              <Link to="/login">Войдите</Link>, чтобы участвовать в обсуждении
            </div>
          )}
        </div>
      </div>

      {/* УВЕДОМЛЕНИЯ TOAST */}
      <div className="notification-container">
        {notifications.map(notif => (
          <NotificationToast key={notif.id} message={notif.message} type={notif.type} duration={notif.duration} onClose={() => setNotifications(prev => prev.filter(n => n.id !== notif.id))} />
        ))}
      </div>

      {/* РАЗРЕШЕНИЕ НА УВЕДОМЛЕНИЯ */}
      {showBrowserPermission && (
        <div className="browser-notification-permission">
          <h4>Включить уведомления?</h4>
          <div className="btn-group">
            <button className="btn-allow-notifications" onClick={() => {
              if ('Notification' in window) {
                Notification.requestPermission().then(permission => {
                  setShowBrowserPermission(false);
                  if (permission === 'granted') addNotification('Уведомления включены', 'success');
                });
              }
            }}>Включить</button>
            <button className="btn-deny-notifications" onClick={() => setShowBrowserPermission(false)}>Не сейчас</button>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО ДЛЯ ПРОСМОТРА ФОТО/ВИДЕО */}
      <ImageModal
        isOpen={imageModalOpen}
        onClose={closeImageViewer}
        files={imageModalFiles}
        currentIndex={imageModalIndex}
        onPrev={prevImage}
        onNext={nextImage}
        onDownload={handleDownloadFile}
        onForward={handleForwardFile}
        onPin={handlePinFile}
        onDelete={handleDeleteFile}
        canPin={true}
        canDelete={true}
      />

      {/* МОДАЛЬНОЕ ОКНО ПОДЕЛИТЬСЯ */}
      {shareModalOpen && (
        <div className="modal-overlay" onClick={() => setShareModalOpen(false)}>
          <div className="modal-content share-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h3><i className="fas fa-share-alt"></i> Поделиться</h3>
              <button className="modal-close" onClick={() => setShareModalOpen(false)}>
                <i className="fas fa-times"></i>
              </button>
            </div>

            <div className="modal-body" style={{ padding: '16px 20px', maxHeight: '450px', overflowY: 'auto' }}>
              {/* Превью сообщения */}
              <div className="share-message-preview">
                <div className="share-message-sender">
                  <i className="fas fa-user-circle"></i>
                  <span>{shareMessage?.username || user?.name}</span>
                  {shareMessage?.chatId && shareMessage.chatId !== 'general' && (
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '8px' }}>
                      <i className="fas fa-arrow-right"></i> из чата
                    </span>
                  )}
                </div>
                <div className="share-message-text">
                  {shareMessage?.text || 'Сообщение без текста'}
                </div>
                {shareMessage?.files?.length > 0 && (
                  <div className="share-message-files">
                    <i className="fas fa-paperclip"></i>
                    <span>{shareMessage.files.length} файлов</span>
                  </div>
                )}
              </div>

              {/* Вкладки */}
              <div className="share-tabs">
                <button 
                  className={`share-tab ${shareActiveTab === 'all' ? 'active' : ''}`}
                  onClick={() => setShareActiveTab('all')}
                >
                  <i className="fas fa-list"></i> Все
                </button>
                <button 
                  className={`share-tab ${shareActiveTab === 'private' ? 'active' : ''}`}
                  onClick={() => setShareActiveTab('private')}
                >
                  <i className="fas fa-user"></i> Личные
                </button>
                <button 
                  className={`share-tab ${shareActiveTab === 'groups' ? 'active' : ''}`}
                  onClick={() => setShareActiveTab('groups')}
                >
                  <i className="fas fa-users"></i> Группы
                </button>
              </div>

              {/* Поиск */}
              <div className="share-search">
                <i className="fas fa-search"></i>
                <input
                  type="text"
                  placeholder="Поиск контактов и групп..."
                  value={shareSearchQuery}
                  onChange={(e) => setShareSearchQuery(e.target.value)}
                />
              </div>

              {/* Список контактов */}
              <div className="share-contact-list">
                {(() => {
                  const allContacts = getShareableContacts();
                  
                  let filtered = allContacts;
                  if (shareActiveTab === 'private') {
                    filtered = filtered.filter(c => c._type === 'user');
                  } else if (shareActiveTab === 'groups') {
                    filtered = filtered.filter(c => c._type === 'group');
                  }
                  
                  if (shareSearchQuery.trim()) {
                    const query = shareSearchQuery.toLowerCase().trim();
                    filtered = filtered.filter(c =>
                      c.displayName.toLowerCase().includes(query) ||
                      (c.username && c.username.toLowerCase().includes(query))
                    );
                  }

                  if (filtered.length === 0) {
                    return (
                      <div className="share-empty">
                        <p>{shareSearchQuery ? 'Ничего не найдено' : 'Нет доступных контактов'}</p>
                      </div>
                    );
                  }

                  return filtered.map(contact => {
                    const isSelected = selectedContacts.includes(contact.id);
                    const isGroup = contact._type === 'group';

                    return (
                      <div
                        key={contact.id}
                        className={`share-contact-item ${isSelected ? 'selected' : ''}`}
                        onClick={() => toggleContactForShare(contact.id)}
                      >
                        <div className="share-contact-info">
                          <div className="share-contact-avatar" style={{ 
                            background: isGroup ? '#ede9fe' : '#e2e8f0',
                            color: isGroup ? '#7c3aed' : '#7c3aed'
                          }}>
                            <i className={contact.avatar || (isGroup ? 'fas fa-users' : 'fas fa-user-circle')}></i>
                          </div>
                          <div className="share-contact-details">
                            <div className="share-contact-name">
                              {contact.displayName}
                              {isGroup && (
                                <span style={{ 
                                  fontSize: '0.6rem', 
                                  color: '#7c3aed', 
                                  background: '#ede9fe', 
                                  padding: '1px 8px', 
                                  borderRadius: '10px',
                                  marginLeft: '8px',
                                  fontWeight: 600
                                }}>
                                  ГРУППА
                                </span>
                              )}
                            </div>
                            <div className="share-contact-username">
                              {isGroup 
                                ? `${contact.members?.length || 0} участников`
                                : `@${contact.username}`
                              }
                            </div>
                          </div>
                        </div>
                        <div className={`share-checkbox ${isSelected ? 'checked' : ''}`}>
                          {isSelected && <i className="fas fa-check"></i>}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>

              {/* Выбранные контакты */}
              {selectedContacts.length > 0 && (
                <div className="share-selected-count">
                  Выбрано: <strong>{selectedContacts.length}</strong> получателей
                  <span style={{ marginLeft: '12px', fontSize: '0.8rem', color: '#94a3b8' }}>
                    {selectedContacts.filter(id => {
                      const contact = selectedUsers.find(u => u.id === id);
                      return contact?.isGroup;
                    }).length} групп, 
                    {selectedContacts.filter(id => {
                      const contact = selectedUsers.find(u => u.id === id);
                      return contact && !contact.isGroup;
                    }).length} пользователей
                  </span>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn-cancel" onClick={() => setShareModalOpen(false)} style={{ padding: '10px 20px', background: '#f1f5f9', border: 'none', borderRadius: '10px', color: '#64748b', fontWeight: 600, cursor: 'pointer' }}>
                Отмена
              </button>
              <button
                className="btn-submit"
                onClick={handleShareToContacts}
                disabled={selectedContacts.length === 0}
                style={{ padding: '10px 20px', background: selectedContacts.length === 0 ? '#94a3b8' : '#7c3aed', border: 'none', borderRadius: '10px', color: 'white', fontWeight: 600, cursor: selectedContacts.length === 0 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <i className="fas fa-paper-plane"></i> Отправить ({selectedContacts.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* КОНТЕКСТНОЕ МЕНЮ ДЛЯ СООБЩЕНИЯ */}
      {messageContextMenu && (
        <div
          className="message-context-menu"
          style={{
            position: 'fixed',
            top: Math.min(messageContextMenu.y, window.innerHeight - 220),
            left: Math.min(messageContextMenu.x, window.innerWidth - 240),
            zIndex: 100000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="message-context-menu-item" onClick={() => openShareModal(messageContextMenu.message)}>
            <i className="fas fa-share-alt"></i>
            <span>Поделиться</span>
          </div>

          <div className="message-context-menu-item" onClick={() => handleCopyMessage(messageContextMenu.message)}>
            <i className="fas fa-copy"></i>
            <span>Копировать текст</span>
          </div>

          <div className="message-context-menu-item" onClick={() => handleReplyMessage(messageContextMenu.message)}>
            <i className="fas fa-reply"></i>
            <span>Ответить</span>
          </div>

          <div className="message-context-menu-divider"></div>

          {messageContextMenu.message.userId === user?.id && (
            <>
              <div className="message-context-menu-item" onClick={() => handleEditMessage(messageContextMenu.message)}>
                <i className="fas fa-pen"></i>
                <span>Редактировать</span>
              </div>

              <div className="message-context-menu-item message-context-menu-item-danger" onClick={() => handleDeleteMessage(messageContextMenu.message)}>
                <i className="fas fa-trash"></i>
                <span>Удалить</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default Forum;