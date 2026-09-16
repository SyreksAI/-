const env = import.meta.env;

export const TURNSTILE_SITE_KEY = env.VITE_TURNSTILE_SITE_KEY || '';
export const YANDEX_RTB_BLOCK_ID = env.VITE_YANDEX_RTB_BLOCK_ID || '';
export const SITE_URL = env.VITE_SITE_URL || 'http://localhost:8080';
