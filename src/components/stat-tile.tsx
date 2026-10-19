import { Link } from 'react-router-dom';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  loading,
  to,
  size = 'default',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'default' | 'attention' | 'danger' | 'success';
  loading?: boolean;
  to?: string;
  size?: 'default' | 'sm';
  className?: string;
}) {
  const body = (
    <>
      <dt className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0">
        {icon}
        <span className="truncate">{label}</span>
      </dt>
      <dd
        className={cn(
          'font-semibold tabular-nums',
          size === 'sm' ? 'text-lg leading-7' : 'text-metric',
          tone === 'attention' && 'text-primary',
          tone === 'danger' && 'text-destructive',
          tone === 'success' && 'text-success',
        )}
      >
        {loading ? <Skeleton className={size === 'sm' ? 'h-7 w-12' : 'h-8 w-16'} /> : value}
      </dd>
      {hint ? <dd className="truncate text-xs text-muted-foreground">{hint}</dd> : null}
    </>
  );
  const classes = cn(
    'flex min-w-0 flex-col gap-1 rounded-lg border bg-card',
    size === 'sm' ? 'px-3 py-2.5' : 'p-4',
    className,
  );
  if (to) {
    return (
      <Link
        to={to}
        className={cn(
          classes,
          'transition-colors hover:border-border-strong hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        )}
      >
        <dl className="contents">{body}</dl>
      </Link>
    );
  }
  return <dl className={classes}>{body}</dl>;
}

export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6', className)}>
      {children}
    </div>
  );
}
