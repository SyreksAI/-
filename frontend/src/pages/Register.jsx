import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../utils/api';
import { Turnstile } from '@marsidev/react-turnstile';

function Register() {
  const navigate = useNavigate();
  const [turnstileToken, setTurnstileToken] = useState(null);
  const turnstileContainerRef = useRef(null);
  const widgetIdRef = useRef(null);
  
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // ✅ ЗАГРУЗКА TURNSTILE СКРИПТА
  useEffect(() => {
    // Загружаем скрипт Cloudflare Turnstile
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    // Ждём, пока API станет доступным
    const checkTurnstile = setInterval(() => {
      if (window.turnstile) {
        clearInterval(checkTurnstile);
        renderTurnstile();
      }
    }, 100);

    // Очистка при размонтировании
    return () => {
      clearInterval(checkTurnstile);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {}
      }
    };
  }, []);

  const renderTurnstile = () => {
    if (!turnstileContainerRef.current || !window.turnstile) return;

    // Очищаем контейнер
    turnstileContainerRef.current.innerHTML = '';

    // Создаём виджет
    widgetIdRef.current = window.turnstile.render(turnstileContainerRef.current, {
      sitekey: '0x4AAAAAAEp_ptyyFaa5K-ck',
      theme: 'light',
      callback: function(token) {
        console.log('✅ Turnstile токен получен:', token);
        setTurnstileToken(token);
      },
      'expired-callback': function() {
        console.log('⏰ Turnstile токен истёк');
        setTurnstileToken(null);
      },
      'error-callback': function() {
        console.log('❌ Ошибка Turnstile');
        setTurnstileToken(null);
      }
    });
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { name, username, email, password, confirmPassword } = formData;

    // ✅ ВАЛИДАЦИЯ
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

    // ✅ ПРОВЕРКА Turnstile
    if (!turnstileToken) {
      setError('❌ Подтвердите, что вы не робот');
      setLoading(false);
      return;
    }

    console.log('📤 Sending registration data:', { 
      name, 
      username, 
      email, 
      password,
      recaptcha_token: turnstileToken 
    });

    try {
      const response = await authAPI.register({ 
        name, 
        username, 
        email, 
        password,
        recaptcha_token: turnstileToken
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
      // Сбрасываем Turnstile
      setTurnstileToken(null);
      if (window.turnstile && widgetIdRef.current) {
        window.turnstile.reset(widgetIdRef.current);
      }
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <img src="/logo.png" alt="ДубльПар.рф" className="auth-logo-img" />
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

          {/* ✅ TURNSTILE (официальный скрипт) */}
          <div className="form-group turnstile-wrapper">
            <div ref={turnstileContainerRef}></div>
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

        <div className="auth-footer-links">
          <Link to="/privacy">Конфиденциальность</Link>
          <span className="footer-divider">•</span>
          <Link to="/terms">Условия использования</Link>
          <span className="footer-divider">•</span>
          <Link to="/support">Поддержка</Link>
          <span className="footer-divider">•</span>
          <Link to="/about">О проекте</Link>
        </div>

        <div className="auth-copyright">
          © 2026 ДубльПар.рф. Все права защищены.
        </div>

        <div className="auth-security">
          <i className="fas fa-lock"></i>
          <span>Ваши данные защищены. Мы не передаём информацию третьим лицам.</span>
        </div>
      </div>
    </div>
  );
}

export default Register;