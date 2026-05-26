import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  ClipboardList,
  Edit3,
  Hammer,
  Loader2,
  Mail,
  Plus,
  RefreshCcw,
  Send,
  Tag,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type Project } from '@/contexts/project-context';
import { useT, useLocale } from '@/i18n';
import {
  type ApiError,
  tasksAdminApi,
  type Task,
  type TaskComment,
  type TaskMember,
  type TaskPriority,
  type TaskStatus,
  type TaskUserLite,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

const STATUSES: Array<TaskStatus | 'all'> = ['open', 'in_progress', 'done', 'dismissed', 'all'];
const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

const KIND_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  contact_review: Mail,
  inquiry_review: Send,
  ad_hoc: ClipboardList,
  order_dispute: AlertCircle,
  bad_review_followup: AlertCircle,
  partner_application: Hammer,
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  low: 'bg-muted/60 text-muted-foreground border-border',
  normal: 'bg-muted/40 text-foreground border-border',
  high: 'bg-rust-soft/60 text-rust border-rust/30',
  urgent: 'bg-destructive/10 text-destructive border-destructive/40',
};

function isOverdue(dueAt: string | null): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < Date.now();
}

function useRelative() {
  const t = useT();
  const { bcp47 } = useLocale();
  return (iso: string) =>
    buildRelative(iso, bcp47, {
      now: t('tasks.timeNow'),
      ago: (v) => t('tasks.timeAgo', { value: v }),
      ina: (v) => t('tasks.timeIn', { value: v }),
    });
}

function buildRelative(
  iso: string,
  locale: string,
  copy: { now: string; ago: (v: string) => string; ina: (v: string) => string },
): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const past = diff >= 0;
  const abs = Math.abs(diff);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (abs < min) return copy.now;
  let value: string;
  if (abs < hr) value = `${Math.floor(abs / min)} min`;
  else if (abs < day) value = `${Math.floor(abs / hr)} h`;
  else if (abs < 7 * day) value = `${Math.floor(abs / day)} d`;
  else
    value = new Date(iso).toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
    });
  return past ? copy.ago(value) : copy.ina(value);
}

