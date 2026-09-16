import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authAPI, setAuthHandlers } from '../utils/api';
import {
  cancelScheduledAuthLogout,
  clearAuthToken,
  persistAuthToken,
  restoreAuthTokenBackup,
  syncMediaAuthCookie,
  tryRefreshSession,
} from '../utils/authToken';
import websocketService from '../services/websocket';

const AuthContext = createContext(null);

const TOKEN_KEY = 'token';

let bootstrapPromise = null;

function readCachedUser() {
  try {
    const raw = localStorage.getItem('currentUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function resolveSession({ suppressLogout = true } = {}) {
  restoreAuthTokenBackup();

  const fetchMe = () => authAPI.getCurrentUser({ suppressLogout });

  if (sessionStorage.getItem(TOKEN_KEY)) {
    try {
      return await fetchMe();
    } catch {
      const refreshed = await tryRefreshSession();
      if (refreshed) {
        return fetchMe();
      }
      throw new Error('session-expired');
    }
  }

  const refreshed = await tryRefreshSession();
  if (!refreshed) {
    throw new Error('session-missing');
  }
  return fetchMe();
}

async function bootstrapSession() {
  restoreAuthTokenBackup();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const me = await resolveSession({ suppressLogout: true });
      cancelScheduledAuthLogout();
      return {
        user: me,
        token: sessionStorage.getItem(TOKEN_KEY),
        ok: true,
      };
    } catch {
      await tryRefreshSession();
      if (attempt < 2) {
        await new Promise((resolve) => {
          setTimeout(resolve, 120 * (attempt + 1));
        });
      }
    }
  }

  const cachedUser = readCachedUser();
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (cachedUser && token) {
    return { user: cachedUser, token, ok: true, stale: true };
  }

  return { user: null, token: null, ok: false };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(readCachedUser);
  const [token, setToken] = useState(() => restoreAuthTokenBackup());
  const [loading, setLoading] = useState(() => {
    try {
      return Boolean(restoreAuthTokenBackup() || localStorage.getItem('currentUser'));
    } catch {
      return false;
    }
  });
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'error') => {
    setToast({ message, type, id: Date.now() });
  }, []);

  const persistUserSnapshot = useCallback((nextUser) => {
    if (nextUser) {
      localStorage.setItem('currentUser', JSON.stringify(nextUser));
    } else {
      localStorage.removeItem('currentUser');
    }
  }, []);

  const clearSession = useCallback(() => {
    cancelScheduledAuthLogout();
    clearAuthToken();
    localStorage.removeItem('currentUser');
    syncMediaAuthCookie();
    setToken(null);
    setUser(null);
    websocketService.disconnect?.();
  }, []);

  const refreshUser = useCallback(async () => {
    if (!restoreAuthTokenBackup()) {
      setUser(null);
      return null;
    }
    const me = await authAPI.getCurrentUser();
    setUser(me);
    persistUserSnapshot(me);
    return me;
  }, [persistUserSnapshot]);

  const applyAuthResponse = useCallback((response) => {
    persistAuthToken(response.access_token);
    setToken(response.access_token);
    setUser(response.user);
    persistUserSnapshot(response.user);
    syncMediaAuthCookie();
    cancelScheduledAuthLogout();
  }, [persistUserSnapshot]);

  const login = useCallback(async (credentials) => {
    const response = await authAPI.login(credentials);
    applyAuthResponse(response);
    return response;
  }, [applyAuthResponse]);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch {
      // ignore
    }
    clearSession();
  }, [clearSession]);

  useEffect(() => {
    setAuthHandlers({
      onUnauthorized: (nextPath) => {
        clearSession();
        const next = nextPath ? `?next=${encodeURIComponent(nextPath)}` : '';
        window.location.href = `/login${next}`;
      },
      onForbidden: (message) => {
        showToast(message || 'Недостаточно прав', 'error');
        refreshUser().catch(() => clearSession());
      },
    });
  }, [clearSession, refreshUser, showToast]);

  useEffect(() => {
    let cancelled = false;

    if (!bootstrapPromise) {
      bootstrapPromise = bootstrapSession().finally(() => {
        bootstrapPromise = null;
      });
    }

    bootstrapPromise
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setToken(result.token);
          setUser(result.user);
          persistUserSnapshot(result.user);
          syncMediaAuthCookie();
          if (!result.stale) {
            refreshUser().catch(() => {});
          }
        } else {
          clearSession();
        }
      })
      .catch(() => {
        if (!cancelled) {
          const cachedUser = readCachedUser();
          const cachedToken = sessionStorage.getItem(TOKEN_KEY);
          if (cachedUser && cachedToken) {
            setUser(cachedUser);
            setToken(cachedToken);
          } else {
            clearSession();
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clearSession, persistUserSnapshot, refreshUser]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      isAuthenticated: Boolean(user && token),
      login,
      applyAuthResponse,
      logout,
      refreshUser,
      showToast,
      toast,
      clearToast: () => setToast(null),
    }),
    [user, token, loading, login, applyAuthResponse, logout, refreshUser, showToast, toast],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
