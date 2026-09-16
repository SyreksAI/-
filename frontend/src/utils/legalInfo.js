import { BRAND_EMAIL, BRAND_OPERATOR, BRAND_PLATFORM, BRAND_SITE_URL } from './brand';

const env = import.meta.env;

export const LEGAL_DOCS_VERSION = env.VITE_LEGAL_DOCS_VERSION || '07.09.2026';

export const LEGAL_INFO = {
  operatorName: env.VITE_LEGAL_OPERATOR_NAME || BRAND_OPERATOR,
  platformName: env.VITE_LEGAL_PLATFORM_NAME || BRAND_PLATFORM,
  siteUrl: env.VITE_LEGAL_SITE_URL || env.VITE_SITE_URL || BRAND_SITE_URL,
  privacyEmail: env.VITE_LEGAL_PRIVACY_EMAIL || BRAND_EMAIL,
  supportEmail: env.VITE_LEGAL_SUPPORT_EMAIL || BRAND_EMAIL,
  policyDate: env.VITE_LEGAL_DOCS_VERSION || '07.09.2026',
  termsDate: env.VITE_LEGAL_DOCS_VERSION || '07.09.2026',
  inn: env.VITE_LEGAL_INN || '',
  ogrn: env.VITE_LEGAL_OGRN || '',
  legalAddress: env.VITE_LEGAL_ADDRESS || '',
  phone: env.VITE_LEGAL_PHONE || '',
  roskomnadzorNumber: env.VITE_LEGAL_ROSKOMNADZOR_NUMBER || '',
  roskomnadzorOrder: '',
  roskomnadzorRegisteredAt: '',
  processingStartedAt: '',
};

export const applyLegalInfo = (legal = {}) => {
  if (!legal || typeof legal !== 'object') {
    return LEGAL_INFO;
  }
  return {
    ...LEGAL_INFO,
    operatorName: legal.operatorName || LEGAL_INFO.operatorName,
    platformName: legal.platformName || LEGAL_INFO.platformName,
    siteUrl: legal.siteUrl || LEGAL_INFO.siteUrl,
    privacyEmail: legal.privacyEmail || LEGAL_INFO.privacyEmail,
    supportEmail: legal.supportEmail || LEGAL_INFO.supportEmail,
    docsVersion: legal.docsVersion || LEGAL_DOCS_VERSION,
    inn: legal.inn ?? LEGAL_INFO.inn,
    ogrn: legal.ogrn ?? LEGAL_INFO.ogrn,
    legalAddress: legal.legalAddress ?? LEGAL_INFO.legalAddress,
    phone: legal.phone ?? LEGAL_INFO.phone,
    roskomnadzorNumber: legal.roskomnadzorNumber ?? LEGAL_INFO.roskomnadzorNumber,
  };
};

export const hasOperatorRequisites = (info = LEGAL_INFO) =>
  Boolean(info.inn || info.ogrn || info.legalAddress);