export function TasksPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('tasks.title'));
  const { projects, activeProject, isAllBrands } = useProject();
  const qc = useQueryClient();

  const [status, setStatus] = useState<TaskStatus | 'all'>('open');
  const [mineOnly, setMineOnly] = useState(false);
  const [openTaskId, setOpenTaskId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const rel = useRelative();

  const [search, setSearch] = useSearchParams();
  useEffect(() => {
    const id = search.get('id');
    if (id && /^\d+$/.test(id)) setOpenTaskId(Number(id));
  }, [search]);

  const brandSlug = isAllBrands ? undefined : activeProject.companySlug;

  const list = useQuery({
    queryKey: ['tasks', brandSlug ?? 'all', status, mineOnly],
    queryFn: ({ signal }) =>
      tasksAdminApi.list({ status, brand: brandSlug, mine: mineOnly, limit: 50 }, signal),
    refetchInterval: 30_000,
  });

  function refresh() {
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['task-detail'] });
    void qc.invalidateQueries({ queryKey: ['notifications-unread'] });
  }

  const ack = useMutation({
    mutationFn: (id: number) => tasksAdminApi.ack(id),
    onSuccess: refresh,
  });
  const done = useMutation({
    mutationFn: (id: number) => tasksAdminApi.done(id),
    onSuccess: refresh,
  });
  const dismiss = useMutation({
    mutationFn: (id: number) => tasksAdminApi.dismiss(id),
    onSuccess: refresh,
  });

  const brandsBySlug = useMemo(() => new Map(projects.map((p) => [p.companySlug, p])), [projects]);

  function openTask(id: number) {
    setOpenTaskId(id);
    const next = new URLSearchParams(search);
    next.set('id', String(id));
    setSearch(next, { replace: true });
  }

  function closeTask() {
    setOpenTaskId(null);
    const next = new URLSearchParams(search);
    next.delete('id');
    setSearch(next, { replace: true });
  }

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of STATUSES) out[s] = 0;
    for (const it of list.data?.items ?? []) out[it.status] = (out[it.status] ?? 0) + 1;
    out.all = list.data?.items.length ?? 0;
    return out;
  }, [list.data]);

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeading
        title={t('tasks.title')}
        subtitle={isAllBrands ? t('tasks.subtitleAllBrands') : t('tasks.subtitleSingle')}
        actions={
          <div className="flex gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => list.refetch()}
              disabled={list.isFetching}
            >
              {list.isFetching ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <RefreshCcw className="size-3.5" />
              )}
              {t('common.refresh')}
            </Button>
            <Button
              size="sm"
              onClick={() => setCreating(true)}
              disabled={isAllBrands}
              title={isAllBrands ? t('tasks.newPickBrand') : undefined}
            >
              <Plus className="size-3.5" />
              {t('tasks.new')}
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <div
          role="tablist"
          aria-label={t('tasks.filterAria')}
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-1"
        >
          {STATUSES.map((s) => {
            const active = status === s;
            return (
              <button
                key={s}
                role="tab"
                type="button"
                aria-selected={active}
                onClick={() => setStatus(s)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40',
                  active
                    ? 'bg-rust text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                )}
              >
                {t(`tasks.status.${s}` as never)}
                <span
                  className={cn(
                    'rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums',
                    active ? 'bg-primary-foreground/15' : 'bg-muted/80 text-muted-foreground',
                  )}
                >
                  {counts[s] ?? 0}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          aria-pressed={mineOnly}
          onClick={() => setMineOnly((v) => !v)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40',
            mineOnly
              ? 'border-rust/60 bg-rust-soft/40 text-rust'
              : 'border-border bg-card text-muted-foreground hover:text-foreground',
          )}
        >
          <UserIcon className="size-3" aria-hidden="true" />
          {t('tasks.mineOnly')}
        </button>
      </div>

      {list.isLoading ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {t('common.loading')}
        </div>
      ) : list.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{(list.error as ApiError).message}</span>
        </div>
      ) : !list.data || list.data.items.length === 0 ? (
        <EmptyState onCreate={() => setCreating(true)} disabled={isAllBrands} />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.data.items.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              brand={brandsBySlug.get(task.companySlug)}
              bcp47={bcp47}
              rel={rel}
              onOpen={() => openTask(task.id)}
              onAck={() => ack.mutate(task.id)}
              onDone={() => done.mutate(task.id)}
              onDismiss={() => dismiss.mutate(task.id)}
              busy={ack.isPending || done.isPending || dismiss.isPending}
            />
          ))}
        </ul>
      )}

      {openTaskId != null ? (
        <TaskDetailSheet
          taskId={openTaskId}
          open
          onOpenChange={(o) => (o ? null : closeTask())}
          onChanged={refresh}
        />
      ) : null}

      {creating ? (
        <CreateTaskSheet
          open={creating}
          onOpenChange={setCreating}
          onCreated={(id) => {
            refresh();
            setCreating(false);
            openTask(id);
          }}
        />
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  brand,
  bcp47,
  rel,
  onOpen,
  onAck,
  onDone,
  onDismiss,
  busy,
}: {
  task: Task;
  brand: Project | undefined;
  bcp47: string;
  rel: (iso: string) => string;
  onOpen: () => void;
  onAck: () => void;
  onDone: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const t = useT();
  const Icon = KIND_ICON[task.kind] ?? ClipboardList;
  const open = task.status === 'open' || task.status === 'in_progress';
  const overdue = isOverdue(task.dueAt);
  const effectivePriority: TaskPriority = overdue ? 'urgent' : task.priority;

  return (
    <li
      className={cn(
        'group flex items-stretch gap-3 overflow-hidden rounded-xl border border-border bg-card transition-colors hover:bg-muted/30',
        task.status === 'done' && 'opacity-60',
        task.status === 'dismissed' && 'opacity-50',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'w-0.5',
          task.status === 'open' && (overdue ? 'bg-destructive' : 'bg-rust'),
          task.status === 'in_progress' && 'bg-rust',
          task.status === 'done' && 'bg-emerald-500',
          task.status === 'dismissed' && 'bg-muted',
        )}
      />

      <button
        type="button"
        onClick={onOpen}
        className="flex flex-1 items-start gap-3 px-3 py-3 text-left focus-visible:bg-muted/30 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-rust-soft/60 text-rust ring-1 ring-rust/15"
        >
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            {brand ? <BrandMark brand={brand} size="xs" /> : null}
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {brand?.shortName ?? task.companySlug}
            </span>
            <span
              className={cn(
                'inline-flex h-4 items-center rounded-full border px-1.5 text-[9px] uppercase tracking-wider',
                PRIORITY_TONE[effectivePriority],
              )}
            >
              {overdue ? t('tasks.overdue') : task.priority}
            </span>
            {task.status !== 'open' ? (
              <span className="inline-flex h-4 items-center rounded-full border border-border px-1.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                {t(`tasks.status.${task.status}` as never)}
              </span>
            ) : null}
            <time
              dateTime={task.createdAt}
              className="ml-auto text-[10px] tabular-nums text-muted-foreground"
              title={formatDateTime(task.createdAt, bcp47)}
            >
              {rel(task.createdAt)}
            </time>
          </div>
          <p className="mt-1 truncate text-sm font-medium text-foreground">{task.title}</p>
          {task.body ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{task.body}</p>
          ) : null}
          {task.dueAt ? (
            <p
              className={cn(
                'mt-1 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider',
                overdue ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              <AlarmClock className="size-3" />
              {t('tasks.dueAtLabel')}: {formatDateTime(task.dueAt, bcp47)}
            </p>
          ) : null}
        </div>
      </button>

      {open ? (
        <div className="flex shrink-0 items-center gap-1 border-l border-border/70 px-2">
          {task.status === 'open' ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onAck}
              disabled={busy}
              className="h-7 px-2 text-xs"
              title={t('tasks.actions.ack')}
            >
              <UserIcon className="size-3" />
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={onDone}
            disabled={busy}
            className="h-7 px-2 text-xs text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300"
            title={t('tasks.actions.done')}
          >
            <CheckCircle2 className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
            disabled={busy}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive"
            title={t('tasks.actions.dismiss')}
          >
            <CircleSlash className="size-3.5" />
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function TaskDetailSheet({
  taskId,
  open,
  onOpenChange,
  onChanged,
}: {
  taskId: number;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const { projects } = useProject();
  const qc = useQueryClient();
  const rel = useRelative();

  const detail = useQuery({
    queryKey: ['task-detail', taskId],
    queryFn: ({ signal }) => tasksAdminApi.detail(taskId, signal),
  });
  const comments = useQuery({
    queryKey: ['task-comments', taskId],
    queryFn: ({ signal }) => tasksAdminApi.comments(taskId, signal),
  });

  const task = detail.data?.task;
  const brand = task ? projects.find((p) => p.companySlug === task.companySlug) : null;

  const [editing, setEditing] = useState(false);

  const ack = useMutation({
    mutationFn: () => tasksAdminApi.ack(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task-detail', taskId] });
      onChanged();
    },
  });
  const done = useMutation({
    mutationFn: () => tasksAdminApi.done(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task-detail', taskId] });
      onChanged();
    },
  });
  const dismiss = useMutation({
    mutationFn: () => tasksAdminApi.dismiss(taskId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['task-detail', taskId] });
      onChanged();
    },
  });

  function refreshAll() {
    void qc.invalidateQueries({ queryKey: ['task-detail', taskId] });
    void qc.invalidateQueries({ queryKey: ['task-comments', taskId] });
    onChanged();
  }

  if (!task) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="flex w-full flex-col gap-4 sm:max-w-xl">
          {detail.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('common.loading')}
            </div>
          ) : detail.error ? (
            <div className="text-sm text-destructive">{(detail.error as ApiError).message}</div>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  const overdue = isOverdue(task.dueAt);
  const isOpenStatus = task.status === 'open' || task.status === 'in_progress';
  const Icon = KIND_ICON[task.kind] ?? ClipboardList;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <div className="flex flex-col gap-3 border-b border-border bg-card p-5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {brand ? <BrandMark brand={brand} size="xs" /> : null}
            <span>{brand?.shortName ?? task.companySlug}</span>
            <span aria-hidden="true">·</span>
            <span>{t(`tasks.kindLabel.${task.kind}` as never) || task.kind}</span>
            <span className="ml-auto inline-flex h-4 items-center rounded-full border border-border bg-background px-1.5 text-[9px] uppercase tracking-wider">
              {t(`tasks.status.${task.status}` as never)}
            </span>
          </div>

          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-rust-soft/60 text-rust ring-1 ring-rust/15"
            >
              <Icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <SheetTitle className="font-serif text-xl leading-tight tracking-tight">
                {task.title}
              </SheetTitle>
              <SheetDescription className="text-[11px]">
                {t('tasks.createdAt', { time: formatDateTime(task.createdAt, bcp47) })}
              </SheetDescription>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] uppercase tracking-wider',
                PRIORITY_TONE[overdue ? 'urgent' : task.priority],
              )}
            >
              <Tag className="size-2.5" />
              {overdue ? t('tasks.overdue') : task.priority}
            </span>
            {task.dueAt ? (
              <span
                className={cn(
                  'inline-flex h-5 items-center gap-1 rounded-full border px-2 text-[10px] uppercase tracking-wider',
                  overdue
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : 'border-border bg-background text-muted-foreground',
                )}
              >
                <AlarmClock className="size-2.5" />
                {formatDateTime(task.dueAt, bcp47)}
              </span>
            ) : null}
            <AssigneePill assignee={detail.data?.assignee ?? null} t={t} />
            {task.refKind && task.refId ? (
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="ml-auto h-6 px-2 text-[10px] uppercase tracking-wider"
              >
                <Link
                  to={
                    task.refKind === 'contact_message'
                      ? `/contacts?id=${task.refId}`
                      : task.refKind === 'service_inquiry'
                        ? `/inquiries?id=${task.refId}`
                        : '/'
                  }
                  onClick={() => onOpenChange(false)}
                >
                  {t('tasks.openSource')}
                  <ArrowRight className="size-3" />
                </Link>
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-background p-5">
          {editing ? (
            <TaskEditForm
              task={task}
              brand={brand ?? null}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                refreshAll();
              }}
            />
          ) : (
            <section>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  {t('tasks.body')}
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="h-6 px-2 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  <Edit3 className="size-3" />
                  {t('common.edit')}
                </Button>
              </div>
              {task.body ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {task.body}
                </p>
              ) : (
                <p className="text-sm italic text-muted-foreground">{t('tasks.noBody')}</p>
              )}
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t('tasks.comments')}
              <span className="ml-1.5 font-mono tabular-nums text-foreground/70">
                {comments.data?.comments.length ?? 0}
              </span>
            </h3>
            {comments.isLoading ? (
              <div className="text-xs text-muted-foreground">{t('common.loading')}</div>
            ) : !comments.data || comments.data.comments.length === 0 ? (
              <p className="text-xs italic text-muted-foreground">{t('tasks.noComments')}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {comments.data.comments.map((c) => (
                  <CommentBubble key={c.id} comment={c} bcp47={bcp47} rel={rel} />
                ))}
              </ul>
            )}
            <CommentComposer
              taskId={taskId}
              onPosted={() => void qc.invalidateQueries({ queryKey: ['task-comments', taskId] })}
            />
          </section>

          {task.resolvedAt ? (
            <section className="rounded-md border border-border/60 bg-muted/30 p-3 text-[11px] text-muted-foreground">
              <p>
                <strong className="text-foreground">
                  {t(`tasks.status.${task.status}` as never)}
                </strong>{' '}
                · {formatDateTime(task.resolvedAt, bcp47)}
                {detail.data?.resolvedBy ? (
                  <> · {detail.data.resolvedBy.name ?? detail.data.resolvedBy.email}</>
                ) : null}
              </p>
            </section>
          ) : null}
        </div>

        {isOpenStatus ? (
          <div className="flex gap-2 border-t border-border bg-card p-3">
            {task.status === 'open' ? (
              <Button
                variant="outline"
                className="flex-1"
                size="sm"
                onClick={() => ack.mutate()}
                disabled={ack.isPending}
              >
                {ack.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <UserIcon className="size-3.5" />
                )}
                {t('tasks.actions.ack')}
              </Button>
            ) : null}
            <Button
              className="flex-1"
              size="sm"
              onClick={() => done.mutate()}
              disabled={done.isPending}
            >
              {done.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="size-3.5" />
              )}
              {t('tasks.actions.done')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => dismiss.mutate()}
              disabled={dismiss.isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              {dismiss.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Trash2 className="size-3.5" />
              )}
              {t('tasks.actions.dismiss')}
            </Button>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function AssigneePill({
  assignee,
  t,
}: {
  assignee: TaskUserLite | null;
  t: ReturnType<typeof useT>;
}) {
  if (!assignee) {
    return (
      <span className="inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-border bg-background px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <UserIcon className="size-2.5" />
        {t('tasks.unassigned')}
      </span>
    );
  }
  return (
    <span className="inline-flex h-5 items-center gap-1 rounded-full border border-border bg-background px-2 text-[10px] uppercase tracking-wider text-foreground">
      <UserIcon className="size-2.5" />
      {assignee.name ?? assignee.email}
    </span>
  );
}

function CommentBubble({
  comment,
  bcp47,
  rel,
}: {
  comment: TaskComment;
  bcp47: string;
  rel: (iso: string) => string;
}) {
  return (
    <li className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          {comment.authorName ?? comment.authorEmail ?? '—'}
        </span>
        <time
          dateTime={comment.createdAt}
          className="text-[10px] tabular-nums text-muted-foreground"
          title={formatDateTime(comment.createdAt, bcp47)}
        >
          {rel(comment.createdAt)}
        </time>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/90">{comment.body}</p>
    </li>
  );
}

function CommentComposer({ taskId, onPosted }: { taskId: number; onPosted: () => void }) {
  const t = useT();
  const [body, setBody] = useState('');
  const post = useMutation({
    mutationFn: () => tasksAdminApi.postComment(taskId, body.trim()),
    onSuccess: () => {
      setBody('');
      onPosted();
    },
  });
  return (
    <div className="mt-1 flex flex-col gap-2">
      <Textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('tasks.commentPlaceholder')}
        className="text-sm"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && body.trim()) {
            e.preventDefault();
            post.mutate();
          }
        }}
      />
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">⌘ + ↵</span>
        <Button size="sm" disabled={!body.trim() || post.isPending} onClick={() => post.mutate()}>
          {post.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5" />
          )}
          {t('tasks.postComment')}
        </Button>
      </div>
      {post.error ? (
        <p className="text-xs text-destructive">{(post.error as ApiError).message}</p>
      ) : null}
    </div>
  );
}

