import React from 'react';
import { useLazyMedia } from '../hooks/useLazyMedia';

export default function ChatMediaImage({ file, aspectRatio, onClick, extraLabel }) {
  const { rootRef, src, loading, error } = useLazyMedia(file, 'thumb');

  return (
    <button
      ref={rootRef}
      type="button"
      className="chat-attach-image"
      style={{ aspectRatio }}
      onClick={onClick}
      title="Открыть фото"
    >
      {!src && <div className={`chat-attach-skeleton${loading ? ' is-loading' : ''}`} />}
      {error && !src && (
        <div className="chat-attach-media-error">
          <i className="fas fa-image" />
        </div>
      )}
      {src && (
        <img
          src={src}
          alt=""
          className={`chat-attach-image-img${loading ? ' is-loading' : ' is-ready'}`}
          draggable={false}
        />
      )}
      {extraLabel && <span className="chat-attach-more">{extraLabel}</span>}
    </button>
  );
}
