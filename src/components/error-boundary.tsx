import { AlertTriangle } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Catches render errors that escape React Router's errorElement. */
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
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight">
            Anwendung konnte nicht geladen werden
          </h1>
          <p className="text-sm text-muted-foreground">
            {this.state.error.message || 'Ein unerwarteter Fehler ist aufgetreten.'}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-rust-foreground mt-2 inline-flex items-center rounded-full bg-rust px-4 py-2 text-sm font-medium hover:bg-rust/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
          >
            Neu laden
          </button>
        </div>
      </div>
    );
  }
}
