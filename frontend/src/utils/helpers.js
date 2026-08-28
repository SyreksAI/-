// frontend/src/utils/helpers.js

/**
 * Форматирование размера файла
 */
export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Форматирование времени
 */
export const formatTime = (timestamp) => {
  if (!timestamp) return '';
  return new Date(timestamp).toLocaleTimeString('ru-RU', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });
};

/**
 * Форматирование даты
 */
export const formatDate = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const diff = (new Date(now.getFullYear(), now.getMonth(), now.getDate()) - 
                new Date(date.getFullYear(), date.getMonth(), date.getDate())) / 
               (1000 * 60 * 60 * 24);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Вчера';
  return date.toLocaleDateString('ru-RU');
};

/**
 * Получение иконки для файла
 */
export const getFileIcon = (file) => {
  const type = file.type;
  if (type?.startsWith('image/')) return 'fa-image';
  if (type?.startsWith('video/')) return 'fa-video';
  if (type?.startsWith('audio/')) return 'fa-music';
  if (type?.includes('pdf')) return 'fa-file-pdf';
  if (type?.includes('word') || type?.includes('doc')) return 'fa-file-word';
  if (type?.includes('excel') || type?.includes('sheet')) return 'fa-file-excel';
  if (type?.includes('zip') || type?.includes('rar') || type?.includes('7z')) return 'fa-file-archive';
  return 'fa-file';
};

/**
 * Получение цвета для файла
 */
export const getFileColor = (file) => {
  const type = file.type;
  if (type?.startsWith('image/')) return '#3b82f6';
  if (type?.startsWith('video/')) return '#8b5cf6';
  if (type?.startsWith('audio/')) return '#ec4899';
  if (type?.includes('pdf')) return '#ef4444';
  if (type?.includes('word') || type?.includes('doc')) return '#3b82f6';
  if (type?.includes('excel') || type?.includes('sheet')) return '#22c55e';
  if (type?.includes('zip') || type?.includes('rar') || type?.includes('7z')) return '#f59e0b';
  return '#64748b';
};