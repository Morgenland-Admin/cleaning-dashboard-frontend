import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/** Label/value facts as a description list; empty values are skipped unless `empty` is given. */
export function KeyValueList({
  children,
  layout = 'inline',
  className,
}: {
  children: ReactNode;
  layout?: 'inline' | 'grid' | 'stacked';
  className?: string;
}) {
  return (
    <dl
      data-layout={layout}
      className={cn(
        'group/kv text-2sm',
        layout === 'grid'
          ? 'grid grid-cols-[minmax(6rem,auto)_1fr] gap-x-4 gap-y-1.5'
          : layout === 'stacked'
            ? 'grid gap-3'
            : 'grid gap-1.5',
        className,
      )}
    >
      {children}
    </dl>
  );
}

export function KeyValue({
  label,
  value,
  empty,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  empty?: ReactNode;
  className?: string;
}) {
  const isEmpty = value === null || value === undefined || value === '';
  if (isEmpty && empty === undefined) return null;
  const shown = isEmpty ? <span className="text-muted-foreground">{empty}</span> : value;
  return (
    <div
      className={cn(
        // `contents` so dt/dd land in the parent grid's columns.
        'group-data-[layout=grid]/kv:contents',
        'group-data-[layout=inline]/kv:flex group-data-[layout=inline]/kv:items-baseline group-data-[layout=inline]/kv:justify-between group-data-[layout=inline]/kv:gap-3',
        'group-data-[layout=stacked]/kv:space-y-0.5',
        className,
      )}
    >
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-foreground [overflow-wrap:anywhere] group-data-[layout=inline]/kv:text-right">
        {shown}
      </dd>
    </div>
  );
}
