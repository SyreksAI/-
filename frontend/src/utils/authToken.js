const TOKEN_KEY = 'token';
export const MEDIA_COOKIE = 'media_access';
const MEDIA_COOKIE_MAX_AGE = 15 * 60;

const getCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

let refreshInFlight = null;
let logoutTimer = null;

export function persistAuthToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearAuthToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('token');
}

export function restoreAuthTokenBackup() {
  const sessionToken = sessionStorage.getItem(TOKEN_KEY);
  if (sessionToken) return sessionToken;
  const localToken = localStorage.getItem(TOKEN_KEY) || localStorage.getItem('token');
  if (localToken) {
    sessionStorage.setItem(TOKEN_KEY, localToken);
    localStorage.setItem(TOKEN_KEY, localToken);
    return localToken;
  }
  return null;
}

export function cancelScheduledAuthLogout() {
  if (logoutTimer) {
    clearTimeout(logoutTimer);
    logoutTimer = null;
  }
}

export function scheduleAuthLogout(callback, delay = 500) {
  cancelScheduledAuthLogout();
  logoutTimer = setTimeout(() => {
    logoutTimer = null;
    callback();
  }, delay);
}

/** Renew access token via HttpOnly refresh cookie (single-flight). */
export async function tryRefreshSession() {
  if (refreshInFlight) return refreshInFlight;

  const refreshPromise = (async () => {
    const csrf = getCookie('csrf_token');
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
      },
      body: '{}',
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!data?.access_token) return null;

    persistAuthToken(data.access_token);
    syncMediaAuthCookie();
    cancelScheduledAuthLogout();
    return data.access_token;
  })();

  refreshInFlight = refreshPromise;

  try {
    return await refreshPromise;
  } finally {
    if (refreshInFlight === refreshPromise) {
      refreshInFlight = null;
    }
  }
}

export const getStoredAuthToken = () => {
  try {
    return restoreAuthTokenBackup();
  } catch {
    return null;
  }
};

/** Sync cookie so <video>/<audio> Range requests authenticate without ?token= in URL. */
export const syncMediaAuthCookie = () => {
  try {
    const token = getStoredAuthToken();
    if (!token) {
      document.cookie = `${MEDIA_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
      return;
    }
    document.cookie = `${MEDIA_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${MEDIA_COOKIE_MAX_AGE}; SameSite=Lax`;
  } catch {
    // ignore
  }
};
