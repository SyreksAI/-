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

  // ТОЛЬКО ОДИН РАЗ!
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
  const addNotification = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now();
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
      addNotification('❌ Ошибка загрузки пользователей', 'error');
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
      addNotification('📨 Запрос на подписку отправлен', 'info', 3000);
    } catch (error) {
      addNotification(`❌ ${error.message || 'Ошибка подписки'}`, 'error', 4000);
    }
  }, [user, users, selectedUsers, addNotification]);

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
      addNotification('✅ Взаимная подписка установлена!', 'success', 4000);
    } catch (error) {
      addNotification(`❌ ${error.message || 'Ошибка'}`, 'error', 4000);
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
    } catch (e) {}
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
        console.error('❌ Ошибка подключения WebSocket:', error);
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
          files: rawMsg.files || []
        };
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg]);

        if (data.type === 'new_message' && msg.chatId !== selectedChat && msg.userId !== user?.id) {
          setUnreadCounts(prev => ({ ...prev, [msg.chatId]: (prev[msg.chatId] || 0) + 1 }));
          if (!msg.isSystem) {
            addNotification(`💬 ${msg.username}: ${msg.text.substring(0, 30)}...`, 'message', 5000);
          }
        }
      } 
      else if (data.type === 'connection_status') {
        setIsConnected(data.status === 'connected');
      }
      else if (data.type === 'notification') {
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
          addNotification(`🔔 ${name} хочет подписаться на вас!`, 'subscription', 7000);
        } 
        else if (data.notification_type === 'subscription_approved') {
          const { following_id, follower_id } = data.data;
          setSubscriptionStatuses(prev => {
            const updated = { ...prev, [following_id]: 'approved', [follower_id]: 'approved' };
            localStorage.setItem('subscriptionStatuses', JSON.stringify(updated));
            return updated;
          });
          setMutualSubscriptions(prev => ({ ...prev, [follower_id]: true, [following_id]: true }));
          addNotification('✅ Взаимная подписка установлена!', 'success', 4000);
        }
        else if (data.notification_type === 'group_added') {
          const { group, added_by } = data.data;
          const savedChats = JSON.parse(localStorage.getItem('userChats') || '[]');
          if (!savedChats.some(c => c.id === group.id)) {
            savedChats.push(group);
            localStorage.setItem('userChats', JSON.stringify(savedChats));
            setSelectedUsers(savedChats);
            addNotification(`👥 Вас добавили в группу "${group.name}" пользователем ${added_by}`, 'success', 5000);
            loadChatHistory(group.id);
          }
        }
      }
      else if (data.type === 'error') {
        addNotification(`❌ ${data.message}`, 'error', 5000);
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
      console.error('❌ Ошибка подписки на WebSocket сообщения:', error);
    }
  }, [selectedChat, user]); // ← ТОЛЬКО selectedChat И user!

  // ===== ПОИСК =====
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (searchQuery.length >= 2) {
        setSearchLoading(true);
        setShowSearchResults(true);
        
        try {
          const [usersRes, groupsRes] = await Promise.all([
            fetch(`/api/users/search?q=${searchQuery}`, {
              headers: { 'X-User-ID': String(user?.id || '') }
            }),
            fetch(`/api/groups/search?q=${searchQuery}`, {
              headers: { 'X-User-ID': String(user?.id || '') }
            })
          ]);
          
          let users = [];
          let groups = [];
          
          if (usersRes.ok) {
            users = await usersRes.json();
          }
          
          if (groupsRes.ok) {
            groups = await groupsRes.json();
          }
          
          const sortedUsers = users.sort((a, b) => {
            const statusA = subscriptionStatuses[a.id] || 'none';
            const statusB = subscriptionStatuses[b.id] || 'none';
            if (statusA === 'approved' && statusB !== 'approved') return -1;
            if (statusB === 'approved' && statusA !== 'approved') return 1;
            return 0;
          });
          
          const combined = [
            ...sortedUsers.map(u => ({ ...u, _type: 'user' })),
            ...groups.map(g => ({ ...g, _type: 'group' }))
          ];
          
          setSearchResults(combined);
          setSearchResultsGroups(groups);
          
          setUsers(prev => {
            const updated = [...prev];
            users.forEach(u => {
              if (!updated.some(existing => existing.id === u.id)) updated.push(u);
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
        setShowSearchResults(false);
        setSearchResults([]);
      }
    }, 300);
    
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

  const handleShareMessage = useCallback((msg) => {
    addNotification('📤 Сообщение переслано (в разработке)', 'info', 3000);
  }, [addNotification]);

  const closeMessageContextMenu = useCallback(() => {
    setMessageContextMenu(null);
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
    }
  }, []);

  const handleForwardFile = useCallback((file) => {
    addNotification('📤 Функция пересылки будет добавлена позже', 'info', 3000);
  }, [addNotification]);

  const handlePinFile = useCallback((file) => {
    addNotification('📌 Файл закреплён (в разработке)', 'info', 3000);
  }, [addNotification]);

  const handleDeleteFile = useCallback((file) => {
    if (window.confirm('Удалить этот файл из сообщения?')) {
      addNotification('🗑️ Файл удалён (в разработке)', 'info', 3000);
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
    
    if (!user || !isConnected) return;
    if (!newMessage.trim() && selectedFiles.length === 0) {
      addNotification('⚠️ Введите текст или выберите файл', 'warning', 2000);
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
      
      if (websocketService.sendMessage(messageData)) {
        setNewMessage('');
        clearFiles();
        setUnreadCounts(prev => ({ ...prev, [selectedChat]: 0 }));
        addNotification(`📤 ${uploadedFiles.length} файлов отправлено`, 'success', 3000);
      }
      return;
    }
    
    // Только текст
    const messageData = {
      type: 'message',
      text: newMessage.trim(),
      chat_id: selectedChat
    };
    
    if (currentChat?.type === 'private') {
      messageData.recipient_id = targetUserId;
    }
    
    if (websocketService.sendMessage(messageData)) {
      setNewMessage('');
      setUnreadCounts(prev => ({ ...prev, [selectedChat]: 0 }));
    } else {
      addNotification('❌ Ошибка отправки', 'error', 3000);
    }
  }, [user, isConnected, newMessage, selectedFiles, selectedChat, currentChat, targetUserId, uploadFiles, clearFiles, addNotification]);

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
    addNotification('🗑️ Чат удален из списка', 'info', 3000);
  }, [contextMenu, selectedUsers, user, pinnedChats, customChatNames, selectedChat, addNotification]);

  const handleTogglePin = useCallback(() => {
    if (!contextMenu) return;
    const chatId = contextMenu.chatId;
    if (pinnedChats.includes(chatId)) {
      const newPinned = pinnedChats.filter(id => id !== chatId);
      setPinnedChats(newPinned);
      localStorage.setItem('pinnedChats', JSON.stringify(newPinned));
      addNotification('📌 Чат откреплён', 'info', 2000);
    } else {
      if (pinnedChats.length >= 5) return addNotification('⚠️ Максимум 5 чатов', 'warning', 3000);
      const newPinned = [...pinnedChats, chatId];
      setPinnedChats(newPinned);
      localStorage.setItem('pinnedChats', JSON.stringify(newPinned));
      addNotification('📌 Чат закреплён', 'success', 2000);
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
    if (!trimmed) return addNotification('❌ Имя не может быть пустым', 'error', 3000);
    
    const updated = { ...customChatNames, [showRenameModal]: trimmed };
    setCustomChatNames(updated);
    localStorage.setItem('customChatNames', JSON.stringify(updated));
    addNotification('✅ Чат переименован', 'success', 2000);
    setShowRenameModal(null);
    setNewChatName('');
  }, [showRenameModal, newChatName, customChatNames, addNotification]);

  // ===== ГРУППЫ =====
  const handleLeaveGroup = useCallback(async (groupId) => {
    if (!user) return;
    const group = selectedUsers.find(u => u.isGroup && u.id === groupId);
    if (!group) return;
    if (!window.confirm(`Вы уверены, что хотите выйти из группы "${group.name}"?`)) return;
    
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
      
      addNotification(`👋 Вы вышли из группы "${group.name}"`, 'info', 3000);
    } catch (error) {
      addNotification(`❌ ${error.message || 'Ошибка выхода из группы'}`, 'error', 4000);
    }
  }, [user, selectedUsers, pinnedChats, selectedChat, addNotification]);

  const handleDeleteGroup = useCallback(async (groupId) => {
    if (!user) return;
    const group = selectedUsers.find(u => u.isGroup && u.id === groupId);
    if (!group) return;
    if (group.creatorId !== user.id) {
      addNotification('❌ Только создатель может удалить группу', 'error', 3000);
      return;
    }
    if (!window.confirm(`Вы уверены, что хотите удалить группу "${group.name}"? Это действие необратимо!`)) return;
    
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
      
      addNotification(`🗑️ Группа "${group.name}" удалена`, 'info', 3000);
    } catch (error) {
      addNotification(`❌ ${error.message || 'Ошибка удаления группы'}`, 'error', 4000);
    }
  }, [user, selectedUsers, pinnedChats, selectedChat, addNotification]);

  const handleCreateGroupSubmit = useCallback(async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) {
      return addNotification('❌ Введите название группы', 'error', 3000);
    }
    if (selectedGroupMembers.length === 0) {
      return addNotification('❌ Выберите хотя бы одного участника', 'error', 3000);
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
      
      addNotification(`✅ Группа "${newGroup.name}" создана!`, 'success', 3000);
    } catch (error) {
      addNotification(`❌ ${error.message || 'Ошибка создания группы'}`, 'error', 5000);
    }
  }, [user, newGroupName, selectedGroupMembers, selectedUsers, users, addNotification]);

  // ===== ДОБАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯ =====
  const handleAddUser = useCallback(async (selectedUser) => {
    if (selectedUser.id === user?.id) return;
    
    if (!selectedUsers.some(u => u.id === selectedUser.id)) {
      const updated = [...selectedUsers, selectedUser];
      setSelectedUsers(updated);
      localStorage.setItem('userChats', JSON.stringify(updated));
    }
    
    const chatId = `private_${Math.min(user.id, selectedUser.id)}_${Math.max(user.id, selectedUser.id)}`;
    setSelectedChat(chatId);
    setShowAddUserModal(false);
    
    try {
      const statusData = await get(`/api/users/subscriptions/status/${selectedUser.id}`, {
        'X-User-ID': String(user.id)
      });
      
      if (statusData.status === 'none') {
        await post('/api/users/subscribe', 
          { following_id: selectedUser.id },
          { 'X-User-ID': String(user.id) }
        );
        setSubscriptionStatuses(prev => ({ ...prev, [selectedUser.id]: 'pending' }));
      } else {
        setSubscriptionStatuses(prev => ({ ...prev, [selectedUser.id]: statusData.status }));
      }
    } catch (error) {
      console.error('Ошибка подписки:', error);
      addNotification('❌ Ошибка при подписке', 'error');
    }
  }, [user, selectedUsers, addNotification]);

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
        const timeA = new Date(a.timestamp).getTime();
        const timeB = new Date(b.timestamp).getTime();
        if (timeA !== timeB) return timeA - timeB;
        return String(a.id).localeCompare(String(b.id));
      });

    if (chatMessages.length === 0) {
      return <div className="chat-empty"><i className="fas fa-comment-dots"></i><p>Сообщений пока нет</p></div>;
    }

    let lastDate = '';
    return chatMessages.map((msg, index) => {
      const msgDate = formatDate(msg.timestamp);
      const showDate = msgDate !== lastDate;
      lastDate = msgDate;
      const isOwn = msg.userId === user?.id;
      const isSystem = msg.isSystem;

      return (
        <React.Fragment key={msg.id || index}>
          {showDate && <div className="chat-date-divider"><span>{msgDate}</span></div>}
          
          <div className={`chat-message ${isOwn ? 'own' : ''} ${isSystem ? 'system' : ''}`}>
            {!isOwn && !isSystem && <div className="chat-message-avatar"><i className="fas fa-user-circle"></i></div>}
            <div className="chat-message-content">
              <div className="chat-message-bubble" style={{ position: 'relative' }}>
                
                {/* Кнопки при наведении */}
                {!isSystem && (
                  <div className="message-hover-actions">
                    <button 
                      className="message-hover-btn message-share-btn"
                      onClick={(e) => { e.stopPropagation(); handleShareMessage(msg); }}
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
                  {msg.text && <div className="message-text-content">{msg.text}</div>}
                  
                  {/* ФАЙЛЫ */}
                  {msg.files && msg.files.length > 0 && (
                    <div className="message-files">
                      {msg.files.map((file, idx) => {
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
                        
                        // ФОТО
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
                                  console.error('❌ Ошибка загрузки фото:', imgSrc);
                                  e.target.src = imgSrc.replace(/%20/g, ' ');
                                }}
                              />
                            </div>
                          );
                        }
                        
                        // ВИДЕО
                        if (isVideo) {
                          return (
                            <div key={idx} className="message-file-video">
                              <video src={fileUrl} controls preload="metadata" className="message-video-player">
                                Ваш браузер не поддерживает видео
                              </video>
                            </div>
                          );
                        }
                        
                        // АУДИО
                        if (isAudio) {
                          return (
                            <div key={idx} className="message-file-audio">
                              <audio src={fileUrl} controls className="message-audio-player">
                                Ваш браузер не поддерживает аудио
                              </audio>
                            </div>
                          );
                        }
                        
                        // ОСТАЛЬНЫЕ ФАЙЛЫ
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
  }, [messages, selectedChat, user, handleShareMessage, handleMessageMenuToggle, getFileUrl, openImageViewer]);

  const getUserById = useCallback((id) => {
    return users.find(u => u.id === id) || { name: 'Неизвестный', username: 'unknown' };
  }, [users]);

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
            {searchLoading && <div className="search-loading">Поиск...</div>}
            {searchResults.length === 0 && !searchLoading && (
              <div className="search-empty">
                <i className="fas fa-search"></i>
                <p>Ничего не найдено</p>
              </div>
            )}
            {searchResults.map(item => {
              if (item._type === 'group') {
                return (
                  <div key={item.id} className="search-result-item clickable" onClick={() => {
                    const savedChats = JSON.parse(localStorage.getItem('userChats') || '[]');
                    if (!savedChats.some(c => c.id === item.id)) {
                      savedChats.push({
                        id: item.id,
                        name: item.name,
                        isGroup: true,
                        creatorId: item.creatorId,
                        members: item.members
                      });
                      localStorage.setItem('userChats', JSON.stringify(savedChats));
                      setSelectedUsers(savedChats);
                    }
                    setSelectedChat(item.id);
                    setShowSearchResults(false);
                    setSearchQuery('');
                  }} style={{ cursor: 'pointer' }}>
                    <div className="search-result-info">
                      <div className="search-result-avatar group-avatar"><i className="fas fa-users"></i></div>
                      <div className="search-result-details">
                        <div className="search-result-username" style={{ color: '#7c3aed' }}>
                          <i className="fas fa-users" style={{ marginRight: '6px' }}></i>
                          {item.name}
                        </div>
                        <div className="search-result-name">Группа • {item.memberCount || item.members?.length || 0} участников</div>
                      </div>
                    </div>
                    <button className="search-result-btn btn-open-chat" onClick={(e) => {
                      e.stopPropagation();
                      const savedChats = JSON.parse(localStorage.getItem('userChats') || '[]');
                      if (!savedChats.some(c => c.id === item.id)) {
                        savedChats.push({
                          id: item.id,
                          name: item.name,
                          isGroup: true,
                          creatorId: item.creatorId,
                          members: item.members
                        });
                        localStorage.setItem('userChats', JSON.stringify(savedChats));
                        setSelectedUsers(savedChats);
                      }
                      setSelectedChat(item.id);
                      setShowSearchResults(false);
                      setSearchQuery('');
                    }}><i className="fas fa-arrow-right"></i> Открыть</button>
                  </div>
                );
              }
              
              const status = subscriptionStatuses[item.id] || 'none';
              const isSubscribed = status === 'approved';
              const isPending = status === 'pending';
              const isRejected = status === 'rejected';
              
              return (
                <div key={item.id} className={`search-result-item ${isSubscribed ? 'clickable' : ''}`} onClick={() => {
                  if (isSubscribed) {
                    const chatId = `private_${Math.min(user.id, item.id)}_${Math.max(user.id, item.id)}`;
                    if (!selectedUsers.some(u => u.id === item.id)) {
                      const updated = [...selectedUsers, item];
                      setSelectedUsers(updated);
                      localStorage.setItem('userChats', JSON.stringify(updated));
                    }
                    setSelectedChat(chatId);
                    setShowSearchResults(false);
                    setSearchQuery('');
                    checkSubscriptionStatus(item.id, user.id);
                  }
                }} style={{ cursor: isSubscribed ? 'pointer' : 'default' }}>
                  <div className="search-result-info">
                    <div className="search-result-avatar"><i className="fas fa-user-circle"></i></div>
                    <div className="search-result-details">
                      <div className="search-result-username">@{item.username}</div>
                      <div className="search-result-name">{item.name}</div>
                      <div className="search-result-status">
                        {isSubscribed && <span className="status-badge subscribed"><i className="fas fa-check-circle"></i> Подписан</span>}
                        {isPending && <span className="status-badge pending"><i className="fas fa-clock"></i> Ожидает</span>}
                        {isRejected && <span className="status-badge rejected"><i className="fas fa-times-circle"></i> Отклонено</span>}
                        {!isSubscribed && !isPending && !isRejected && <span className="status-badge none"><i className="fas fa-user-plus"></i> Не подписан</span>}
                      </div>
                    </div>
                  </div>
                  {isSubscribed ? (
                    <button className="search-result-btn btn-open-chat" onClick={(e) => {
                      e.stopPropagation();
                      const chatId = `private_${Math.min(user.id, item.id)}_${Math.max(user.id, item.id)}`;
                      if (!selectedUsers.some(u => u.id === item.id)) {
                        const updated = [...selectedUsers, item];
                        setSelectedUsers(updated);
                        localStorage.setItem('userChats', JSON.stringify(updated));
                      }
                      setSelectedChat(chatId);
                      setShowSearchResults(false);
                      setSearchQuery('');
                    }}><i className="fas fa-comment-dots"></i> Открыть чат</button>
                  ) : isPending ? (
                    <button className="search-result-btn btn-pending" disabled><i className="fas fa-clock"></i> Ожидает</button>
                  ) : (
                    <button className="search-result-btn btn-subscribe" onClick={(e) => {
                      e.stopPropagation();
                      handleSubscribe(item.id);
                    }} disabled={isRejected}><i className="fas fa-user-plus"></i> Подписаться</button>
                  )}
                </div>
              );
            })}
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
                    <p>В этой группе пока нет общих медиафайлов</p>
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
                  <div className="modal-empty"><p>Нет доступных пользователей</p></div>
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
                <div className="modal-empty"><p>Нет новых уведомлений</p></div>
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
                      <span style={{ color: '#22c55e', fontWeight: 500 }}> Онлайн</span>
                    ) : (
                      <span style={{ color: '#94a3b8' }}> Офлайн</span>
                    )}
                  </>
                )}
                {currentChat?.type === 'group' && (
                  <> 👥 {currentChat?.members?.length || 0} участников</>
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
                  placeholder={selectedFiles.length > 0 ? 'Добавить текст к файлам...' : 'Введите сообщение...'} 
                  value={newMessage} 
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={() => sendTyping()}  // ← Добавить
                  disabled={!isConnected || isUploading} 
                />
                <button type="submit" className="chat-send-btn" disabled={(!newMessage.trim() && selectedFiles.length === 0) || !isConnected || isUploading}>
                  {isUploading ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-paper-plane"></i>}
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
          <h4>🔔 Включить уведомления?</h4>
          <div className="btn-group">
            <button className="btn-allow-notifications" onClick={() => {
              if ('Notification' in window) {
                Notification.requestPermission().then(permission => {
                  setShowBrowserPermission(false);
                  if (permission === 'granted') addNotification('✅ Уведомления включены!', 'success');
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

      {/* КОНТЕКСТНОЕ МЕНЮ ДЛЯ СООБЩЕНИЯ */}
      {messageContextMenu && (
        <div className="message-context-menu" style={{
          position: 'fixed',
          top: Math.min(messageContextMenu.y, window.innerHeight - 220),
          left: Math.min(messageContextMenu.x, window.innerWidth - 240),
          zIndex: 100000,
          background: 'rgba(30, 30, 30, 0.95)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderRadius: '12px',
          padding: '6px 0',
          minWidth: '200px',
          boxShadow: '0 8px 30px rgba(0, 0, 0, 0.5)',
          border: '1px solid rgba(255, 255, 255, 0.06)',
          animation: 'contextFadeIn 0.15s ease'
        }} onClick={(e) => e.stopPropagation()}>
          <div className="message-context-menu-item" onClick={() => { handleShareMessage(messageContextMenu.message); closeMessageContextMenu(); }} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.9)', transition: '0.2s', fontWeight: 500 }}>
            <i className="fas fa-share-alt" style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.5)', width: '18px', textAlign: 'center' }}></i>
            <span>Переслать</span>
          </div>
          <div className="message-context-menu-item" onClick={() => {
            const text = messageContextMenu.message.text || '';
            if (text) {
              navigator.clipboard?.writeText(text);
              addNotification('📋 Текст скопирован', 'success', 2000);
            }
            closeMessageContextMenu();
          }} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.9)', transition: '0.2s', fontWeight: 500 }}>
            <i className="fas fa-copy" style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.5)', width: '18px', textAlign: 'center' }}></i>
            <span>Копировать текст</span>
          </div>
          {messageContextMenu.message.userId === user?.id && (
            <div className="message-context-menu-item message-context-menu-item-danger" onClick={() => {
              addNotification('🗑️ Сообщение удалено (в разработке)', 'info', 3000);
              closeMessageContextMenu();
            }} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: '#ef4444', transition: '0.2s', fontWeight: 500 }}>
              <i className="fas fa-trash" style={{ fontSize: '0.9rem', color: '#ef4444', width: '18px', textAlign: 'center' }}></i>
              <span>Удалить</span>
            </div>
          )}
          <div className="message-context-menu-divider" style={{ height: '1px', background: 'rgba(255, 255, 255, 0.06)', margin: '4px 12px' }}></div>
          <div className="message-context-menu-item" onClick={closeMessageContextMenu} style={{ padding: '10px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.9)', transition: '0.2s', fontWeight: 500 }}>
            <i className="fas fa-times" style={{ fontSize: '0.9rem', color: 'rgba(255, 255, 255, 0.5)', width: '18px', textAlign: 'center' }}></i>
            <span>Закрыть</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default Forum;