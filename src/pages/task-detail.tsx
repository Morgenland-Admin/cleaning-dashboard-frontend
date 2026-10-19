import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlarmClock,
  ArrowUpRight,
  Check,
  CheckCircle2,
  CircleSlash,
  Edit3,
  Send,
  User as UserIcon,
} from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { BrandChip } from '@/components/brand-mark';
import { CountPill } from '@/components/count-pill';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav, RecordPager } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  ApiError,
  errMessage,
  tasksAdminApi,
  type Task,
  type TaskComment,
  type TaskMember,
  type TaskPriority,
  type TaskStatus,
} from '@/lib/api';
import { readListNav } from '@/lib/list-nav';
import { useNow } from '@/lib/use-now';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';
import { taskKindLabel } from '@/pages/tasks-shared';

type T = ReturnType<typeof useT>;

const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'urgent'];

const PRIORITY_VARIANT: Record<string, NonNullable<BadgeProps['variant']> | undefined> = {
  low: 'secondary',
  normal: 'outline',
  high: 'warning',
  urgent: 'destructive',
};

const STATUS_TONE: Record<string, 'info' | 'success' | 'neutral' | undefined> = {
  open: 'neutral',
  in_progress: 'info',
  done: 'success',
  dismissed: 'neutral',
};

/** t() echoes an unknown key; show the raw DB value instead. */
function labelOr(t: T, key: string, raw: string): string {
  const label = t(key as DictKey);
  return label && label !== key ? label : raw;
}

function isOverdue(dueAt: string | null, now: number): boolean {
  if (!dueAt) return false;
  return new Date(dueAt).getTime() < now;
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function sourceHref(task: Task): string | null {
  if (task.refId == null) return null;
  switch (task.refKind) {
    case 'contact_message':
      return `/contacts/${task.companySlug}/${task.refId}`;
    case 'service_inquiry':
      return `/inquiries/${task.companySlug}/${task.refId}`;
    case 'order':
      return `/auftraege/${task.refId}`;
    default:
      return null;
  }
}

function relativeTime(iso: string, now: number, bcp47: string, t: T): string {
  const diff = now - new Date(iso).getTime();
  const past = diff >= 0;
  const abs = Math.abs(diff);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (abs < min) return t('tasks.timeNow');
  let value: string;
  if (abs < hr) value = `${Math.floor(abs / min)} min`;
  else if (abs < day) value = `${Math.floor(abs / hr)} h`;
  else if (abs < 7 * day) value = `${Math.floor(abs / day)} d`;
  else value = new Date(iso).toLocaleDateString(bcp47, { day: '2-digit', month: 'short' });
  return past ? t('tasks.timeAgo', { value }) : t('tasks.timeIn', { value });
}

export function PriorityBadge({
  priority,
  overdue,
}: {
  priority: TaskPriority;
  overdue?: boolean;
}) {
  const t = useT();
  return (
    <Badge variant={overdue ? 'destructive' : (PRIORITY_VARIANT[priority] ?? 'outline')}>
      {overdue ? t('tasks.overdue') : labelOr(t, `tasks.priority.${priority}`, priority)}
    </Badge>
  );
}

export function TaskStatusBadge({ status }: { status: TaskStatus }) {
  const t = useT();
  return (
    <StatusBadge
      label={labelOr(t, `tasks.status.${status}`, status)}
      tone={STATUS_TONE[status] ?? 'neutral'}
    />
  );
}

/** Not wrappable by FormField (it clones its child to set `id`): the trigger is named by label + value ("Priorität, Hoch"). */
export function DropdownField({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: (ids: { id: string; labelledBy: string }) => ReactNode;
}) {
  const labelId = `${id}-label`;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label id={labelId} htmlFor={id}>
        {label}
      </Label>
      {children({ id, labelledBy: `${labelId} ${id}` })}
    </div>
  );
}

