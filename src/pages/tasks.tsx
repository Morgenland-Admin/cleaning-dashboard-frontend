import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, CircleSlash, ClipboardList, Plus, User as UserIcon } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { CountPill } from '@/components/count-pill';
import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { FormField } from '@/components/form-field';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { ListSkeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT, useLocale } from '@/i18n';
import {
  errMessage,
  tasksAdminApi,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';
import {
  AssigneeSelect,
  DropdownField,
  PriorityBadge,
  PrioritySelect,
  TaskStatusBadge,
} from '@/pages/task-detail';
import { taskKindLabel } from '@/pages/tasks-shared';

type T = ReturnType<typeof useT>;
type RowAction = 'ack' | 'done' | 'dismiss';

const STATUSES: Array<TaskStatus | 'all'> = ['open', 'in_progress', 'done', 'dismissed', 'all'];

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
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('tasks.title'));
  const { projects, activeProject, isAllBrands } = useProject();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow(60_000);

  const [status, setStatus] = useState<TaskStatus | 'all'>('open');
  const [mineOnly, setMineOnly] = useState(false);
  const [creating, setCreating] = useState(false);

  const brandSlug = isAllBrands ? undefined : activeProject.companySlug;

  const list = useQuery({
    queryKey: ['tasks', brandSlug ?? 'all', status, mineOnly],
    queryFn: ({ signal }) =>
      tasksAdminApi.list({ status, brand: brandSlug, mine: mineOnly, limit: 50 }, signal),
    refetchInterval: 30_000,
  });
  const items = useMemo(() => list.data?.items ?? [], [list.data]);

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

  // Server-side filtering: only the selected status has a real count; the others would read 0.
  const activeCount = list.data ? `${items.length}${list.data.nextCursor ? '+' : ''}` : null;

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
    onAck: () => ack.mutate(task.id),
    onDone: () => done.mutate(task.id),
    onDismiss: () => dismiss.mutate(task.id),
  });

  const newButton = (
    <Button
      size="sm"
      onClick={() => setCreating(true)}
      disabled={isAllBrands}
      title={isAllBrands ? t('tasks.newPickBrand') : undefined}
    >
      <Plus aria-hidden="true" />
      {t('tasks.new')}
    </Button>
  );

  return (
    <PageContainer width="full" className="gap-4">
      <PageHeading
        className="mb-1"
        title={t('tasks.title')}
        subtitle={isAllBrands ? t('tasks.subtitleAllBrands') : t('tasks.subtitleSingle')}
        actions={
          <>
            <RefreshButton fetching={list.isFetching} onClick={() => void list.refetch()} />
            {newButton}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SegmentedControl
          label={t('tasks.filterAria')}
          value={status}
          onValueChange={setStatus}
          overflow="scroll"
          className="sm:w-auto"
          options={STATUSES.map((s) => ({
            value: s,
            label: (
              <>
                {t(`tasks.status.${s}` as never)}
                {s === status && activeCount != null ? (
                  <CountPill tone="accent">{activeCount}</CountPill>
                ) : null}
              </>
            ),
          }))}
        />
        <FilterChip
          pressed={mineOnly}
          onPressedChange={setMineOnly}
          icon={<UserIcon aria-hidden="true" />}
        >
          {t('tasks.mineOnly')}
        </FilterChip>
      </div>

      {list.isLoading ? (
        <div role="status" aria-label={t('common.loading')}>
          <ListSkeleton rows={4} avatar={false} />
        </div>
      ) : list.error ? (
        <ErrorState
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : items.length === 0 ? (
        <EmptyState
          variant="dashed"
          icon={<ClipboardList aria-hidden="true" />}
          title={t('tasks.empty')}
          message={t('tasks.emptyHint')}
          action={newButton}
        />
      ) : (
        <div className="overflow-clip rounded-lg border border-border bg-card">
          <div className="lg:max-h-[calc(100svh-16rem)] lg:overflow-y-auto lg:overscroll-contain">
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
          </div>
        </div>
      )}

      {creating ? (
        <CreateTaskSheet
          open={creating}
          onOpenChange={setCreating}
          onCreated={(id) => {
            refresh();
            setCreating(false);
            navigate(`/tasks/${id}`, { state: { from: linkState.from } });
          }}
        />
      ) : null}
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
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
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

function RowActions({ task, pending, onAck, onDone, onDismiss }: TaskRowProps) {
  const t = useT();
  if (task.status !== 'open' && task.status !== 'in_progress') return null;
  const busy = pending !== null;
  return (
    <div
      role="group"
      aria-label={t('tasks.rowActions', { title: task.title })}
      className="flex items-center justify-end gap-0.5"
    >
      {task.status === 'open' ? (
        <IconAction
          label={t('tasks.actions.ack')}
          onClick={onAck}
          disabled={busy}
          loading={pending === 'ack'}
        >
          <UserIcon aria-hidden="true" />
        </IconAction>
      ) : null}
      <IconAction
        label={t('tasks.actions.done')}
        onClick={onDone}
        disabled={busy}
        loading={pending === 'done'}
        className="text-success hover:bg-success-soft hover:text-success"
      >
        <CheckCircle2 aria-hidden="true" />
      </IconAction>
      <IconAction
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
      <div className="shrink-0 pt-2">
        <RowActions {...props} />
      </div>
    </li>
  );
}

function CreateTaskSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: (id: number) => void;
}) {
  const t = useT();
  const uid = useId();
  const { activeProject } = useProject();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueLocal, setDueLocal] = useState<string>('');
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null);

  const members = useQuery({
    queryKey: ['task-members', activeProject.companySlug],
    queryFn: ({ signal }) => tasksAdminApi.members(activeProject.companySlug, signal),
  });

  const create = useMutation({
    mutationFn: () =>
      tasksAdminApi.create({
        companySlug: activeProject.companySlug,
        title: title.trim(),
        body: body.trim() || undefined,
        priority,
        dueAt: dueLocal ? new Date(dueLocal).toISOString() : undefined,
        assigneeUserId: assigneeUserId ?? undefined,
      }),
    onSuccess: (res) => {
      onCreated(res.task.id);
    },
  });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setTitle('');
          setBody('');
          setPriority('normal');
          setDueLocal('');
          setAssigneeUserId(null);
          create.reset();
        }
      }}
    >
      <SheetContent side="right" variant="content" className="flex flex-col gap-5 sm:max-w-md">
        {/* SheetTitle/Description stay sr-only and name the dialog; the visible copy is aria-hidden so it is not read twice. */}
        <SheetTitle>{t('tasks.newTitle')}</SheetTitle>
        <SheetDescription>{t('tasks.newSubtitle')}</SheetDescription>
        <div className="flex flex-col gap-2 pr-10">
          <div className="flex">
            <BrandChip brand={activeProject} />
          </div>
          <div aria-hidden="true" className="space-y-1">
            <p className="text-base font-semibold text-foreground">{t('tasks.newTitle')}</p>
            <p className="text-2sm text-muted-foreground">{t('tasks.newSubtitle')}</p>
          </div>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <FormField label={t('tasks.field.title')} required>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('tasks.titlePlaceholder')}
              maxLength={500}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </FormField>

          <FormField label={`${t('tasks.field.body')} ${t('common.optional')}`}>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={t('tasks.bodyPlaceholder')}
              maxLength={8000}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-3">
            <DropdownField id={`${uid}-priority`} label={t('tasks.field.priority')}>
              {(ids) => <PrioritySelect {...ids} value={priority} onChange={setPriority} />}
            </DropdownField>
            <FormField label={t('tasks.field.dueAt')}>
              <DateTimePicker value={dueLocal} onValueChange={setDueLocal} />
            </FormField>
          </div>

          <DropdownField id={`${uid}-assignee`} label={t('tasks.field.assignee')}>
            {(ids) => (
              <AssigneeSelect
                {...ids}
                value={assigneeUserId}
                onChange={setAssigneeUserId}
                members={members.data?.members ?? []}
                loading={members.isLoading}
              />
            )}
          </DropdownField>

          {create.error ? <Alert tone="destructive">{errMessage(create.error)}</Alert> : null}

          <div className="mt-auto flex gap-2 pt-2">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1">
                {t('common.cancel')}
              </Button>
            </SheetClose>
            <Button
              type="submit"
              className="flex-1"
              disabled={!title.trim()}
              loading={create.isPending}
            >
              <Plus aria-hidden="true" />
              {t('tasks.newCta')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
