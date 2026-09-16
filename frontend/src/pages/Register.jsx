import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { authAPI } from '../utils/api';
import { fetchPublicSettings } from '../utils/studyData';
import { useAuth } from '../context/AuthProvider';
import CopyrightNotice from '../components/CopyrightNotice';
import { LEGAL_DOCS_VERSION } from '../utils/legalInfo';
import { Turnstile } from '@marsidev/react-turnstile';
import { TURNSTILE_SITE_KEY } from '../config/env';
import { getPasswordValidationError, PASSWORD_HINT } from '../utils/passwordValidation';
import PasswordInput from '../components/PasswordInput';
import YandexLoginButton from '../components/YandexLoginButton';

function Register() {
  const navigate = useNavigate();
  const { applyAuthResponse } = useAuth();
  const [turnstileToken, setTurnstileToken] = useState(null);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState(TURNSTILE_SITE_KEY);
  const [turnstileRequired, setTurnstileRequired] = useState(Boolean(TURNSTILE_SITE_KEY));
  const [formData, setFormData] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [yandexOAuthEnabled, setYandexOAuthEnabled] = useState(false);
  const [agreements, setAgreements] = useState({
    privacyPolicy: false,
    dataProcessing: false,
    publicOffer: false,
  });

  const allAgreementsAccepted = agreements.privacyPolicy && agreements.dataProcessing && agreements.publicOffer;

  useEffect(() => {
    fetchPublicSettings()
      .then((data) => {
        if (data?.turnstileSiteKey) {
          setTurnstileSiteKey(data.turnstileSiteKey);
        }
        if (typeof data?.turnstileRequired === 'boolean') {
          setTurnstileRequired(data.turnstileRequired);
        }
        if (typeof data?.yandexOAuthEnabled === 'boolean') {
          setYandexOAuthEnabled(data.yandexOAuthEnabled);
        }
      })
      .catch(() => {
        // fallback to build-time env
      });
  }, []);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleAgreementChange = (e) => {
    const { name, checked } = e.target;
    setAgreements((prev) => ({ ...prev, [name]: checked }));
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

    const passwordError = getPasswordValidationError(password);
    if (passwordError) {
      setError(`❌ ${passwordError}`);
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('❌ Пароли не совпадают');
      setLoading(false);
      return;
    }

    if (!agreements.privacyPolicy) {
      setError('❌ Необходимо ознакомиться с политикой обработки персональных данных');
      setLoading(false);
      return;
    }

    if (!agreements.dataProcessing) {
      setError('❌ Необходимо дать согласие на обработку персональных данных');
      setLoading(false);
      return;
    }

    if (!agreements.publicOffer) {
      setError('❌ Необходимо принять условия публичной оферты');
      setLoading(false);
      return;
    }

    if (turnstileRequired && !turnstileToken) {
      setError('❌ Подтвердите, что вы не робот');
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.register({ 
        name, 
        username, 
        email, 
        password,
        recaptcha_token: turnstileToken,
        accept_privacy_policy: agreements.privacyPolicy,
        accept_data_processing: agreements.dataProcessing,
        accept_public_offer: agreements.publicOffer,
        legal_docs_version: LEGAL_DOCS_VERSION,
      });
      
      applyAuthResponse(response);

      setLoading(false);
      navigate('/');
    } catch (err) {
      console.error('Registration error:', err);
      setError(err.message || '❌ Ошибка регистрации. Попробуйте другой username или email.');
      setLoading(false);
      setTurnstileToken(null);
      setTurnstileKey((key) => key + 1);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <img src="/logo.png" alt="дубльпар.online" className="auth-logo-img" />
          </div>
          <h1>Регистрация</h1>
          <p>Создайте аккаунт для доступа к материалам</p>
        </div>

        {error && <div className="auth-error">{error}</div>}

        {yandexOAuthEnabled && (
          <>
            <YandexLoginButton next="/" label="Продолжить с Яндекс ID" />
            <div className="auth-divider">
              <span>или зарегистрируйтесь по email</span>
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="auth-form" autoComplete="on">
          <div className="form-group">
            <label htmlFor="register-name">Ваше имя *</label>
            <input
              id="register-name"
              type="text"
              name="name"
              autoComplete="name"
              placeholder="Введите ваше имя"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="register-username">Имя пользователя (@username) *</label>
            <input
              id="register-username"
              type="text"
              name="username"
              autoComplete="username"
              placeholder="Например: julia"
              value={formData.username}
              onChange={handleChange}
              required
            />
            <small className="auth-form__hint">
              Только буквы, цифры и _ (минимум 3 символа). Будет отображаться в чате как @username
            </small>
          </div>
          <div className="form-group">
            <label htmlFor="register-email">Email *</label>
            <input
              id="register-email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="Введите email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="register-password">Пароль *</label>
            <PasswordInput
              id="register-password"
              name="password"
              autoComplete="new-password"
              placeholder="Мин. 8 символов: Aa1!"
              value={formData.password}
              onChange={handleChange}
              required
            />
            <small className="auth-form__hint">
              {PASSWORD_HINT}
            </small>
          </div>
          <div className="form-group">
            <label htmlFor="register-password-confirm">Подтвердите пароль *</label>
            <PasswordInput
              id="register-password-confirm"
              name="confirmPassword"
              autoComplete="new-password"
              placeholder="Повторите пароль"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          {/* Согласия */}
          <div className="auth-consent-group">
            <label className="auth-consent-item">
              <input
                type="checkbox"
                name="privacyPolicy"
                checked={agreements.privacyPolicy}
                onChange={handleAgreementChange}
              />
              <span>
                Ознакомлен(а) с{' '}
                <Link to="/privacy" target="_blank" rel="noopener noreferrer">
                  Политикой обработки персональных данных
                </Link>
              </span>
            </label>

            <label className="auth-consent-item">
              <input
                type="checkbox"
                name="dataProcessing"
                checked={agreements.dataProcessing}
                onChange={handleAgreementChange}
              />
              <span>
                Даю{' '}
                <Link to="/privacy#consent" target="_blank" rel="noopener noreferrer">
                  согласие на обработку персональных данных
                </Link>
              </span>
            </label>

            <label className="auth-consent-item">
              <input
                type="checkbox"
                name="publicOffer"
                checked={agreements.publicOffer}
                onChange={handleAgreementChange}
              />
              <span>
                Принимаю условия{' '}
                <Link to="/terms" target="_blank" rel="noopener noreferrer">
                  публичной оферты
                </Link>
              </span>
            </label>
          </div>

          {turnstileRequired && !turnstileSiteKey && (
            <div className="auth-error">
              Captcha включена на сервере, но публичный ключ не настроен. Добавьте TURNSTILE_SITE_KEY в .env.
            </div>
          )}

          {turnstileSiteKey && (
            <div className="form-group turnstile-wrapper">
              <Turnstile
                key={turnstileKey}
                siteKey={turnstileSiteKey}
                onSuccess={setTurnstileToken}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                options={{ theme: 'light', refreshExpired: 'auto' }}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn-submit"
            disabled={loading || !allAgreementsAccepted || (turnstileRequired && !turnstileSiteKey)}
          >
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

        <CopyrightNotice />

        <div className="auth-security">
          <i className="fas fa-lock"></i>
          <span>Ваши данные защищены. Мы не передаём информацию третьим лицам.</span>
        </div>
      </div>
    </div>
  );
}

export default Register;