// frontend/src/components/ChatMessage.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function ChatMessage({ 
  msg, 
  isOwn,
  isSystem, 
  onOpenImageViewer, 
  onShare, 
  onMenuToggle,
  onReply,
  onEdit,
  onDelete,
  formatTime,
  getFileUrl,
  formatFileSize
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text || '');

  const handleEditSubmit = (e) => {
    e.preventDefault();
    if (editText.trim() && editText.trim() !== msg.text) {
      onEdit(msg.id, editText.trim());
    }
    setIsEditing(false);
  };

  // ===== ФУНКЦИИ ДЛЯ ОПРЕДЕЛЕНИЯ ТИПОВ ФАЙЛОВ =====
  const getFileIcon = (file) => {
    const name = file.name || file.originalName || '';
    const type = file.type || '';
    
    if (type.startsWith('image/') || /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(name)) {
      return 'fa-image';
    }
    if (type.startsWith('video/') || /\.(mp4|avi|mov|wmv|flv|mkv|webm)$/i.test(name)) {
      return 'fa-video';
    }
    if (type.startsWith('audio/') || /\.(mp3|wav|flac|aac|ogg|wma)$/i.test(name)) {
      return 'fa-music';
    }
    if (type.includes('pdf') || /\.pdf$/i.test(name)) {
      return 'fa-file-pdf';
    }
    if (type.includes('word') || /\.(doc|docx)$/i.test(name)) {
      return 'fa-file-word';
    }
    if (type.includes('excel') || /\.(xls|xlsx)$/i.test(name)) {
      return 'fa-file-excel';
    }
    if (type.includes('zip') || /\.(zip|rar|7z|tar|gz)$/i.test(name)) {
      return 'fa-file-archive';
    }
    if (type.includes('text/') || /\.(txt|md|log)$/i.test(name)) {
      return 'fa-file-alt';
    }
    return 'fa-file';
  };

  const getFileColor = (file) => {
    const name = file.name || file.originalName || '';
    const type = file.type || '';
    
    if (type.startsWith('image/') || /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(name)) {
      return '#3b82f6';
    }
    if (type.startsWith('video/') || /\.(mp4|avi|mov|wmv|flv|mkv|webm)$/i.test(name)) {
      return '#8b5cf6';
    }
    if (type.startsWith('audio/') || /\.(mp3|wav|flac|aac|ogg|wma)$/i.test(name)) {
      return '#ec4899';
    }
    if (type.includes('pdf') || /\.pdf$/i.test(name)) {
      return '#ef4444';
    }
    if (type.includes('word') || /\.(doc|docx)$/i.test(name)) {
      return '#3b82f6';
    }
    if (type.includes('excel') || /\.(xls|xlsx)$/i.test(name)) {
      return '#22c55e';
    }
    if (type.includes('zip') || /\.(zip|rar|7z|tar|gz)$/i.test(name)) {
      return '#f59e0b';
    }
    return '#64748b';
  };

  // ===== РЕНДЕР ФАЙЛОВ =====
  const renderFile = (file, idx) => {
    const fileUrl = getFileUrl(file);
    const fileName = file.originalName || file.name || 'Файл';
    const fileSize = file.size ? formatFileSize(file.size) : '';
    
    const isImage = file.isImage === true || 
      (file.type && file.type.startsWith('image/')) ||
      (file.name && /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(file.name)) ||
      (file.originalName && /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(file.originalName));

    const isVideo = file.isVideo === true ||
      (file.type && file.type.startsWith('video/')) ||
      (file.name && /\.(mp4|avi|mov|wmv|flv|mkv|webm)$/i.test(file.name)) ||
      (file.originalName && /\.(mp4|avi|mov|wmv|flv|mkv|webm)$/i.test(file.originalName));

    const isAudio = file.isAudio === true ||
      (file.type && file.type.startsWith('audio/')) ||
      (file.name && /\.(mp3|wav|flac|aac|ogg|wma)$/i.test(file.name)) ||
      (file.originalName && /\.(mp3|wav|flac|aac|ogg|wma)$/i.test(file.originalName));

    // ===== 📸 ФОТО =====
    if (isImage) {
      const imgSrc = file.preview || fileUrl;
      return (
        <div 
          key={idx} 
          className="message-file-image" 
          onClick={() => onOpenImageViewer(msg.files, idx)}
        >
          <img 
            src={imgSrc} 
            alt={fileName}
            className="message-image-thumb"
            loading="lazy"
            crossOrigin="anonymous"
            onError={(e) => {
              console.error('❌ Ошибка загрузки фото:', imgSrc);
              e.target.src = '/placeholder-image.png';
            }}
          />
          {fileSize && <span className="file-size-badge">{fileSize}</span>}
        </div>
      );
    }

    // ===== 🎥 ВИДЕО =====
    if (isVideo) {
      return (
        <div key={idx} className="message-file-video">
          <div className="video-wrapper">
            <video 
              src={fileUrl}
              controls
              preload="metadata"
              className="message-video-player"
              controlsList="nodownload"
              playsInline
            >
              Ваш браузер не поддерживает видео
            </video>
            <div className="file-name-caption">
              <i className="fas fa-video"></i>
              <span>{fileName}</span>
              {fileSize && <span className="file-size">{fileSize}</span>}
            </div>
          </div>
        </div>
      );
    }

    // ===== 🎵 АУДИО =====
    if (isAudio) {
      return (
        <div key={idx} className="message-file-audio">
          <div className="audio-player-wrapper">
            <div className="audio-icon">
              <i className="fas fa-music"></i>
            </div>
            <div className="audio-info">
              <div className="audio-name">{fileName}</div>
              {fileSize && <div className="audio-size">{fileSize}</div>}
            </div>
            <audio 
              src={fileUrl}
              controls
              className="message-audio-player"
              controlsList="nodownload"
              preload="metadata"
            >
              Ваш браузер не поддерживает аудио
            </audio>
          </div>
        </div>
      );
    }

    // ===== 📄 ОСТАЛЬНЫЕ ФАЙЛЫ =====
    const icon = getFileIcon(file);
    const color = getFileColor(file);
    
    return (
      <div key={idx} className="message-file">
        <div className="file-icon-wrapper" style={{ color: color }}>
          <i className={`fas ${icon}`}></i>
        </div>
        <div className="file-info">
          <a 
            href={fileUrl} 
            target="_blank" 
            rel="noopener noreferrer" 
            className="file-link"
            download={fileName}
          >
            {fileName}
          </a>
          {fileSize && <span className="file-size">{fileSize}</span>}
        </div>
        <button 
          className="file-download-btn"
          onClick={() => {
            const link = document.createElement('a');
            link.href = fileUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
          title="Скачать"
        >
          <i className="fas fa-download"></i>
        </button>
      </div>
    );
  };

  return (
    <div className={`chat-message ${isOwn ? 'own' : ''} ${isSystem ? 'system' : ''}`}>
      {!isOwn && !isSystem && (
        <div className="chat-message-avatar">
          <i className="fas fa-user-circle"></i>
        </div>
      )}
      
      <div className="chat-message-content">
        <div className="chat-message-bubble" style={{ position: 'relative' }}>
          
          {/* ✅ КНОПКИ ПРИ НАВЕДЕНИИ */}
          {!isSystem && (
            <div className={`message-hover-actions ${isOwn ? 'own' : ''}`}>
              <button 
                className="message-hover-btn message-share-btn"
                onClick={(e) => { e.stopPropagation(); onShare(msg); }}
                title="Поделиться"
              >
                <i className="fas fa-share-alt"></i>
              </button>
              <button 
                className="message-hover-btn message-menu-btn"
                onClick={(e) => onMenuToggle(e, msg)}
                title="Ещё"
              >
                <i className="fas fa-ellipsis-v"></i>
              </button>
            </div>
          )}

          {/* 👤 ИМЯ ОТПРАВИТЕЛЯ */}
          {!isOwn && !isSystem && (
            <Link to={`/profile/${msg.userId}`} className="chat-message-sender">
              {msg.username || msg.name}
            </Link>
          )}

          {/* 📝 ТЕКСТ СООБЩЕНИЯ */}
          <div className="chat-message-text">
            {isEditing ? (
              <form onSubmit={handleEditSubmit} className="message-edit-form">
                <input
                  type="text"
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  autoFocus
                  className="message-edit-input"
                />
                <button type="submit" className="message-edit-save">
                  <i className="fas fa-check"></i>
                </button>
                <button type="button" className="message-edit-cancel" onClick={() => setIsEditing(false)}>
                  <i className="fas fa-times"></i>
                </button>
              </form>
            ) : (
              <>
                {/* 📎 Ответ на сообщение */}
                {msg.reply_to && (
                  <div className="message-reply-quote">
                    <div className="reply-quote-sender">
                      <i className="fas fa-reply"></i>
                      <span>{msg.reply_to.username}</span>
                    </div>
                    <div className="reply-quote-text">{msg.reply_to.text}</div>
                  </div>
                )}

                {/* 📝 Текст */}
                {msg.text && <div className="message-text-content">{msg.text}</div>}
                {msg.edited && <span className="message-edited-label">(ред.)</span>}
              </>
            )}

            {/* 📎 ФАЙЛЫ */}
            {msg.files && msg.files.length > 0 && (
              <div className="message-files">
                {msg.files.map((file, idx) => renderFile(file, idx))}
              </div>
            )}

            {/* ⚠️ Пустое сообщение */}
            {!msg.text && (!msg.files || msg.files.length === 0) && (
              <span className="empty-message-text">пустое сообщение</span>
            )}
          </div>

          {/* ⏰ ВРЕМЯ */}
          <div className="chat-message-time">{formatTime(msg.timestamp)}</div>
        </div>
      </div>
    </div>
  );
}

export default ChatMessage;