import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  CheckCircle2,
  CircleSlash,
  ClipboardList,
  Plus,
  Search,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ListSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT, useLocale } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import { errMessage, tasksAdminApi, type Task } from '@/lib/api';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { useNow } from '@/lib/use-now';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';
import { PriorityBadge, TaskStatusBadge } from '@/pages/task-detail';
import { taskKindLabel } from '@/pages/tasks-shared';
import { useUrlSearch } from '@/pages/use-inbox-list';

type T = ReturnType<typeof useT>;
type RowAction = 'ack' | 'done' | 'dismiss';

const STATUSES = ['active', 'open', 'in_progress', 'done', 'dismissed', 'all'] as const;
type StatusFilter = (typeof STATUSES)[number];

const PAGE_SIZE = 50;

function isOverdue(dueAt: string | null, now: number): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < now;
}

export function TasksPage() {
  const [params] = useSearchParams();
  // Legacy ?id=<id> links from older notifications redirect to /tasks/<id>.
  const legacyId = params.get('id');
  if (legacyId && /^\d+$/.test(legacyId)) {
    return <Navigate to={`/tasks/${legacyId}`} replace />;
  }
  return <TasksList />;
}

function TasksList() {
  const canWrite = useCanWrite();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('tasks.title'));
  const { projects, activeProject, isAllBrands } = useProject();
  const qc = useQueryClient();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const now = useNow(60_000);

  const rawStatus = params.get('status');
  const status: StatusFilter = STATUSES.includes(rawStatus as StatusFilter)
    ? (rawStatus as StatusFilter)
    : 'active';
  const mineOnly = params.get('mine') === '1';
  function setParam(key: string, value: string | null) {
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: true },
    );
  }

  const { search, setSearch, q, searching } = useUrlSearch();
  const brandSlug = isAllBrands ? undefined : activeProject.companySlug;
  const listScrollRef = useRef<HTMLDivElement>(null);
  const isDesktop = useIsDesktop();

  const list = useInfiniteQuery({
    queryKey: ['tasks', brandSlug ?? 'all', status, mineOnly, q] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      tasksAdminApi.list(
        {
          status,
          brand: brandSlug,
          mine: mineOnly,
          q: q || undefined,
          limit: PAGE_SIZE,
          cursor: pageParam,
        },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const counts = useQuery({
    queryKey: ['tasks-counts', brandSlug ?? 'all', mineOnly, q] as const,
    queryFn: ({ signal }) =>
      tasksAdminApi.counts({ brand: brandSlug, mine: mineOnly, q: q || undefined }, signal),
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
  function countFor(s: StatusFilter): number | undefined {
    const by = counts.data?.byStatus;
    if (!by) return undefined;
    if (s === 'all') return Object.values(by).reduce((a, b) => a + b, 0);
    if (s === 'active') return (by.open ?? 0) + (by.in_progress ?? 0);
    return by[s] ?? 0;
  }

  useEffect(() => {
    listScrollRef.current?.scrollTo({ top: 0 });
  }, [status, mineOnly, brandSlug, q]);

  // The list carries assignee ids only; names come from each brand's member list.
  const slugsInView = useMemo(
    () => [...new Set(items.filter((i) => i.assigneeUserId).map((i) => i.companySlug))],
    [items],
  );
  const memberQueries = useQueries({
    queries: slugsInView.map((slug) => ({
      queryKey: ['task-members', slug],
      queryFn: ({ signal }: { signal?: AbortSignal }) => tasksAdminApi.members(slug, signal),
      staleTime: 5 * 60_000,
      retry: false,
    })),
  });
  const memberNames = useMemo(() => {
    const out = new Map<string, string>();
    for (const q of memberQueries) {
      for (const m of q.data?.members ?? []) out.set(m.id, m.name || m.email);
    }
    return out;
  }, [memberQueries]);
  const membersLoading = memberQueries.some((q) => q.isLoading);

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['tasks-counts'] });
    void qc.invalidateQueries({ queryKey: ['task-detail'] });
    void qc.invalidateQueries({ queryKey: ['notifications-unread'] });
  }

  const onRowError = (err: unknown) => toast.error(errMessage(err), t('common.error'));
  const ack = useMutation({
    mutationFn: (id: number) => tasksAdminApi.ack(id),
    onSuccess: refresh,
    onError: onRowError,
  });
  const done = useMutation({
    mutationFn: (id: number) => tasksAdminApi.done(id),
    onSuccess: refresh,
    onError: onRowError,
  });
  const dismiss = useMutation({
    mutationFn: (id: number) => tasksAdminApi.dismiss(id),
    onSuccess: refresh,
    onError: onRowError,
  });

  function pendingFor(id: number): RowAction | null {
    if (ack.isPending && ack.variables === id) return 'ack';
    if (done.isPending && done.variables === id) return 'done';
    if (dismiss.isPending && dismiss.variables === id) return 'dismiss';
    return null;
  }

  const brandsBySlug = useMemo(() => new Map(projects.map((p) => [p.companySlug, p])), [projects]);

  const linkState = {
    from: `${location.pathname}${location.search}`,
    ids: items.map((i) => i.id),
  };

  const rowProps = (task: Task): TaskRowProps => ({
    task,
    brand: brandsBySlug.get(task.companySlug),
    assigneeName: task.assigneeUserId ? (memberNames.get(task.assigneeUserId) ?? null) : null,
    membersLoading,
    showBrand: isAllBrands,
    bcp47,
    now,
    linkState,
    pending: pendingFor(task.id),
    canWrite,
    onAck: () => ack.mutate(task.id),
    onDone: () => done.mutate(task.id),
    onDismiss: () => dismiss.mutate(task.id),
  });

  const newButton = !canWrite ? null : isAllBrands ? (
    <Button size="sm" disabled title={t('tasks.newPickBrand')}>
      <Plus aria-hidden="true" />
      {t('tasks.new')}
    </Button>
  ) : (
    <Button size="sm" asChild>
      <Link to="/tasks/neu" state={{ from: linkState.from }}>
        <Plus aria-hidden="true" />
        {t('tasks.new')}
      </Link>
    </Button>
  );

  const nextPageFailed = list.isFetchNextPageError;
  const sentinel = (
    <InfiniteScrollSentinel
      hasMore={!!list.hasNextPage}
      isLoading={list.isFetchingNextPage}
      onIntersect={() => {
        if (!list.isFetchingNextPage) void list.fetchNextPage();
      }}
      // Root only when the box scrolls (lg+); otherwise the sentinel stays inside it and loads every page.
      rootRef={isDesktop ? listScrollRef : undefined}
    />
  );

  return (
    <PageContainer width="full" className="gap-4">
      <PageHeading
        className="mb-1"
        title={t('tasks.title')}
        subtitle={isAllBrands ? t('tasks.subtitleAllBrands') : t('tasks.subtitleSingle')}
        actions={
          <>
            <RefreshButton fetching={list.isFetching} onClick={refresh} />
            {newButton}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label={t('tasks.filterAria')}
          value={status}
          onValueChange={(next) => setParam('status', next === 'active' ? null : next)}
          overflow="scroll"
          className="min-w-0 sm:w-auto"
          options={STATUSES.map((s) => ({
            value: s,
            label: t(`tasks.status.${s}`),
            count: countFor(s),
          }))}
        />
        <FilterChip
          pressed={mineOnly}
          onPressedChange={(next) => setParam('mine', next ? '1' : null)}
          icon={<UserIcon aria-hidden="true" />}
        >
          {t('tasks.mineOnly')}
        </FilterChip>
        <SearchInput
          value={search}
          onValueChange={setSearch}
          searching={searching}
          placeholder={t('tasks.searchPlaceholder')}
          containerClassName="sm:ml-auto sm:w-72"
        />
      </div>

      {list.isLoading ? (
        <div role="status" aria-label={t('common.loading')}>
          <ListSkeleton rows={4} avatar={false} />
        </div>
      ) : list.error && items.length === 0 ? (
        <ErrorState
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : items.length === 0 ? (
        q ? (
          <EmptyState
            variant="dashed"
            icon={<Search aria-hidden="true" />}
            title={t('inbox.searchEmpty')}
            message={t('inbox.searchEmptyHint', { query: q })}
            action={
              <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                <X aria-hidden="true" />
                {t('common.clearSearch')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            variant="dashed"
            icon={<ClipboardList aria-hidden="true" />}
            title={t('tasks.empty')}
            message={t('tasks.emptyHint')}
            action={newButton}
          />
        )
      ) : (
        <>
          <div
            className={cn(
              'overflow-clip rounded-lg border border-border bg-card transition-opacity',
              list.isPlaceholderData && 'opacity-60',
            )}
            aria-busy={list.isPlaceholderData || undefined}
          >
            <div
              ref={listScrollRef}
              className="relative lg:max-h-[calc(100svh-16rem)] lg:overflow-y-auto lg:overscroll-contain"
            >
              <ul className="divide-y divide-border md:hidden">
                {items.map((task) => (
                  <TaskListItem key={task.id} {...rowProps(task)} />
                ))}
              </ul>
              <Table containerClassName="hidden w-full md:block">
                <TableHeader sticky>
                  <TableRow>
                    <TableHead>{t('tasks.field.priority')}</TableHead>
                    <TableHead>{t('tasks.field.title')}</TableHead>
                    <TableHead>{t('tasks.detailFacts.source')}</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      {t('tasks.field.assignee')}
                    </TableHead>
                    <TableHead>{t('tasks.field.dueAt')}</TableHead>
                    <TableHead>{t('tasks.statusLabel')}</TableHead>
                    <TableHead className="w-0">
                      <span className="sr-only">{t('tasks.actionsLabel')}</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((task) => (
                    <TaskTableRow key={task.id} {...rowProps(task)} />
                  ))}
                </TableBody>
              </Table>
              {isDesktop ? sentinel : null}
            </div>
          </div>
          {isDesktop ? null : sentinel}
          {nextPageFailed && list.error ? (
            <ErrorState
              error={list.error}
              onRetry={() => void list.fetchNextPage()}
              retrying={list.isFetchingNextPage}
            />
          ) : null}
        </>
      )}
    </PageContainer>
  );
}

interface TaskRowProps {
  task: Task;
  brand: Project | undefined;
  assigneeName: string | null;
  membersLoading: boolean;
  showBrand: boolean;
  bcp47: string;
  now: number;
  linkState: { from: string; ids: number[] };
  pending: RowAction | null;
  canWrite: boolean;
  onAck: () => void;
  onDone: () => void;
  onDismiss: () => void;
}

function IconAction({
  label,
  onClick,
  disabled,
  loading,
  className,
  size = 'icon-sm',
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  size?: 'icon' | 'icon-sm';
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size={size}
          onClick={onClick}
          disabled={disabled}
          loading={loading}
          aria-label={label}
          className={className}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function RowActions({
  task,
  pending,
  onAck,
  onDone,
  onDismiss,
  size,
  canWrite,
}: TaskRowProps & { size?: 'icon' | 'icon-sm' }) {
  const t = useT();
  if (!canWrite || (task.status !== 'open' && task.status !== 'in_progress')) return null;
  const busy = pending !== null;
  return (
    <div
      role="group"
      aria-label={t('tasks.rowActions', { title: task.title })}
      className="flex items-center justify-end gap-0.5"
    >
      {task.status === 'open' ? (
        <IconAction
          size={size}
          label={t('tasks.actions.ack')}
          onClick={onAck}
          disabled={busy}
          loading={pending === 'ack'}
        >
          <UserIcon aria-hidden="true" />
        </IconAction>
      ) : null}
      <IconAction
        size={size}
        label={t('tasks.actions.done')}
        onClick={onDone}
        disabled={busy}
        loading={pending === 'done'}
        className="text-success hover:bg-success-soft hover:text-success"
      >
        <CheckCircle2 aria-hidden="true" />
      </IconAction>
      <IconAction
        size={size}
        label={t('tasks.actions.dismiss')}
        onClick={onDismiss}
        disabled={busy}
        loading={pending === 'dismiss'}
        className="text-muted-foreground hover:text-destructive"
      >
        <CircleSlash aria-hidden="true" />
      </IconAction>
    </div>
  );
}

function SourceCell({ task, brand, showBrand, t }: TaskRowProps & { t: T }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      {showBrand || !brand ? (
        brand ? (
          <BrandChip brand={brand} />
        ) : (
          <span className="text-2xs text-muted-foreground">{task.companySlug}</span>
        )
      ) : null}
      <span className="truncate text-muted-foreground">{taskKindLabel(t, task.kind)}</span>
    </span>
  );
}

function DueDate({ task, now, bcp47, t }: { task: Task; now: number; bcp47: string; t: T }) {
  if (!task.dueAt) return <span className="text-muted-foreground">—</span>;
  const overdue = isOverdue(task.dueAt, now);
  return (
    <span
      className={cn('whitespace-nowrap tabular-nums', overdue ? 'text-destructive' : undefined)}
      title={overdue ? t('tasks.overdue') : undefined}
    >
      {formatDateTime(task.dueAt, bcp47, { dateStyle: 'medium', timeStyle: 'short' })}
    </span>
  );
}

function TaskTableRow(props: TaskRowProps) {
  const t = useT();
  const { task, assigneeName, membersLoading, linkState, now, bcp47 } = props;
  const overdue = isOverdue(task.dueAt, now);
  return (
    // Title link is stretched over the row; the action cell sits above it so its buttons stay clickable.
    <TableRow className="relative">
      <TableCell>
        <PriorityBadge priority={task.priority} overdue={overdue} />
      </TableCell>
      <TableCell className="w-full max-w-0">
        <Link
          to={`/tasks/${task.id}`}
          state={linkState}
          className="block truncate font-medium text-foreground after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
        >
          {task.title}
        </Link>
      </TableCell>
      <TableCell className="max-w-[16rem]">
        <SourceCell {...props} t={t} />
      </TableCell>
      <TableCell className="hidden max-w-[12rem] lg:table-cell">
        <span className="block truncate">
          {assigneeName ?? (
            <span className="text-muted-foreground">
              {task.assigneeUserId ? (membersLoading ? '…' : '—') : t('tasks.unassigned')}
            </span>
          )}
        </span>
      </TableCell>
      <TableCell>
        <DueDate task={task} now={now} bcp47={bcp47} t={t} />
      </TableCell>
      <TableCell>
        <TaskStatusBadge status={task.status} />
      </TableCell>
      <TableCell className="relative z-[1] py-1.5">
        <RowActions {...props} />
      </TableCell>
    </TableRow>
  );
}

function TaskListItem(props: TaskRowProps) {
  const t = useT();
  const { task, assigneeName, linkState, now, bcp47 } = props;
  const overdue = isOverdue(task.dueAt, now);
  return (
    <li className="flex items-start gap-2 pr-2">
      <Link
        to={`/tasks/${task.id}`}
        state={linkState}
        className="flex min-w-0 flex-1 flex-col gap-1 px-4 py-3 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-2">
          <PriorityBadge priority={task.priority} overdue={overdue} />
          <span className="truncate text-2sm font-medium text-foreground">{task.title}</span>
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <SourceCell {...props} t={t} />
          {task.status !== 'open' ? <TaskStatusBadge status={task.status} /> : null}
          {assigneeName ? <span className="text-muted-foreground">· {assigneeName}</span> : null}
          {task.dueAt ? (
            <span className="text-muted-foreground">
              · <DueDate task={task} now={now} bcp47={bcp47} t={t} />
            </span>
          ) : null}
        </span>
      </Link>
      <div className="shrink-0 pt-1.5">
        <RowActions {...props} size="icon" />
      </div>
    </li>
  );
}
