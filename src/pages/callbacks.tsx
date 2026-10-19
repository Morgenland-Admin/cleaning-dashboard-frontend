import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardEdit, MapPin, Phone, PhoneCall, Trophy, Wrench, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SectionCard } from '@/components/section';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  errMessage,
  inquiriesApi,
  type HumanCallbackEntry,
  type InquiryStatus,
} from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime, formatShortDate } from '@/lib/utils';

type Row = HumanCallbackEntry & { _brand: Project };

const PAGE_SIZE = 100;

function rowKey(companySlug: CompanySlug, id: number): string {
  return `${companySlug}:${id}`;
}

function listError(error: unknown, t: ReturnType<typeof useT>): Error | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 401) return new Error(t('inquiries.errUnauthorized'));
    if (error.status === 403) return new Error(t('inquiries.errForbidden'));
    return error;
  }
  return new Error(t('inquiries.errGeneric'));
}

export function CallbacksPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('callbacks.title'));
  const now = useNow(60_000);

  const single = useQuery({
    queryKey: ['human-callbacks', activeProject.companySlug] as const,
    enabled: !isAllBrands,
    queryFn: ({ signal }) =>
      inquiriesApi.humanCallbackQueue(activeProject.companySlug, { limit: PAGE_SIZE }, signal),
  });

  const multi = useQueries({
    queries: (isAllBrands ? projects : []).map((p) => ({
      queryKey: ['human-callbacks', p.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        inquiriesApi.humanCallbackQueue(p.companySlug, { limit: PAGE_SIZE }, signal),
    })),
  });

  const isLoading = isAllBrands ? multi.some((q) => q.isLoading) : single.isLoading;
  const isFetching = isAllBrands ? multi.some((q) => q.isFetching) : single.isFetching;
  const firstError = isAllBrands ? multi.find((q) => q.error)?.error : single.error;

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    if (isAllBrands) {
      multi.forEach((q, i) => {
        const brand = projects[i];
        if (!brand) return;
        (q.data?.inquiries ?? []).forEach((c) => out.push({ ...c, _brand: brand }));
      });
    } else {
      (single.data?.inquiries ?? []).forEach((c) => out.push({ ...c, _brand: activeProject }));
    }
    out.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return out;
  }, [isAllBrands, multi, projects, single.data, activeProject]);

  const [pending, setPending] = useState<Record<string, InquiryStatus>>({});

  const updateMutation = useMutation({
    mutationFn: (vars: { companySlug: CompanySlug; id: number; status: InquiryStatus }) =>
      inquiriesApi.update(vars.companySlug, vars.id, { status: vars.status }),
    onMutate: (vars) => {
      setPending((p) => ({ ...p, [rowKey(vars.companySlug, vars.id)]: vars.status }));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['human-callbacks'] });
      void queryClient.invalidateQueries({ queryKey: ['inquiries-infinite'] });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('callbacks.updateFailed'),
        description: errMessage(err),
      });
    },
    onSettled: (_data, _err, vars) => {
      setPending((p) => {
        const next = { ...p };
        delete next[rowKey(vars.companySlug, vars.id)];
        return next;
      });
    },
  });

  function refreshAll() {
    if (isAllBrands) multi.forEach((q) => q.refetch());
    else void single.refetch();
  }

  const error = listError(firstError, t);

  return (
    <PageContainer>
      <PageHeading
        breadcrumb={[
          { label: isAllBrands ? t('brandFilter.allBrands') : activeProject.name },
          { label: t('callbacks.title') },
        ]}
        title={t('callbacks.title')}
        subtitle={t('callbacks.subtitle')}
        actions={<RefreshButton onClick={refreshAll} fetching={isFetching} />}
      />

      <div className="flex flex-col gap-4">
        {error ? <ErrorState error={error} onRetry={refreshAll} retrying={isFetching} /> : null}

        <SectionCard
          title={t('callbacks.listTitle')}
          icon={<PhoneCall />}
          description={
            rows.length === 1
              ? t('callbacks.countSingular', { count: rows.length })
              : t('callbacks.countPlural', { count: rows.length })
          }
          actions={
            <Badge variant="warning">
              <Phone aria-hidden="true" />
              {t('callbacks.flag')}
            </Badge>
          }
          bodyClassName="p-0 sm:p-0"
        >
          {isLoading ? (
            <LoadingState label={t('callbacks.loading')} />
          ) : rows.length === 0 ? (
            error ? null : (
              <EmptyState icon={<PhoneCall />} message={t('callbacks.empty')} />
            )
          ) : (
            <>
              <ul className="divide-y divide-border md:hidden">
                {rows.map((c) => {
                  const key = rowKey(c._brand.companySlug, c.id);
                  return (
                    <CallbackMobileRow
                      key={key}
                      row={c}
                      now={now}
                      t={t}
                      bcp47={bcp47}
                      showBrand={isAllBrands}
                      onStatusChange={(status) =>
                        updateMutation.mutate({
                          companySlug: c._brand.companySlug,
                          id: c.id,
                          status,
                        })
                      }
                      pendingStatus={pending[key] ?? null}
                    />
                  );
                })}
              </ul>
              <Table containerClassName="hidden w-full overflow-x-auto md:block">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('callbacks.colName')}</TableHead>
                    <TableHead>{t('callbacks.colContact')}</TableHead>
                    <TableHead>{t('callbacks.colReason')}</TableHead>
                    <TableHead className="text-right">{t('callbacks.colWaiting')}</TableHead>
                    <TableHead className="text-right">{t('callbacks.colActions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => {
                    const key = rowKey(c._brand.companySlug, c.id);
                    return (
                      <CallbackTableRow
                        key={key}
                        row={c}
                        now={now}
                        t={t}
                        bcp47={bcp47}
                        showBrand={isAllBrands}
                        onStatusChange={(status) =>
                          updateMutation.mutate({
                            companySlug: c._brand.companySlug,
                            id: c.id,
                            status,
                          })
                        }
                        pendingStatus={pending[key] ?? null}
                      />
                    );
                  })}
                </TableBody>
              </Table>
            </>
          )}
        </SectionCard>
      </div>
    </PageContainer>
  );
}

