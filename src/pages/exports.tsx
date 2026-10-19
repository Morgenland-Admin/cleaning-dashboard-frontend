import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Briefcase,
  Check,
  Database,
  Download,
  Inbox,
  Loader2,
  Mail,
  Plus,
  Send,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useId, useMemo, useState } from 'react';

import { BrandChip, BrandMark } from '@/components/brand-mark';
import { EmptyState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
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
import { useProject, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT, useLocale } from '@/i18n';
import {
  errMessage,
  exportsAdminApi,
  type ExportJob,
  type ExportKind,
  type ExportStatus,
} from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';

type T = ReturnType<typeof useT>;

const KIND_ICON: Record<ExportKind, LucideIcon> = {
  orders: Briefcase,
  inquiries: Send,
  contacts: Mail,
  newsletter: Inbox,
  customers: Users,
};

const KINDS = Object.keys(KIND_ICON) as ExportKind[];

const STATUS_FILTERS: Array<ExportStatus | 'all'> = [
  'all',
  'pending',
  'processing',
  'done',
  'failed',
];

const STATUS_TONE: Record<ExportStatus, 'info' | 'success' | 'danger' | 'neutral'> = {
  pending: 'neutral',
  processing: 'info',
  done: 'success',
  failed: 'danger',
  cancelled: 'neutral',
};

function bytesToHuman(n: number | null, bcp47: string): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = new Intl.NumberFormat(bcp47, { maximumFractionDigits: 1 }).format(n / 1024 / 1024);
  return `${mb} MB`;
}

