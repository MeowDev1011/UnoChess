import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from './languages';
import { RESOURCES } from './translations';

const supportedCodes = SUPPORTED_LANGUAGES.map((l) => l.code);

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: RESOURCES,
    supportedLngs: supportedCodes,
    nonExplicitSupportedLngs: true,
    load: 'languageOnly',
    fallbackLng: 'es',
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
    },
    interpolation: {
      escapeValue: false,
    },
  });

const syncHtmlDir = (lng: string) => {
  if (typeof document === 'undefined') return;
  const base = lng.split('-')[0];
  document.documentElement.lang = base;
  document.documentElement.dir = base === 'ar' ? 'rtl' : 'ltr';
};

syncHtmlDir(i18n.language || 'es');
i18n.on('languageChanged', syncHtmlDir);

export default i18n;
