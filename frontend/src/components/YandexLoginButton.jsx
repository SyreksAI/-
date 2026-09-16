import React from 'react';

function YandexLoginButton({ next = '/', label = 'Войти с Яндекс ID' }) {
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams({ next: safeNext });
  if (origin) {
    params.set('origin', origin);
  }
  const href = `/api/auth/yandex/login?${params.toString()}`;

  return (
    <a href={href} className="btn-yandex-oauth">
      <span className="btn-yandex-oauth__icon" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="12" fill="#FC3F1D" />
          <path
            d="M13.32 7.67h-.95c-1.57 0-2.38.78-2.38 2.08 0 1.05.58 1.63 1.77 2.27l.98.52-2.84 4.46h-1.9l2.5-3.93c-1.38-.75-2.15-1.68-2.15-3.05 0-2.08 1.45-3.35 3.97-3.35h2.01v10.33h-1.11V7.67z"
            fill="#fff"
          />
        </svg>
      </span>
      <span className="btn-yandex-oauth__text">{label}</span>
    </a>
  );
}

export default YandexLoginButton;
