const memory = new Map();
const inflight = new Map();

export function fetchWithCache(fetcher, key, ttlMs = 60_000) {
  const now = Date.now();
  const cached = memory.get(key);
  if (cached && now - cached.ts < ttlMs) {
    return Promise.resolve(cached.data);
  }

  if (inflight.has(key)) {
    return inflight.get(key);
  }

  const promise = fetcher()
    .then((data) => {
      memory.set(key, { data, ts: Date.now() });
      inflight.delete(key);
      return data;
    })
    .catch((error) => {
      inflight.delete(key);
      throw error;
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateRequestCache(keyOrPrefix) {
  for (const key of [...memory.keys()]) {
    if (key === keyOrPrefix || key.startsWith(keyOrPrefix)) {
      memory.delete(key);
    }
  }
}

export const CACHE_KEYS = {
  publicSettings: 'settings:public',
  technologies: 'study:technologies',
};

export const CACHE_TTL = {
  publicSettings: 60_000,
  technologies: 300_000,
  forumInit: 30_000,
};

export const forumCacheKey = (userId, resource) => `forum:${userId}:${resource}`;
