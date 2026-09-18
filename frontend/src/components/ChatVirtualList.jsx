import React, { useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Link } from 'react-router-dom';
import { formatTime, formatDate } from '../utils/helpers';
import MessageAttachments from './MessageAttachments';

function buildChatItems(messages, selectedChat) {
  const chatMessages = messages.filter((m) => m.chatId === selectedChat && !m.isSystem);
  const items = [];
  let lastDate = '';
  for (const msg of chatMessages) {
    const msgDate = formatDate(msg.timestamp);
    if (msgDate !== lastDate) {
      items.push({ type: 'date', id: `date-${msgDate}-${msg.id}`, date: msgDate });
      lastDate = msgDate;
    }
    items.push({ type: 'message', id: String(msg.id), msg });
  }
  return items;
}

function ChatMessageRow({
  item,
  user,
  highlightedMessageId,
  setHighlightedMessageId,
  openShareModal,
  handleMessageMenuToggle,
  openImageViewer,
  scrollToMessage,
}) {
  if (item.type === 'date') {
    return (
      <div className="chat-date-divider">
        <span>{item.date}</span>
      </div>
    );
  }

  const msg = item.msg;
  const isOwn = msg.userId === user?.id;
  const isSystem = msg.isSystem;
  const isForwarded = msg.forward && msg.forward.is_shared;
  const forwardSender = isForwarded ? msg.forward.original_sender : null;
  const forwardText = isForwarded ? msg.forward.original_text : null;

  return (
    <div
      className={`chat-message ${isOwn ? 'own' : ''} ${isSystem ? 'system' : ''} ${highlightedMessageId === msg.id ? 'highlighted' : ''}`}
      data-message-id={msg.id}
    >
      {!isOwn && !isSystem && (
        <div className="chat-message-avatar">
          <i className="fas fa-user-circle"></i>
        </div>
      )}
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
            <Link
              to={`/profile/${msg.userId}`}
              className="chat-message-sender"
              style={{ textDecoration: 'none', color: '#14b8a6', fontWeight: '600' }}
            >
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
                  scrollToMessage(replyMsgId);
                  setTimeout(() => setHighlightedMessageId(null), 3000);
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
                <div className="forward-content">{forwardText || msg.text}</div>
              </div>
            )}

            {msg.text && !isForwarded && (
              <div className="message-text-content">
                {isSystem && <i className="fas fa-info-circle chat-system-icon" aria-hidden="true" />}
                {msg.text}
              </div>
            )}

            {msg.files && msg.files.length > 0 && (
              <div className={`message-attachments-wrap${msg.text ? ' has-caption' : ''}`}>
                <MessageAttachments
                  files={msg.files}
                  onOpenImage={(images, idx) => openImageViewer(images, idx)}
                />
              </div>
            )}

            {!msg.text && (!msg.files || msg.files.length === 0) && (
              <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>пустое сообщение</span>
            )}
          </div>

          {!isSystem && <div className="chat-message-time">{formatTime(msg.timestamp)}</div>}
        </div>
      </div>
    </div>
  );
}

const ChatVirtualList = forwardRef(function ChatVirtualList(
  {
    messages,
    selectedChat,
    user,
    highlightedMessageId,
    setHighlightedMessageId,
    openShareModal,
    handleMessageMenuToggle,
    openImageViewer,
    scrollRef,
    onScroll,
    onDragOver,
    onDrop,
    typingIndicator,
    forceScrollRef,
    isLoadingOlderRef,
  },
  ref,
) {
  const items = useMemo(() => buildChatItems(messages, selectedChat), [messages, selectedChat]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 88,
    overscan: 12,
  });

  const scrollToMessage = (messageId) => {
    const index = items.findIndex(
      (item) => item.type === 'message' && String(item.msg.id) === String(messageId),
    );
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'center', behavior: 'smooth' });
    }
  };

  const scrollToBottom = () => {
    if (items.length === 0) return;
    virtualizer.scrollToIndex(items.length - 1, { align: 'end' });
  };

  useImperativeHandle(ref, () => ({
    scrollToBottom,
    scrollToMessage,
  }));

  useEffect(() => {
    const list = scrollRef.current;
    if (!list) return undefined;
    if (isLoadingOlderRef?.current) return undefined;

    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    const isNearBottom = distanceFromBottom < 150;

    if (!forceScrollRef?.current && !isNearBottom) return undefined;

    const frame = requestAnimationFrame(() => {
      scrollToBottom();
      if (forceScrollRef) forceScrollRef.current = false;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, selectedChat, items.length]);

  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      className="chat-messages"
      ref={scrollRef}
      onScroll={onScroll}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      <div className="chat-messages-inner">
        <div
          className="chat-messages-stream"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const item = items[virtualRow.index];
            return (
              <div
                key={item.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ChatMessageRow
                  item={item}
                  user={user}
                  highlightedMessageId={highlightedMessageId}
                  setHighlightedMessageId={setHighlightedMessageId}
                  openShareModal={openShareModal}
                  handleMessageMenuToggle={handleMessageMenuToggle}
                  openImageViewer={openImageViewer}
                  scrollToMessage={scrollToMessage}
                />
              </div>
            );
          })}
        </div>
        {typingIndicator}
      </div>
    </div>
  );
});

export default ChatVirtualList;