function TaskEditForm({
  task,
  brand,
  onCancel,
  onSaved,
}: {
  task: Task;
  brand: Project | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueLocal, setDueLocal] = useState<string>(
    task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : '',
  );
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(task.assigneeUserId);

  const members = useQuery({
    queryKey: ['task-members', task.companySlug],
    queryFn: ({ signal }) => tasksAdminApi.members(task.companySlug, signal),
    enabled: Boolean(brand),
  });

  const save = useMutation({
    mutationFn: () =>
      tasksAdminApi.patch(task.id, {
        title,
        body: body.trim() ? body : null,
        priority,
        dueAt: dueLocal ? new Date(dueLocal).toISOString() : null,
        assigneeUserId,
      }),
    onSuccess: onSaved,
  });

  return (
    <form
      className="flex flex-col gap-3 rounded-lg border border-rust/30 bg-rust-soft/20 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t('tasks.field.title')}
        </label>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={500} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t('tasks.field.body')}
        </label>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={8000}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t('tasks.field.priority')}
          </label>
          <PrioritySelect value={priority} onChange={setPriority} t={t} />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            {t('tasks.field.dueAt')}
          </label>
          <Input
            type="datetime-local"
            value={dueLocal}
            onChange={(e) => setDueLocal(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {t('tasks.field.assignee')}
        </label>
        <AssigneeSelect
          value={assigneeUserId}
          onChange={setAssigneeUserId}
          members={members.data?.members ?? []}
          loading={members.isLoading}
          t={t}
        />
      </div>

      {save.error ? (
        <p className="text-xs text-destructive">{(save.error as ApiError).message}</p>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="ghost" className="flex-1" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" className="flex-1" disabled={save.isPending}>
          {save.isPending ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

function PrioritySelect({
  value,
  onChange,
}: {
  value: TaskPriority;
  onChange: (v: TaskPriority) => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40"
        >
          <span
            className={cn(
              'inline-flex h-4 items-center rounded-full border px-1.5 text-[9px] uppercase tracking-wider',
              PRIORITY_TONE[value],
            )}
          >
            {value}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        {PRIORITIES.map((p) => (
          <DropdownMenuItem
            key={p}
            onSelect={() => onChange(p)}
            className="flex items-center justify-between gap-2"
          >
            <span
              className={cn(
                'inline-flex h-4 items-center rounded-full border px-1.5 text-[9px] uppercase tracking-wider',
                PRIORITY_TONE[p],
              )}
            >
              {p}
            </span>
            {p === value ? <Check className="size-3.5 text-rust" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AssigneeSelect({
  value,
  onChange,
  members,
  loading,
  t,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  members: TaskMember[];
  loading: boolean;
  t: ReturnType<typeof useT>;
}) {
  const selected = value ? members.find((m) => m.id === value) : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex w-full items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40"
        >
          <span className="truncate">
            {loading
              ? t('common.loading')
              : selected
                ? selected.name || selected.email
                : t('tasks.unassigned')}
          </span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuItem onSelect={() => onChange(null)} className="text-muted-foreground">
          <X className="mr-1.5 size-3.5" />
          {t('tasks.unassigned')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {members.map((m) => (
          <DropdownMenuItem
            key={m.id}
            onSelect={() => onChange(m.id)}
            className="flex items-center justify-between gap-2"
          >
            <div className="min-w-0">
              <p className="truncate text-sm">{m.name || m.email}</p>
              <p className="truncate text-[10px] text-muted-foreground">{m.role}</p>
            </div>
            {m.id === value ? <Check className="size-3.5 text-rust" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
      <SheetContent side="right" className="flex w-full flex-col gap-5 sm:max-w-md">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <BrandMark brand={activeProject} size="xs" />
            <span>{activeProject.shortName}</span>
          </div>
          <SheetTitle className="font-serif text-xl tracking-tight">
            {t('tasks.newTitle')}
          </SheetTitle>
          <SheetDescription>{t('tasks.newSubtitle')}</SheetDescription>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t('tasks.field.title')}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              placeholder={t('tasks.titlePlaceholder')}
              maxLength={500}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t('tasks.field.body')}{' '}
              <span className="normal-case text-muted-foreground/60">— {t('common.optional')}</span>
            </label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder={t('tasks.bodyPlaceholder')}
              maxLength={8000}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t('tasks.field.priority')}
              </label>
              <PrioritySelect value={priority} onChange={setPriority} t={t} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {t('tasks.field.dueAt')}
              </label>
              <Input
                type="datetime-local"
                value={dueLocal}
                onChange={(e) => setDueLocal(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {t('tasks.field.assignee')}
            </label>
            <AssigneeSelect
              value={assigneeUserId}
              onChange={setAssigneeUserId}
              members={members.data?.members ?? []}
              loading={members.isLoading}
              t={t}
            />
          </div>

          {create.error ? (
            <p className="text-xs text-destructive">{(create.error as ApiError).message}</p>
          ) : null}

          <div className="mt-auto flex gap-2 pt-2">
            <SheetClose asChild>
              <Button type="button" variant="ghost" className="flex-1">
                {t('common.cancel')}
              </Button>
            </SheetClose>
            <Button type="submit" className="flex-1" disabled={!title.trim() || create.isPending}>
              {create.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              {t('tasks.newCta')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function EmptyState({ onCreate, disabled }: { onCreate: () => void; disabled: boolean }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <span
        aria-hidden="true"
        className="inline-flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground/70"
      >
        <ClipboardList className="size-5" />
      </span>
      <p className="font-serif text-base text-foreground">{t('tasks.empty')}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{t('tasks.emptyHint')}</p>
      <Button size="sm" onClick={onCreate} disabled={disabled}>
        <Plus className="size-3.5" />
        {t('tasks.new')}
      </Button>
    </div>
  );
}
