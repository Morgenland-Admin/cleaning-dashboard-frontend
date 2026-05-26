import { cn } from '@/lib/utils';

import type { Project } from '@/contexts/project-context';

/** Brand avatar: logo if uploaded, else 2-letter mark on brand color or gradient. */
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
        ? 'text-[11px]'
        : size === 'xs'
          ? 'text-[8px]'
          : 'text-[9px]';
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

/** Mark + short name inline. */
export function BrandChip({ brand }: { brand: Project }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <BrandMark brand={brand} size="sm" />
      <span className="text-xs">{brand.shortName}</span>
    </span>
  );
}
