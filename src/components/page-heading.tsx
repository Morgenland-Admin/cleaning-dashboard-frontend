import type { ReactNode } from 'react';

/** Page-level header. Renders the single <h1> for the route. */
export function PageHeading({
  title,
  subtitle,
  breadcrumb,
  actions,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumb?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={
        'mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between' +
        (className ? ` ${className}` : '')
      }
    >
      <div className="min-w-0">
        {breadcrumb ? (
          <nav aria-label="Breadcrumb" className="mb-1 text-xs text-muted-foreground">
            {breadcrumb}
          </nav>
        ) : null}
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
