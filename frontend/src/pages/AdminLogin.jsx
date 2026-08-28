import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

function AdminLogin() {
  const navigate = useNavigate();
  const [loginKey, setLoginKey] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const ADMIN_CREDENTIALS = {
    key: 'admin123',
    password: 'admin2024'
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    setTimeout(() => {
      if (loginKey === ADMIN_CREDENTIALS.key && password === ADMIN_CREDENTIALS.password) {
        localStorage.setItem('adminSession', JSON.stringify({
          loggedIn: true,
          loginTime: new Date().toISOString()
        }));
        setLoading(false);
        navigate('/admin');
      } else {
        setError('❌ Неверный ключ или пароль');
        setLoading(false);
      }
    }, 500);
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          {/* ЛОГОТИП */}
          
          <div className="auth-logo">
            <img src="/logo.png" alt="ДубльПар.ru" className="auth-logo-img" />
          </div>
          <div className="admin-login-icon">
            <i className="fas fa-shield-alt"></i>
          </div>
          <h1>Вход в админ-панель</h1>
          <p>Введите ключ и пароль для доступа</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Ключ доступа</label>
            <input
              type="text"
              placeholder="Введите ключ"
              value={loginKey}
              onChange={(e) => setLoginKey(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label>Пароль</label>
            <input
              type="password"
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

        

        <div className="admin-hint">
          <i className="fas fa-info-circle"></i>
          <span>Обратитесь к администратору для получения ключа и пароля</span>
        </div>
      </div>
    </div>
  );
}

export default AdminLogin;