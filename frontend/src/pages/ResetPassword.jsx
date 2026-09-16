import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import CopyrightNotice from '../components/CopyrightNotice';
import { getPasswordValidationError, PASSWORD_HINT } from '../utils/passwordValidation';
import PasswordInput from '../components/PasswordInput';

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

    const passwordError = getPasswordValidationError(newPassword);
    if (passwordError) {
      setError(`❌ ${passwordError}`);
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
          <CopyrightNotice />
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <img src="/logo.png" alt="дубльпар.online" className="auth-logo-img" />
          </div>
          <h1>Сброс пароля</h1>
          <p>Введите новый пароль</p>
        </div>

        {message && <div className="auth-success">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="on">
          <div className="form-group">
            <label htmlFor="reset-password">Новый пароль</label>
            <PasswordInput
              id="reset-password"
              name="new-password"
              autoComplete="new-password"
              placeholder="Мин. 8 символов: Aa1!"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <small style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              {PASSWORD_HINT}
            </small>
          </div>

          <div className="form-group">
            <label htmlFor="reset-password-confirm">Подтвердите пароль</label>
            <PasswordInput
              id="reset-password-confirm"
              name="confirm-password"
              autoComplete="new-password"
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

        <CopyrightNotice />
      </div>
    </div>
  );
}

export default ResetPassword;