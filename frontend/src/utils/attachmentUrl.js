import { getStoredAuthToken, syncMediaAuthCookie } from './authToken';

/** Build authenticated media URL for <img>/<video>/<audio> tags. */
export const withAuthToken = (url) => {
  if (!url || url === '#') return url;
  const token = getStoredAuthToken();
  if (!token || url.includes('token=')) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(token)}`;
};

export const attachmentDisplayUrl = (file) => {
  if (!file) return '#';
  if (file.preview) return file.preview;
  const base = (file.url || file.path || (file.id ? `/api/files/${file.id}` : '#')).split('?')[0];
  if (base.startsWith('/api/files/')) {
    syncMediaAuthCookie();
    return withAuthToken(base);
  }
  return base;
};

export const attachmentThumbUrl = (file) => {
  if (!file) return null;
  if (file.preview) return file.preview;
  const thumb = file.thumb_url || file.thumbUrl;
  if (thumb) {
    syncMediaAuthCookie();
    return thumb.split('?')[0];
  }
  if (file.kind === 'image' || file.isImage || file.mime?.startsWith('image/') || file.type?.startsWith('image/')) {
    return attachmentDisplayUrl(file);
  }
  return null;
};

export const formatDuration = (seconds) => {
  if (seconds == null || Number.isNaN(seconds)) return '';
  const total = Math.max(0, Math.floor(Number(seconds)));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
