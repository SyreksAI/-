import React, { useMemo } from 'react';
import { Download, FileText, Film, Image as ImageIcon, Music } from 'lucide-react';
import { formatFileSize } from '../utils/helpers';
import { attachmentDisplayUrl, formatDuration } from '../utils/attachmentUrl';
import AudioPlayer from './AudioPlayer';
import ChatMediaImage from './ChatMediaImage';
import ChatMediaVideo from './ChatMediaVideo';

const kindOf = (file) => {
  if (file.kind) return file.kind;
  const mime = file.mime || file.type || '';
  if (file.isImage || mime.startsWith('image/')) return 'image';
  if (file.isVideo || mime.startsWith('video/')) return 'video';
  if (file.isAudio || mime.startsWith('audio/')) return 'audio';
  return 'file';
};

const kindMeta = {
  image: { label: 'Фото', Icon: ImageIcon },
  video: { label: 'Видео', Icon: Film },
  audio: { label: 'Аудио', Icon: Music },
  file: { label: 'Файл', Icon: FileText },
};

function MediaCardHeader({ file }) {
  const kind = kindOf(file);
  const { label, Icon } = kindMeta[kind] || kindMeta.file;
  const name = file.original_name || file.name || label;
  const metaParts = [];
  if (file.size != null) metaParts.push(formatFileSize(file.size));
  if (file.duration != null && (kind === 'video' || kind === 'audio')) {
    metaParts.push(formatDuration(file.duration));
  }

  return (
    <div className="chat-attach-card-head">
      <span className="chat-attach-card-badge">
        <Icon size={14} />
        {label}
      </span>
      <span className="chat-attach-card-title" title={name}>
        {name}
      </span>
      {metaParts.length > 0 && (
        <span className="chat-attach-card-size">{metaParts.join(' · ')}</span>
      )}
    </div>
  );
}

function ImageGrid({ images, onOpen }) {
  const visible = images.slice(0, 4);
  const extra = images.length - visible.length;

  return (
    <div className={`chat-attach-grid count-${Math.min(images.length, 4)}`}>
      {visible.map((file, idx) => {
        const ratio = file.width && file.height ? `${file.width} / ${file.height}` : '4 / 3';
        const extraLabel = extra > 0 && idx === visible.length - 1 ? `+${extra}` : null;
        return (
          <ChatMediaImage
            key={file.id || idx}
            file={file}
            aspectRatio={ratio}
            extraLabel={extraLabel}
            onClick={() => onOpen?.(images, idx)}
          />
        );
      })}
    </div>
  );
}

export default function MessageAttachments({ files = [], onOpenImage }) {
  const grouped = useMemo(() => {
    const items = (files || []).filter((f) => f?._type !== 'forward_metadata');
    return {
      images: items.filter((f) => kindOf(f) === 'image'),
      videos: items.filter((f) => kindOf(f) === 'video'),
      audios: items.filter((f) => kindOf(f) === 'audio'),
      docs: items.filter((f) => kindOf(f) === 'file'),
    };
  }, [files]);

  if (!files?.length) return null;

  return (
    <div className="chat-attachments">
      {grouped.images.length > 0 && (
        <div className="chat-attach-block">
          <ImageGrid images={grouped.images} onOpen={onOpenImage} />
        </div>
      )}

      {grouped.videos.map((file) => {
        const ratio = file.width && file.height ? `${file.width} / ${file.height}` : '4 / 3';
        return (
          <div key={file.id} className="chat-attach-block">
            <div className="chat-attach-grid count-1">
              <ChatMediaVideo
                file={file}
                aspectRatio={ratio}
                onOpen={() => onOpenImage?.([file], 0)}
              />
            </div>
          </div>
        );
      })}

      {grouped.audios.map((file) => (
        <div key={file.id} className="chat-attach-block chat-attach-media-card">
          <MediaCardHeader file={file} />
          <div className="chat-attach-audio-wrap">
            <AudioPlayer src={attachmentDisplayUrl(file)} duration={file.duration} />
          </div>
        </div>
      ))}

      {grouped.docs.map((file) => (
        <a
          key={file.id}
          className="chat-attach-file-card"
          href={attachmentDisplayUrl(file)}
          download={file.original_name || file.name}
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="chat-attach-file-icon">
            <FileText size={22} />
          </div>
          <div className="chat-attach-file-meta">
            <span className="chat-attach-file-kind">Файл</span>
            <span className="chat-attach-file-name">{file.original_name || file.name || 'Вложение'}</span>
            {file.size != null && (
              <span className="chat-attach-file-size">{formatFileSize(file.size)}</span>
            )}
          </div>
          <Download size={18} className="chat-attach-file-dl" />
        </a>
      ))}
    </div>
  );
}
