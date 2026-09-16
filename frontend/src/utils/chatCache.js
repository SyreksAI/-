// v3: кэш сообщений не восстанавливается при загрузке — только с сервера.
const CACHE_VERSION = 'v3';
const messagesKey = (userId) => `chatMessages_${CACHE_VERSION}_${userId}`;
const legacyMessagesKey = (userId) => `chatMessages_${userId}`;
const userChatsKey = (userId) => `userChats_${CACHE_VERSION}_${userId}`;
const selectedChatKey = (userId) => `selectedChat_${CACHE_VERSION}_${userId}`;
const MAX_CACHED_MESSAGES = 800;

export const loadCachedMessages = (userId) => {
  if (!userId) return [];
  try {
    localStorage.removeItem(legacyMessagesKey(userId));
    const raw = localStorage.getItem(messagesKey(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export const saveCachedMessages = (userId, messages) => {
  if (!userId || !Array.isArray(messages)) return;
  try {
    const trimmed = messages.slice(-MAX_CACHED_MESSAGES);
    localStorage.setItem(messagesKey(userId), JSON.stringify(trimmed));
  } catch {
    // localStorage full or unavailable
  }
};

/** Удалить все закэшированные сообщения из localStorage (все версии ключей). */
export const clearAllMessageCaches = () => {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith('chatMessages_')) {
        keys.push(key);
      }
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // localStorage unavailable
  }
};

export const loadCachedUserChats = (userId) => {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(userChatsKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    }
    const legacy = localStorage.getItem('userChats');
    if (legacy) {
      const parsed = JSON.parse(legacy);
      const chats = Array.isArray(parsed) ? parsed : [];
      if (chats.length > 0) {
        saveCachedUserChats(userId, chats);
        localStorage.removeItem('userChats');
      }
      return chats;
    }
    return [];
  } catch {
    return [];
  }
};

export const saveCachedUserChats = (userId, chats) => {
  if (!userId || !Array.isArray(chats)) return;
  try {
    localStorage.setItem(userChatsKey(userId), JSON.stringify(chats));
  } catch {
    // localStorage unavailable
  }
};

export const loadSelectedChat = (userId) => {
  if (!userId) return null;
  try {
    const scoped = localStorage.getItem(selectedChatKey(userId));
    if (scoped) return scoped;
    const legacy = localStorage.getItem('selectedChat');
    if (legacy) {
      saveSelectedChat(userId, legacy);
      localStorage.removeItem('selectedChat');
      return legacy;
    }
    return null;
  } catch {
    return null;
  }
};

export const saveSelectedChat = (userId, chatId) => {
  if (!userId) return;
  try {
    if (chatId) {
      localStorage.setItem(selectedChatKey(userId), chatId);
    } else {
      localStorage.removeItem(selectedChatKey(userId));
    }
  } catch {
    // localStorage unavailable
  }
};
