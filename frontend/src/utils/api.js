// src/utils/api.js

import { fetchWithCache } from './requestCache';
import {
  cancelScheduledAuthLogout,
  clearAuthToken,
  getStoredAuthToken,
  scheduleAuthLogout,
  tryRefreshSession,
} from './authToken';

let banAttempts = 0;
const MAX_BAN_ATTEMPTS = 5;
let authHandlers = {
  onUnauthorized: null,
  onForbidden: null,
};

export const setAuthHandlers = (handlers) => {
  authHandlers = { ...authHandlers, ...handlers };
};

const getCookie = (name) => {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const formatApiError = (detail) => {
  if (!detail) return 'Ошибка запроса';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item?.msg) {
          let msg = String(item.msg);
          if (msg.startsWith('Value error, ')) {
            msg = msg.slice('Value error, '.length);
          }
          const field = Array.isArray(item.loc)
            ? item.loc.filter((part) => part !== 'body').join('.')
            : '';
          return field ? `${field}: ${msg}` : msg;
        }
        return JSON.stringify(item);
      })
      .join('; ');
  }
  if (typeof detail === 'object') {
    return detail.message || detail.msg || JSON.stringify(detail);
  }
  return String(detail);
};

const buildHeaders = (headers = {}, method = 'GET') => {
  const token = getStoredAuthToken();
  const result = { 'Content-Type': 'application/json', ...headers };
  if (token) {
    result.Authorization = `Bearer ${token}`;
  }
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
  if (mutating) {
    const csrf = getCookie('csrf_token');
    if (csrf) {
      result['X-CSRF-Token'] = csrf;
    }
  }
  return result;
};

const AUTH_NO_RETRY = ['/api/auth/login', '/api/auth/register', '/api/auth/refresh'];

export const safeFetch = async (url, options = {}, allowRefresh = true, suppressLogout = false) => {
  const method = options.method || 'GET';
  try {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers: buildHeaders(options.headers || {}, method),
    });

    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('❌ Не JSON ответ:', text.substring(0, 200));
      throw new Error(`Сервер вернул ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!response.ok) {
      const status = response.status;
      const message = formatApiError(data.detail || data.message || data);

      if (status === 403 && (
        message.includes('забанен') ||
        message.includes('заблокирован') ||
        message.toLowerCase().includes('banned')
      )) {
        banAttempts++;
        const remaining = MAX_BAN_ATTEMPTS - banAttempts;
        if (remaining > 0) {
          alert(`⛔ Ваш аккаунт заблокирован! Осталось ${remaining} попыток до выхода.`);
        }
        if (banAttempts >= MAX_BAN_ATTEMPTS) {
          alert('⛔ Превышен лимит попыток. Вы будете перенаправлены на страницу входа.');
          clearAuthToken();
          localStorage.removeItem('currentUser');
          window.location.href = '/login';
          return;
        }
        throw new Error(message);
      }

      if (status === 403 && message.includes('Недостаточно прав')) {
        authHandlers.onForbidden?.(message);
        throw new Error(message);
      }

      if (status === 401) {
        const canRefresh = allowRefresh && !AUTH_NO_RETRY.some((path) => url.includes(path));
        if (canRefresh) {
          const refreshed = await tryRefreshSession();
          if (refreshed) {
            return safeFetch(url, options, false, suppressLogout);
          }
        }

        const currentPath = window.location.pathname;
        if (!suppressLogout && !currentPath.includes('/login') && !currentPath.includes('/register')) {
          scheduleAuthLogout(() => {
            clearAuthToken();
            localStorage.removeItem('currentUser');
            authHandlers.onUnauthorized?.(currentPath);
            if (!authHandlers.onUnauthorized) {
              window.location.href = `/login?next=${encodeURIComponent(currentPath)}`;
            }
          });
        }
        throw new Error(message);
      }

      throw new Error(message);
    }

    cancelScheduledAuthLogout();
    banAttempts = 0;
    return data;
  } catch (error) {
    console.error('❌ Fetch error:', error);
    throw error;
  }
};

export const get = (url, headers = {}, options = {}) => {
  const { cacheTtl = 0, cacheKey = url, suppressLogout = false } = options;
  if (cacheTtl > 0) {
    return fetchWithCache(
      () => safeFetch(url, { method: 'GET', headers }, true, suppressLogout),
      cacheKey,
      cacheTtl,
    );
  }
  return safeFetch(url, { method: 'GET', headers }, true, suppressLogout);
};

export const post = (url, data, headers = {}) =>
  safeFetch(url, { method: 'POST', headers, body: JSON.stringify(data) });

export const put = (url, data, headers = {}) =>
  safeFetch(url, { method: 'PUT', headers, body: JSON.stringify(data) });

export const del = (url, headers = {}) => safeFetch(url, { method: 'DELETE', headers });

export const patch = (url, data, headers = {}) =>
  safeFetch(url, { method: 'PATCH', headers, body: JSON.stringify(data) });

export const authAPI = {
  register: async (data) => post('/api/auth/register', data),
  login: async (data) => post('/api/auth/login', data),
  logout: async () => post('/api/auth/logout', {}),
  refresh: async () => {
    const token = await tryRefreshSession();
    if (!token) throw new Error('Сессия недействительна');
    return { access_token: token };
  },
  getCurrentUser: async (options = {}) => get('/api/auth/me', {}, options),
};

export const adminAPI = {
  getUsers: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return get(`/api/admin/users${query ? `?${query}` : ''}`);
  },
  changeRole: (userId, role) => patch(`/api/admin/users/${userId}/role`, { role }),
  banUser: (userId) => post(`/api/admin/users/${userId}/ban`, {}),
  unbanUser: (userId) => post(`/api/admin/users/${userId}/unban`, {}),
  resetSessions: (userId) => post(`/api/admin/users/${userId}/reset-sessions`, {}),
  getAudit: (params = {}) => {
    const query = new URLSearchParams(params).toString();
    return get(`/api/admin/audit${query ? `?${query}` : ''}`);
  },
  getStats: () => get('/api/admin/stats'),
};
