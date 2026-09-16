import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CONSENT,
  getCookieConsent,
  hasConsentChoice,
  setCookieConsent,
} from '../utils/cookieConsent';

function CookieConsent() {
  const [visible, setVisible] = useState(() => !hasConsentChoice());

  useEffect(() => {
    if (hasConsentChoice()) {
      setVisible(false);
    }
  }, []);

  const accept = (value) => {
    setCookieConsent(value);
    setVisible(false);
  };

  if (!visible || getCookieConsent() !== CONSENT.NONE) {
    return null;
  }

  return (
    <div className="cookie-consent" role="dialog" aria-live="polite" aria-label="Согласие на использование cookie">
      <div className="cookie-consent__panel">
        <div className="cookie-consent__header">
          <span className="cookie-consent__icon" aria-hidden="true">
            <i className="fas fa-cookie-bite" />
          </span>
          <p className="cookie-consent__title">Cookie на сайте</p>
        </div>

        <p className="cookie-consent__text">
          Используем технические cookie для входа и безопасности. Дополнительные — для рекламы и
          улучшения сервиса.{' '}
          <Link to="/privacy#cookies">Подробнее</Link>
        </p>

        <div className="cookie-consent__actions">
          <button
            type="button"
            className="cookie-consent__btn cookie-consent__btn--primary"
            onClick={() => accept(CONSENT.ALL)}
          >
            Принять все
          </button>
          <button
            type="button"
            className="cookie-consent__btn cookie-consent__btn--secondary"
            onClick={() => accept(CONSENT.ESSENTIAL)}
          >
            Только необходимые
          </button>
        </div>
      </div>
    </div>
  );
}

export default CookieConsent;
