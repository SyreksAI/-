// frontend/src/hooks/useFiles.js
import { useState, useRef } from 'react'; // ← добавить useRef
import { formatFileSize, getFileIcon, getFileColor } from '../utils/helpers';

export function useFiles(user, selectedChat) {
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [isUploading, setIsUploading] = useState(false);
  const [filePreviews, setFilePreviews] = useState({});
  
  // ✅ Кеш для URL — сохраняется между рендерами
  const urlCache = useRef(new Map());

  /**
   * Получение URL файла с кешированием
   */
  const getFileUrl = (file) => {
    if (!file) return '#';
    if (file.preview) return file.preview;
    
    const cacheKey = file.path || file.url || file.name || file.originalName || file.id;
    if (urlCache.current.has(cacheKey)) {
      return urlCache.current.get(cacheKey);
    }
    
    let url = file.url || file.path || '#';
    try {
      url = encodeURI(url);
    } catch (e) {
      url = url.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
    }
    
    urlCache.current.set(cacheKey, url);
    return url;
  };

  /**
   * Загрузка файлов на сервер
   */
  const uploadFiles = async (files) => {
    if (files.length === 0) return [];
    
    setIsUploading(true);
    const uploadedFiles = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const formData = new FormData();
      formData.append('file', file);
      formData.append('chat_id', selectedChat);
      formData.append('user_id', user.id);
      
      try {
        setUploadProgress(prev => ({ ...prev, [i]: 0 }));
        
        const response = await fetch('/api/upload/upload', {
          method: 'POST',
          headers: { 'X-User-ID': String(user.id) },
          body: formData
        });
        
        let progress = 0;
        const interval = setInterval(() => {
          progress += Math.random() * 15;
          if (progress > 90) {
            progress = 90;
            clearInterval(interval);
          }
          setUploadProgress(prev => ({ ...prev, [i]: Math.min(progress, 90) }));
        }, 200);
        
        if (!response.ok) {
          throw new Error('Ошибка загрузки файла');
        }
        
        const data = await response.json();
        clearInterval(interval);
        setUploadProgress(prev => ({ ...prev, [i]: 100 }));
        
        const fileData = {
          originalName: file.name,
          name: file.name,
          serverName: data.name || data.filename || `file_${Date.now()}`,
          size: file.size,
          type: file.type,
          path: data.path || data.url,
          url: data.url || data.path,
          isImage: file.type && file.type.startsWith('image/'),
          isVideo: file.type && file.type.startsWith('video/'),
          isAudio: file.type && file.type.startsWith('audio/'),
          preview: filePreviews[i] || null
        };
        
        uploadedFiles.push(fileData);
        
      } catch (error) {
        console.error('Upload error:', error);
        setUploadProgress(prev => ({ ...prev, [i]: -1 }));
      }
    }
    
    setIsUploading(false);
    return uploadedFiles;
  };

  /**
   * Выбор файлов
   */
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    setSelectedFiles(prev => [...prev, ...files]);
    
    files.forEach((file, index) => {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          const previewIndex = index + selectedFiles.length;
          setFilePreviews(prev => ({ ...prev, [previewIndex]: reader.result }));
        };
        reader.readAsDataURL(file);
      }
    });
    
    e.target.value = '';
  };

  /**
   * Удаление файла из списка
   */
  const removeFile = (index) => {
    setFilePreviews(prev => {
      const newPreviews = { ...prev };
      delete newPreviews[index];
      return newPreviews;
    });
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  /**
   * Очистка всех файлов
   */
  const clearFiles = () => {
    setSelectedFiles([]);
    setUploadProgress({});
    setFilePreviews({});
  };

  return {
    selectedFiles,
    setSelectedFiles,
    uploadProgress,
    isUploading,
    filePreviews,
    getFileUrl,
    uploadFiles,
    handleFileSelect,
    removeFile,
    clearFiles,
    formatFileSize,
    getFileIcon,
    getFileColor
  };
}