type RowProps = {
  row: Row;
  now: number;
  t: ReturnType<typeof useT>;
  bcp47: string;
  showBrand: boolean;
  onStatusChange: (status: InquiryStatus) => void;
  pendingStatus: InquiryStatus | null;
};

const LINK =
  'rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function NameLink({ row, t }: { row: Row; t: ReturnType<typeof useT> }) {
  return (
    <Link
      to={`/inquiries/${encodeURIComponent(row._brand.companySlug)}/${row.id}`}
      title={t('callbacks.openInquiry')}
      className="truncate rounded-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {row.name}
    </Link>
  );
}

function ContactLinks({ row, t }: { row: Row; t: ReturnType<typeof useT> }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      {row.phone ? (
        <a
          href={`tel:${row.phone}`}
          className={cn(LINK, 'inline-flex items-center gap-1 font-medium')}
        >
          <Phone className="size-3" aria-hidden="true" />
          <span className="tabular-nums">{row.phone}</span>
        </a>
      ) : (
        <span className="inline-flex items-center gap-1 text-muted-foreground">
          <Phone className="size-3" aria-hidden="true" />
          {t('callbacks.noPhone')}
        </span>
      )}
      {row.email ? (
        <a href={`mailto:${row.email}`} className={cn(LINK, 'truncate text-xs')}>
          {row.email}
        </a>
      ) : null}
    </div>
  );
}

function Reason({ row }: { row: Row }) {
  return (
    <div className="min-w-0">
      <p className={cn('line-clamp-2 break-words', row.callReason && 'font-medium')}>
        {row.callReason ?? row.message}
      </p>
      {row.plz || row.service ? (
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
          {row.plz ? (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MapPin className="size-3" aria-hidden="true" />
              {row.plz}
            </span>
          ) : null}
          {row.service ? (
            <span className="inline-flex items-center gap-1">
              <Wrench className="size-3" aria-hidden="true" />
              {row.service}
            </span>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function Waiting({ row, now, t, bcp47 }: Pick<RowProps, 'row' | 'now' | 't' | 'bcp47'>) {
  return (
    <time
      dateTime={row.createdAt}
      title={formatDateTime(row.createdAt, bcp47)}
      className="whitespace-nowrap tabular-nums text-muted-foreground"
    >
      {formatWaiting(row.createdAt, now, t, bcp47)}
    </time>
  );
}

function RowActions({
  row,
  t,
  onStatusChange,
  pendingStatus,
}: Pick<RowProps, 'row' | 't' | 'onStatusChange' | 'pendingStatus'>) {
  const isUpdating = pendingStatus !== null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
      <Button
        size="xs"
        variant="outline"
        disabled={isUpdating || row.status === 'in_review'}
        aria-pressed={row.status === 'in_review'}
        loading={pendingStatus === 'in_review'}
        onClick={() => onStatusChange('in_review')}
        className={cn(
          row.status === 'in_review' &&
            'border-primary/40 bg-primary-soft text-primary disabled:opacity-100',
        )}
      >
        <ClipboardEdit aria-hidden="true" />
        {t('callbacks.actions.reached')}
      </Button>
      <Button
        size="xs"
        variant="outline"
        disabled={isUpdating}
        loading={pendingStatus === 'won'}
        onClick={() => onStatusChange('won')}
      >
        <Trophy aria-hidden="true" />
        {t('inquiries.actions.won')}
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={isUpdating}
        loading={pendingStatus === 'lost'}
        onClick={() => onStatusChange('lost')}
      >
        <XCircle aria-hidden="true" />
        {t('inquiries.actions.lost')}
      </Button>
    </div>
  );
}

function CallbackTableRow(props: RowProps) {
  const { row, t, showBrand } = props;
  return (
    <TableRow>
      <TableCell className="max-w-[14rem] py-2">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <NameLink row={row} t={t} />
          {showBrand ? <BrandChip brand={row._brand} /> : null}
        </div>
      </TableCell>
      <TableCell className="max-w-[14rem] py-2">
        <ContactLinks row={row} t={t} />
      </TableCell>
      <TableCell className="max-w-[24rem] py-2">
        <Reason row={row} />
      </TableCell>
      <TableCell className="py-2 text-right">
        <Waiting {...props} />
      </TableCell>
      <TableCell className="py-2">
        <RowActions {...props} />
      </TableCell>
    </TableRow>
  );
}

function CallbackMobileRow(props: RowProps) {
  const { row, t, showBrand } = props;
  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center gap-2">
        <NameLink row={row} t={t} />
        {showBrand ? <BrandChip brand={row._brand} /> : null}
        <span className="ml-auto text-xs">
          <Waiting {...props} />
        </span>
      </div>
      <ContactLinks row={row} t={t} />
      <div className="text-2sm">
        <Reason row={row} />
      </div>
      <RowActions {...props} />
    </li>
  );
}

function formatWaiting(iso: string, now: number, t: ReturnType<typeof useT>, bcp47: string) {
  const date = new Date(iso);
  const minutes = Math.floor((now - date.getTime()) / 60_000);
  if (minutes < 1) return t('contacts.timeNow');
  if (minutes < 60) return t('contacts.timeMinutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('contacts.timeHours', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('contacts.timeDays', { n: days });
  return formatShortDate(date, bcp47);
}
