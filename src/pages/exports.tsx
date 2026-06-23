import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Check,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  Inbox,
  Loader2,
  Mail,
  Plus,
  RefreshCcw,
  Send,
  Users,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT, useLocale } from '@/i18n';
import {
  type ApiError,
  exportsAdminApi,
  type ExportJob,
  type ExportKind,
  type ExportStatus,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

interface KindMeta {
  icon: React.ComponentType<{ className?: string }>;
  accent: 'rust' | 'amber' | 'emerald' | 'sky';
}

const KIND_META: Record<ExportKind, KindMeta> = {
  orders: { icon: Briefcase, accent: 'rust' },
  inquiries: { icon: Send, accent: 'amber' },
  contacts: { icon: Mail, accent: 'sky' },
  newsletter: { icon: Inbox, accent: 'emerald' },
  customers: { icon: Users, accent: 'sky' },
};

const ACCENT_CLS = {
  rust: 'bg-rust-soft/60 text-rust ring-rust/15',
  amber: 'bg-amber-500/10 text-amber-700 ring-amber-500/20 dark:text-amber-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 ring-emerald-500/20 dark:text-emerald-300',
  sky: 'bg-sky-500/10 text-sky-700 ring-sky-500/20 dark:text-sky-300',
} as const;

const STATUS_FILTERS: Array<{ value: ExportStatus | 'all'; iconActive?: boolean }> = [
  { value: 'all' },
  { value: 'pending' },
  { value: 'processing' },
  { value: 'done' },
  { value: 'failed' },
];

function bytesToHuman(n: number | null): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function relative(iso: string, bcp47: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return 'gerade eben';
  if (diff < hr) return `vor ${Math.floor(diff / min)} min`;
  if (diff < day) return `vor ${Math.floor(diff / hr)} h`;
  if (diff < 7 * day) return `vor ${Math.floor(diff / day)} d`;
  return new Date(iso).toLocaleDateString(bcp47, { day: '2-digit', month: 'short' });
}

export function ExportsPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('exports.title'));
  const { projects } = useProject();
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<ExportStatus | 'all'>('all');
  const [sheetOpen, setSheetOpen] = useState(false);

  const list = useQuery({
    queryKey: ['exports'],
    queryFn: ({ signal }) => exportsAdminApi.list({ limit: 50 }, signal),
    refetchInterval: (q) => {
      const items = (q.state.data?.items ?? []) as ExportJob[];
      const anyActive = items.some((j) => j.status === 'pending' || j.status === 'processing');
      return anyActive ? 3000 : false;
    },
  });

  const cancel = useMutation({
    mutationFn: (id: number) => exportsAdminApi.cancel(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['exports'] }),
  });

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const j of list.data?.items ?? []) {
      c.all = (c.all ?? 0) + 1;
      c[j.status] = (c[j.status] ?? 0) + 1;
    }
    return c;
  }, [list.data]);

  const filtered = useMemo(() => {
    const items = list.data?.items ?? [];
    return statusFilter === 'all' ? items : items.filter((j) => j.status === statusFilter);
  }, [list.data, statusFilter]);

  async function downloadJob(id: number) {
    try {
      const { downloadUrl } = await exportsAdminApi.download(id);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const brandsBySlug = useMemo(() => new Map(projects.map((p) => [p.companySlug, p])), [projects]);

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <PageHeading
        title={t('exports.title')}
        subtitle={t('exports.subtitle')}
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
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus className="size-3.5" />
              {t('exports.new')}
            </Button>
          </div>
        }
      />

      <div
        role="tablist"
        aria-label={t('exports.filterAria')}
        className="inline-flex flex-wrap items-center gap-1 self-start rounded-lg border border-border bg-card p-1"
      >
        {STATUS_FILTERS.map((s) => {
          const active = statusFilter === s.value;
          const count = counts[s.value] ?? 0;
          return (
            <button
              key={s.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setStatusFilter(s.value)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40',
                active
                  ? 'bg-rust text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <span>{t(`exports.status.${s.value}` as never)}</span>
              <span
                className={cn(
                  'rounded-full px-1.5 py-px font-mono text-[10px] tabular-nums',
                  active
                    ? 'bg-primary-foreground/15 text-primary-foreground/90'
                    : 'bg-muted/80 text-muted-foreground',
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {list.isLoading ? (
        <ListSkeleton />
      ) : list.error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{(list.error as ApiError).message}</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          hasAny={(list.data?.items ?? []).length > 0}
          onCreate={() => setSheetOpen(true)}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {filtered.map((job) => (
            <JobRow
              key={job.id}
              job={job}
              brand={brandsBySlug.get(job.companySlug)}
              bcp47={bcp47}
              onDownload={() => downloadJob(job.id)}
              onCancel={() => cancel.mutate(job.id)}
            />
          ))}
        </ul>
      )}

      <NewExportSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

function JobRow({
  job,
  brand,
  bcp47,
  onDownload,
  onCancel,
}: {
  job: ExportJob;
  brand: Project | undefined;
  bcp47: string;
  onDownload: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const meta = KIND_META[job.kind];
  const Icon = meta.icon;
  const isActive = job.status === 'pending' || job.status === 'processing';
  const isDone = job.status === 'done';
  const isExpired = job.expiresAt != null && new Date(job.expiresAt).getTime() < Date.now();

  return (
    <li
      className={cn(
        'group relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-card p-3 transition-shadow hover:shadow-sm',
        job.status === 'cancelled' && 'opacity-60',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-0 left-0 w-0.5',
          job.status === 'processing' && 'bg-rust',
          job.status === 'done' && 'bg-success',
          job.status === 'failed' && 'bg-destructive',
          job.status === 'pending' && 'bg-muted-foreground/30',
          job.status === 'cancelled' && 'bg-muted',
        )}
      />

      <span
        className={cn(
          'ml-1 inline-flex size-10 shrink-0 items-center justify-center rounded-lg ring-1',
          isActive
            ? 'bg-rust-soft/60 text-rust ring-rust/15'
            : isDone
              ? 'bg-success-soft text-success ring-success/15'
              : ACCENT_CLS[meta.accent],
        )}
        aria-hidden="true"
      >
        {isActive ? <Loader2 className="size-5 animate-spin" /> : <Icon className="size-5" />}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {brand ? <BrandMark brand={brand} size="xs" /> : null}
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {brand?.shortName ?? job.companySlug}
          </span>
          <span className="text-sm font-medium text-foreground">
            {t(`exports.kind.${job.kind}` as never)}
          </span>
          <StatusPill status={job.status} t={t} />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-muted-foreground">
          <time dateTime={job.createdAt} title={formatDateTime(job.createdAt, bcp47)}>
            {relative(job.createdAt, bcp47)}
          </time>
          {job.rowCount != null ? (
            <span>
              {job.rowCount.toLocaleString(bcp47)} {t('exports.rows')}
            </span>
          ) : null}
          {job.sizeBytes != null ? <span>{bytesToHuman(job.sizeBytes)}</span> : null}
          {job.status === 'failed' && job.errorMessage ? (
            <span className="text-destructive">· {job.errorMessage}</span>
          ) : null}
        </div>
      </div>

      <div className="ml-1 shrink-0">
        {isDone && !isExpired ? (
          <Button size="sm" onClick={onDownload}>
            <Download className="size-3.5" />
            {t('exports.download')}
          </Button>
        ) : isDone && isExpired ? (
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {t('exports.expired')}
          </span>
        ) : job.status === 'pending' ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            className="text-muted-foreground hover:text-destructive"
          >
            <X className="size-3.5" />
            {t('exports.cancel')}
          </Button>
        ) : null}
      </div>
    </li>
  );
}

function StatusPill({ status, t }: { status: ExportStatus; t: ReturnType<typeof useT> }) {
  const tones: Record<ExportStatus, string> = {
    pending: 'border-muted-foreground/30 bg-muted/40 text-muted-foreground',
    processing: 'border-rust/30 bg-rust-soft/60 text-rust [&_span]:animate-pulse-dot',
    done: 'border-success/30 bg-success-soft text-success',
    failed: 'border-destructive/40 bg-destructive/5 text-destructive',
    cancelled: 'border-border bg-muted/40 text-muted-foreground line-through',
  };
  const icon = {
    pending: null,
    processing: (
      <span className="inline-block size-1.5 rounded-full bg-current" aria-hidden="true" />
    ),
    done: <Check className="size-3" />,
    failed: <AlertCircle className="size-3" />,
    cancelled: null,
  }[status];
  return (
    <span
      className={cn(
        'inline-flex h-4 items-center gap-1 rounded-full border px-1.5 text-[9px] font-medium uppercase tracking-wider',
        tones[status],
      )}
    >
      {icon}
      {t(`exports.status.${status}` as never)}
    </span>
  );
}

function NewExportSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const t = useT();
  const { projects, activeProject } = useProject();
  const qc = useQueryClient();

  const [brandSlug, setBrandSlug] = useState<string>(activeProject.companySlug);
  const [kind, setKind] = useState<ExportKind | null>(null);
  const [submitted, setSubmitted] = useState<boolean>(false);

  const create = useMutation({
    mutationFn: (input: { companySlug: string; kind: ExportKind }) => exportsAdminApi.create(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['exports'] });
      setSubmitted(true);
      setTimeout(() => {
        onOpenChange(false);
        setSubmitted(false);
        setKind(null);
      }, 1200);
    },
  });

  const selectedBrand = projects.find((p) => p.companySlug === brandSlug);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) {
          setKind(null);
          setSubmitted(false);
          setBrandSlug(activeProject.companySlug);
          create.reset();
        }
      }}
    >
      <SheetContent side="right" className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-md">
        <div>
          <SheetTitle className="font-serif text-xl tracking-tight">
            {t('exports.sheetTitle')}
          </SheetTitle>
          <SheetDescription>{t('exports.sheetSubtitle')}</SheetDescription>
        </div>

        <FieldGroup label={t('exports.brand')} hint={t('exports.brandSheetHint')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="group flex w-full items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2.5 text-left text-sm transition-colors hover:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40"
              >
                {selectedBrand ? <BrandMark brand={selectedBrand} size="sm" /> : null}
                <span className="min-w-0 flex-1 truncate">
                  <span className="block font-medium">{selectedBrand?.name ?? brandSlug}</span>
                  <span className="block truncate text-[10px] uppercase tracking-wider text-muted-foreground">
                    {selectedBrand?.domain ?? '—'}
                  </span>
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[var(--radix-dropdown-menu-trigger-width)]"
            >
              {projects.map((p) => (
                <DropdownMenuItem
                  key={p.companySlug}
                  onSelect={() => setBrandSlug(p.companySlug)}
                  className="flex items-center gap-2.5"
                >
                  <BrandMark brand={p} size="xs" />
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.companySlug === brandSlug ? <Check className="size-3.5 text-rust" /> : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </FieldGroup>

        <FieldGroup label={t('exports.kindLabel')} hint={t('exports.kindSheetHint')}>
          <ul className="grid grid-cols-1 gap-2">
            {(Object.keys(KIND_META) as ExportKind[]).map((k) => (
              <li key={k}>
                <KindOption kind={k} selected={kind === k} onSelect={() => setKind(k)} t={t} />
              </li>
            ))}
          </ul>
        </FieldGroup>

        <div className="mt-auto flex flex-col gap-2">
          {create.error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
              <span>{(create.error as Error).message}</span>
            </div>
          ) : null}

          {submitted ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success"
            >
              <CheckCircle2 className="size-4" />
              <span>{t('exports.queued')}</span>
            </div>
          ) : (
            <div className="flex gap-2">
              <SheetClose asChild>
                <Button variant="ghost" className="flex-1">
                  {t('common.cancel')}
                </Button>
              </SheetClose>
              <Button
                disabled={!kind || create.isPending}
                onClick={() => kind && create.mutate({ companySlug: brandSlug, kind })}
                className="flex-1"
              >
                {create.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowRight className="size-4" />
                )}
                {t('exports.createButton')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FieldGroup({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function KindOption({
  kind,
  selected,
  onSelect,
  t,
}: {
  kind: ExportKind;
  selected: boolean;
  onSelect: () => void;
  t: ReturnType<typeof useT>;
}) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'group/opt flex w-full items-start gap-3 rounded-lg border bg-background p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40',
        selected
          ? 'border-rust/70 bg-rust-soft/30 shadow-sm'
          : 'border-border hover:border-foreground/30',
      )}
    >
      <span
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-md ring-1 transition-colors',
          selected ? 'bg-rust text-primary-foreground ring-rust/40' : ACCENT_CLS[meta.accent],
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{t(`exports.kind.${kind}` as never)}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
          {t(`exports.kindDesc.${kind}` as never)}
        </p>
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected
            ? 'border-rust bg-rust text-primary-foreground'
            : 'border-muted-foreground/30 bg-background',
        )}
      >
        {selected ? <Check className="size-2.5" strokeWidth={3} /> : null}
      </span>
    </button>
  );
}

function EmptyState({ hasAny, onCreate }: { hasAny: boolean; onCreate: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card/40 p-10 text-center">
      <span
        aria-hidden="true"
        className="inline-flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground/70"
      >
        <Database className="size-5" />
      </span>
      <p className="font-serif text-base text-foreground">
        {hasAny ? t('exports.emptyForFilter') : t('exports.empty')}
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">
        {hasAny ? t('exports.emptyForFilterHint') : t('exports.emptyHint')}
      </p>
      <Button size="sm" onClick={onCreate}>
        <Plus className="size-3.5" />
        {t('exports.new')}
      </Button>
    </div>
  );
}

function ListSkeleton() {
  return (
    <ul className="flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
          <Skeleton className="size-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2 w-1/2" />
          </div>
          <Skeleton className="h-7 w-20 shrink-0" />
        </li>
      ))}
    </ul>
  );
}
