import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, Loader2, Play } from 'lucide-react';
import { useLazyMedia } from '../hooks/useLazyMedia';
import { attachmentDisplayUrl } from '../utils/attachmentUrl';
import { syncMediaAuthCookie } from '../utils/authToken';
import { isMediaUrlAlive } from '../utils/mediaCache';

function isVideoAttachment(file) {
  const mime = file?.mime || file?.type || '';
  return file?.kind === 'video' || file?.isVideo || mime.startsWith('video/');
}

export default function ChatMediaVideo({ file, aspectRatio, onOpen }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const isVideo = useMemo(() => isVideoAttachment(file), [file]);

  const { rootRef: lazyRef, src: fetchedPoster, loading: thumbLoading, error: thumbError } = useLazyMedia(
    file,
    'thumb',
    { enabled: isVideo },
  );

  const [playing, setPlaying] = useState(false);
  const [streamUrl, setStreamUrl] = useState(null);
  const [frameReady, setFrameReady] = useState(false);
  const [posterReady, setPosterReady] = useState(false);
  const [useVideoFrame, setUseVideoFrame] = useState(false);

  const posterUrl = fetchedPoster;

  const setWrapRef = useCallback(
    (node) => {
      wrapRef.current = node;
      lazyRef.current = node;
    },
    [lazyRef],
  );

  useEffect(() => {
    setPosterReady(false);
    setUseVideoFrame(false);
    setFrameReady(false);

    if (!posterUrl) return undefined;

    let cancelled = false;
    (async () => {
      const alive = await isMediaUrlAlive(posterUrl);
      if (cancelled) return;
      if (alive) {
        setPosterReady(true);
        return;
      }
      setUseVideoFrame(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [posterUrl]);

  useEffect(() => {
    if (playing) {
      syncMediaAuthCookie();
      setStreamUrl(attachmentDisplayUrl(file));
      return undefined;
    }

    if (posterReady) {
      setStreamUrl(null);
      setFrameReady(false);
      setUseVideoFrame(false);
      return undefined;
    }

    if (thumbLoading) {
      return undefined;
    }

    if (thumbError || useVideoFrame || !posterUrl) {
      syncMediaAuthCookie();
      setStreamUrl(attachmentDisplayUrl(file));
      setFrameReady(false);
      return undefined;
    }

    return undefined;
  }, [file, posterReady, posterUrl, thumbLoading, thumbError, useVideoFrame, playing]);

  const handlePlay = useCallback(() => {
    syncMediaAuthCookie();
    setStreamUrl(attachmentDisplayUrl(file));
    setPlaying(true);
  }, [file]);

  useEffect(() => {
    if (!playing) return undefined;
    const video = videoRef.current;
    if (!video || !streamUrl) return undefined;

    const tryPlay = () => {
      video.play().catch(() => {});
    };

    if (video.readyState >= 2) {
      tryPlay();
      return undefined;
    }

    video.addEventListener('canplay', tryPlay, { once: true });
    return () => video.removeEventListener('canplay', tryPlay);
  }, [playing, streamUrl]);

  const handleOpen = () => {
    if (onOpen) onOpen();
    else handlePlay();
  };

  const showPoster = posterReady && posterUrl && !playing;
  const showVideoFrame = !showPoster && streamUrl && !playing;
  const showSpinner =
    (thumbLoading && !showPoster && !frameReady) ||
    (showVideoFrame && !frameReady);
  const showFallback = !showPoster && !streamUrl && !thumbLoading && !playing;

  return (
    <div ref={setWrapRef} className="chat-attach-video-card">
      <div className="chat-attach-video-wrap" style={{ aspectRatio }}>
        <div className="chat-attach-video-placeholder chat-attach-video-backdrop" aria-hidden="true">
          <Film size={36} />
        </div>

        {showSpinner && (
          <div className="chat-attach-video-placeholder chat-attach-video-spinner">
            <Loader2 size={32} className="chat-attach-spin" />
          </div>
        )}

        {showFallback && (
          <div className="chat-attach-video-placeholder">
            <Film size={36} />
          </div>
        )}

        {showPoster && (
          <div
            className="chat-attach-video-poster"
            style={{ backgroundImage: `url("${posterUrl}")` }}
            role="img"
            aria-label="Превью видео"
          />
        )}

        {streamUrl && (
          <video
            ref={videoRef}
            src={streamUrl}
            className={`chat-attach-video${playing ? ' is-visible is-playing' : showVideoFrame && frameReady ? ' is-poster' : ' is-hidden'}`}
            controls={playing}
            preload={playing ? 'auto' : 'metadata'}
            muted={!playing}
            playsInline
            onLoadedData={() => {
              if (showVideoFrame) setFrameReady(true);
            }}
            onLoadedMetadata={() => {
              if (!showVideoFrame || playing) return;
              const video = videoRef.current;
              if (!video) return;
              const seekTarget =
                Number.isFinite(video.duration) && video.duration > 0.1 ? 0.05 : 0;
              if (seekTarget > 0) {
                video.onseeked = () => setFrameReady(true);
                video.currentTime = seekTarget;
              } else {
                setFrameReady(true);
              }
            }}
            onError={() => {
              if (showVideoFrame) setFrameReady(false);
            }}
          />
        )}

        {!playing && (
          <button
            type="button"
            className="chat-attach-video-play"
            onClick={handlePlay}
            aria-label="Воспроизвести видео"
          >
            <Play size={28} fill="currentColor" />
          </button>
        )}

        {thumbError && !showPoster && !frameReady && !playing && (
          <button type="button" className="chat-attach-video-retry" onClick={handleOpen}>
            Нажмите для воспроизведения
          </button>
        )}
      </div>
    </div>
  );
}
