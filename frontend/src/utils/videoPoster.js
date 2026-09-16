/** Capture first visible frame from a video URL (Range-friendly, no full download). */
export function captureVideoPoster(streamUrl) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let settled = false;

    const finish = (blobUrl) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(blobUrl);
    };

    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      video.onloadeddata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };

    const drawFrame = () => {
      try {
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        if (!width || !height) {
          fail(new Error('No video dimensions'));
          return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fail(new Error('Canvas unavailable'));
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              fail(new Error('Poster encode failed'));
              return;
            }
            finish(URL.createObjectURL(blob));
          },
          'image/jpeg',
          0.82,
        );
      } catch (error) {
        fail(error);
      }
    };

    video.onloadeddata = () => {
      const target = Number.isFinite(video.duration) && video.duration > 1
        ? Math.min(1, video.duration * 0.05)
        : 0;
      if (target > 0) {
        video.onseeked = () => drawFrame();
        video.currentTime = target;
      } else {
        drawFrame();
      }
    };

    video.onerror = () => fail(new Error('Video preview failed'));
    video.src = streamUrl;
    video.load();
  });
}
