import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/** Independent on/off toggle (aria-pressed); for one-of-n filters use SegmentedControl. */
export function FilterChip({
  pressed,
  onPressedChange,
  icon,
  children,
  className,
}: {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onPressedChange(!pressed)}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-3 text-2sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:h-8 sm:px-2.5 [&_svg]:size-4 [&_svg]:shrink-0',
        pressed
          ? 'border-primary/40 bg-primary-soft text-primary'
          : 'border-border-strong bg-card text-foreground hover:bg-accent',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
