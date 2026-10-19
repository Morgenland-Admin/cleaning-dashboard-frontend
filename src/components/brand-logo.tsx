import { Brush } from 'lucide-react';

import { cn } from '@/lib/utils';

// The surface the logo sits on, not the mark's colour: `auto` follows the
// theme; `dark` and `cream` are permanently dark / pale panels.
type BrandTone = 'auto' | 'dark' | 'cream';

interface AppMarkProps {
  size?: number;
  tone?: BrandTone;
  className?: string;
}

/** The console's own mark, not a tenant brand's avatar (see brand-mark.tsx). */
export function AppMark({ size = 32, tone = 'auto', className }: AppMarkProps) {
  const toneClass =
    tone === 'dark'
      ? 'bg-parchment text-ink'
      : tone === 'cream'
        ? 'bg-ink text-parchment'
        : 'bg-primary text-primary-foreground';

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[24%]',
        toneClass,
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Brush className="size-[56%]" strokeWidth={2.2} />
    </span>
  );
}

interface BrandBlockProps {
  tone?: BrandTone;
  subtitle?: string;
  className?: string;
  size?: number;
  compact?: boolean;
}

export function BrandBlock({
  tone = 'auto',
  subtitle,
  className,
  size = 32,
  compact,
}: BrandBlockProps) {
  const wordmarkColor =
    tone === 'cream' ? 'text-ink' : tone === 'dark' ? 'text-parchment' : 'text-foreground';

  const subtitleColor =
    tone === 'cream'
      ? 'text-ink/70'
      : tone === 'dark'
        ? 'text-parchment/70'
        : 'text-muted-foreground';

  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <AppMark size={size} tone={tone} />
      {compact ? (
        <span className="sr-only">{BRAND_NAME}</span>
      ) : (
        <div className="flex min-w-0 flex-col leading-tight">
          <span className={cn('truncate text-sm font-semibold', wordmarkColor)}>{BRAND_NAME}</span>
          {subtitle ? (
            <span className={cn('truncate text-2xs', subtitleColor)}>{subtitle}</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

export const BRAND_NAME = 'Reinigungs-Portal';
export const BRAND_TAGLINE = 'Cleaning Operations Console';
