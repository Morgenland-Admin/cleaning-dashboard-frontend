import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

import type { ReactNode } from 'react';

/*
 * The little count beside a filter tab. It existed in six hand-written copies
 * across the list pages in two shapes, and both failed AA:
 *
 *   - the selected pill inside a filled tab washed `bg-primary-foreground/15`
 *     under text that was already `primary-foreground`, i.e. it moved the
 *     background *towards* the text (3.47:1);
 *   - the resting pill put `text-muted-foreground` on a muted-tinted chip,
 *     which darkens the background under already-soft text (4.18:1).
 *
 * `onFill` now washes with `primary`, not `primary-foreground`. Because those
 * two tokens are opposites in both themes, the wash always moves the background
 * away from the text — it gets darker under light text in the light theme, and
 * lighter under dark text in the dark one.
 */
const countPillVariants = cva('rounded-md px-1.5 py-0.5 text-3xs font-semibold tabular-nums', {
  variants: {
    tone: {
      /** Resting tab. */
      muted: 'bg-muted-foreground/15 text-foreground',
      /** Selected tab that stays on a light surface (a Radix TabsTrigger). */
      accent: 'bg-rust/15 text-rust',
      /** Selected tab painted with a solid accent fill. */
      onFill: 'bg-primary/25 text-primary-foreground',
    },
  },
  defaultVariants: {
    tone: 'muted',
  },
});

export function CountPill({
  tone,
  className,
  children,
}: VariantProps<typeof countPillVariants> & { className?: string; children: ReactNode }) {
  return <span className={cn(countPillVariants({ tone }), className)}>{children}</span>;
}
