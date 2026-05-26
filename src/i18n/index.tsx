import * as React from 'react';

import { de, type Dict } from './dictionaries/de';
import { en } from './dictionaries/en';

export type Locale = 'de' | 'en';

const DICTS: Record<Locale, Dict> = { de, en };

const STORAGE_KEY = 'reinigungs-portal-locale';

// Dot-notation paths through Dict as a string union — makes t() type-safe.
type Leaves<T> = T extends string
  ? ''
  : {
      [K in Extract<keyof T, string>]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
    }[Extract<keyof T, string>];

export type DictKey = Leaves<Dict>;

interface LocaleContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
  bcp47: string;
}

const LocaleContext = React.createContext<LocaleContextValue | undefined>(undefined);

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'de';
  const stored = window.localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (stored === 'de' || stored === 'en') return stored;
  const browser = navigator.language?.toLowerCase() ?? '';
  if (browser.startsWith('en')) return 'en';
  return 'de';
}

function lookup(dict: Dict, key: string): string {
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const p of parts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return key;
    }
  }
  return typeof cur === 'string' ? cur : key;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const v = vars[name];
    return v === undefined || v === null ? `{{${name}}}` : String(v);
  });
}

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = React.useState<Locale>(detectLocale);

  const setLocale = React.useCallback((next: Locale) => {
    setLocaleState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
      document.documentElement.setAttribute('lang', next);
    }
  }, []);

  React.useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', locale);
    }
  }, [locale]);

  const t = React.useCallback(
    (key: DictKey, vars?: Record<string, string | number>) =>
      interpolate(lookup(DICTS[locale], key), vars),
    [locale],
  );

  const bcp47 = locale === 'de' ? 'de-DE' : 'en-GB';

  const value = React.useMemo(
    () => ({ locale, setLocale, t, bcp47 }),
    [locale, setLocale, t, bcp47],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

/** Convenience hook that returns just the translation function. */
export function useT() {
  return useLocale().t;
}
