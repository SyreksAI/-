export const CONSENT_STORAGE_KEY = 'dubpar_cookie_consent_v1';
export const CONSENT_CHANGED_EVENT = 'dubpar:cookie-consent';

export const CONSENT = {
  NONE: 'none',
  ESSENTIAL: 'essential',
  ALL: 'all',
};

export const getCookieConsent = () => {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (raw === CONSENT.ESSENTIAL || raw === CONSENT.ALL) {
      return raw;
    }
  } catch {
    // localStorage unavailable
  }
  return CONSENT.NONE;
};

export const hasConsentChoice = () => getCookieConsent() !== CONSENT.NONE;

export const hasAnalyticsConsent = () => getCookieConsent() === CONSENT.ALL;

export const setCookieConsent = (value) => {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // localStorage unavailable
  }
  if (value === CONSENT.ALL) {
    ensureYandexContextLoaded();
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: value }));
};

/** Load Yandex RTB only after analytics consent. */
export const ensureYandexContextLoaded = () => {
  if (typeof document === 'undefined') return;
  window.yaContextCb = window.yaContextCb || [];
  if (document.querySelector('script[data-yandex-context]')) return;
  const script = document.createElement('script');
  script.src = 'https://yandex.ru/ads/system/context.js';
  script.async = true;
  script.dataset.yandexContext = '1';
  document.head.appendChild(script);
};

export const initCookieConsent = () => {
  if (hasAnalyticsConsent()) {
    ensureYandexContextLoaded();
  }
};
