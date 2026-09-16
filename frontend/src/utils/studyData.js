import { get } from './api';
import { CACHE_KEYS, CACHE_TTL, invalidateRequestCache } from './requestCache';

const SESSION_KEY = 'study_technologies_v1';

export function readTechnologiesSnapshot() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeTechnologiesSnapshot(data) {
  try {
    if (Array.isArray(data)) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    }
  } catch {
    // sessionStorage unavailable or full
  }
}

export function buildTopicsMap(categories) {
  const topics = {};
  for (const cat of categories) {
    topics[cat.id] = cat.topics || [];
  }
  return topics;
}

export async function fetchTechnologies() {
  const data = await get('/api/study/technologies', {}, {
    cacheTtl: CACHE_TTL.technologies,
    cacheKey: CACHE_KEYS.technologies,
  });
  writeTechnologiesSnapshot(data);
  return data;
}

export async function fetchPublicSettings() {
  return get('/api/settings/public', {}, {
    cacheTtl: CACHE_TTL.publicSettings,
    cacheKey: CACHE_KEYS.publicSettings,
  });
}

export function invalidatePublicSettingsCache() {
  invalidateRequestCache(CACHE_KEYS.publicSettings);
}

export function invalidateTechnologiesCache() {
  invalidateRequestCache(CACHE_KEYS.technologies);
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}
