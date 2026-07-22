import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as SecureStore from 'expo-secure-store';

import ptBR from './locales/pt-BR/translation.json';
import en from './locales/en/translation.json';

const LANGUAGE_KEY = 'handy_language';

export async function getStoredLanguage(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(LANGUAGE_KEY);
  } catch {
    return null;
  }
}

export async function setStoredLanguage(lang: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(LANGUAGE_KEY, lang);
  } catch {
    // ignore secure store errors in dev
  }
}

const resources = {
  'pt-BR': { translation: ptBR },
  en: { translation: en },
};

i18n.use(initReactI18next).init({
  resources,
  lng: 'pt-BR',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  compatibilityJSON: 'v4',
});

export default i18n;