export function PrioritySelect({
  id,
  labelledBy,
  value,
  onChange,
}: {
  id: string;
  labelledBy: string;
  value: TaskPriority;
  onChange: (v: TaskPriority) => void;
}) {
  const t = useT();
  return (
    <Select<TaskPriority>
      id={id}
      aria-labelledby={labelledBy}
      value={value}
      onValueChange={onChange}
      options={PRIORITIES.map((p) => ({
        value: p,
        label: t(`tasks.priority.${p}` as never),
        content: <PriorityBadge priority={p} />,
      }))}
    />
  );
}

export function AssigneeSelect({
  id,
  labelledBy,
  value,
  onChange,
  members,
  loading,
}: {
  id: string;
  labelledBy: string;
  value: string | null;
  onChange: (v: string | null) => void;
  members: TaskMember[];
  loading: boolean;
}) {
  const t = useT();
  return (
    <Select
      id={id}
      aria-labelledby={labelledBy}
      value={value ?? ''}
      onValueChange={(v) => onChange(v || null)}
      disabled={loading}
      placeholder={loading ? t('common.loading') : undefined}
      options={[
        { value: '', label: t('tasks.unassigned') },
        ...members.map((m) => ({
          value: m.id,
          label: m.name || m.email,
          description: m.role,
        })),
      ]}
    />
  );
}

export function TaskDetailPage() {
  const params = useParams();
  const id = params.id && /^\d+$/.test(params.id) ? Number(params.id) : null;
  // Keyed by id: prev/next must not carry an open edit form over to the next task.
  return <TaskDetail key={id ?? 'invalid'} id={id} />;
}

