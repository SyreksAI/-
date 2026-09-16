const TOKEN_KEY = 'token';

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export function isAdminUser(user) {
  if (!user) return false;
  return ['admin', 'superadmin'].includes(user.role);
}

export function isStaffUser(user) {
  if (!user) return false;
  return ['moderator', 'admin', 'superadmin'].includes(user.role);
}

export function clearAuthStorage() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('token');
  localStorage.removeItem('currentUser');
}

export function getAuthHeaders(extra = {}) {
  const token = getToken();
  const headers = { ...extra };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}
