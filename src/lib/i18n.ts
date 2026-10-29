import { readonly, ref } from 'vue';
import english from '../locales/en.json';

export const supportedLocales = ['en'] as const;
export type Locale = typeof supportedLocales[number];
export const languageOptions = [{ value: 'en', label: 'English' }] as const;
const activeLocale = ref<Locale>('en');
export const locale = readonly(activeLocale);
const catalogs: Record<Locale, Readonly<Record<string, string>>> = { en: english };

/** Resolve once on first launch; unsupported system languages fall back to English. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().replaceAll('_', '-').split('-')[0];
    if (supportedLocales.includes(base as Locale)) return base as Locale;
  }
  return 'en';
}
export function resolveLocale(saved: unknown, languages: readonly string[]): Locale {
  return supportedLocales.includes(saved as Locale) ? saved as Locale : detectLocale(languages);
}
export function setLocale(value: Locale) {
  if (!supportedLocales.includes(value)) throw new Error('Unsupported language.');
  activeLocale.value = value;
  if (typeof document !== 'undefined') document.documentElement.lang = value;
}
/** English source messages are stable keys; values are interpolated, never evaluated. */
export function t(message: string, values: readonly unknown[] = []): string {
  const translated = catalogs[activeLocale.value][message] ?? english[message as keyof typeof english] ?? message;
  return translated.replace(/\{(\d+)\}/g, (token, index) => index in values ? String(values[index]) : token);
}
export const formatNumber = (value: number) => new Intl.NumberFormat(locale.value).format(value);
