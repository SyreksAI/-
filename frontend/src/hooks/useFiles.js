import { useCallback, useEffect, useRef, useState } from 'react';
import { formatFileSize, getFileColor, getFileIcon } from '../utils/helpers';
import { attachmentDisplayUrl } from '../utils/attachmentUrl';
import { getStoredAuthToken } from '../utils/authToken';
import { getUploadKind, parseUploadError, validateUploadFile } from '../utils/uploadLimits';
import { captureVideoPoster } from '../utils/videoPoster';
import { isRetainedPreviewUrl } from '../utils/uploadPreviewCache';

const makeKey = () => `staged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const readPreview = (file) =>
  new Promise((resolve) => {
    if (!file.type?.startsWith('image/')) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });

const readVideoMeta = (file, kind) =>
  new Promise((resolve) => {
    if (kind !== 'video' && !file.type?.startsWith('video/')) {
      resolve({ duration: null, width: null, height: null, preview: null });
      return;
    }

    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    const finish = async () => {
      const duration = Number.isFinite(video.duration) ? video.duration : null;
      const width = video.videoWidth || null;
      const height = video.videoHeight || null;

      try {
        const preview = await captureVideoPoster(url);
        URL.revokeObjectURL(url);
        resolve({ duration, width, height, preview });
      } catch {
        URL.revokeObjectURL(url);
        resolve({ duration, width, height, preview: null });
      }
    };

    video.onloadedmetadata = () => {
      finish();
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ duration: null, width: null, height: null, preview: null });
    };
    video.src = url;
  });

export function useFiles(user, selectedChat) {
  const [stagedItems, setStagedItems] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const urlCache = useRef(new Map());
  const previewUrlsRef = useRef(new Set());

  const trackPreview = useCallback((preview) => {
    if (preview && typeof preview === 'string' && preview.startsWith('blob:')) {
      previewUrlsRef.current.add(preview);
    }
  }, []);

  const revokePreview = useCallback((preview) => {
    if (!preview || isRetainedPreviewUrl(preview)) return;
    if (previewUrlsRef.current.has(preview)) {
      URL.revokeObjectURL(preview);
      previewUrlsRef.current.delete(preview);
    }
  }, []);

  useEffect(
    () => () => {
      previewUrlsRef.current.forEach((url) => {
        if (!isRetainedPreviewUrl(url)) URL.revokeObjectURL(url);
      });
      previewUrlsRef.current.clear();
    },
    [],
  );

  const getFileUrl = useCallback((file) => {
    if (!file) return '#';
    if (file.preview) return file.preview;
    const cacheKey = file.id || file.path || file.url || file.name;
    if (urlCache.current.has(cacheKey)) {
      return urlCache.current.get(cacheKey);
    }
    const url = attachmentDisplayUrl(file);
    urlCache.current.set(cacheKey, url);
    return url;
  }, []);

  const addFiles = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;

      const entries = await Promise.all(
        files.map(async (file) => {
          const kind = getUploadKind(file);
          const [preview, videoMeta] = await Promise.all([
            readPreview(file),
            readVideoMeta(file, kind),
          ]);
          const validation = validateUploadFile(file);
          const resolvedPreview = preview || videoMeta.preview;
          trackPreview(resolvedPreview);
          return {
            key: makeKey(),
            file,
            name: file.name,
            size: file.size,
            type: file.type,
            kind,
            preview: resolvedPreview,
            duration: videoMeta.duration,
            width: videoMeta.width,
            height: videoMeta.height,
            status: validation.ok ? 'ready' : 'error',
            errorMessage: validation.message,
            progress: 0,
            attachment: null,
          };
        }),
      );
      setStagedItems((prev) => [...prev, ...entries]);
    },
    [trackPreview],
  );

  const handleFileSelect = useCallback(
    (e) => {
      addFiles(e.target.files);
      e.target.value = '';
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const files = [];
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) files.push(f);
        }
      }
      if (files.length) {
        e.preventDefault();
        addFiles(files);
      }
    },
    [addFiles],
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.files?.length) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles],
  );

  const removeStaged = useCallback(
    (index) => {
      setStagedItems((prev) => {
        const item = prev[index];
        if (item?.preview) revokePreview(item.preview);
        return prev.filter((_, i) => i !== index);
      });
    },
    [revokePreview],
  );

  const clearStaged = useCallback(() => {
    setStagedItems((prev) => {
      prev.forEach((item) => {
        if (item?.preview) revokePreview(item.preview);
      });
      return [];
    });
  }, [revokePreview]);

  const uploadOneItem = useCallback(
    (item, chatId, onProgress) =>
      new Promise((resolve, reject) => {
        if (!item?.file) {
          reject(new Error('Файл недоступен'));
          return;
        }
        if (item.attachment) {
          onProgress?.(100);
          resolve(item.attachment);
          return;
        }

        const xhr = new XMLHttpRequest();
        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('chat_id', chatId);
        if (item.duration != null) formData.append('duration', String(item.duration));
        if (item.width != null) formData.append('width', String(item.width));
        if (item.height != null) formData.append('height', String(item.height));

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;
          onProgress?.(Math.round((event.loaded / event.total) * 100));
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch (err) {
              reject(err);
            }
            return;
          }
          reject(new Error(parseUploadError(xhr)));
        };

        xhr.onerror = () => reject(new Error(parseUploadError({ status: 0, responseText: '' })));

        xhr.open('POST', '/api/chat/upload');
        const token = getStoredAuthToken();
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.send(formData);
      }),
    [],
  );

  const uploadOne = useCallback(
    (item, index) =>
      uploadOneItem(item, selectedChat, (pct) => {
        setStagedItems((prev) =>
          prev.map((row, i) => (i === index ? { ...row, progress: pct, status: 'uploading' } : row)),
        );
      }).then((data) => {
        setStagedItems((prev) =>
          prev.map((row, i) =>
            i === index ? { ...row, progress: 100, status: 'done', attachment: data } : row,
          ),
        );
        return data;
      }),
    [selectedChat, uploadOneItem],
  );

  const uploadStaged = useCallback(async () => {
    if (!stagedItems.length) return [];
    const blocked = stagedItems.find((item) => item.status === 'error');
    if (blocked) {
      throw new Error(blocked.errorMessage || 'Удалите или замените файлы с ошибкой');
    }
    setIsUploading(true);
    const uploaded = [];

    for (let i = 0; i < stagedItems.length; i += 1) {
      const item = stagedItems[i];
      if (item.attachment) {
        uploaded.push(item.attachment);
        continue;
      }
      try {
        setStagedItems((prev) =>
          prev.map((row, idx) => (idx === i ? { ...row, status: 'uploading', progress: 0 } : row)),
        );
        const data = await uploadOne(item, i);
        uploaded.push(data);
      } catch (error) {
        console.error('Upload error:', error);
        const message = error?.message || 'Не удалось загрузить файл';
        setStagedItems((prev) =>
          prev.map((row, idx) =>
            idx === i ? { ...row, status: 'error', progress: 0, errorMessage: message } : row,
          ),
        );
        setIsUploading(false);
        throw error;
      }
    }

    setIsUploading(false);
    return uploaded;
  }, [stagedItems, uploadOne]);

  const retryStaged = useCallback(
    async (index) => {
      const item = stagedItems[index];
      if (!item?.file) return null;
      setIsUploading(true);
      try {
        const data = await uploadOne(item, index);
        setIsUploading(false);
        return data;
      } catch (error) {
        const message = error?.message || 'Не удалось загрузить файл';
        setStagedItems((prev) =>
          prev.map((row, i) =>
            i === index ? { ...row, status: 'error', errorMessage: message } : row,
          ),
        );
        setIsUploading(false);
        throw error;
      }
    },
    [stagedItems, uploadOne],
  );

  const selectedFiles = stagedItems.map((s) => s.file).filter(Boolean);
  const uploadProgress = Object.fromEntries(
    stagedItems.map((s, i) => [i, s.status === 'error' ? -1 : s.progress]),
  );

  return {
    stagedItems,
    selectedFiles,
    uploadProgress,
    isUploading,
    filePreviews: Object.fromEntries(
      stagedItems.map((s, i) => (s.preview ? [i, s.preview] : [])).filter((e) => e.length),
    ),
    getFileUrl,
    uploadFiles: uploadStaged,
    uploadStaged,
    handleFileSelect,
    handlePaste,
    handleDrop,
    addFiles,
    removeFile: removeStaged,
    removeStaged,
    clearFiles: clearStaged,
    clearStaged,
    retryStaged,
    formatFileSize,
    getFileIcon,
    getFileColor,
  };
}
