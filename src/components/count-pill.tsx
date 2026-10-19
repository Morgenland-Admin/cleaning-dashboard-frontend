import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

const countPillVariants = cva(
  'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 text-3xs font-semibold leading-4 tabular-nums',
  {
    variants: {
      tone: {
        muted: 'bg-muted-foreground/15 text-foreground',
        accent: 'bg-highlight/15 text-primary',
        solid: 'bg-highlight text-highlight-foreground',
        onFill: 'bg-primary-foreground/20 text-primary-foreground',
      },
    },
    defaultVariants: {
      tone: 'muted',
    },
  },
);

export function CountPill({
  tone,
  className,
  children,
}: VariantProps<typeof countPillVariants> & { className?: string; children: ReactNode }) {
  return <span className={cn(countPillVariants({ tone }), className)}>{children}</span>;
}
