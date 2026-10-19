import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, RefreshCcw, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/* Errors get `role="alert"`; every other tone is a polite `status`. */
const alertVariants = cva(
  'flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-2sm [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0',
  {
    variants: {
      tone: {
        destructive: 'border-destructive/25 bg-destructive-soft text-destructive',
        warning: 'border-warning/25 bg-warning-soft text-warning',
        success: 'border-success/25 bg-success-soft text-success',
        info: 'border-info/25 bg-info-soft text-info',
        neutral: 'border-border bg-muted text-foreground [&>svg]:text-muted-foreground',
      },
    },
    defaultVariants: { tone: 'destructive' },
  },
);

const ICON = {
  destructive: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
  neutral: Info,
} as const;

export interface AlertProps extends VariantProps<typeof alertVariants> {
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  icon?: ReactNode;
  className?: string;
}

export function Alert({
  tone = 'destructive',
  title,
  children,
  action,
  onDismiss,
  icon,
  className,
}: AlertProps) {
  const t = useT();
  const Icon = ICON[tone ?? 'destructive'];
  return (
    <div
      role={tone === 'destructive' ? 'alert' : 'status'}
      className={cn(alertVariants({ tone }), className)}
    >
      {icon === undefined ? <Icon aria-hidden="true" /> : icon}
      <div className="min-w-0 flex-1 space-y-0.5 break-words">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && 'text-foreground/90')}>{children}</div> : null}
        {action ? <div className="pt-1.5">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('common.dismiss')}
          className="-m-1 grid size-7 shrink-0 place-items-center rounded-md opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** A failed query: message plus retry. Never pair it with an empty state, which would read as success. */
export function ErrorState({
  error,
  onRetry,
  retrying,
  title,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  title?: ReactNode;
  className?: string;
}) {
  const t = useT();
  const message = error instanceof Error && error.message ? error.message : t('common.loadFailed');
  return (
    <Alert
      tone="destructive"
      title={title}
      className={className}
      action={
        onRetry ? (
          <Button type="button" variant="outline" size="xs" onClick={onRetry} loading={retrying}>
            <RefreshCcw aria-hidden="true" />
            {t('common.retry')}
          </Button>
        ) : null
      }
    >
      {message}
    </Alert>
  );
}
