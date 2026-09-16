import React, { useEffect, useRef, useState } from 'react';
import { Music, Pause, Play } from 'lucide-react';
import { formatDuration } from '../utils/attachmentUrl';

export default function AudioPlayer({ src, duration: metaDuration }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(metaDuration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onTime = () => {
      setCurrent(audio.currentTime);
      setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0);
    };
    const onMeta = () => setDuration(audio.duration || metaDuration || 0);
    const onEnd = () => setPlaying(false);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnd);
    };
  }, [metaDuration, src]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      audio.play();
      setPlaying(true);
    }
  };

  const seek = (e) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audio.currentTime = ratio * duration;
  };

  return (
    <div className="chat-audio-player">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button type="button" className="chat-audio-play" onClick={toggle} aria-label={playing ? 'Пауза' : 'Воспроизвести'}>
        {playing ? <Pause size={18} /> : <Play size={18} />}
      </button>
      <div className="chat-audio-track" onClick={seek} role="presentation">
        <div className="chat-audio-progress" style={{ width: `${progress}%` }} />
      </div>
      <span className="chat-audio-time">
        {formatDuration(current)} / {formatDuration(duration)}
      </span>
      <Music size={16} className="chat-audio-icon" />
    </div>
  );
}
