import { BRAND_OPERATOR, BRAND_PLATFORM } from './brand';

export const COPYRIGHT_YEAR = new Date().getFullYear();
export const COPYRIGHT_SITE = BRAND_PLATFORM;
export const COPYRIGHT_COMPANY = BRAND_OPERATOR;

export const COPYRIGHT_TEXT = `© ${COPYRIGHT_YEAR} ${COPYRIGHT_SITE}. Все права защищены компанией ${COPYRIGHT_COMPANY}.`;
