import React from 'react';
import { BRAND_PLATFORM } from '../utils/brand';

export default function AppLoadingScreen({
  logoUrl = '/logo_min.png',
  alt = BRAND_PLATFORM,
  fullscreen = true,
}) {
  return (
    <div
      className={`app-loading-screen${fullscreen ? ' app-loading-screen--fullscreen' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Загрузка"
    >
      <img src={logoUrl} alt={alt} className="app-loading-screen__logo" draggable="false" />
    </div>
  );
}
