import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ClipboardEdit,
  MapPin,
  Phone,
  PhoneCall,
  RefreshCcw,
  Trophy,
  Wrench,
  XCircle,
} from 'lucide-react';
import { useMemo } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import { ApiError, inquiriesApi, type HumanCallbackEntry, type InquiryStatus } from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatShortDate } from '@/lib/utils';

type Row = HumanCallbackEntry & { _brand: Project };

const PAGE_SIZE = 100;

export function CallbacksPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('callbacks.title'));

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

  const updateMutation = useMutation({
    mutationFn: (vars: { companySlug: CompanySlug; id: number; status: InquiryStatus }) =>
      inquiriesApi.update(vars.companySlug, vars.id, { status: vars.status }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['human-callbacks'] });
      void queryClient.invalidateQueries({ queryKey: ['inquiries-infinite'] });
    },
  });

  function refreshAll() {
    if (isAllBrands) multi.forEach((q) => q.refetch());
    else void single.refetch();
  }

  const errorMessage =
    firstError instanceof ApiError
      ? firstError.status === 401
        ? t('inquiries.errUnauthorized')
        : firstError.status === 403
          ? t('inquiries.errForbidden')
          : firstError.message
      : firstError
        ? t('inquiries.errGeneric')
        : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{isAllBrands ? t('brandFilter.allBrands') : activeProject.name}</span>
          <span>/</span>
          <span className="text-foreground">{t('callbacks.title')}</span>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
              {t('callbacks.title')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('callbacks.subtitle')}</p>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAll} disabled={isFetching}>
            <RefreshCcw className={cn('size-3.5', isFetching && 'animate-spin')} />
            {t('inquiries.refresh')}
          </Button>
        </div>
      </div>

      {errorMessage ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="size-4 text-rust" />
            {t('callbacks.listTitle')}
          </CardTitle>
          <CardDescription>
            {rows.length === 1
              ? t('callbacks.countSingular', { count: rows.length })
              : t('callbacks.countPlural', { count: rows.length })}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
              {t('inquiries.loading')}
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <PhoneCall className="size-6 opacity-50" />
              <span>{t('callbacks.empty')}</span>
            </div>
          ) : (
            <ul className="divide-y">
              {rows.map((c) => (
                <CallbackRow
                  key={`${c._brand.id}:${c.id}`}
                  row={c}
                  t={t}
                  bcp47={bcp47}
                  showBrand={isAllBrands}
                  onStatusChange={(status) =>
                    updateMutation.mutate({ companySlug: c._brand.companySlug, id: c.id, status })
                  }
                  isUpdating={updateMutation.isPending}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CallbackRow({
  row,
  t,
  bcp47,
  showBrand,
  onStatusChange,
  isUpdating,
}: {
  row: Row;
  t: ReturnType<typeof useT>;
  bcp47: string;
  showBrand: boolean;
  onStatusChange: (status: InquiryStatus) => void;
  isUpdating: boolean;
}) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold">{row.name}</span>
          {showBrand ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-1.5 py-0.5">
              <BrandMark brand={row._brand} size="xs" />
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {row._brand.shortName}
              </span>
            </span>
          ) : null}
        </div>
        <Badge variant="warning" className="gap-1">
          <Phone className="size-3" />
          {t('callbacks.flag')}
        </Badge>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
        {row.phone ? (
          <a
            href={`tel:${row.phone}`}
            className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          >
            <Phone className="size-3" />
            {row.phone}
          </a>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground/70">
            <Phone className="size-3" />
            {t('callbacks.noPhone')}
          </span>
        )}
        {row.email ? (
          <a href={`mailto:${row.email}`} className="truncate text-primary hover:underline">
            {row.email}
          </a>
        ) : null}
        {row.plz ? (
          <span className="inline-flex items-center gap-1">
            <MapPin className="size-3" />
            {row.plz}
          </span>
        ) : null}
        {row.service ? (
          <span className="inline-flex items-center gap-1">
            <Wrench className="size-3" />
            {row.service}
          </span>
        ) : null}
        <span className="tabular-nums">{formatShortDate(row.createdAt, bcp47)}</span>
      </div>

      {row.callReason || row.message ? (
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm leading-relaxed">
          {row.callReason ? (
            <span className="font-medium text-foreground">{row.callReason}</span>
          ) : (
            row.message
          )}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={row.status === 'in_review' ? 'default' : 'outline'}
          disabled={isUpdating || row.status === 'in_review'}
          onClick={() => onStatusChange('in_review')}
        >
          <ClipboardEdit className="size-3.5" />
          {t('callbacks.actions.reached')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isUpdating}
          onClick={() => onStatusChange('won')}
        >
          <Trophy className="size-3.5" />
          {t('inquiries.actions.won')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isUpdating}
          onClick={() => onStatusChange('lost')}
        >
          <XCircle className="size-3.5" />
          {t('inquiries.actions.lost')}
        </Button>
      </div>
    </li>
  );
}
