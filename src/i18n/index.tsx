import * as React from 'react';

import { de, type Dict } from './dictionaries/de';

export type Locale = 'de' | 'en';

// `de` is the type source and ships in the entry chunk; other locales are lazy chunks.
const LOADERS: Record<Locale, () => Promise<Dict>> = {
  de: () => Promise.resolve(de),
  en: () => import('./dictionaries/en').then((m) => m.en),
};

const loaded: Partial<Record<Locale, Dict>> = { de };
const inFlight: Partial<Record<Locale, Promise<Dict>>> = {};

function loadDict(locale: Locale): Promise<Dict> {
  const cached = loaded[locale];
  if (cached) return Promise.resolve(cached);
  let pending = inFlight[locale];
  if (!pending) {
    pending = LOADERS[locale]().then(
      (dict) => {
        loaded[locale] = dict;
        return dict;
      },
      (err: unknown) => {
        delete inFlight[locale];
        throw err;
      },
    );
    inFlight[locale] = pending;
  }
  return pending;
}

const STORAGE_KEY = 'reinigungs-portal-locale';

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

const initialLocale = detectLocale();
loadDict(initialLocale).catch(() => {});

function lookup(dict: Dict, key: string): string {
  // A missing label must never take a whole page down.
  if (typeof key !== 'string') return '';
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
  // Only changes once that dictionary is loaded, so t() stays synchronous; null holds children back (no German flash).
  const [shown, setShown] = React.useState<Locale | null>(() =>
    loaded[initialLocale] ? initialLocale : null,
  );
  // A slow load must not override a later choice.
  const requested = React.useRef<Locale>(initialLocale);

  const activate = React.useCallback((next: Locale) => {
    requested.current = next;
    loadDict(next).then(
      () => {
        if (requested.current === next) setShown(next);
      },
      () => {
        // Chunk unreachable (offline, or replaced by a deploy): never leave the app blank.
        if (requested.current === next) setShown((cur) => cur ?? 'de');
      },
    );
  }, []);

  React.useEffect(() => {
    if (shown === null) activate(requested.current);
  }, [shown, activate]);

  const setLocale = React.useCallback(
    (next: Locale) => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, next);
      }
      activate(next);
    },
    [activate],
  );

  const locale = shown ?? 'de';

  React.useEffect(() => {
    if (shown && typeof document !== 'undefined') {
      document.documentElement.setAttribute('lang', shown);
    }
  }, [shown]);

  const dict = loaded[locale] ?? de;
  const t = React.useCallback(
    (key: DictKey, vars?: Record<string, string | number>) => interpolate(lookup(dict, key), vars),
    [dict],
  );

  const bcp47 = locale === 'de' ? 'de-DE' : 'en-GB';

  const value = React.useMemo(
    () => ({ locale, setLocale, t, bcp47 }),
    [locale, setLocale, t, bcp47],
  );

  if (shown === null) return null;

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}

export function useT() {
  return useLocale().t;
}
