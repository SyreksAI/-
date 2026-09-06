import React, { useState } from 'react';
import { Link } from 'react-router-dom';

function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    setError('');
    setLoading(true);

    try {
        // ✅ ОТПРАВЛЯЕМ КАК QUERY-ПАРАМЕТР
        const response = await fetch(`/api/auth/forgot-password?email=${encodeURIComponent(email)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (response.ok) {
        setMessage('✅ Инструкция по сбросу пароля отправлена на ваш email');
        setEmail('');
        } else {
        const errorMsg = typeof data.detail === 'string' 
            ? data.detail 
            : (Array.isArray(data.detail) 
            ? data.detail.map(err => err.msg || JSON.stringify(err)).join(', ')
            : JSON.stringify(data.detail));
        setError(errorMsg || '❌ Ошибка при отправке запроса');
        }
    } catch (err) {
        console.error('Ошибка:', err);
        setError('❌ Ошибка соединения с сервером');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <img src="/logo.png" alt="ДубльПар.рф" className="auth-logo-img" />
          </div>
          <h1>Восстановление пароля</h1>
          <p>Введите email, чтобы сбросить пароль</p>
        </div>

        {message && <div className="auth-success">{message}</div>}
        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Email</label>
            <input
              type="email"
              placeholder="Введите email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-paper-plane"></i>
            )}
            {loading ? ' Отправка...' : ' Отправить инструкцию'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Вспомнили пароль? <Link to="/login">Войти</Link></p>
        </div>
      </div>
    </div>
  );
}

export default ForgotPassword;