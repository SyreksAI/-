// frontend/src/pages/Forum.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import '../static/partials/forum.scss';
import '../static/partials/chat-attachments.scss';
import ChatVirtualList from '../components/ChatVirtualList';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import websocketService from '../services/websocket';
import NotificationToast from '../components/NotificationToast';
import { post, get, put, del } from '../utils/api';
import ImageModal from '../components/ImageModal';
import AttachmentStaging from '../components/AttachmentStaging';
import ChatEmojiPicker from '../components/ChatEmojiPicker';
import ChatMessengerWallpaper from '../components/ChatMessengerWallpaper';
import { useFiles } from '../hooks/useFiles';
import { useChat } from '../hooks/useChat';
import { MESSAGES } from '../utils/messages';
import {
  normalizeChatMessage,
  mergeChatMessages,
  compareChatMessages,
  upsertLiveMessage,
  upsertLiveMessages,
} from '../utils/chatMessage';
import {
  saveCachedMessages,
  loadCachedMessages,
  loadCachedUserChats,
  saveCachedUserChats,
  loadSelectedChat,
  saveSelectedChat,
} from '../utils/chatCache';
import { useAuth } from '../context/AuthProvider';
import useActivityTracker from '../hooks/useActivityTracker';
import UserFooter from '../components/UserFooter';
import { CACHE_TTL, forumCacheKey } from '../utils/requestCache';
import { UPLOAD_ACCEPT } from '../utils/uploadLimits';
import { retainUploadPreview } from '../utils/uploadPreviewCache';

const getErrorMessage = (error, fallback) => {
  if (!error) return fallback;
  return error.message || fallback;
};

