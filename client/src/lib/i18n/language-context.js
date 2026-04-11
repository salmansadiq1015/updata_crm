'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { translations } from './translations';

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState('de');

  const t = useCallback(
    (key) => translations[locale]?.[key] ?? translations.de[key] ?? key,
    [locale]
  );

  const toggleLanguage = useCallback(() => {
    setLocale((prev) => (prev === 'de' ? 'en' : 'de'));
  }, []);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider');
  return ctx;
}
