import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/** Pinned to the viewport bottom; below lg it sits above the fixed mobile tab bar (53px + safe-area padding). */
export function FormActionBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'sticky bottom-[calc(3.3125rem+max(0.375rem,env(safe-area-inset-bottom)))] z-10 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-border bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border lg:bottom-0',
        className,
      )}
    >
      {children}
    </div>
  );
}
