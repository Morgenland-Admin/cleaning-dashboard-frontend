import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { SearchInput } from '@/components/search-input';
import { Button } from '@/components/ui/button';
import { SegmentedControl, type SegmentedOption } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { NO_SOURCE, readBrandListState, sourceLabel, type BrandRef } from '@/pages/inbox-shared';

import type { CompanySlug } from '@/contexts/project-context';

export function NewDot({ show, className }: { show: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-1.5 shrink-0 rounded-full',
        show ? 'bg-highlight' : 'bg-transparent',
        className,
      )}
    />
  );
}

/** Prev/next through the (brand, id) list the user came from; nothing when opened directly. */
export function BrandRecordPager({
  slug,
  id,
  hrefFor,
}: {
  slug: CompanySlug;
  id: number;
  hrefFor: (ref: BrandRef) => string;
}) {
  const t = useT();
  const location = useLocation();
  const navigate = useNavigate();
  const { ids } = readBrandListState(location.state);
  const position = ids ? ids.findIndex((r) => r.slug === slug && r.id === id) : -1;
  if (!ids || position < 0 || ids.length < 2) return null;

  const prev = ids[position - 1];
  const next = ids[position + 1];
  const go = (ref: BrandRef) => navigate(hrefFor(ref), { replace: true, state: location.state });

  return (
    <div
      role="group"
      aria-label={t('common.position', { n: position + 1, total: ids.length })}
      className="flex items-center gap-0.5"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('common.previous')}
        disabled={!prev}
        onClick={() => prev && go(prev)}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span
        aria-hidden="true"
        className="min-w-12 text-center text-xs tabular-nums text-muted-foreground"
      >
        {position + 1} / {ids.length}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('common.next')}
        disabled={!next}
        onClick={() => next && go(next)}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Status tabs (server counts), search and source filter: the same strip on every inbox list. */
export function InboxToolbar<S extends string>({
  statusLabel,
  status,
  onStatusChange,
  statusOptions,
  search,
  onSearchChange,
  searching,
  searchPlaceholder,
  source,
  onSourceChange,
  sourceCounts,
}: {
  statusLabel: string;
  status: S;
  onStatusChange: (next: S) => void;
  statusOptions: SegmentedOption<S>[];
  search: string;
  onSearchChange: (next: string) => void;
  searching: boolean;
  searchPlaceholder: string;
  source: string;
  onSourceChange: (next: string) => void;
  sourceCounts: Record<string, number> | undefined;
}) {
  const t = useT();
  const sourceOptions = useMemo(() => {
    const entries = Object.entries(sourceCounts ?? {}).sort((a, b) => b[1] - a[1]);
    if (source && !entries.some(([k]) => k === source)) entries.push([source, 0]);
    const labelled = entries.map(([value, n]) => ({
      value,
      label: sourceLabel(t, value === NO_SOURCE ? null : value),
      meta: String(n),
    }));
    // Several raw sources can share a label ("Test"); the raw value tells them apart.
    return labelled.map((o) =>
      labelled.filter((x) => x.label === o.label).length > 1 ? { ...o, description: o.value } : o,
    );
  }, [sourceCounts, source, t]);
  const showSource = !!source || sourceOptions.length > 1;

  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <SegmentedControl
        label={statusLabel}
        value={status}
        onValueChange={onStatusChange}
        overflow="scroll"
        className="min-w-0 xl:w-fit"
        options={statusOptions}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center xl:shrink-0">
        <SearchInput
          value={search}
          onValueChange={onSearchChange}
          searching={searching}
          placeholder={searchPlaceholder}
          containerClassName="sm:w-72"
        />
        {showSource ? (
          <Select
            aria-label={t('inbox.sourceFilter')}
            value={source}
            onValueChange={onSourceChange}
            className="sm:w-48"
            contentClassName="min-w-56"
            options={[{ value: '', label: t('inbox.allSources') }, ...sourceOptions]}
          />
        ) : null}
      </div>
    </div>
  );
}
