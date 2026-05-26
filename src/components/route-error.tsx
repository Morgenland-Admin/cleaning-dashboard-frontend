import { AlertTriangle } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

import { NotFoundPage } from '@/pages/not-found';

/** React Router errorElement — fallback for thrown loader/render errors and 404s. */
export function RouteError() {
  const error = useRouteError();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'Ein unerwarteter Fehler ist aufgetreten.';

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[640px] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
        Da ist etwas schiefgelaufen
      </h1>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-2 flex gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center rounded-full border border-border bg-card px-4 py-2 text-sm font-medium hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
        >
          Neu laden
        </button>
        <Link
          to="/"
          className="text-rust-foreground inline-flex items-center rounded-full bg-rust px-4 py-2 text-sm font-medium hover:bg-rust/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
        >
          Zur Übersicht
        </Link>
      </div>
    </div>
  );
}
