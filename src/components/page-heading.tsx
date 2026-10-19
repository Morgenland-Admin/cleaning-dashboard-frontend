import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

export interface Crumb {
  label: ReactNode;
  /** Omit for the current page (plain text, `aria-current`). */
  to?: string;
  state?: unknown;
}

/** Page-level header; renders the route's single <h1>. */
export function PageHeading({
  title,
  subtitle,
  breadcrumb,
  actions,
  meta,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumb?: Crumb[] | ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0 space-y-1">
        {breadcrumb ? (
          Array.isArray(breadcrumb) ? (
            <Breadcrumbs items={breadcrumb} />
          ) : (
            <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground">
              {breadcrumb}
            </nav>
          )
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="min-w-0 break-words text-title font-semibold text-foreground">{title}</h1>
          {meta ? <div className="flex flex-wrap items-center gap-1.5">{meta}</div> : null}
        </div>
        {subtitle ? <p className="max-w-3xl text-2sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('text-xs text-muted-foreground', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <Fragment key={i}>
              <li className="min-w-0 truncate">
                {item.to && !last ? (
                  <Link
                    to={item.to}
                    state={item.state}
                    className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current={last ? 'page' : undefined}>{item.label}</span>
                )}
              </li>
              {last ? null : (
                <li aria-hidden="true" className="text-muted-foreground">
                  /
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/** One frame for every page (full width up to 100rem); `narrow` keeps a reading width but stays left-aligned so titles line up. */
export function PageContainer({
  width = 'full',
  className,
  children,
}: {
  width?: 'full' | 'default' | 'narrow';
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-[100rem]">
      <div
        className={cn('flex w-full min-w-0 flex-col', width === 'narrow' && 'max-w-4xl', className)}
      >
        {children}
      </div>
    </div>
  );
}