function TaskDetail({ id }: { id: number | null }) {
  const canWrite = useCanWrite();
  const t = useT();
  const { bcp47 } = useLocale();
  const location = useLocation();
  const qc = useQueryClient();
  const { projects, setBrandView } = useProject();
  const now = useNow(60_000);

  const from = readListNav(location.state).from;
  const backTo = from?.startsWith('/') ? from : '/tasks';

  const detail = useQuery({
    queryKey: ['task-detail', id],
    queryFn: ({ signal }) => tasksAdminApi.detail(id!, signal),
    enabled: id != null,
  });
  const comments = useQuery({
    queryKey: ['task-comments', id],
    queryFn: ({ signal }) => tasksAdminApi.comments(id!, signal),
    enabled: id != null,
  });

  const task = detail.data?.task;
  usePageTitle(task?.title ?? t('tasks.detailTitle'));
  const [editing, setEditing] = useState(false);

  function refreshAll() {
    void qc.invalidateQueries({ queryKey: ['task-detail', id] });
    void qc.invalidateQueries({ queryKey: ['task-comments', id] });
    void qc.invalidateQueries({ queryKey: ['tasks'] });
    void qc.invalidateQueries({ queryKey: ['tasks-counts'] });
    void qc.invalidateQueries({ queryKey: ['notifications-unread'] });
  }

  const afterAction = {
    onSuccess: refreshAll,
    onError: (err: unknown) => toast.error(errMessage(err), t('common.error')),
  };
  const ack = useMutation({ mutationFn: () => tasksAdminApi.ack(id!), ...afterAction });
  const done = useMutation({ mutationFn: () => tasksAdminApi.done(id!), ...afterAction });
  const dismiss = useMutation({ mutationFn: () => tasksAdminApi.dismiss(id!), ...afterAction });
  const acting = ack.isPending || done.isPending || dismiss.isPending;

  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to={backTo}>{t('tasks.title')}</BackLink>
    </RecordNav>
  );

  if (id == null || (!task && !detail.isLoading)) {
    const error =
      detail.error && !(detail.error instanceof ApiError && detail.error.status === 404)
        ? detail.error
        : null;
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('tasks.detailTitle')} />
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => void detail.refetch()}
            retrying={detail.isFetching}
          />
        ) : (
          <EmptyState variant="dashed" message={t('tasks.notFound')} />
        )}
      </PageContainer>
    );
  }

  if (!task) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState />
      </PageContainer>
    );
  }

  const brand = projects.find((p) => p.companySlug === task.companySlug) ?? null;
  const overdue = isOverdue(task.dueAt, now);
  const isOpenStatus = task.status === 'open' || task.status === 'in_progress';
  const assignee = detail.data?.assignee ?? null;
  const source = sourceHref(task);

  // Orders load for the brand in view, so switch to the task's brand first.
  const openSource = () => setBrandView(brand?.id ?? task.companySlug);

  const commentList = comments.data?.comments ?? [];

  return (
    <PageContainer>
      {backRow(<RecordPager currentId={task.id} hrefFor={(next) => `/tasks/${next}`} />)}
      <PageHeading
        title={task.title}
        meta={
          <>
            <PriorityBadge priority={task.priority} overdue={overdue} />
            <TaskStatusBadge status={task.status} />
          </>
        }
        subtitle={t('tasks.createdAt', { time: formatDateTime(task.createdAt, bcp47) })}
        actions={
          <>
            {canWrite && isOpenStatus ? (
              <>
                {task.status === 'open' ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => ack.mutate()}
                    disabled={acting}
                    loading={ack.isPending}
                  >
                    <UserIcon aria-hidden="true" />
                    {t('tasks.actions.ack')}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dismiss.mutate()}
                  disabled={acting}
                  loading={dismiss.isPending}
                >
                  <CircleSlash aria-hidden="true" />
                  {t('tasks.actions.dismiss')}
                </Button>
                <Button
                  size="sm"
                  onClick={() => done.mutate()}
                  disabled={acting}
                  loading={done.isPending}
                >
                  <CheckCircle2 aria-hidden="true" />
                  {t('tasks.actions.done')}
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {editing ? (
            <TaskEditForm
              task={task}
              brand={brand}
              onCancel={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                refreshAll();
              }}
            />
          ) : (
            <SectionCard
              title={t('tasks.body')}
              actions={
                canWrite ? (
                  <Button variant="ghost" size="xs" onClick={() => setEditing(true)}>
                    <Edit3 aria-hidden="true" />
                    {t('common.edit')}
                  </Button>
                ) : undefined
              }
            >
              {task.body ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {task.body}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">{t('tasks.noBody')}</p>
              )}
            </SectionCard>
          )}

          <SectionCard
            title={
              <span className="inline-flex items-center gap-2">
                {t('tasks.comments')}
                <CountPill>{commentList.length}</CountPill>
              </span>
            }
            bodyClassName="flex flex-col gap-4"
          >
            {comments.isLoading ? (
              <LoadingState inline />
            ) : comments.error ? (
              <ErrorState
                error={comments.error}
                onRetry={() => void comments.refetch()}
                retrying={comments.isFetching}
              />
            ) : commentList.length === 0 ? (
              <p className="text-2sm text-muted-foreground">{t('tasks.noComments')}</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {commentList.map((c) => (
                  <CommentBlock key={c.id} comment={c} now={now} bcp47={bcp47} t={t} />
                ))}
              </ul>
            )}
            {canWrite ? (
              <CommentComposer
                taskId={task.id}
                onPosted={() => void qc.invalidateQueries({ queryKey: ['task-comments', id] })}
              />
            ) : null}
          </SectionCard>
        </div>

        <SectionCard title={t('tasks.details')} className="self-start">
          <KeyValueList layout="stacked">
            <KeyValue
              label={t('tasks.detailFacts.source')}
              value={
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{taskKindLabel(t, task.kind)}</span>
                  {source ? (
                    <Link
                      to={source}
                      onClick={openSource}
                      className="inline-flex min-h-6 items-center gap-1 rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t('tasks.openSource')}
                      <ArrowUpRight className="size-3.5" aria-hidden="true" />
                    </Link>
                  ) : null}
                </span>
              }
            />
            <KeyValue
              label={t('common.brand')}
              value={
                brand ? (
                  <BrandChip brand={brand} />
                ) : (
                  <span className="text-muted-foreground">{task.companySlug}</span>
                )
              }
            />
            <KeyValue
              label={t('tasks.field.assignee')}
              value={
                assignee ? (
                  (assignee.name ?? assignee.email)
                ) : (
                  <span className="text-muted-foreground">{t('tasks.unassigned')}</span>
                )
              }
            />
            <KeyValue
              label={t('tasks.field.dueAt')}
              empty="—"
              value={
                task.dueAt ? (
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 tabular-nums',
                      overdue && 'text-destructive',
                    )}
                  >
                    <AlarmClock className="size-3.5" aria-hidden="true" />
                    {formatDateTime(task.dueAt, bcp47)}
                  </span>
                ) : null
              }
            />
            <KeyValue
              label={t('tasks.detailFacts.created')}
              value={<span className="tabular-nums">{formatDateTime(task.createdAt, bcp47)}</span>}
            />
            <KeyValue
              label={t('tasks.detailFacts.resolved')}
              value={
                task.resolvedAt ? (
                  <span>
                    <span className="tabular-nums">{formatDateTime(task.resolvedAt, bcp47)}</span>
                    {detail.data?.resolvedBy ? (
                      <span className="text-muted-foreground">
                        {' '}
                        · {detail.data.resolvedBy.name ?? detail.data.resolvedBy.email}
                      </span>
                    ) : null}
                  </span>
                ) : null
              }
            />
          </KeyValueList>
        </SectionCard>
      </div>
    </PageContainer>
  );
}

