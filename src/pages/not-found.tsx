import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-[640px] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-rust/15 text-rust">
        <Compass className="size-6" aria-hidden="true" />
      </div>
      <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
        Seite nicht gefunden
      </h1>
      <p className="text-sm text-muted-foreground">
        Diese Adresse existiert nicht (mehr). Vielleicht wurde sie umbenannt oder der Link ist
        veraltet.
      </p>
      <Link
        to="/"
        className="text-rust-foreground mt-2 inline-flex items-center rounded-full bg-rust px-4 py-2 text-sm font-medium hover:bg-rust/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
      >
        Zurück zur Übersicht
      </Link>
    </div>
  );
}
