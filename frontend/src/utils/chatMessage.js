const toTime = (value) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const toId = (value) => {
  if (value == null) return 0;
  const raw = String(value);
  if (raw.startsWith('pending-')) return 0;
  const numeric = parseInt(raw, 10);
  return Number.isNaN(numeric) ? 0 : numeric;
};

export const isPendingId = (id) => String(id).startsWith('pending-');

const fileSignature = (files) =>
  (files || [])
    .map((f) => String(f?.id ?? f?.name ?? ''))
    .sort()
    .join(',');

/**
 * Единый порядок: старые сверху, новые снизу.
 * Только (timestamp, id) — без user_id и без legacy `order`.
 */
export const compareChatMessages = (a, b) => {
  const timeDiff = toTime(a.timestamp) - toTime(b.timestamp);
  if (timeDiff !== 0) return timeDiff;

  const aPending = isPendingId(a.id);
  const bPending = isPendingId(b.id);
  if (aPending !== bPending) return aPending ? 1 : -1;

  return toId(a.id) - toId(b.id);
};

export const sortChatMessages = (messages) => [...(messages || [])].sort(compareChatMessages);

/** Bulk merge for history / reconnect — полная пересортировка. */
export const mergeChatMessages = (prev, incoming) => {
  const map = new Map((prev || []).map((msg) => [msg.id, msg]));
  (incoming || []).forEach((msg) => {
    if (msg?.id != null) {
      map.set(msg.id, msg);
    }
  });
  return sortChatMessages(Array.from(map.values()));
};

/**
 * Live WS / optimistic: append в конец чата, без группировки по автору.
 * - pending заменяется по тому же индексу при подтверждении сервером
 * - подтверждённое с большим id всегда в конец (монотонный PK)
 */
export const upsertLiveMessage = (prev, msg) => {
  if (!msg?.id) return prev || [];

  const list = prev || [];
  const chatId = msg.chatId;

  const existingIdx = list.findIndex((m) => m.id === msg.id);
  if (existingIdx !== -1) {
    const next = [...list];
    next[existingIdx] = msg;
    return next;
  }

  const clientTempId = msg.clientTempId || msg.client_temp_id;
  if (clientTempId) {
    const pendingIdx = list.findIndex((m) => m.id === clientTempId);
    if (pendingIdx !== -1) {
      const next = [...list];
      const { clientTempId: _ct, client_temp_id: _ct2, uploadState, uploadFailed, uploadProgress, ...confirmed } = msg;
      next[pendingIdx] = confirmed;
      return next;
    }
  }

  const pendingIdx = list.findIndex(
    (m) =>
      isPendingId(m.id) &&
      m.chatId === chatId &&
      Number(m.userId) === Number(msg.userId) &&
      m.text === msg.text &&
      fileSignature(m.files) === fileSignature(msg.files),
  );
  if (pendingIdx !== -1) {
    const next = [...list];
    next[pendingIdx] = msg;
    return next;
  }

  const inChat = list.filter((m) => m.chatId === chatId);
  const outOfChat = list.filter((m) => m.chatId !== chatId);

  if (isPendingId(msg.id)) {
    const lastTime = inChat.reduce((max, m) => Math.max(max, toTime(m.timestamp)), 0);
    const optimistic = {
      ...msg,
      timestamp: new Date(Math.max(toTime(msg.timestamp), lastTime + 1)).toISOString(),
    };
    return [...outOfChat, ...inChat, optimistic];
  }

  const maxIdInChat = inChat.reduce((max, m) => Math.max(max, toId(m.id)), 0);
  if (toId(msg.id) > maxIdInChat) {
    return [...outOfChat, ...inChat, msg];
  }

  return sortChatMessages([...list, msg]);
};

export const upsertLiveMessages = (prev, incoming) =>
  (incoming || []).reduce((acc, msg) => upsertLiveMessage(acc, msg), prev || []);

export const normalizeChatMessage = (rawMsg) => {
  const attachments = rawMsg.attachments || [];
  const legacyFiles = rawMsg.files || [];
  const files = attachments.length
    ? [...attachments, ...legacyFiles.filter((f) => !f?.id && f?._type === 'forward_metadata')]
    : legacyFiles;
  const forwardMeta = files.find((file) => file?._type === 'forward_metadata');
  const displayFiles = files.filter((file) => file?._type !== 'forward_metadata');
  const isShared = Boolean(rawMsg.is_shared || forwardMeta);
  const forward = isShared
    ? {
        is_shared: true,
        original_sender: forwardMeta?.original_sender || rawMsg.original_sender || rawMsg.username,
        original_text: forwardMeta?.original_text || rawMsg.text,
      }
    : null;

  return {
    id: rawMsg.id,
    chatId: rawMsg.chat_id || rawMsg.chatId || 'general',
    userId: rawMsg.user_id ?? rawMsg.userId,
    username: rawMsg.username,
    name: rawMsg.name || rawMsg.user_name,
    text: rawMsg.text,
    isSystem: rawMsg.is_system || rawMsg.isSystem || false,
    timestamp: rawMsg.timestamp,
    files: displayFiles,
    reply_to: rawMsg.reply_to || null,
    order: rawMsg.order || 0,
    edited: rawMsg.edited || Boolean(rawMsg.edited_at),
    forward,
    clientTempId: rawMsg.client_temp_id || rawMsg.clientTempId || null,
    uploadState: rawMsg.uploadState || rawMsg.upload_state || null,
    uploadFailed: rawMsg.uploadFailed || rawMsg.upload_failed || false,
    uploadProgress: rawMsg.uploadProgress ?? rawMsg.upload_progress ?? null,
  };
};