function CommentBlock({
  comment,
  now,
  bcp47,
  t,
}: {
  comment: TaskComment;
  now: number;
  bcp47: string;
  t: T;
}) {
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-foreground">
          {comment.authorName ?? comment.authorEmail ?? '—'}
        </span>
        <time
          dateTime={comment.createdAt}
          className="text-2xs tabular-nums text-muted-foreground"
          title={formatDateTime(comment.createdAt, bcp47)}
        >
          {relativeTime(comment.createdAt, now, bcp47, t)}
        </time>
      </div>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{comment.body}</p>
    </li>
  );
}

const IS_APPLE =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.userAgent);

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
    <div className="flex flex-col gap-2">
      <Textarea
        rows={3}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('tasks.commentPlaceholder')}
        aria-label={t('tasks.commentLabel')}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && body.trim()) {
            e.preventDefault();
            post.mutate();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          <kbd className="font-sans">{IS_APPLE ? '⌘' : 'Ctrl'} + ↵</kbd> {t('tasks.sendShortcut')}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!body.trim()}
          loading={post.isPending}
          onClick={() => post.mutate()}
        >
          <Send aria-hidden="true" />
          {t('tasks.postComment')}
        </Button>
      </div>
      {post.error ? <Alert tone="destructive">{errMessage(post.error)}</Alert> : null}
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
  const uid = useId();
  const [title, setTitle] = useState(task.title);
  const [body, setBody] = useState(task.body ?? '');
  const [priority, setPriority] = useState<TaskPriority>(task.priority);
  const [dueLocal, setDueLocal] = useState<string>(task.dueAt ? toLocalInputValue(task.dueAt) : '');
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
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <SectionCard
        as="fieldset"
        title={t('common.edit')}
        bodyClassName="grid gap-4 sm:grid-cols-2"
        footer={
          <>
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" loading={save.isPending}>
              <Check aria-hidden="true" />
              {t('common.save')}
            </Button>
          </>
        }
      >
        <FormField label={t('tasks.field.title')} required className="sm:col-span-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
        </FormField>

        <FormField label={t('tasks.field.body')} className="sm:col-span-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={5}
            maxLength={8000}
          />
        </FormField>

        <DropdownField id={`${uid}-priority`} label={t('tasks.field.priority')}>
          {(ids) => <PrioritySelect {...ids} value={priority} onChange={setPriority} />}
        </DropdownField>
        <FormField label={t('tasks.field.dueAt')}>
          <DateTimePicker value={dueLocal} onValueChange={setDueLocal} />
        </FormField>

        <DropdownField
          id={`${uid}-assignee`}
          label={t('tasks.field.assignee')}
          className="sm:col-span-2"
        >
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

        {save.error ? (
          <Alert tone="destructive" className="sm:col-span-2">
            {errMessage(save.error)}
          </Alert>
        ) : null}
      </SectionCard>
    </form>
  );
}
