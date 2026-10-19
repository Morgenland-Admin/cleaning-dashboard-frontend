import { cn } from '@/lib/utils';

import type { Project } from '@/contexts/project-context';

export function BrandMark({
  brand,
  size = 'sm',
  className,
}: {
  brand: Project;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const dim =
    size === 'lg' ? 'size-10' : size === 'md' ? 'size-7' : size === 'xs' ? 'size-4' : 'size-5';
  const text =
    size === 'lg'
      ? 'text-sm'
      : size === 'md'
        ? 'text-2xs'
        : size === 'xs'
          ? 'text-3xs'
          : 'text-3xs';
  const radius = size === 'lg' ? 'rounded-md' : 'rounded-sm';

  if (brand.logoUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden bg-white',
          dim,
          radius,
          className,
        )}
      >
        <img
          src={brand.logoUrl}
          alt=""
          className="size-full object-contain"
          loading="lazy"
          decoding="async"
        />
      </span>
    );
  }

  const usePrimary = !!brand.primaryColor;
  return (
    <span
      aria-hidden="true"
      style={usePrimary ? { backgroundColor: brand.primaryColor! } : undefined}
      className={cn(
        'inline-flex shrink-0 items-center justify-center font-bold leading-none text-white',
        dim,
        radius,
        text,
        usePrimary ? '' : `bg-gradient-to-br ${brand.gradient}`,
        className,
      )}
    >
      {brand.mark}
    </span>
  );
}

/** Which brand a row belongs to, in cross-brand lists. */
export function BrandChip({ brand, className }: { brand: Project; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full shrink-0 items-center gap-1 rounded-sm border border-border bg-card py-px pl-0.5 pr-1.5 text-2xs font-medium text-muted-foreground',
        className,
      )}
    >
      <BrandMark brand={brand} size="xs" />
      <span className="truncate">{brand.shortName}</span>
    </span>
  );
}