function Forum() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout: authLogout } = useAuth();
  useActivityTracker();

  // ===== ОСНОВНЫЕ СОСТОЯНИЯ =====
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState(() => {
    try {
      const raw = localStorage.getItem('users');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
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
  const [approvedFollowers, setApprovedFollowers] = useState([]);

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
  const [addUserSearchResults, setAddUserSearchResults] = useState([]);
  const [addUserSearchLoading, setAddUserSearchLoading] = useState(false);
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
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);

  // ===== REFS =====
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const addButtonRef = useRef(null);
  const actionMenuRef = useRef(null);
  const chatContextMenuRef = useRef(null);
  const messageListRef = useRef(null);
  const chatListRef = useRef(null);
  const messagesRef = useRef(messages);
  const selectedChatRef = useRef(selectedChat);
  const isLoadingOlderRef = useRef(false);
  const forceScrollRef = useRef(true);

  useEffect(() => {
    selectedChatRef.current = selectedChat;
  }, [selectedChat]);

  // ===== ХУКИ =====
  const {
    stagedItems,
    selectedFiles,
    isUploading,
    getFileUrl,
    uploadStaged,
    handleFileSelect,
    handlePaste,
    handleDrop,
    removeStaged,
    clearStaged,
    retryStaged,
  } = useFiles(user, selectedChat);

  const {
    isConnected,
    setIsConnected,
    unreadCounts,
    setUnreadCounts,
    typingUsers,
    setTypingUsers,
    loadChatHistory,
    sendMessage: chatSendMessage,
    editMessage,
    deleteMessage,
    sendTyping,
    handleNewMessage,
  } = useChat(user, selectedChat, setMessages);

  // ===== УВЕДОМЛЕНИЯ =====
  const addNotification = useCallback((message, type = 'info', duration = 4000) => {
    const id = Date.now() + Math.random();
    setNotifications(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const applyIncomingMessages = useCallback((rawMessages, userId, { live = false } = {}) => {
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return;
    const incoming = rawMessages.map((item) => normalizeChatMessage(item.message ?? item));
    setMessages((prev) => {
      const merged = live
        ? upsertLiveMessages(prev, incoming)
        : mergeChatMessages(prev, incoming);
      if (userId) saveCachedMessages(userId, merged);
      return merged;
    });
  }, []);

  // ===== ЗАГРУЗКА ПОЛЬЗОВАТЕЛЕЙ =====
  const loadAllUsers = useCallback(async () => {
    try {
      const data = await get('/api/users/');
      setUsers(data);
      localStorage.setItem('users', JSON.stringify(data));
    } catch (error) {
      console.error('Error loading users:', error);
      addNotification(getErrorMessage(error, MESSAGES.LOAD_ERROR), 'error');
    }
  }, [addNotification]);

  const loadUserGroups = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const groups = await get(`/api/groups/user/${userId}`, {}, {
        cacheKey: forumCacheKey(userId, 'groups'),
        cacheTtl: CACHE_TTL.forumInit,
      });
      const serverGroups = Array.isArray(groups) ? groups : [];
      const groupIds = new Set(serverGroups.map((group) => group.id));
      const savedChats = loadCachedUserChats(userId);
      const merged = savedChats.filter((chat) => !chat.isGroup || groupIds.has(chat.id));

      serverGroups.forEach((group) => {
        if (!merged.some((chat) => chat.id === group.id)) {
          merged.push(group);
        }
      });
      setSelectedUsers(merged);
      saveCachedUserChats(userId, merged);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  }, []);

  const loadApprovedFollowers = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const data = await get(`/api/users/${userId}/followers`, {}, {
        cacheKey: forumCacheKey(userId, 'followers'),
        cacheTtl: CACHE_TTL.forumInit,
      });
      setApprovedFollowers(Array.isArray(data) ? data.map((f) => f.id) : []);
    } catch (error) {
      console.error('Error loading followers:', error);
    }
  }, []);

  // ===== ПОДПИСКИ =====
  const loadPendingSubscriptions = useCallback(async (userId) => {
    if (!userId) return;
    try {
      const data = await get(`/api/users/${userId}/pending-subscriptions`, {}, {
        cacheKey: forumCacheKey(userId, 'pending'),
        cacheTtl: CACHE_TTL.forumInit,
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
      const data = await get(`/api/users/${userId}/subscriptions`, {}, {
        cacheKey: forumCacheKey(userId, 'subscriptions'),
        cacheTtl: CACHE_TTL.forumInit,
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
      const data = await get(`/api/users/subscriptions/status/${targetUserId}`);

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
        { following_id: targetUserId }
      );

      setSubscriptionStatuses(prev => ({ ...prev, [targetUserId]: 'pending' }));

      const foundUser = users.find(u => u.id === targetUserId);
      if (foundUser && !selectedUsers.some(u => u.id === targetUserId)) {
        const updated = [...selectedUsers, foundUser];
        setSelectedUsers(updated);
        saveCachedUserChats(user.id, updated);
      }
      addNotification(MESSAGES.SUBSCRIPTION_REQUESTED, 'info', 3000);
    } catch (error) {
      console.error('Subscribe error:', error);
      const message = getErrorMessage(error, MESSAGES.SUBSCRIPTION_ERROR);
      if (message.includes('уже подписаны') || message.toLowerCase().includes('already subscribed')) {
        setSubscriptionStatuses(prev => ({ ...prev, [targetUserId]: 'approved' }));
        addNotification('Вы уже подписаны на этого пользователя', 'info', 3000);
      } else if (message.includes('Запрос уже отправлен')) {
        setSubscriptionStatuses(prev => ({ ...prev, [targetUserId]: 'pending' }));
        addNotification('Запрос на подписку уже отправлен', 'info', 3000);
      } else {
        addNotification(`${MESSAGES.SUBSCRIPTION_ERROR}: ${message}`, 'error', 4000);
      }
    }
  }, [user, users, selectedUsers, subscriptionStatuses, addNotification]);

  const handleRejectSubscription = useCallback(async (subscriptionId, followerId) => {
    if (!user?.id) return;
    try {
      await put(`/api/users/subscriptions/${subscriptionId}/reject`, {});

      setPendingSubscriptions(prev => prev.filter(s => s.id !== subscriptionId));
      setNotificationCount(prev => Math.max(0, prev - 1));
      setSubscriptionStatuses(prev => ({ ...prev, [followerId]: 'rejected' }));
      addNotification('Запрос на подписку отклонён', 'info', 3000);
    } catch (error) {
      addNotification(getErrorMessage(error, MESSAGES.SUBSCRIPTION_ERROR), 'error', 4000);
    }
  }, [user, addNotification]);

  const handleApproveSubscription = useCallback(async (subscriptionId, followerId) => {
    if (!user?.id) return;
    try {
      await put(`/api/users/subscriptions/${subscriptionId}/approve`, {});

      setPendingSubscriptions(prev => prev.filter(s => s.id !== subscriptionId));
      setNotificationCount(prev => Math.max(0, prev - 1));

      const follower = users.find(u => u.id === followerId);
      if (follower && !selectedUsers.some(u => u.id === followerId)) {
        setSelectedUsers(prev => {
          const updated = [...prev, follower];
          saveCachedUserChats(user.id, updated);
          return updated;
        });
      }

      setSelectedChat(`private_${Math.min(user.id, followerId)}_${Math.max(user.id, followerId)}`);
      setShowNotifications(false);
      setSubscriptionStatuses(prev => ({ ...prev, [followerId]: 'approved' }));
      setApprovedFollowers(prev => (prev.includes(followerId) ? prev : [...prev, followerId]));
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

  const chats = useMemo(() => getChats(), [getChats]);
  const currentChat = chats.find(c => c.id === selectedChat);

  const getTargetUserId = useCallback(() => {
    if (!selectedChat || !selectedChat.startsWith('private_') || !user?.id) return null;
    const parts = selectedChat.split('_');
    return parts.length === 3 ? (parts[1] === String(user.id) ? parseInt(parts[2]) : parseInt(parts[1])) : null;
  }, [selectedChat, user]);

  const targetUserId = getTargetUserId();
  const hasMutualSubscription = Boolean(
    targetUserId
    && subscriptionStatuses[targetUserId] === 'approved'
    && approvedFollowers.includes(targetUserId)
  );
  const canSendPrivateMessage = currentChat?.type !== 'private' || hasMutualSubscription;
  const privateChatBlockedReason = (() => {
    if (currentChat?.type !== 'private' || canSendPrivateMessage || !targetUserId) return null;
    const status = subscriptionStatuses[targetUserId] || 'none';
    if (status === 'pending') return 'Ожидается подтверждение подписки. Сообщения будут доступны после взаимного одобрения.';
    if (status === 'rejected') return 'Запрос на подписку был отклонён. Отправьте новый запрос, чтобы начать переписку.';
    return 'Для личных сообщений нужна взаимная подписка. Отправьте запрос на подписку.';
  })();

  const activeTypingUsers = Object.entries(typingUsers)
    .filter(([userId, timestamp]) => Date.now() - timestamp < 3000 && Number(userId) !== user?.id)
    .map(([userId]) => users.find(u => u.id === Number(userId))?.name || 'Кто-то');

  // ===== ПОИСК В МОДАЛКЕ ДОБАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯ =====
  useEffect(() => {
    if (!showAddUserModal) {
      setAddUserSearchResults([]);
      return undefined;
    }

    const query = searchUser.trim();
    if (query.length < 2) {
      setAddUserSearchResults([]);
      return undefined;
    }

    const timer = setTimeout(async () => {
      setAddUserSearchLoading(true);
      try {
        const results = await get(`/api/users/search?q=${encodeURIComponent(query)}`);
        setAddUserSearchResults(Array.isArray(results) ? results : []);
      } catch (error) {
        console.error('Add user search error:', error);
        setAddUserSearchResults([]);
      } finally {
        setAddUserSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchUser, showAddUserModal]);

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
  const initializedUserIdRef = useRef(null);

  useEffect(() => {
    if (!user?.id) {
      initializedUserIdRef.current = null;
      setSelectedChat(null);
      setSelectedUsers([]);
      setMessages([]);
      return;
    }

    if (initializedUserIdRef.current === user.id) return;
    initializedUserIdRef.current = user.id;

    setMessages(loadCachedMessages(user.id));
    setSelectedUsers(loadCachedUserChats(user.id));
    setSelectedChat(loadSelectedChat(user.id) || 'general');

    try {
      if (!websocketService.isConnected) {
        websocketService.connect(user.id);
      }
    } catch (error) {
      console.error('Ошибка подключения WebSocket:', error);
    }

    Promise.all([
      loadPendingSubscriptions(user.id),
      loadAllSubscriptionStatuses(user.id),
      loadUserGroups(user.id),
      loadApprovedFollowers(user.id),
    ]).catch((error) => console.error('Forum init load error:', error));

    setPinnedChats(JSON.parse(localStorage.getItem('pinnedChats') || '[]'));
    setCustomChatNames(JSON.parse(localStorage.getItem('customChatNames') || '{}'));
  }, [user?.id, loadPendingSubscriptions, loadAllSubscriptionStatuses, loadUserGroups, loadApprovedFollowers]);

  useEffect(() => {
    if (!user?.id) return;
    saveSelectedChat(user.id, selectedChat);
  }, [user?.id, selectedChat]);

  useEffect(() => {
    if (!user?.id) return;
    const chatIdFromNav = location.state?.chatId;
    if (chatIdFromNav) {
      setSelectedChat(chatIdFromNav);
    }
  }, [user?.id, location.state?.chatId]);

  useEffect(() => {
    if (!user?.id || !selectedChat) return;
    const chatIds = new Set(chats.map((chat) => chat.id));
    if (!chatIds.has(selectedChat)) {
      setSelectedChat('general');
    }
  }, [user?.id, selectedChat, chats]);

  // ===== WEBSOCKET =====
  useEffect(() => {
    let isMounted = true;

    const handleMessage = (data) => {
      if (!isMounted) return;

      if (data.type === 'history_batch') {
        applyIncomingMessages(data.messages || [], user?.id);
      } else if (data.type === 'new_message' || data.type === 'history') {
        const msg = normalizeChatMessage(data.message);
        applyIncomingMessages([msg], user?.id, { live: data.type === 'new_message' });

        if (
          data.type === 'new_message'
          && !msg.isSystem
          && msg.chatId !== selectedChatRef.current
          && msg.userId !== user?.id
        ) {
          setUnreadCounts(prev => ({ ...prev, [msg.chatId]: (prev[msg.chatId] || 0) + 1 }));
          addNotification(`${msg.username}: ${msg.text.substring(0, 30)}...`, 'message', 5000);
        }
      } else if (data.type === 'message_edited') {
        const edited = data.message || {};
        const messageId = edited.id ?? data.message_id;
        const newText = edited.text ?? data.new_text;
        if (messageId) {
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.id === messageId ? { ...m, text: newText, edited: true } : m
            );
            if (user?.id) saveCachedMessages(user.id, updated);
            return updated;
          });
        }
      } else if (data.type === 'message_deleted') {
        const messageId = data.message_id;
        if (messageId) {
          setMessages((prev) => {
            const updated = prev.filter((m) => m.id !== messageId);
            if (user?.id) saveCachedMessages(user.id, updated);
            return updated;
          });
        }
      } else if (data.type === 'typing') {
        if (data.chat_id === selectedChatRef.current && data.user_id !== user?.id) {
          setTypingUsers(prev => ({ ...prev, [data.user_id]: Date.now() }));
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
          if (user?.id === follower_id) {
            setSubscriptionStatuses(prev => {
              const updated = { ...prev, [following_id]: 'approved' };
              localStorage.setItem('subscriptionStatuses', JSON.stringify(updated));
              return updated;
            });
            setApprovedFollowers(prev => (prev.includes(following_id) ? prev : [...prev, following_id]));
          }
          if (user?.id === following_id) {
            setSubscriptionStatuses(prev => {
              const updated = { ...prev, [follower_id]: 'approved' };
              localStorage.setItem('subscriptionStatuses', JSON.stringify(updated));
              return updated;
            });
            setApprovedFollowers(prev => (prev.includes(follower_id) ? prev : [...prev, follower_id]));
          }
          setMutualSubscriptions(prev => ({ ...prev, [follower_id]: true, [following_id]: true }));
          addNotification(MESSAGES.SUBSCRIPTION_APPROVED, 'success', 4000);
        } else if (data.notification_type === 'group_added') {
          const { group, added_by } = data.data;
          const savedChats = loadCachedUserChats(user?.id);
          if (!savedChats.some(c => c.id === group.id)) {
            savedChats.push(group);
            saveCachedUserChats(user.id, savedChats);
            setSelectedUsers(savedChats);
            addNotification(`Вас добавили в группу "${group.name}" пользователем ${added_by}`, 'success', 5000);
            loadChatHistory(group.id);
          }
        }
      } else if (data.type === 'error') {
        if (data.message === 'Доступ запрещен') {
          if (selectedChatRef.current && selectedChatRef.current !== 'general') {
            setSelectedChat('general');
          }
          return;
        }
        addNotification(data.message, 'error', 5000);
      }
    };

    setIsConnected(websocketService.isConnected);

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
  }, [user, applyIncomingMessages, addNotification, setIsConnected, loadChatHistory]);

  const canLoadChatHistory = useCallback((chatId) => {
    if (!chatId || chatId === 'general') return true;
    const chat = chats.find((item) => item.id === chatId);
    if (chat?.type === 'private') {
      const parts = chatId.split('_');
      if (parts.length !== 3) return false;
      const otherId = parts[1] === String(user?.id) ? parseInt(parts[2], 10) : parseInt(parts[1], 10);
      return Boolean(
        otherId
        && subscriptionStatuses[otherId] === 'approved'
        && approvedFollowers.includes(otherId)
      );
    }
    return true;
  }, [chats, user?.id, subscriptionStatuses, approvedFollowers]);

  // ===== ДОГРУЗКА ИСТОРИИ ДЛЯ ПУСТОГО ЧАТА (fallback) =====
  useEffect(() => {
    if (!user?.id || !selectedChat) return undefined;
    if (!canLoadChatHistory(selectedChat)) return undefined;
    const hasMessages = messages.some((m) => m.chatId === selectedChat);
    if (hasMessages) return undefined;

    loadChatHistory(selectedChat);
    return undefined;
  }, [selectedChat, user?.id, messages, loadChatHistory, canLoadChatHistory]);

  // ===== КЭШ СООБЩЕНИЙ =====
  useEffect(() => {
    if (!user?.id || messages.length === 0) return undefined;
    const timer = setTimeout(() => saveCachedMessages(user.id, messages), 300);
    return () => clearTimeout(timer);
  }, [messages, user?.id]);

  // ===== ПОИСК =====
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      // Показываем поиск только если есть запрос
      if (searchQuery.length >= 2) {
        setSearchLoading(true);
        setShowSearchResults(true);
        
        try {
          const [users, groups] = await Promise.all([
            get(`/api/users/search?q=${encodeURIComponent(searchQuery)}`),
            get(`/api/groups/search?q=${encodeURIComponent(searchQuery)}`),
          ]);
          
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

  const insertEmoji = useCallback((emoji) => {
    const input = inputRef.current;
    if (!input) {
      setNewMessage((prev) => `${prev}${emoji}`);
      return;
    }
    const start = input.selectionStart ?? newMessage.length;
    const end = input.selectionEnd ?? newMessage.length;
    const next = `${newMessage.slice(0, start)}${emoji}${newMessage.slice(end)}`;
    setNewMessage(next);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + emoji.length;
      input.setSelectionRange(pos, pos);
    });
  }, [newMessage]);

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
      const mime = file.mime || file.type || '';
      const isImage = file.kind === 'image' || file.isImage
        || mime.startsWith('image/')
        || (file.name && /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(file.name));
      const isVideo = file.kind === 'video' || file.isVideo
        || mime.startsWith('video/')
        || (file.name && /\.(mp4|avi|mov|wmv|flv|mkv|webm)$/i.test(file.name));
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
  const appendOptimisticMessage = useCallback((text, files = []) => {
    if (!user?.id) return null;
    const tempId = `pending-${Date.now()}`;

    // Часы клиента могут отставать от сервера — держим сообщение последним в списке.
    const newestInChat = (messagesRef.current || [])
      .filter((m) => m.chatId === selectedChat)
      .reduce((max, m) => Math.max(max, new Date(m.timestamp).getTime() || 0), 0);
    const timestamp = new Date(Math.max(Date.now(), newestInChat + 1)).toISOString();

    setMessages((prev) => {
      const merged = upsertLiveMessage(prev, normalizeChatMessage({
        id: tempId,
        chat_id: selectedChat,
        user_id: user.id,
        username: user.username,
        user_name: user.name,
        text,
        timestamp,
        files,
      }));
      if (user?.id) saveCachedMessages(user.id, merged);
      return merged;
    });
    return tempId;
  }, [user, selectedChat]);

  const sendMessage = useCallback(async (e) => {
    e.preventDefault();

    const wsReady = isConnected || websocketService.isConnected;
    if (!user || !wsReady) {
      addNotification(MESSAGES.NOT_CONNECTED, 'error', 3000);
      return;
    }
    if (currentChat?.type === 'private' && !canSendPrivateMessage) {
      addNotification(privateChatBlockedReason || 'Личные сообщения недоступны', 'warning', 4000);
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
      let uploadedFiles;
      try {
        uploadedFiles = await uploadStaged();
      } catch (err) {
        addNotification(err?.message || MESSAGES.UPLOAD_ERROR, 'error', 6000);
        return;
      }

      const messageData = {
        type: 'message',
        text: newMessage.trim() || '',
        chat_id: selectedChat,
        attachment_ids: uploadedFiles.map((f) => f.id).filter(Boolean),
      };

      if (replyToMessage) {
        messageData.reply_to = {
          message_id: replyToMessage.id,
          text: replyToMessage.text,
          username: replyToMessage.username,
          user_id: replyToMessage.userId,
        };
      }

      const previewByKey = new Map();
      stagedItems.forEach((item) => {
        if (!item.preview) return;
        previewByKey.set(item.name, item.preview);
        if (item.attachment?.id) previewByKey.set(item.attachment.id, item.preview);
      });
      const uploadedWithPreview = uploadedFiles.map((attachment) => {
        const preview =
          previewByKey.get(attachment.id)
          || previewByKey.get(attachment.original_name || attachment.name)
          || undefined;
        if (preview && attachment.id) {
          retainUploadPreview(attachment.id, preview);
        }
        return { ...attachment, preview };
      });
      const tempId = appendOptimisticMessage(messageData.text, uploadedWithPreview);
      const result = websocketService.sendMessage(messageData);

      if (result) {
        setNewMessage('');
        clearStaged();
        setReplyToMessage(null);
        setEditingMessage(null);
        setUnreadCounts((prev) => ({ ...prev, [selectedChat]: 0 }));
        addNotification(MESSAGES.FILE_UPLOAD_SUCCESS(uploadedFiles.length), 'success', 3000);
      } else {
        addNotification(MESSAGES.SEND_ERROR, 'error', 3000);
        if (tempId) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
        }
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

    appendOptimisticMessage(messageData.text);
    const result = websocketService.sendMessage(messageData);

    if (result) {
      setNewMessage('');
      setReplyToMessage(null);
      setEditingMessage(null);
      setUnreadCounts(prev => ({ ...prev, [selectedChat]: 0 }));
    } else {
      addNotification(MESSAGES.SEND_ERROR, 'error', 3000);
    }
  }, [user, isConnected, newMessage, selectedFiles, stagedItems, selectedChat, currentChat, targetUserId, uploadStaged, clearStaged, addNotification, editingMessage, submitEdit, replyToMessage, canSendPrivateMessage, privateChatBlockedReason, appendOptimisticMessage]);

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
    saveCachedUserChats(user.id, updated);

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
      await del(`/api/groups/${groupId}/remove-member`);

      const updated = selectedUsers.filter(u => u.id !== groupId);
      setSelectedUsers(updated);
      saveCachedUserChats(user.id, updated);

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
      await del(`/api/groups/${groupId}`);

      const updated = selectedUsers.filter(u => u.id !== groupId);
      setSelectedUsers(updated);
      saveCachedUserChats(user.id, updated);

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
        }
      );

      const updatedChats = [...selectedUsers, newGroup];
      setSelectedUsers(updatedChats);
      saveCachedUserChats(user.id, updatedChats);

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
      saveCachedUserChats(user.id, updated);
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
      const statusData = await get(`/api/users/subscriptions/status/${selectedUser.id}`);
      
      const currentStatus = statusData.status || 'none';
      setSubscriptionStatuses(prev => ({ ...prev, [selectedUser.id]: currentStatus }));

      // Если подписки нет — отправляем запрос
      if (currentStatus === 'none') {
        await post('/api/users/subscribe',
          { following_id: selectedUser.id }
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
          { following_id: selectedUser.id }
        );
        setSubscriptionStatuses(prev => ({ ...prev, [selectedUser.id]: 'pending' }));
        addNotification(`Запрос на подписку отправлен повторно пользователю ${selectedUser.name}`, 'info', 3000);
      }
    } catch (error) {
      console.error('Ошибка подписки:', error);
      addNotification(getErrorMessage(error, MESSAGES.SUBSCRIPTION_ERROR), 'error', 4000);
    }
  }, [user, selectedUsers, addNotification]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Принудительный скролл вниз при открытии и смене чата
  useEffect(() => {
    forceScrollRef.current = true;
  }, [selectedChat]);

  const handleMessageListScroll = useCallback(async () => {
    const list = messageListRef.current;
    if (!list || isLoadingOlderRef.current) return;
    if (list.scrollTop > 80) return;
    if (!canLoadChatHistory(selectedChat)) return;

    const oldest = (messagesRef.current || [])
      .filter((m) => m.chatId === selectedChat && !String(m.id).startsWith('pending-'))
      .sort(compareChatMessages)[0];
    if (!oldest) return;

    isLoadingOlderRef.current = true;
    const previousHeight = list.scrollHeight;
    try {
      const loaded = await loadChatHistory(selectedChat, { beforeId: oldest.id });
      if (loaded > 0) {
        // Сохраняем позицию просмотра: контент добавился сверху
        requestAnimationFrame(() => {
          list.scrollTop += list.scrollHeight - previousHeight;
        });
      }
    } finally {
      isLoadingOlderRef.current = false;
    }
  }, [selectedChat, loadChatHistory, canLoadChatHistory]);

  // ===== ВЫХОД =====
  const handleLogout = useCallback(async () => {
    await authLogout();
    navigate('/login');
  }, [authLogout, navigate]);

  // ===== МЕНЮ ДЕЙСТВИЙ =====
  const toggleActionMenu = useCallback((e) => {
    e.stopPropagation();
    if (actionMenuPos) setActionMenuPos(null);
    else {
      const rect = addButtonRef.current.getBoundingClientRect();
      setActionMenuPos({ top: rect.top - 160, left: rect.left - 180 });
    }
  }, [actionMenuPos]);

  const closeOnBackdrop = useCallback((closeFn) => (e) => {
    if (e.target === e.currentTarget) closeFn();
  }, []);

  const toggleGroupMember = useCallback((u) => {
    if (selectedGroupMembers.find(m => m.id === u.id)) {
      setSelectedGroupMembers(prev => prev.filter(m => m.id !== u.id));
    } else {
      setSelectedGroupMembers(prev => [...prev, u]);
    }
  }, [selectedGroupMembers]);

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

  // ===== ЗАКРЫТИЕ МЕНЮ «+» ПО КЛИКУ ВНЕ =====
  useEffect(() => {
    if (!actionMenuPos) return;

    const handleClickOutside = (e) => {
      const menu = actionMenuRef.current;
      const btn = addButtonRef.current;
      if (menu && !menu.contains(e.target) && btn && !btn.contains(e.target)) {
        setActionMenuPos(null);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [actionMenuPos]);

  // ===== ЗАКРЫТИЕ КОНТЕКСТНОГО МЕНЮ ЧАТА ПО КЛИКУ ВНЕ =====
  useEffect(() => {
    if (!contextMenu) return;

    const handleClickOutside = (e) => {
      const menu = chatContextMenuRef.current;
      if (menu && !menu.contains(e.target)) {
        setContextMenu(null);
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contextMenu]);

  // ===== ЗАКРЫТИЕ POPOVER / КОНТЕКСТНОГО МЕНЮ ПО ESCAPE =====
  useEffect(() => {
    if (!actionMenuPos && !contextMenu) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setActionMenuPos(null);
        setContextMenu(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [actionMenuPos, contextMenu]);

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
                            saveCachedUserChats(user.id, updated);
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
          <UserFooter />
        </div>
      </div>

      {/* POPOVER МЕНЮ «+» — portal в body, чтобы клик вне закрывал меню */}
      {actionMenuPos && createPortal(
        <>
          <div className="popover-backdrop" onMouseDown={() => setActionMenuPos(null)} aria-hidden="true" />
          <div
            ref={actionMenuRef}
            className="action-popover-menu"
            style={{ position: 'fixed', top: `${actionMenuPos.top}px`, left: `${actionMenuPos.left}px`, zIndex: 100001, background: '#ffffff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)', padding: '6px 0', minWidth: '200px', animation: 'contextFadeIn 0.15s ease' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
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
        </>,
        document.body
      )}

      {/* ИНФОРМАЦИЯ О ГРУППЕ */}
      {showGroupInfo && currentChat?.type === 'group' && (
        <div className="modal-overlay" style={{ background: 'rgba(0, 0, 0, 0.1)', backdropFilter: 'none' }} onMouseDown={closeOnBackdrop(() => setShowGroupInfo(false))}>
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
        <div className="modal-overlay" style={{ background: 'rgba(0, 0, 0, 0.1)', backdropFilter: 'none' }} onMouseDown={closeOnBackdrop(() => setShowCreateGroupModal(false))}>
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
      {contextMenu && createPortal(
        <>
        <div className="popover-backdrop" onMouseDown={() => setContextMenu(null)} aria-hidden="true" />
        <div ref={chatContextMenuRef} className="context-menu" style={{ position: 'fixed', top: `${contextMenu.y}px`, left: `${contextMenu.x}px`, zIndex: 100001, background: '#ffffff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0, 0, 0, 0.15)', padding: '6px 0', minWidth: '200px', animation: 'contextFadeIn 0.15s ease' }} onMouseDown={(e) => e.stopPropagation()}>
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
        </>,
        document.body
      )}

      {/* ПЕРЕИМЕНОВАНИЕ */}
      {showRenameModal && (
        <div className="modal-overlay" onMouseDown={closeOnBackdrop(() => setShowRenameModal(null))}>
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
        <div className="modal-overlay" onMouseDown={closeOnBackdrop(() => setShowAddUserModal(false))}>
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
                {addUserSearchLoading && (
                  <div className="search-loading"><i className="fas fa-spinner fa-spin"></i> Поиск...</div>
                )}
                {!addUserSearchLoading && searchUser.trim().length < 2 && (
                  <div className="modal-empty"><p>Введите минимум 2 символа для поиска</p></div>
                )}
                {!addUserSearchLoading && searchUser.trim().length >= 2 && addUserSearchResults
                  .filter(u => u.id !== user?.id && !selectedUsers.some(su => su.id === u.id))
                  .map(u => (
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
                {!addUserSearchLoading && searchUser.trim().length >= 2 && addUserSearchResults.filter(u => u.id !== user?.id && !selectedUsers.some(su => su.id === u.id)).length === 0 && (
                  <div className="modal-empty"><p>{MESSAGES.NO_CONTACTS}</p></div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* УВЕДОМЛЕНИЯ */}
      {showNotifications && (
        <div className="modal-overlay" onMouseDown={closeOnBackdrop(() => setShowNotifications(false))}>
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
                      <button className="btn-reject-subscription" onClick={() => handleRejectSubscription(sub.id, sub.follower_id)} style={{ marginLeft: '8px', padding: '8px 12px', background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}><i className="fas fa-times"></i> Отклонить</button>
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
        {!selectedChat ? (
          <div className="chat-empty">
            <i className="fas fa-comments"></i>
            <p>Выберите чат</p>
            <span>Выберите чат из списка слева или найдите пользователя через поиск</span>
          </div>
        ) : (
        <>
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

        <div className="chat-messages-shell">
          <ChatMessengerWallpaper />
          <ChatVirtualList
            ref={chatListRef}
            scrollRef={messageListRef}
            messages={messages}
            selectedChat={selectedChat}
            user={user}
            highlightedMessageId={highlightedMessageId}
            setHighlightedMessageId={setHighlightedMessageId}
            openShareModal={openShareModal}
            handleMessageMenuToggle={handleMessageMenuToggle}
            openImageViewer={openImageViewer}
            onScroll={handleMessageListScroll}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            forceScrollRef={forceScrollRef}
            isLoadingOlderRef={isLoadingOlderRef}
            typingIndicator={
              activeTypingUsers.length > 0 ? (
                <div className="typing-indicator" style={{ padding: '8px 16px', color: '#64748b', fontSize: '0.85rem', fontStyle: 'italic' }}>
                  {activeTypingUsers.join(', ')} {activeTypingUsers.length === 1 ? 'печатает' : 'печатают'}...
                </div>
              ) : null
            }
          />
        </div>

        {privateChatBlockedReason && (
          <div className="private-chat-banner" style={{ padding: '10px 16px', background: '#fef3c7', color: '#92400e', fontSize: '0.9rem', borderTop: '1px solid #fde68a' }}>
            <i className="fas fa-lock" style={{ marginRight: '8px' }}></i>
            {privateChatBlockedReason}
          </div>
        )}

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

        <AttachmentStaging
          items={stagedItems}
          onRemove={removeStaged}
          onRetry={retryStaged}
        />

        {/* ПОЛЕ ВВОДА */}
        <div className="chat-input-area">
          {user ? (
            <form className="chat-input-form" onSubmit={sendMessage}>
              <div className="chat-input-wrapper">
                <button type="button" className="chat-attach-btn" onClick={() => fileInputRef.current.click()} title="Прикрепить файлы" disabled={isUploading}>
                  <i className="fas fa-paperclip"></i>
                </button>
                <input type="file" ref={fileInputRef} multiple accept={UPLOAD_ACCEPT} style={{ display: 'none' }} onChange={handleFileSelect} disabled={isUploading} />
                <ChatEmojiPicker
                  open={emojiPickerOpen}
                  onToggle={setEmojiPickerOpen}
                  onSelect={insertEmoji}
                  disabled={!(isConnected || websocketService.isConnected) || isUploading || !canSendPrivateMessage}
                />
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
                  onPaste={handlePaste}
                  onKeyDown={() => sendTyping()}
                  disabled={!(isConnected || websocketService.isConnected) || isUploading || !canSendPrivateMessage}
                />
                <button type="submit" className="chat-send-btn" disabled={(!newMessage.trim() && selectedFiles.length === 0) || !(isConnected || websocketService.isConnected) || isUploading || !canSendPrivateMessage}>
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
        </>
        )}
      </div>

      {/* УВЕДОМЛЕНИЯ TOAST */}
      <div className="notification-container">
        {notifications.map(notif => (
          <NotificationToast
            key={notif.id}
            message={notif.message}
            type={notif.type}
            duration={notif.duration}
            onClose={() => removeNotification(notif.id)}
          />
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
        <div className="modal-overlay" onMouseDown={closeOnBackdrop(() => setShareModalOpen(false))}>
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