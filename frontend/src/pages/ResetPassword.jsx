import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';

function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('❌ Токен сброса пароля не найден');
    }
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');

    if (newPassword.length < 6) {
      setError('❌ Пароль должен содержать минимум 6 символов');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('❌ Пароли не совпадают');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: newPassword })
      });

      const data = await response.json();

      if (response.ok) {
        setMessage('✅ Пароль успешно изменён!');
        setTimeout(() => navigate('/login'), 3000);
      } else {
        const errorMsg = typeof data.detail === 'string' 
          ? data.detail 
          : (Array.isArray(data.detail) 
            ? data.detail.map(err => err.msg || JSON.stringify(err)).join(', ')
            : JSON.stringify(data.detail));
        setError(errorMsg || '❌ Ошибка при сбросе пароля');
      }
    } catch (err) {
      console.error('Ошибка:', err);
      setError('❌ Ошибка соединения с сервером');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-header">
            <h1>Неверная ссылка</h1>
            <p>Ссылка для сброса пароля недействительна</p>
          </div>
          <div className="auth-error">❌ Токен сброса пароля не найден</div>
          <div className="auth-footer">
            <Link to="/login">Вернуться на страницу входа</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <img src="/logo.png" alt="ДубльПар.рф" className="auth-logo-img" />
          </div>
          <h1>Сброс пароля</h1>
          <p>Введите новый пароль</p>
        </div>

        {message && <div className="auth-success">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Новый пароль</label>
            <input
              type="password"
              placeholder="Минимум 6 символов"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label>Подтвердите пароль</label>
            <input
              type="password"
              placeholder="Повторите пароль"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-key"></i>
            )}
            {loading ? ' Сохранение...' : ' Сохранить пароль'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Вспомнили пароль? <Link to="/login">Войти</Link></p>
        </div>
      </div>
    </div>
  );
}

export default ResetPassword;