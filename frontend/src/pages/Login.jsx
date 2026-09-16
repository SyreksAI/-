import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { fetchPublicSettings } from '../utils/studyData';
import YandexLoginButton from '../components/YandexLoginButton';
import CopyrightNotice from '../components/CopyrightNotice';
import PasswordInput from '../components/PasswordInput';

function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login, logout } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [yandexOAuthEnabled, setYandexOAuthEnabled] = useState(false);

  useEffect(() => {
    fetchPublicSettings()
      .then((data) => {
        if (typeof data?.yandexOAuthEnabled === 'boolean') {
          setYandexOAuthEnabled(data.yandexOAuthEnabled);
        }
      })
      .catch(() => {});
  }, []);

  const nextPath = params.get('next') || '/';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await login({
        email: email.trim(),
        password,
      });
      if (nextPath.startsWith('/admin') && !['admin', 'superadmin'].includes(response.user.role)) {
        await logout();
        setError('Недостаточно прав для входа в админ-панель');
        return;
      }
      navigate(nextPath);
    } catch (err) {
      setError(err.message || '❌ Неверный email или пароль');
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
          <h1>Вход в систему</h1>
          <p>Войдите в свой аккаунт для продолжения</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="on">
          <div className="form-group">
            <label htmlFor="login-email">Email</label>
            <input
              id="login-email"
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
            <label htmlFor="login-password">Пароль</label>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              placeholder="Введите пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="form-group auth-form__forgot">
            <Link to="/forgot-password" className="auth-form__forgot-link">
              Забыли пароль?
            </Link>
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

        {yandexOAuthEnabled && (
          <>
            <div className="auth-divider">
              <span>или</span>
            </div>
            <YandexLoginButton next={params.get('next') || '/'} label="Войти с Яндекс ID" />
          </>
        )}

        <div className="auth-footer">
          <p>Нет аккаунта? <Link to="/register">Зарегистрироваться</Link></p>
        </div>

        <div className="auth-footer-links">
          <Link to="/privacy">Конфиденциальность</Link>
          <span className="footer-divider">•</span>
          <Link to="/terms">Условия использования</Link>
          <span className="footer-divider">•</span>
          <Link to="/support">Поддержка</Link>
          <span className="footer-divider">•</span>
          <Link to="/about">О проекте</Link>
        </div>

        <CopyrightNotice />
      </div>
    </div>
  );
}

export default Login;