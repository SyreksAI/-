import React, { useEffect, useState } from 'react';
import {
  CONSENT_CHANGED_EVENT,
  ensureYandexContextLoaded,
  hasAnalyticsConsent,
} from '../utils/cookieConsent';

const isLocalHost = () => {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || import.meta.env.DEV;
};

function YandexAd({ blockId }) {
  const [analyticsAllowed, setAnalyticsAllowed] = useState(() => hasAnalyticsConsent());

  useEffect(() => {
    const onConsentChange = () => setAnalyticsAllowed(hasAnalyticsConsent());
    window.addEventListener(CONSENT_CHANGED_EVENT, onConsentChange);
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, onConsentChange);
  }, []);

  useEffect(() => {
    if (isLocalHost() || !analyticsAllowed) return;

    ensureYandexContextLoaded();
    window.yaContextCb = window.yaContextCb || [];
    window.yaContextCb.push(() => {
      if (window.Ya?.Context?.AdvManager) {
        window.Ya.Context.AdvManager.render({
          blockId,
          renderTo: `yandex_rtb_${blockId}`,
        });
      }
    });
  }, [blockId, analyticsAllowed]);

  if (isLocalHost() || !analyticsAllowed) {
    return null;
  }

  return (
    <div
      id={`yandex_rtb_${blockId}`}
      style={{ minHeight: '250px' }}
    />
  );
}

export default YandexAd;
