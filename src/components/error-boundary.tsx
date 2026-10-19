import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
}

// Wraps ThemeProvider and LocaleProvider, so no context exists here: the copy is a
// static pair picked from <html lang>.
const COPY = {
  de: {
    title: 'Anwendung konnte nicht geladen werden',
    fallback: 'Ein unerwarteter Fehler ist aufgetreten.',
    reload: 'Neu laden',
  },
  en: {
    title: 'The app could not be loaded',
    fallback: 'An unexpected error occurred.',
    reload: 'Reload',
  },
} as const;

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (typeof console !== 'undefined') {
      console.error('Top-level render error:', error, info);
    }
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    const lang = typeof document !== 'undefined' ? document.documentElement.lang : 'de';
    const copy = lang === 'en' ? COPY.en : COPY.de;
    return (
      <main className="flex min-h-svh items-center justify-center bg-background p-6 text-foreground">
        <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
          <span className="flex size-10 items-center justify-center rounded-lg bg-destructive-soft text-destructive">
            <AlertTriangle className="size-5" aria-hidden="true" />
          </span>
          <h1 className="text-title font-semibold">{copy.title}</h1>
          <p className="break-words text-2sm text-muted-foreground">
            {this.state.error.message || copy.fallback}
          </p>
          <Button type="button" className="mt-2" onClick={() => window.location.reload()}>
            <RefreshCcw aria-hidden="true" />
            {copy.reload}
          </Button>
        </div>
      </main>
    );
  }
}
