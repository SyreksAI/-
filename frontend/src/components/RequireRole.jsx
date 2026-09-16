import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import AppLoadingScreen from './AppLoadingScreen';

const ROLE_RANK = {
  user: 0,
  student: 0,
  moderator: 1,
  admin: 2,
  superadmin: 3,
};

function normalizeRole(role) {
  if (!role) return 'user';
  return role === 'student' ? 'user' : role;
}

function hasRole(userRole, minimumRole) {
  const current = ROLE_RANK[normalizeRole(userRole)] ?? 0;
  const minimum = ROLE_RANK[normalizeRole(minimumRole)] ?? 0;
  return current >= minimum;
}

export function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AppLoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  return children;
}

export function RequireRole({ role = 'admin', children }) {
  const { user, isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to={`/admin/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  }

  if (!hasRole(user?.role, role)) {
    return <Navigate to="/" replace state={{ forbidden: true }} />;
  }

  return children;
}

export default RequireRole;
