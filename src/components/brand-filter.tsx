import { Layers } from 'lucide-react';

import { BrandMark } from '@/components/brand-mark';
import { useProject, type BrandFilterId } from '@/contexts/project-context';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export function BrandFilter() {
  const { projects, brandView, setBrandView } = useProject();
  const t = useT();

  return (
    <div
      role="radiogroup"
      aria-label={t('brandFilter.title')}
      className="rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-3"
    >
      <div className="px-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t('brandFilter.title')}
      </div>
      <ul className="flex flex-col gap-0.5">
        <FilterRow
          id="all"
          active={brandView === 'all'}
          onSelect={setBrandView}
          name={t('brandFilter.allBrands')}
          meta={t('brandFilter.allBrandsMeta')}
          showIcon
        />
        {projects.map((project) => (
          <FilterRow
            key={project.id}
            id={project.id}
            active={brandView === project.id || brandView === project.companySlug}
            onSelect={setBrandView}
            name={project.name}
            meta={project.domain || project.companySlug}
            brand={project}
          />
        ))}
      </ul>
    </div>
  );
}

function FilterRow({
  id,
  active,
  onSelect,
  name,
  meta,
  showIcon,
  brand,
}: {
  id: BrandFilterId;
  active: boolean;
  onSelect: (id: BrandFilterId) => void;
  name: string;
  meta: string;
  showIcon?: boolean;
  brand?: Parameters<typeof BrandMark>[0]['brand'];
}) {
  return (
    <li>
      <button
        type="button"
        role="radio"
        aria-checked={active}
        onClick={() => onSelect(id)}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30',
          active
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'hover:bg-sidebar-accent/60',
        )}
      >
        {showIcon ? (
          <span
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded-sm',
              active ? 'bg-rust/20 text-rust' : 'bg-sidebar-border/60 text-muted-foreground',
            )}
            aria-hidden="true"
          >
            <Layers className="size-3" />
          </span>
        ) : brand ? (
          <BrandMark brand={brand} size="xs" />
        ) : (
          <span
            className={cn(
              'inline-flex size-2.5 shrink-0 items-center justify-center rounded-full ring-1 ring-inset',
              active ? 'bg-rust ring-rust' : 'bg-transparent ring-sidebar-border',
            )}
            aria-hidden="true"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col leading-tight">
          <span className={cn('truncate text-[13px]', active ? 'font-semibold' : 'font-medium')}>
            {name}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{meta}</span>
        </div>
      </button>
    </li>
  );
}
