import { formatFileSize } from './helpers';

/** Должно совпадать с app/config.py и app/file_magic.py */
export const UPLOAD_LIMITS = {
  image: 10 * 1024 * 1024,
  video: 400 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  file: 10 * 1024 * 1024,
};

export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.mp4',
  '.webm',
  '.mov',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.txt',
  '.zip',
]);

export const UPLOAD_ACCEPT =
  'image/jpeg,image/png,image/gif,image/webp,' +
  'video/mp4,video/webm,video/quicktime,' +
  'audio/mpeg,audio/wav,audio/ogg,audio/mp4,' +
  'application/pdf,application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.ms-excel,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,' +
  'text/plain,application/zip,' +
  '.jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.mp3,.wav,.ogg,.m4a,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip';

const EXT_KIND = {
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.m4a': 'audio',
};

const kindFromType = (type = '') => {
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
};

const getExtension = (name = '') => {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf('.');
  if (dot === -1) return '';
  return lower.slice(dot);
};

const kindFromName = (name = '') => EXT_KIND[getExtension(name)] || null;

const kindLabel = {
  image: 'изображение',
  video: 'видео',
  audio: 'аудио',
  file: 'файл',
};

export function getUploadKind(file) {
  const type = file?.type || '';
  const fromType = kindFromType(type);
  if (fromType !== 'file' || type === 'application/octet-stream') {
    if (fromType !== 'file') return fromType;
  }
  return kindFromName(file?.name || '') || fromType;
}

export function getUploadLimit(file) {
  return UPLOAD_LIMITS[getUploadKind(file)];
}

export function validateUploadFile(file) {
  const kind = getUploadKind(file);
  const ext = getExtension(file?.name || '');

  if (ext && !ALLOWED_UPLOAD_EXTENSIONS.has(ext)) {
    return {
      ok: false,
      kind,
      message: `Формат «${ext}» не поддерживается. Выберите JPG, PNG, MP4, PDF и другие разрешённые типы.`,
    };
  }

  const limit = UPLOAD_LIMITS[kind];
  if (file.size > limit) {
    return {
      ok: false,
      kind,
      message: `${kindLabel[kind]} слишком большой: ${formatFileSize(file.size)}. Максимум ${formatFileSize(limit)}.`,
    };
  }
  return { ok: true, kind, message: null };
}

export function parseUploadError(xhr) {
  if (xhr.status === 413) {
    return 'Файл слишком большой. Сожмите видео или выберите файл меньшего размера.';
  }
  if (xhr.status === 0) {
    return 'Сеть прервала загрузку. Проверьте соединение и попробуйте снова.';
  }
  try {
    const data = JSON.parse(xhr.responseText);
    if (typeof data.detail === 'string') return data.detail;
    if (Array.isArray(data.detail)) {
      return data.detail.map((d) => d.msg || d).join(', ');
    }
  } catch {
    /* ignore */
  }
  if (xhr.status >= 400) {
    return `Не удалось загрузить файл (ошибка ${xhr.status})`;
  }
  return 'Не удалось загрузить файл';
}
