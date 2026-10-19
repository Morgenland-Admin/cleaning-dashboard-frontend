import { useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import { EmptyState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
import { StatusBadge } from '@/components/status-badge';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { ListSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProject, type Project } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  staffApi,
  type StaffAccessLevel,
  type StaffListRow,
  type StaffStatusFilter,
} from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';
import { useUrlSearch } from '@/lib/use-url-search';
import { cn, formatDateTime } from '@/lib/utils';
import { STAFF_LEVELS, accessLabel, accessTone } from '@/pages/users-shared';

/** Stretched row link (one real link per row). */
const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

const STATUS_FILTERS: StaffStatusFilter[] = ['active', 'inactive', 'all'];
const ALL_LEVELS = 'all';

export function UsersPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { projects } = useProject();
  const { data: session } = useSession();
  const selfId = session?.user?.id;
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const search = useUrlSearch();
  usePageTitle(t('users.title'));

  const statusParam = searchParams.get('status');
  const status: StaffStatusFilter = STATUS_FILTERS.includes(statusParam as StaffStatusFilter)
    ? (statusParam as StaffStatusFilter)
    : 'active';
  const levelParam = searchParams.get('level');
  const level = STAFF_LEVELS.includes(levelParam as StaffAccessLevel)
    ? (levelParam as StaffAccessLevel)
    : null;

  function setParam(key: string, value: string | null) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );
  }

  const listQuery = useQuery({
    queryKey: ['staff', status, level, search.query] as const,
    queryFn: ({ signal }) =>
      staffApi.list(
        { q: search.query || undefined, status, accessLevel: level ?? undefined },
        signal,
      ),
    placeholderData: (prev) => prev,
  });
  const rows = listQuery.data?.users ?? [];
  const counts = listQuery.data?.counts;

  const brandBySlug = useMemo(() => new Map(projects.map((p) => [p.companySlug, p])), [projects]);
  const navState = { from: `${location.pathname}${location.search}` };

  const newButton = (
    <Button size="sm" asChild>
      <Link to="/users/new">
        <Plus aria-hidden="true" />
        {t('users.new')}
      </Link>
    </Button>
  );

  const filtered = !!search.query || level !== null;

  return (
    <PageContainer width="full" className="gap-4">
      <PageHeading
        className="mb-1"
        title={t('users.title')}
        subtitle={t('users.subtitle')}
        actions={
          <>
            <RefreshButton
              fetching={listQuery.isFetching}
              onClick={() => void listQuery.refetch()}
            />
            {newButton}
          </>
        }
      />

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <SegmentedControl
          label={t('users.filterStatus')}
          value={status}
          onValueChange={(v) => setParam('status', v === 'active' ? null : v)}
          className="lg:w-auto"
          options={STATUS_FILTERS.map((value) => ({
            value,
            label: t(`users.status.${value}` as never),
            count:
              value === 'active'
                ? counts?.active
                : value === 'inactive'
                  ? counts?.inactive
                  : counts
                    ? counts.active + counts.inactive
                    : undefined,
          }))}
        />
        <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:justify-end">
          <Select<string>
            size="sm"
            className="sm:w-48"
            aria-label={t('users.filterLevel')}
            value={level ?? ALL_LEVELS}
            onValueChange={(v) => setParam('level', v === ALL_LEVELS ? null : v)}
            options={[
              { value: ALL_LEVELS, label: t('users.allLevels') },
              ...STAFF_LEVELS.map((l) => ({ value: l, label: accessLabel(t, l) })),
            ]}
          />
          <SearchInput
            value={search.input}
            onValueChange={search.setInput}
            searching={search.searching}
            placeholder={t('users.searchPlaceholder')}
            containerClassName="sm:max-w-xs"
          />
        </div>
      </div>

      {listQuery.isLoading ? (
        <div role="status" aria-label={t('common.loading')}>
          <ListSkeleton rows={5} avatar={false} />
        </div>
      ) : listQuery.error ? (
        <ErrorState
          error={listQuery.error}
          onRetry={() => void listQuery.refetch()}
          retrying={listQuery.isFetching}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="dashed"
          icon={<Users aria-hidden="true" />}
          message={filtered ? t('users.emptyFilter') : t('users.empty')}
          action={filtered ? undefined : newButton}
        />
      ) : (
        <div className="overflow-clip rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border md:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className="relative flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent/60"
              >
                <div className="flex items-center gap-2">
                  <Link
                    to={`/users/${row.id}`}
                    state={navState}
                    className={cn('min-w-0 truncate text-2sm font-medium', ROW_LINK)}
                  >
                    {row.name}
                  </Link>
                  {row.id === selfId ? <Badge variant="secondary">{t('users.you')}</Badge> : null}
                  <span className="ml-auto">
                    <LevelBadge level={row.accessLevel} />
                  </span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BrandMarks slugs={row.companySlugs} brandBySlug={brandBySlug} />
                  <span className="ml-auto tabular-nums">
                    <LastActive row={row} bcp47={bcp47} />
                  </span>
                </div>
              </li>
            ))}
          </ul>

          <Table containerClassName="hidden w-full md:block">
            <TableHeader>
              <TableRow>
                <TableHead>{t('users.col.name')}</TableHead>
                <TableHead>{t('users.col.level')}</TableHead>
                <TableHead>{t('users.col.brands')}</TableHead>
                <TableHead>{t('users.col.lastActive')}</TableHead>
                <TableHead>{t('users.col.status')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="relative">
                  <TableCell className="max-w-[24rem]">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/users/${row.id}`}
                        state={navState}
                        className={cn(
                          'min-w-0 truncate font-medium text-foreground underline-offset-2 hover:underline',
                          ROW_LINK,
                        )}
                      >
                        {row.name}
                      </Link>
                      {row.id === selfId ? (
                        <Badge variant="secondary">{t('users.you')}</Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                  </TableCell>
                  <TableCell>
                    <LevelBadge level={row.accessLevel} />
                  </TableCell>
                  <TableCell>
                    <BrandMarks slugs={row.companySlugs} brandBySlug={brandBySlug} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                    <LastActive row={row} bcp47={bcp47} />
                  </TableCell>
                  <TableCell>
                    <StatusBadge
                      label={row.isActive ? t('users.active') : t('users.inactive')}
                      tone={row.isActive ? 'success' : 'neutral'}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </PageContainer>
  );
}

export function LevelBadge({ level }: { level: string }) {
  const t = useT();
  return <StatusBadge label={accessLabel(t, level)} tone={accessTone(level)} />;
}

function BrandMarks({
  slugs,
  brandBySlug,
}: {
  slugs: string[];
  brandBySlug: Map<string, Project>;
}) {
  if (slugs.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {slugs.map((slug) => {
        const brand = brandBySlug.get(slug);
        return brand ? (
          <span key={slug} title={brand.name} className="inline-flex">
            <BrandMark brand={brand} size="xs" />
            <span className="sr-only">{brand.name}</span>
          </span>
        ) : (
          <span key={slug} className="text-xs text-muted-foreground">
            {slug}
          </span>
        );
      })}
    </span>
  );
}

function LastActive({ row, bcp47 }: { row: StaffListRow; bcp47: string }) {
  const t = useT();
  const at = row.lastActiveAt ?? row.lastSignInAt;
  return at ? <>{formatDateTime(at, bcp47)}</> : <>{t('users.neverSignedIn')}</>;
}
