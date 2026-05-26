import { Brush } from 'lucide-react';

import { cn } from '@/lib/utils';

interface BrandLogoProps {
  size?: number;
  tone?: 'auto' | 'dark' | 'cream';
  className?: string;
}

export function BrandMark({ size = 36, tone = 'auto', className }: BrandLogoProps) {
  const toneClass =
    tone === 'cream'
      ? 'bg-[hsl(38_30%_92%)] text-[hsl(20_22%_14%)]'
      : tone === 'dark'
        ? 'bg-[hsl(20_22%_14%)] text-[hsl(38_30%_92%)]'
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
  tone?: 'auto' | 'dark' | 'cream';
  subtitle?: string;
  className?: string;
  size?: number;
}

export function BrandBlock({ tone = 'auto', subtitle, className, size = 36 }: BrandBlockProps) {
  const wordmarkColor =
    tone === 'cream'
      ? 'text-[hsl(20_22%_14%)]'
      : tone === 'dark'
        ? 'text-[hsl(38_30%_92%)]'
        : 'text-foreground';

  const subtitleColor =
    tone === 'cream'
      ? 'text-[hsl(20_22%_14%)]/60'
      : tone === 'dark'
        ? 'text-[hsl(38_30%_92%)]/60'
        : 'text-muted-foreground';

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <BrandMark size={size} tone={tone} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span
          className={cn('truncate text-[16px] font-semibold tracking-[-0.01em]', wordmarkColor)}
        >
          Reinigungs-Portal
        </span>
        {subtitle ? (
          <span className={cn('truncate text-[11px]', subtitleColor)}>{subtitle}</span>
        ) : null}
      </div>
    </div>
  );
}

export const BRAND_NAME = 'Reinigungs-Portal';
export const BRAND_TAGLINE = 'Cleaning Operations Console';
