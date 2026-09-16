import { getStoredAuthToken, syncMediaAuthCookie, tryRefreshSession } from './authToken';
import { resolveAttachmentPreview } from './uploadPreviewCache';
import { withAuthToken } from './attachmentUrl';
import { captureVideoPoster } from './videoPoster';

const cache = new Map();
const inflight = new Map();
const MAX_CACHE = 80;

const cacheKey = (file, variant) => `${variant}:${file?.id || file?.url || file?.path}`;

const isVideoFile = (file) => {
  const mime = file?.mime || file?.type || '';
  return file?.kind === 'video' || file?.isVideo || mime.startsWith('video/');
};

export const resolveMediaPath = (file, variant = 'full') => {
  if (!file) return null;
  if (variant === 'thumb') {
    const thumb = file.thumb_url || file.thumbUrl;
    if (thumb) return thumb.split('?')[0];
    if (isVideoFile(file)) return null;
  }
  const base = file.url || file.path || (file.id ? `/api/files/${file.id}` : null);
  return base ? base.split('?')[0] : null;
};

const trimCache = () => {
  while (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
};

export function invalidateMediaBlob(file, variant = 'thumb') {
  cache.delete(cacheKey(file, variant));
  inflight.delete(cacheKey(file, variant));
}

const isImageBlob = async (blobUrl) => {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    return blob.size > 0 && blob.type.startsWith('image/');
  } catch {
    return false;
  }
};

export async function isMediaUrlAlive(url) {
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  if (url.startsWith('blob:')) return isImageBlob(url);
  return true;
}

const fetchBlob = async (path, allowRefresh = true) => {
  const token = getStoredAuthToken();
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(path, { credentials: 'include', headers });
  if (response.status === 401 && allowRefresh) {
    const refreshed = await tryRefreshSession();
    if (refreshed) return fetchBlob(path, false);
  }
  if (!response.ok) {
    throw new Error(`Media ${response.status}`);
  }
  return response.blob();
};

export async function fetchMediaBlob(file, variant = 'thumb') {
  if (!file) throw new Error('No file');

  const key = cacheKey(file, variant);
  const cached = cache.get(key);
  if (cached) {
    if (await isMediaUrlAlive(cached)) return cached;
    cache.delete(key);
  }
  if (inflight.has(key)) return inflight.get(key);

  const task = (async () => {
    const path = resolveMediaPath(file, variant);

    try {
      if (path) {
        const blob = await fetchBlob(withAuthToken(path));
        if (variant === 'thumb' && !blob.type.startsWith('image/')) {
          throw new Error('Thumb is not an image');
        }
        const blobUrl = URL.createObjectURL(blob);
        cache.set(key, blobUrl);
        trimCache();
        return blobUrl;
      }
      throw new Error('No path');
    } catch (error) {
      if (variant === 'thumb' && isVideoFile(file)) {
        const fullPath = resolveMediaPath(file, 'full');
        if (fullPath) {
          syncMediaAuthCookie();
          try {
            const posterUrl = await captureVideoPoster(withAuthToken(fullPath));
            cache.set(key, posterUrl);
            trimCache();
            return posterUrl;
          } catch {
            /* fall through */
          }
        }
      }
      if (variant === 'thumb' && !isVideoFile(file)) {
        const fullPath = resolveMediaPath(file, 'full');
        if (fullPath && fullPath !== path) {
          const blob = await fetchBlob(withAuthToken(fullPath));
          const blobUrl = URL.createObjectURL(blob);
          cache.set(key, blobUrl);
          trimCache();
          return blobUrl;
        }
      }
      throw error;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

export function peekMediaBlob(file, variant = 'thumb') {
  const cachedPreview = resolveAttachmentPreview(file);
  if (cachedPreview) return cachedPreview;
  return cache.get(cacheKey(file, variant)) || null;
}
