// frontend/src/components/ChatMessage.jsx
import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function ChatMessage({ 
  msg, 
  isOwn,  // ← ПРОСТО ПРИНИМАЙ isOwn КАК ПАРАМЕТР!
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

  return (
    <div className={`chat-message ${isOwn ? 'own' : ''} ${isSystem ? 'system' : ''}`}>
      {!isOwn && !isSystem && (
        <div className="chat-message-avatar">
          <i className="fas fa-user-circle"></i>
        </div>
      )}
      <div className="chat-message-content">
        <div className="chat-message-bubble" style={{ position: 'relative' }}>
          
          {/* ✅ Кнопки при наведении */}
          {!isSystem && (
            <div className={`message-hover-actions ${isOwn ? 'own' : ''}`}>
              {/* Кнопка "Поделиться" */}
              <button 
                className="message-hover-btn message-share-btn"
                onClick={(e) => { e.stopPropagation(); onShare(msg); }}
                title="Поделиться"
              >
                <i className="fas fa-share-alt"></i>
              </button>
              {/* Кнопка ⋮ — открывает контекстное меню */}
              <button 
                className="message-hover-btn message-menu-btn"
                onClick={(e) => onMenuToggle(e, msg)}
                title="Ещё"
              >
                <i className="fas fa-ellipsis-v"></i>
              </button>
            </div>
          )}

          {!isOwn && !isSystem && (
            <Link to={`/profile/${msg.userId}`} className="chat-message-sender">
              {msg.username || msg.name}
            </Link>
          )}
          
          <div className="chat-message-text">
            {/* Режим редактирования */}
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
                {msg.text && <div className="message-text-content">{msg.text}</div>}
                {msg.edited && <span className="message-edited-label">(ред.)</span>}
              </>
            )}
            
            {/* Файлы */}
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
                        onClick={() => onOpenImageViewer(msg.files, idx)}
                      >
                        <img 
                          src={imgSrc} 
                          alt="" 
                          className="message-image-thumb"
                          loading="lazy"
                          crossOrigin="anonymous"
                          onError={(e) => {
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
  );
}

export default ChatMessage;