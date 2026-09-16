/** Client-side upload previews keyed by attachment id (survives staging cleanup). */
const previewsById = new Map();
const retainedUrls = new Set();

export function retainUploadPreview(attachmentId, previewUrl) {
  if (!attachmentId || !previewUrl) return;
  const prev = previewsById.get(attachmentId);
  if (prev && prev !== previewUrl && retainedUrls.has(prev)) {
    URL.revokeObjectURL(prev);
    retainedUrls.delete(prev);
  }
  previewsById.set(attachmentId, previewUrl);
  retainedUrls.add(previewUrl);
}

export function resolveAttachmentPreview(file) {
  if (!file) return null;
  if (file.preview) return file.preview;
  if (file.id) return previewsById.get(file.id) || null;
  return null;
}

export function isRetainedPreviewUrl(url) {
  return Boolean(url && retainedUrls.has(url));
}

export function releaseUploadPreview(attachmentId) {
  const url = previewsById.get(attachmentId);
  if (!url) return;
  previewsById.delete(attachmentId);
  retainedUrls.delete(url);
  if (url.startsWith('blob:')) URL.revokeObjectURL(url);
}
