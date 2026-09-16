import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { isAdminUser } from '../utils/auth';
import CopyrightNotice from '../components/CopyrightNotice';
import PasswordInput from '../components/PasswordInput';

function AdminLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login, logout, isAuthenticated, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const next = params.get('next') || '/admin';

  if (isAuthenticated && isAdminUser(user)) {
    return <Navigate to={next} replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login({
        email: email.trim(),
        password,
      });

      if (!isAdminUser(response.user)) {
        await logout();
        setError('Недостаточно прав для входа в админ-панель');
        return;
      }

      navigate(next);
    } catch (err) {
      setError(err.message || 'Неверный email или пароль');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <img src="/logo.png" alt="дубльпар.online" className="auth-logo-img" />
          </div>
          <div className="admin-login-icon">
            <i className="fas fa-shield-alt"></i>
          </div>
          <h1>Вход в админ-панель</h1>
          <p>Войдите с учётной записью администратора</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="on">
          <div className="form-group">
            <label htmlFor="admin-login-email">Email</label>
            <input
              id="admin-login-email"
              name="email"
              type="email"
              autoComplete="username email"
              placeholder="Введите email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="admin-login-password">Пароль</label>
            <PasswordInput
              id="admin-login-password"
              name="password"
              autoComplete="current-password"
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-sign-in-alt"></i>
            )}
            {loading ? ' Проверка...' : ' Войти'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            <Link to="/login">Обычный вход</Link>
            {' · '}
            <Link to="/">На главную</Link>
          </p>
        </div>

        <div className="admin-hint">
          <i className="fas fa-info-circle"></i>
          <span>Доступ только для пользователей с ролью admin или superadmin</span>
        </div>

        <CopyrightNotice />
      </div>
    </div>
  );
}

export default AdminLogin;
