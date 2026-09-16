import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthProvider';
import { authAPI } from '../utils/api';
import { persistAuthToken } from '../utils/authToken';
import CopyrightNotice from '../components/CopyrightNotice';

function safeNextPath(value) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/';
  }
  return value;
}

function OAuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { applyAuthResponse } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const errorParam = params.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      setLoading(false);
      return undefined;
    }

    const accessToken = params.get('access_token');
    const next = safeNextPath(params.get('next'));

    if (!accessToken) {
      setError('Не удалось завершить вход через Яндекс');
      setLoading(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        persistAuthToken(accessToken);
        const user = await authAPI.getCurrentUser();
        if (cancelled) return;
        applyAuthResponse({ access_token: accessToken, user });
        navigate(next, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Ошибка авторизации');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params, navigate, applyAuthResponse]);

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <img src="/logo.png" alt="дубльпар.online" className="auth-logo-img" />
          </div>
          {loading && !error ? (
            <>
              <h1>Завершение входа</h1>
              <p>Пожалуйста, подождите...</p>
            </>
          ) : (
            <>
              <h1>Ошибка входа</h1>
              <p>{error}</p>
            </>
          )}
        </div>

        {error && <div className="auth-error">{error}</div>}

        {error && (
          <div className="auth-footer">
            <p><Link to="/login">Вернуться ко входу</Link></p>
          </div>
        )}

        <div className="auth-footer-links">
          <Link to="/privacy">Конфиденциальность</Link>
          <span className="footer-divider">•</span>
          <Link to="/terms">Условия использования</Link>
          <span className="footer-divider">•</span>
          <Link to="/support">Поддержка</Link>
        </div>

        <CopyrightNotice />
      </div>
    </div>
  );
}

export default OAuthCallback;
