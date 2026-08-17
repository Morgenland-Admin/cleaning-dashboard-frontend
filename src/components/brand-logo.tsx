import { Brush } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * `tone` names the SURFACE the logo is placed on, not the colour of the mark.
 *
 * It used to name the mark, which is why the login showcase panel asked for
 * `cream` (it wanted the pale mark) and got a `text-ink` wordmark painted onto
 * an ink panel — measured 1.00:1, i.e. the product name was invisible.
 *
 * - `auto`  — follows the theme. Every in-app placement.
 * - `dark`  — a permanently dark surface: pale mark, pale wordmark.
 * - `cream` — a permanently pale surface: ink mark, ink wordmark.
 */
type BrandTone = 'auto' | 'dark' | 'cream';

interface BrandLogoProps {
  size?: number;
  tone?: BrandTone;
  className?: string;
}

export function BrandMark({ size = 36, tone = 'auto', className }: BrandLogoProps) {
  const toneClass =
    tone === 'dark'
      ? 'bg-parchment text-ink'
      : tone === 'cream'
        ? 'bg-ink text-parchment'
        : 'bg-foreground text-background';

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] shadow-sm',
        toneClass,
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Brush className="size-[58%]" strokeWidth={2.2} />
    </span>
  );
}

interface BrandBlockProps {
  tone?: BrandTone;
  subtitle?: string;
  className?: string;
  size?: number;
}

export function BrandBlock({ tone = 'auto', subtitle, className, size = 36 }: BrandBlockProps) {
  const wordmarkColor =
    tone === 'cream' ? 'text-ink' : tone === 'dark' ? 'text-parchment' : 'text-foreground';

  const subtitleColor =
    tone === 'cream'
      ? 'text-ink/60'
      : tone === 'dark'
        ? 'text-parchment/60'
        : 'text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={size} tone={tone} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={cn('truncate text-base font-semibold tracking-[-0.01em]', wordmarkColor)}>
          Reinigungs-Portal
        </span>
        {subtitle ? (
          <span className={cn('truncate text-2xs', subtitleColor)}>{subtitle}</span>
        ) : null}
      </div>
    </div>
  );
}

export const BRAND_NAME = 'Reinigungs-Portal';
export const BRAND_TAGLINE = 'Cleaning Operations Console';
