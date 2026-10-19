import { Loader2 } from 'lucide-react';

import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  message,
  action,
  variant = 'plain',
  size = 'default',
  className,
}: {
  icon?: ReactNode;
  title?: string;
  message: string;
  action?: ReactNode;
  variant?: 'plain' | 'dashed';
  size?: 'default' | 'sm';
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 px-4 text-center text-2sm text-muted-foreground',
        size === 'sm' ? 'min-h-28 py-6' : 'min-h-48 py-10',
        variant === 'dashed' && 'rounded-lg border border-dashed border-border-strong',
        className,
      )}
    >
      {icon ? (
        <div
          className="mb-1.5 flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5"
          aria-hidden="true"
        >
          {icon}
        </div>
      ) : null}
      {title ? <p className="text-sm font-medium text-foreground">{title}</p> : null}
      <p className="max-w-sm">{message}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function LoadingState({
  label,
  className,
  inline,
}: {
  label?: string;
  className?: string;
  inline?: boolean;
}) {
  const t = useT();
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'flex items-center gap-2 text-2sm text-muted-foreground',
        inline ? 'py-2' : 'min-h-32 justify-center py-8',
        className,
      )}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label ?? t('common.loading')}</span>
    </div>
  );
}
