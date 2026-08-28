// frontend/src/components/ImageModal.jsx

import React, { useState, useEffect, useRef } from 'react';

function ImageModal({ 
  isOpen, 
  onClose, 
  files, 
  currentIndex, 
  onPrev, 
  onNext,
  onDownload,
  onForward,
  onPin,
  onDelete,
  canPin = false,
  canDelete = false
}) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isZoomed, setIsZoomed] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);
  const containerRef = useRef(null);

  // Сброс при открытии нового файла
  useEffect(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsZoomed(false);
    setShowContextMenu(false);
  }, [currentIndex]);

  // Закрытие по Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
    };
    
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'auto';
    };
  }, [isOpen, onClose, onPrev, onNext]);

  if (!isOpen || !files || files.length === 0) return null;

  const currentFile = files[currentIndex];
  if (!currentFile) return null;

  const isImage = currentFile.isImage || 
    (currentFile.type && currentFile.type.startsWith('image/')) ||
    (currentFile.name && /\.(png|jpg|jpeg|gif|svg|webp|bmp|ico)$/i.test(currentFile.name));

  const isVideo = currentFile.isVideo ||
    (currentFile.type && currentFile.type.startsWith('video/')) ||
    (currentFile.name && /\.(mp4|avi|mov|wmv|flv|mkv|webm)$/i.test(currentFile.name));

    const getFileUrl = (file) => {
        if (!file) return '#';
        if (file.preview) return file.preview;
        
        let url = file.url || file.path || '#';
        
        try {
            url = encodeURI(url);
        } catch (e) {
            url = url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
        }
        
        // ❌ УБЕРИ ЭТОТ БЛОК:
        // if (url !== '#') {
        //   url += (url.includes('?') ? '&' : '?') + 't=' + Date.now();
        // }
        
        return url;
    };

  const fileUrl = getFileUrl(currentFile);

  // ✅ Зум по клику — на весь экран
  const handleImageClick = (e) => {
    e.stopPropagation();
    
    if (!isZoomed) {
      // ✅ Увеличиваем на весь экран (масштаб 3)
      setScale(3);
      setIsZoomed(true);
    } else {
      // ✅ Возвращаем в исходное
      setScale(1);
      setPosition({ x: 0, y: 0 });
      setIsZoomed(false);
    }
  };

  // Панорамирование (только когда увеличен)
  const handleMouseDown = (e) => {
    if (scale > 1) {
      setIsDragging(true);
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Контекстное меню
  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  // Форматирование размера
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div 
      className="image-modal-overlay" 
      onClick={() => {
        if (!showContextMenu) onClose();
      }}
      onContextMenu={handleContextMenu}
    >
      <div 
        className="image-modal-content" 
        onClick={(e) => e.stopPropagation()}
        ref={containerRef}
      >
        {/* Верхняя панель */}
        <div className="image-modal-topbar">
          <div className="image-modal-topbar-left">
            <span className="image-modal-filename">
              {currentFile.originalName || currentFile.name || 'Файл'}
            </span>
            {currentFile.size && (
              <span className="image-modal-filesize">
                {formatFileSize(currentFile.size)}
              </span>
            )}
          </div>
          <div className="image-modal-topbar-right">
            
            <button 
              className="image-modal-topbar-btn image-modal-close" 
              onClick={onClose}
              title="Закрыть (Esc)"
            >
              <i className="fas fa-times"></i>
            </button>
          </div>
        </div>

        {/* Навигация */}
        {files.length > 1 && (
          <>
            <button className="image-modal-nav image-modal-nav-prev" onClick={(e) => { e.stopPropagation(); onPrev(); }}>
              <i className="fas fa-chevron-left"></i>
            </button>
            <button className="image-modal-nav image-modal-nav-next" onClick={(e) => { e.stopPropagation(); onNext(); }}>
              <i className="fas fa-chevron-right"></i>
            </button>
            <div className="image-modal-counter">
              {currentIndex + 1} / {files.length}
            </div>
          </>
        )}

        {/* Медиа контент */}
        <div 
          className="image-modal-media"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{ cursor: scale > 1 ? 'grab' : 'default' }}
        >
          {isImage && (
            <img 
              ref={imgRef}
              src={fileUrl} 
              alt="" 
              className={`image-modal-img ${isZoomed ? 'zoomed' : ''}`}
              style={{
                transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
              }}
              loading="lazy"
              draggable={false}
              onClick={handleImageClick}
            />
          )}
          {isVideo && (
            <video 
              src={fileUrl} 
              controls 
              autoPlay
              className="image-modal-video"
              controlsList="nodownload"
            >
              Ваш браузер не поддерживает видео
            </video>
          )}
          {!isImage && !isVideo && (
            <div className="image-modal-file-info">
              <i className={`fas ${currentFile.isAudio ? 'fa-music' : 'fa-file'}`}></i>
              <p>{currentFile.originalName || currentFile.name || 'Файл'}</p>
              <button className="image-modal-download-btn" onClick={() => onDownload && onDownload(currentFile)}>
                <i className="fas fa-download"></i> Скачать
              </button>
            </div>
          )}
        </div>

        {/* ✅ Подсказка о зуме (только для фото) */}
        {isImage && (
          <div className="image-modal-zoom-hint">
            <span className="image-modal-zoom-level">{Math.round(scale * 100)}%</span>
          </div>
        )}

        {/* Нижняя панель */}
        <div className="image-modal-bottom-bar">
          <span className="image-modal-filename">
            {currentFile.originalName || currentFile.name || 'Файл'}
          </span>
          <div className="image-modal-bottom-actions">
            <button 
              className="image-modal-bottom-btn" 
              onClick={() => onDownload && onDownload(currentFile)}
              title="Скачать"
            >
              <i className="fas fa-download"></i>
            </button>
          </div>
        </div>

        {/* Контекстное меню */}
        {showContextMenu && (
          <div 
            className="image-modal-context-menu"
            style={{ 
              position: 'fixed', 
              top: contextMenuPos.y, 
              left: contextMenuPos.x,
              zIndex: 100000
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="image-modal-context-menu-item" onClick={() => { onDownload && onDownload(currentFile); setShowContextMenu(false); }}>
              <i className="fas fa-download"></i> Скачать
            </div>
            <div className="image-modal-context-menu-item" onClick={() => { onForward && onForward(currentFile); setShowContextMenu(false); }}>
              <i className="fas fa-share"></i> Переслать
            </div>
            {canPin && (
              <div className="image-modal-context-menu-item" onClick={() => { onPin && onPin(currentFile); setShowContextMenu(false); }}>
                <i className="fas fa-thumbtack"></i> Закрепить
              </div>
            )}
            {canDelete && (
              <div className="image-modal-context-menu-item image-modal-context-menu-item-danger" onClick={() => { onDelete && onDelete(currentFile); setShowContextMenu(false); }}>
                <i className="fas fa-trash"></i> Удалить
              </div>
            )}
            <div className="image-modal-context-menu-divider"></div>
            <div className="image-modal-context-menu-item" onClick={() => { setShowContextMenu(false); }}>
              <i className="fas fa-times"></i> Закрыть
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ImageModal;