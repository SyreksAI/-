import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../api';

function Register() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { name, username, email, password, confirmPassword } = formData;

    if (!name.trim()) {
      setError('❌ Введите ваше имя');
      setLoading(false);
      return;
    }

    if (!username.trim() || username.length < 3) {
      setError('❌ Имя пользователя должно содержать минимум 3 символа');
      setLoading(false);
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError('❌ Имя пользователя может содержать только буквы, цифры и _');
      setLoading(false);
      return;
    }

    if (!email.trim()) {
      setError('❌ Введите email');
      setLoading(false);
      return;
    }

    if (password.length < 6) {
      setError('❌ Пароль должен содержать минимум 6 символов');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('❌ Пароли не совпадают');
      setLoading(false);
      return;
    }

    try {
      console.log('📤 Sending registration data:', { name, username, email, password });
      
      const response = await authAPI.register({ 
        name, 
        username, 
        email, 
        password 
      });
      
      console.log('📥 Registration response:', response);
      
      localStorage.setItem('token', response.access_token);
      localStorage.setItem('currentUser', JSON.stringify(response.user));
      
      setLoading(false);
      navigate('/');
      window.location.reload();
    } catch (err) {
      console.error('❌ Registration error:', err);
      setError(err.message || '❌ Ошибка регистрации. Попробуйте другой username или email.');
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <img src="/logo.png" alt="ДубльПар.ru" className="auth-logo-img" />
          </div>
          <h1>Регистрация</h1>
          <p>Создайте аккаунт для доступа к материалам</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label>Ваше имя *</label>
            <input
              type="text"
              name="name"
              placeholder="Введите ваше имя"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Имя пользователя (@username) *</label>
            <input
              type="text"
              name="username"
              placeholder="Например: julia"
              value={formData.username}
              onChange={handleChange}
              required
            />
            <small style={{ color: '#94a3b8', fontSize: '0.75rem' }}>
              Только буквы, цифры и _ (минимум 3 символа). Будет отображаться в чате как @username
            </small>
          </div>
          <div className="form-group">
            <label>Email *</label>
            <input
              type="email"
              name="email"
              placeholder="Введите email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Пароль *</label>
            <input
              type="password"
              name="password"
              placeholder="Минимум 6 символов"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label>Подтвердите пароль *</label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="Повторите пароль"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>
          <button type="submit" className="btn-submit" disabled={loading}>
            {loading ? (
              <i className="fas fa-spinner fa-spin"></i>
            ) : (
              <i className="fas fa-user-plus"></i>
            )}
            {loading ? ' Регистрация...' : ' Зарегистрироваться'}
          </button>
        </form>

        <div className="auth-footer">
          <p>Уже есть аккаунт? <Link to="/login">Войти</Link></p>
        </div>
      </div>
    </div>
  );
}

export default Register;