function relative(iso: string, now: number, bcp47: string, t: T): string {
  const diff = now - new Date(iso).getTime();
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('exports.relative.justNow');
  if (diff < hr) return t('exports.relative.minutes', { n: Math.floor(diff / min) });
  if (diff < day) return t('exports.relative.hours', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('exports.relative.days', { n: Math.floor(diff / day) });
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
  // One shared clock: a link that expires while the page is open flips over (polling stops when nothing is active).
  const now = useNow(30_000);

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
    onSuccess: () => {
      toast.success(t('exports.cancelled'));
      void qc.invalidateQueries({ queryKey: ['exports'] });
    },
    onError: (err) => toast.error(errMessage(err), t('common.error')),
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
      toast.error(errMessage(err), t('common.error'));
    }
  }

  const brandsBySlug = useMemo(() => new Map(projects.map((p) => [p.companySlug, p])), [projects]);
  const hasAny = (list.data?.items ?? []).length > 0;
  const jobProps = (job: ExportJob): JobRowProps => ({
    job,
    brand: brandsBySlug.get(job.companySlug),
    bcp47,
    now,
    cancelling: cancel.isPending && cancel.variables === job.id,
    onDownload: () => void downloadJob(job.id),
    onCancel: () => cancel.mutate(job.id),
  });

  return (
    <PageContainer width="full" className="gap-4">
      <PageHeading
        className="mb-1"
        title={t('exports.title')}
        subtitle={t('exports.subtitle')}
        actions={
          <>
            <RefreshButton fetching={list.isFetching} onClick={() => void list.refetch()} />
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus aria-hidden="true" />
              {t('exports.new')}
            </Button>
          </>
        }
      />

      <SegmentedControl
        label={t('exports.filterAria')}
        value={statusFilter}
        onValueChange={setStatusFilter}
        overflow="scroll"
        className="self-start"
        options={STATUS_FILTERS.map((value) => ({
          value,
          label: t(`exports.status.${value}` as never),
          count: counts[value] ?? 0,
        }))}
      />

      {list.isLoading ? (
        <div role="status" aria-label={t('common.loading')}>
          <ListSkeleton rows={3} />
        </div>
      ) : list.error ? (
        <ErrorState
          error={list.error}
          onRetry={() => void list.refetch()}
          retrying={list.isFetching}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          variant="dashed"
          icon={<Database aria-hidden="true" />}
          title={hasAny ? t('exports.emptyForFilter') : t('exports.empty')}
          message={hasAny ? t('exports.emptyForFilterHint') : t('exports.emptyHint')}
          action={
            <Button size="sm" onClick={() => setSheetOpen(true)}>
              <Plus aria-hidden="true" />
              {t('exports.new')}
            </Button>
          }
        />
      ) : (
        <div className="overflow-clip rounded-lg border border-border bg-card">
          <div className="lg:max-h-[calc(100svh-16rem)] lg:overflow-y-auto lg:overscroll-contain">
            <ul className="divide-y divide-border md:hidden">
              {filtered.map((job) => (
                <JobListItem key={job.id} {...jobProps(job)} />
              ))}
            </ul>
            <Table containerClassName="hidden w-full md:block">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>{t('exports.kindLabel')}</TableHead>
                  <TableHead>{t('exports.brand')}</TableHead>
                  <TableHead>{t('exports.col.created')}</TableHead>
                  <TableHead>{t('exports.col.status')}</TableHead>
                  <TableHead className="text-right">{t('exports.rows')}</TableHead>
                  <TableHead className="text-right">{t('exports.col.size')}</TableHead>
                  <TableHead>{t('exports.col.expires')}</TableHead>
                  <TableHead className="w-0">
                    <span className="sr-only">{t('exports.col.actions')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((job) => (
                  <JobTableRow key={job.id} {...jobProps(job)} />
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      <NewExportSheet open={sheetOpen} onOpenChange={setSheetOpen} />
    </PageContainer>
  );
}

interface JobRowProps {
  job: ExportJob;
  brand: Project | undefined;
  bcp47: string;
  now: number;
  cancelling: boolean;
  onDownload: () => void;
  onCancel: () => void;
}

function JobBrand({ job, brand }: { job: ExportJob; brand: Project | undefined }) {
  return brand ? (
    <BrandChip brand={brand} />
  ) : (
    <span className="text-2xs text-muted-foreground">{job.companySlug}</span>
  );
}

function JobStatus({ job }: { job: ExportJob }) {
  const t = useT();
  const isActive = job.status === 'pending' || job.status === 'processing';
  return (
    <span className="inline-flex items-center gap-1.5">
      <StatusBadge
        label={t(`exports.status.${job.status}` as never)}
        tone={STATUS_TONE[job.status]}
      />
      {isActive ? (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
      ) : null}
    </span>
  );
}

function JobCreated({ job, now, bcp47 }: { job: ExportJob; now: number; bcp47: string }) {
  const t = useT();
  return (
    <time
      dateTime={job.createdAt}
      title={formatDateTime(job.createdAt, bcp47)}
      className="whitespace-nowrap tabular-nums"
    >
      {relative(job.createdAt, now, bcp47, t)}
    </time>
  );
}

function isExpired(job: ExportJob, now: number): boolean {
  return job.expiresAt != null && new Date(job.expiresAt).getTime() < now;
}

function JobAction({ job, now, cancelling, onDownload, onCancel }: JobRowProps) {
  const t = useT();
  if (job.status === 'done' && !isExpired(job, now)) {
    return (
      <Button variant="outline" size="xs" onClick={onDownload}>
        <Download aria-hidden="true" />
        {t('exports.download')}
      </Button>
    );
  }
  if (job.status === 'pending') {
    return (
      <Button
        variant="ghost"
        size="xs"
        onClick={onCancel}
        loading={cancelling}
        className="text-muted-foreground hover:text-destructive"
      >
        <X aria-hidden="true" />
        {t('exports.cancel')}
      </Button>
    );
  }
  return null;
}

function JobExpiry({ job, now, bcp47 }: { job: ExportJob; now: number; bcp47: string }) {
  const t = useT();
  if (job.status !== 'done' || !job.expiresAt) return <>—</>;
  if (isExpired(job, now)) return <>{t('exports.expired')}</>;
  return <>{formatDateTime(job.expiresAt, bcp47, { dateStyle: 'medium' })}</>;
}

function JobTableRow(props: JobRowProps) {
  const t = useT();
  const { job, brand, bcp47, now } = props;
  return (
    <TableRow>
      <TableCell className="font-medium text-foreground">
        {t(`exports.kind.${job.kind}` as never)}
      </TableCell>
      <TableCell>
        <JobBrand job={job} brand={brand} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        <JobCreated job={job} now={now} bcp47={bcp47} />
      </TableCell>
      <TableCell className="max-w-[18rem]">
        <JobStatus job={job} />
        {job.status === 'failed' && job.errorMessage ? (
          <p className="mt-0.5 truncate text-xs text-destructive" title={job.errorMessage}>
            {job.errorMessage}
          </p>
        ) : null}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {job.rowCount != null ? job.rowCount.toLocaleString(bcp47) : '—'}
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">
        {bytesToHuman(job.sizeBytes, bcp47)}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        <JobExpiry job={job} now={now} bcp47={bcp47} />
      </TableCell>
      <TableCell className="py-1.5 text-right">
        <JobAction {...props} />
      </TableCell>
    </TableRow>
  );
}

function JobListItem(props: JobRowProps) {
  const t = useT();
  const { job, brand, bcp47, now } = props;
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-2sm font-medium text-foreground">
            {t(`exports.kind.${job.kind}` as never)}
          </span>
          <JobStatus job={job} />
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-muted-foreground">
          <JobBrand job={job} brand={brand} />
          <JobCreated job={job} now={now} bcp47={bcp47} />
          {job.rowCount != null ? (
            <span>
              · {job.rowCount.toLocaleString(bcp47)} {t('exports.rows')}
            </span>
          ) : null}
          {job.sizeBytes != null ? <span>· {bytesToHuman(job.sizeBytes, bcp47)}</span> : null}
          {job.status === 'done' && isExpired(job, now) ? (
            <span>· {t('exports.expired')}</span>
          ) : null}
        </div>
        {job.status === 'failed' && job.errorMessage ? (
          <p className="mt-1 text-xs text-destructive">{job.errorMessage}</p>
        ) : null}
      </div>
      <div className="shrink-0">
        <JobAction {...props} />
      </div>
    </li>
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
  const ids = useId();
  const brandId = `${ids}-brand`;
  const brandLabelId = `${ids}-brand-label`;
  const brandHintId = `${ids}-brand-hint`;
  const kindHintId = `${ids}-kind-hint`;

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
      <SheetContent
        side="right"
        variant="content"
        className="flex flex-col gap-6 overflow-y-auto sm:max-w-md"
      >
        {/* SheetTitle/Description stay sr-only and name the dialog; the visible copy is aria-hidden so it is not read twice. */}
        <SheetTitle>{t('exports.sheetTitle')}</SheetTitle>
        <SheetDescription>{t('exports.sheetSubtitle')}</SheetDescription>
        <div aria-hidden="true" className="space-y-1 pr-10">
          <p className="text-base font-semibold text-foreground">{t('exports.sheetTitle')}</p>
          <p className="text-2sm text-muted-foreground">{t('exports.sheetSubtitle')}</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label id={brandLabelId} htmlFor={brandId}>
            {t('exports.brand')}
          </Label>
          <Select
            id={brandId}
            aria-labelledby={brandLabelId}
            aria-describedby={brandHintId}
            value={brandSlug}
            onValueChange={setBrandSlug}
            options={projects.map((p) => ({
              value: p.companySlug,
              label: p.name,
              description: p.domain,
              icon: <BrandMark brand={p} size="xs" />,
            }))}
          />
          <p id={brandHintId} className="text-xs text-muted-foreground">
            {t('exports.brandSheetHint')}
          </p>
        </div>

        <fieldset className="min-w-0" aria-describedby={kindHintId}>
          <legend className="mb-1.5 text-2sm font-medium leading-5 text-foreground">
            {t('exports.kindLabel')}
          </legend>
          <div className="grid grid-cols-1 gap-2">
            {KINDS.map((k) => (
              <KindOption
                key={k}
                name={`${ids}-kind`}
                kind={k}
                selected={kind === k}
                onSelect={() => setKind(k)}
                t={t}
              />
            ))}
          </div>
          <p id={kindHintId} className="mt-1.5 text-xs text-muted-foreground">
            {t('exports.kindSheetHint')}
          </p>
        </fieldset>

        <div className="mt-auto flex flex-col gap-2">
          {create.error ? <Alert tone="destructive">{errMessage(create.error)}</Alert> : null}

          {submitted ? (
            <Alert tone="success">{t('exports.queued')}</Alert>
          ) : (
            <div className="flex gap-2">
              <SheetClose asChild>
                <Button variant="outline" className="flex-1">
                  {t('common.cancel')}
                </Button>
              </SheetClose>
              <Button
                disabled={!kind}
                loading={create.isPending}
                onClick={() => kind && create.mutate({ companySlug: brandSlug, kind })}
                className="flex-1"
              >
                <ArrowRight aria-hidden="true" />
                {t('exports.createButton')}
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function KindOption({
  name,
  kind,
  selected,
  onSelect,
  t,
}: {
  name: string;
  kind: ExportKind;
  selected: boolean;
  onSelect: () => void;
  t: T;
}) {
  const Icon = KIND_ICON[kind];
  const id = useId();
  return (
    <label
      className={cn(
        'flex w-full cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 text-left transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-1',
        selected ? 'border-primary bg-primary-soft' : 'border-border hover:bg-accent/60',
      )}
    >
      <input
        type="radio"
        name={name}
        value={kind}
        checked={selected}
        onChange={onSelect}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-desc`}
        className="sr-only"
      />
      <span
        className={cn(
          'inline-flex size-9 shrink-0 items-center justify-center rounded-md transition-colors',
          selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span id={`${id}-title`} className="block text-sm font-medium text-foreground">
          {t(`exports.kind.${kind}` as never)}
        </span>
        <span id={`${id}-desc`} className="mt-0.5 block text-xs text-muted-foreground">
          {t(`exports.kindDesc.${kind}` as never)}
        </span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card',
        )}
      >
        {selected ? <Check className="size-2.5" strokeWidth={3} /> : null}
      </span>
    </label>
  );
}
