import { useEffect, useRef, useState } from 'react';
import { fetchMediaBlob, isMediaUrlAlive, peekMediaBlob } from '../utils/mediaCache';
import { resolveAttachmentPreview } from '../utils/uploadPreviewCache';

export function useLazyMedia(file, variant = 'thumb', { enabled = true, rootMargin = '250px' } = {}) {
  const rootRef = useRef(null);
  const [src, setSrc] = useState(() => (enabled && file ? peekMediaBlob(file, variant) : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled || !file) {
      setSrc(null);
      setLoading(false);
      setError(false);
      return undefined;
    }

    let cancelled = false;
    let observer;

    const applySrc = (url) => {
      if (!cancelled && url) setSrc(url);
    };

    const load = async () => {
      setLoading(true);
      setError(false);

      const preview = resolveAttachmentPreview(file);
      if (preview && (await isMediaUrlAlive(preview))) {
        applySrc(preview);
      }

      const cached = peekMediaBlob(file, variant);
      if (cached && (await isMediaUrlAlive(cached))) {
        applySrc(cached);
      }

      try {
        const url = await fetchMediaBlob(file, variant);
        if (!cancelled) {
          setSrc(url);
          setLoading(false);
          setError(false);
        }
      } catch {
        if (!cancelled) {
          if (!preview && !cached) setSrc(null);
          setError(true);
          setLoading(false);
        }
      }
    };

    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }

    observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer?.disconnect();
          load();
        }
      },
      { rootMargin },
    );
    observer.observe(node);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [file, variant, enabled, rootMargin]);

  return { rootRef, src, loading, error };
}
