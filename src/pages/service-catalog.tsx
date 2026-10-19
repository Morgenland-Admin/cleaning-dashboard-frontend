import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Inbox, Plus } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { EmptyState, LoadingState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
import { StatusBadge } from '@/components/status-badge';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProject } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import { serviceCatalogApi, type CatalogEntry } from '@/lib/api';
import { catalogCategoryLabel, pricingModeLabel } from '@/lib/partners';
import { useOrderKindLabel } from '@/lib/use-order-kind-label';
import { usePageTitle } from '@/lib/use-page-title';

type Filter = 'all' | 'active' | 'inactive';
const FILTERS: Filter[] = ['all', 'active', 'inactive'];

const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

export function ServiceCatalogPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const location = useLocation();
  const canWrite = useCanWrite();
  const { activeProject, isAllBrands } = useProject();
  const slug = activeProject.companySlug;
  usePageTitle(t('serviceCatalog.title'));
  const kindLabel = useOrderKindLabel(isAllBrands ? null : slug);
  // Filter and search live in the URL, so the back link from an entry restores them.
  const [searchParams, setSearchParams] = useSearchParams();
  const filterParam = searchParams.get('status') as Filter | null;
  const filter: Filter = filterParam && FILTERS.includes(filterParam) ? filterParam : 'all';
  const search = searchParams.get('q') ?? '';
  function setParam(key: 'status' | 'q', value: string, empty: string) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value === empty) p.delete(key);
        else p.set(key, value);
        return p;
      },
      { replace: true },
    );
  }

  const query = useQuery({
    queryKey: ['service-catalog', slug] as const,
    queryFn: ({ signal }) => serviceCatalogApi.list(slug, signal),
    enabled: !isAllBrands,
  });
  const services = useMemo(() => query.data?.services ?? [], [query.data]);
  const counts = useMemo(
    () => ({
      all: services.length,
      active: services.filter((s) => s.isActive).length,
      inactive: services.filter((s) => !s.isActive).length,
    }),
    [services],
  );
  const needle = search.trim().toLowerCase();
  const filtered = services.filter(
    (s) =>
      (filter === 'all' || (filter === 'active') === s.isActive) &&
      (!needle ||
        s.name.toLowerCase().includes(needle) ||
        s.slug.includes(needle) ||
        (s.category ?? '').toLowerCase().includes(needle) ||
        (catalogCategoryLabel(s.category) ?? '').toLowerCase().includes(needle)),
  );
  const linkState = { from: location.search, ids: filtered.map((s) => s.id) };

  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const heading = (
    <PageHeading
      title={t('serviceCatalog.title')}
      subtitle={t('serviceCatalog.subtitle', { brand: brandLabel })}
      breadcrumb={[{ label: brandLabel }, { label: t('serviceCatalog.title') }]}
      actions={
        isAllBrands ? null : (
          <>
            <RefreshButton onClick={() => void query.refetch()} fetching={query.isFetching} />
            {canWrite ? (
              <Button size="sm" asChild>
                <Link to="/leistungskatalog/neu">
                  <Plus aria-hidden="true" />
                  {t('serviceCatalog.create')}
                </Link>
              </Button>
            ) : null}
          </>
        )
      }
    />
  );

  if (isAllBrands) {
    return (
      <PageContainer width="full">
        {heading}
        <EmptyState variant="dashed" icon={<Inbox />} message={t('partners.selectBrandFirst')} />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="full">
      {heading}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SegmentedControl
            value={filter}
            onValueChange={(v) => setParam('status', v, 'all')}
            label={t('serviceCatalog.filterLabel')}
            overflow="scroll"
            className="w-fit"
            options={[
              { value: 'all', label: t('partners.tabAll'), count: counts.all },
              { value: 'active', label: t('serviceCatalog.active'), count: counts.active },
              { value: 'inactive', label: t('serviceCatalog.inactive'), count: counts.inactive },
            ]}
          />
          <SearchInput
            value={search}
            onValueChange={(v) => setParam('q', v, '')}
            label={t('serviceCatalog.searchLabel')}
            placeholder={t('serviceCatalog.searchPlaceholder')}
            containerClassName="sm:w-72 sm:shrink-0"
          />
        </div>

        {query.isError ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : query.isLoading ? (
          <Card>
            <LoadingState />
          </Card>
        ) : filtered.length === 0 ? (
          <EmptyState
            variant="dashed"
            icon={<Inbox />}
            message={needle ? t('serviceCatalog.noSearchResults') : t('serviceCatalog.empty')}
          />
        ) : (
          <>
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
              {filtered.map((s) => (
                <li
                  key={s.id}
                  className="relative flex items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-accent/60"
                >
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/leistungskatalog/${s.id}`}
                        state={linkState}
                        className={`min-w-0 truncate text-2sm font-medium text-foreground ${ROW_LINK}`}
                      >
                        {s.name}
                      </Link>
                      <ActiveBadge active={s.isActive} className="ml-auto" />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[
                        pricingModeLabel(t, s.pricingMode),
                        catalogCategoryLabel(s.category),
                        commissionText(s, t, bcp47),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block lg:max-h-[calc(100svh-17rem)] lg:overflow-auto lg:overscroll-contain">
              <Table containerClassName="w-full">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>{t('serviceCatalog.colService')}</TableHead>
                    <TableHead>{t('serviceCatalog.colCategory')}</TableHead>
                    <TableHead>{t('serviceCatalog.colPricing')}</TableHead>
                    <TableHead>{t('serviceCatalog.colOrderKind')}</TableHead>
                    <TableHead className="text-right">
                      {t('serviceCatalog.colCommission')}
                    </TableHead>
                    <TableHead>{t('partners.colStatus')}</TableHead>
                    <TableHead className="text-right">{t('serviceCatalog.colSort')}</TableHead>
                    <TableHead className="w-10">
                      <span className="sr-only">{t('partners.openDetail')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className="relative">
                      <TableCell className="max-w-[22rem] py-2">
                        <Link
                          to={`/leistungskatalog/${s.id}`}
                          state={linkState}
                          className={`block truncate font-medium text-foreground hover:underline ${ROW_LINK}`}
                        >
                          {s.name}
                        </Link>
                        <p className="truncate font-mono text-xs text-muted-foreground">{s.slug}</p>
                      </TableCell>
                      <TableCell
                        className="py-2 text-muted-foreground"
                        title={s.category ?? undefined}
                      >
                        {catalogCategoryLabel(s.category) ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2">
                        {pricingModeLabel(t, s.pricingMode)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-muted-foreground">
                        {s.orderKind ? kindLabel(s.orderKind) : '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-2 text-right tabular-nums">
                        {commissionText(s, t, bcp47)}
                      </TableCell>
                      <TableCell className="py-2">
                        <ActiveBadge active={s.isActive} />
                      </TableCell>
                      <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                        {s.sortOrder}
                      </TableCell>
                      <TableCell className="w-10 py-2 text-right">
                        <ChevronRight
                          className="ml-auto size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </PageContainer>
  );
}

function ActiveBadge({ active, className }: { active: boolean; className?: string }) {
  const t = useT();
  return (
    <StatusBadge
      label={active ? t('serviceCatalog.active') : t('serviceCatalog.inactive')}
      tone={active ? 'success' : 'neutral'}
      className={className}
    />
  );
}

function commissionText(s: CatalogEntry, t: ReturnType<typeof useT>, bcp47: string): string {
  return s.commissionRate != null
    ? `${Number(s.commissionRate).toLocaleString(bcp47)} %`
    : t('serviceCatalog.commissionDefault');
}
