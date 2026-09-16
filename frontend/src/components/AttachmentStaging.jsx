import React from 'react';
import { FileText, Image as ImageIcon, Music, Video, X } from 'lucide-react';
import { formatFileSize } from '../utils/helpers';
import { formatDuration } from '../utils/attachmentUrl';

const stageIcon = (item) => {
  const type = item.file?.type || item.type || '';
  if (type.startsWith('image/')) return ImageIcon;
  if (type.startsWith('video/')) return Video;
  if (type.startsWith('audio/')) return Music;
  return FileText;
};

export default function AttachmentStaging({
  items = [],
  onRemove,
  onRetry,
}) {
  if (!items.length) return null;

  return (
    <div className="chat-staging">
      {items.map((item, index) => {
        const Icon = stageIcon(item);
        const progress = item.progress ?? 0;
        const failed = item.status === 'error';
        const uploading = item.status === 'uploading';

        return (
          <div
            key={item.key || index}
            className={`chat-staging-item ${failed ? 'is-error' : ''} ${uploading ? 'is-uploading' : ''}`}
          >
            <button
              type="button"
              className="chat-staging-remove"
              onClick={() => onRemove(index)}
              aria-label="Удалить"
            >
              <X size={14} />
            </button>

            <div className="chat-staging-preview">
              {item.preview ? (
                <img src={item.preview} alt="" className="chat-staging-thumb" />
              ) : (
                <div className="chat-staging-icon"><Icon size={24} /></div>
              )}
              {(item.kind === 'video' || item.file?.type?.startsWith('video/')) && (
                <span className="chat-staging-play"><Video size={14} /></span>
              )}
            </div>

            <div className="chat-staging-meta">
              <span className="chat-staging-name">{item.name}</span>
              <span className="chat-staging-size">
                {formatFileSize(item.size)}
                {item.duration != null ? ` · ${formatDuration(item.duration)}` : ''}
              </span>
              {uploading && (
                <div className="chat-staging-progress">
                  <div className="chat-staging-progress-bar" style={{ width: `${progress}%` }} />
                </div>
              )}
              {failed && (
                <div className="chat-staging-error">
                  <span>{item.errorMessage || 'Не отправлено'}</span>
                  <button type="button" onClick={() => onRetry?.(index)}>Повторить</button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
