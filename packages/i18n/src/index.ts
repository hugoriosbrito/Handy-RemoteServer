import i18n, { type InitOptions } from "i18next";

import en from "../locales/en/translation.json";
import ptBR from "../locales/pt-BR/translation.json";

export const REMOTE_I18N_NAMESPACE = "translation" as const;

export const remoteResources = {
  "pt-BR": { [REMOTE_I18N_NAMESPACE]: ptBR },
  en: { [REMOTE_I18N_NAMESPACE]: en },
} as const;

export type RemoteLocale = keyof typeof remoteResources;

export const DEFAULT_REMOTE_LOCALE: RemoteLocale = "pt-BR";
export const REMOTE_FALLBACK_LOCALE: RemoteLocale = "en";

export const remoteI18nInitOptions: InitOptions = {
  resources: remoteResources,
  lng: DEFAULT_REMOTE_LOCALE,
  fallbackLng: REMOTE_FALLBACK_LOCALE,
  interpolation: {
    escapeValue: false,
  },
};

export function createRemoteI18n(): typeof i18n {
  const instance = i18n.createInstance();
  void instance.init(remoteI18nInitOptions);
  return instance;
}

export { en, ptBR };
export default i18n;
