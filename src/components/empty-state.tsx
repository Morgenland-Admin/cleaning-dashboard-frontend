import type { ReactNode } from 'react';

/** Empty / no-results state with role=status for AT announcements. */
export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: {
  icon?: ReactNode;
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={
        'flex h-48 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground' +
        (className ? ` ${className}` : '')
      }
    >
      {icon ? <div className="opacity-50">{icon}</div> : null}
      {title ? <p className="font-medium text-foreground">{title}</p> : null}
      <p className="max-w-sm">{message}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
