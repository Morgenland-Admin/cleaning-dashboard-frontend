import { ChevronsUpDown, Layers } from 'lucide-react';

import { BrandMark } from '@/components/brand-mark';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject } from '@/contexts/project-context';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Sidebar context switcher: scopes every list to all brands or one. */
export function BrandFilter({ collapsed = false }: { collapsed?: boolean }) {
  const { projects, setBrandView, isAllBrands, activeProject } = useProject();
  const t = useT();

  // The stored view may be a slug or an id; resolve to an id for the radio value.
  const currentId = isAllBrands ? 'all' : activeProject.id;
  const name = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const meta = isAllBrands
    ? t('brandFilter.allBrandsMeta')
    : activeProject.domain || activeProject.companySlug;

  const mark = isAllBrands ? (
    <span
      className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
      aria-hidden="true"
    >
      <Layers className="size-3.5" />
    </span>
  ) : (
    <BrandMark brand={activeProject} size="md" className="size-6" />
  );

  const trigger = (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={`${t('brandFilter.switch')}: ${name}`}
        className={cn(
          'group flex w-full items-center gap-2.5 rounded-lg border border-sidebar-border bg-sidebar-active text-left shadow-xs transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:border-border-strong',
          collapsed ? 'size-10 justify-center p-0' : 'h-12 px-2 lg:h-11',
        )}
      >
        {mark}
        {collapsed ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-2sm font-semibold text-foreground">{name}</span>
              <span className="truncate text-2xs text-muted-foreground">{meta}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </>
        )}
      </button>
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">{name}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent
        side={collapsed ? 'right' : 'bottom'}
        align="start"
        className="w-[min(18rem,calc(100vw-2rem))]"
      >
        <DropdownMenuLabel>{t('brandFilter.title')}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={currentId} onValueChange={(v) => setBrandView(v)}>
          <DropdownMenuRadioItem value="all" className="gap-2.5">
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary-soft text-primary"
              aria-hidden="true"
            >
              <Layers className="size-3" />
            </span>
            <Option name={t('brandFilter.allBrands')} meta={t('brandFilter.allBrandsMeta')} />
          </DropdownMenuRadioItem>
          <DropdownMenuSeparator />
          {projects.map((project) => (
            <DropdownMenuRadioItem key={project.id} value={project.id} className="gap-2.5">
              <BrandMark brand={project} size="sm" />
              <Option name={project.name} meta={project.domain || project.companySlug} />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Option({ name, meta }: { name: string; meta: string }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-2sm font-medium">{name}</span>
      <span className="truncate text-2xs text-muted-foreground">{meta}</span>
    </span>
  );
}
