import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

/** Goes to a fixed parent page, not browser history. */
export function BackLink({
  to,
  state,
  children,
  className,
}: {
  to: string;
  state?: unknown;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      to={to}
      state={state}
      className={cn(
        '-ml-1 inline-flex min-h-10 w-fit items-center gap-1.5 self-start rounded-md px-1 py-0.5 text-2sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0',
        className,
      )}
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}
