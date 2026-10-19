import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag } from 'lucide-react';
import { useMemo, useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { FilterChip } from '@/components/filter-chip';
import { FormField } from '@/components/form-field';
import { InfiniteScrollSentinel } from '@/components/infinite-scroll-sentinel';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  errMessage,
  priceAdjustmentsAdminApi,
  type PriceAdjustment,
  type PriceAdjustmentScope,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { formatShortDate } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

const SCOPES: PriceAdjustmentScope[] = ['global', 'service', 'zone'];

const SCOPE_LABEL: Record<PriceAdjustmentScope, DictKey> = {
  global: 'priceAdjustments.scope.global',
  service: 'priceAdjustments.scope.service',
  zone: 'priceAdjustments.scope.zone',
};

type Translate = ReturnType<typeof useT>;

function scopeText(t: Translate, row: PriceAdjustment): string {
  const key = SCOPE_LABEL[row.scope];
  return key ? t(key) : row.scope;
}

/** "+2,5 %" in the UI locale; the API stores a decimal string. */
function percentText(value: string, bcp47: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return `${value} %`;
  const formatted = new Intl.NumberFormat(bcp47, {
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  }).format(n);
  return `${formatted} %`;
}

function validityText(row: PriceAdjustment, bcp47: string): string {
  const from = row.validFrom ? formatShortDate(row.validFrom, bcp47) : null;
  const to = row.validTo ? formatShortDate(row.validTo, bcp47) : null;
  return from || to ? `${from ?? '…'} – ${to ?? '…'}` : '—';
}

/** "2,5", "-3" or "1.5" → number; null when it is not one. */
function parsePercent(raw: string): number | null {
  const v = raw.trim().replace(',', '.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(v)) return null;
  return Number(v);
}

export function PriceAdjustmentsPage() {
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  const canWrite = useCanWrite();
  usePageTitle(t('priceAdjustments.title'));

  const slug = activeProject.companySlug;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);

  const listQuery = useInfiniteQuery({
    queryKey: ['price-adjustments', slug, activeOnly] as const,
    enabled: !isAllBrands,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      priceAdjustmentsAdminApi.list(
        slug,
        { active: activeOnly ? true : undefined, limit: 50, cursor: pageParam ?? undefined },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = useMemo(
    () => listQuery.data?.pages.flatMap((p) => p.adjustments) ?? [],
    [listQuery.data],
  );

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['price-adjustments', slug] });

  const toggleMutation = useMutation({
    mutationFn: (vars: { id: number; active: boolean }) =>
      priceAdjustmentsAdminApi.setActive(slug, vars.id, vars.active),
    onSuccess: (_data, vars) => {
      invalidate();
      toast.success(
        vars.active ? t('priceAdjustments.activatedToast') : t('priceAdjustments.deactivatedToast'),
      );
    },
    onError: (err) => toast.error(errMessage(err)),
  });

  const newButton = canWrite ? (
    <Button size="sm" onClick={() => setDialogOpen(true)}>
      <Plus aria-hidden="true" />
      {t('priceAdjustments.new')}
    </Button>
  ) : null;

  const heading = (
    <PageHeading
      breadcrumb={[
        { label: isAllBrands ? t('brandFilter.allBrands') : activeProject.name },
        { label: t('priceAdjustments.title') },
      ]}
      title={t('priceAdjustments.title')}
      subtitle={t('priceAdjustments.subtitle')}
      actions={
        isAllBrands ? undefined : (
          <>
            <RefreshButton
              onClick={() => void listQuery.refetch()}
              fetching={listQuery.isFetching}
            />
            {newButton}
          </>
        )
      }
    />
  );

  if (isAllBrands) {
    return (
      <PageContainer width="full">
        {heading}
        <EmptyState
          variant="dashed"
          icon={<Tag aria-hidden="true" />}
          message={t('priceAdjustments.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  const toggleFor = (row: PriceAdjustment) =>
    canWrite
      ? {
          busy: toggleMutation.isPending && toggleMutation.variables?.id === row.id,
          onToggle: () => toggleMutation.mutate({ id: row.id, active: !row.active }),
        }
      : null;

  return (
    <PageContainer width="full">
      {heading}

      <div className="flex flex-col gap-4">
        <Alert tone="info">{t('priceAdjustments.recordOnly')}</Alert>

        <FilterChip pressed={activeOnly} onPressedChange={setActiveOnly} className="self-start">
          {t('priceAdjustments.onlyActive')}
        </FilterChip>

        {listQuery.isLoading ? (
          <div className="space-y-2" role="status" aria-label={t('common.loading')}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : listQuery.error && rows.length === 0 ? (
          <ErrorState
            error={listQuery.error}
            onRetry={() => void listQuery.refetch()}
            retrying={listQuery.isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            variant="dashed"
            icon={<Tag aria-hidden="true" />}
            title={activeOnly ? t('priceAdjustments.emptyActive') : t('priceAdjustments.empty')}
            message={t('priceAdjustments.emptyHint')}
            action={activeOnly ? undefined : newButton}
          />
        ) : (
          <>
            <ul className="divide-y divide-border rounded-lg border border-border bg-card md:hidden">
              {rows.map((row) => {
                const toggle = toggleFor(row);
                return (
                  <li key={row.id} className="flex items-start gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-2sm font-semibold tabular-nums">
                          {percentText(row.adjustmentPercent, bcp47)}
                        </span>
                        <span className="text-2sm text-foreground">
                          {scopeText(t, row)}
                          {row.scopeKey ? (
                            <span className="text-muted-foreground"> · {row.scopeKey}</span>
                          ) : null}
                        </span>
                        <ActiveBadge active={row.active} t={t} />
                      </div>
                      {row.reason ? (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {row.reason}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
                        {validityText(row, bcp47)}
                      </p>
                    </div>
                    {toggle ? <ToggleButton row={row} t={t} {...toggle} /> : null}
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-hidden rounded-lg border border-border bg-card md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('priceAdjustments.colScope')}</TableHead>
                    <TableHead className="text-right">{t('priceAdjustments.colPercent')}</TableHead>
                    <TableHead>{t('priceAdjustments.colReason')}</TableHead>
                    <TableHead>{t('priceAdjustments.colValidity')}</TableHead>
                    <TableHead>{t('priceAdjustments.colStatus')}</TableHead>
                    {canWrite ? (
                      <TableHead className="text-right">
                        <span className="sr-only">{t('priceAdjustments.colActions')}</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => {
                    const toggle = toggleFor(row);
                    return (
                      <TableRow key={row.id}>
                        <TableCell>
                          {scopeText(t, row)}
                          {row.scopeKey ? (
                            <span className="text-muted-foreground"> · {row.scopeKey}</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {percentText(row.adjustmentPercent, bcp47)}
                        </TableCell>
                        <TableCell
                          className="max-w-xs truncate text-muted-foreground"
                          title={row.reason ?? undefined}
                        >
                          {row.reason ?? '—'}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                          {validityText(row, bcp47)}
                        </TableCell>
                        <TableCell>
                          <ActiveBadge active={row.active} t={t} />
                        </TableCell>
                        {toggle ? (
                          <TableCell className="py-2 text-right">
                            <ToggleButton row={row} t={t} {...toggle} />
                          </TableCell>
                        ) : null}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <InfiniteScrollSentinel
              hasMore={!!listQuery.hasNextPage}
              isLoading={listQuery.isFetchingNextPage}
              onIntersect={() => {
                void listQuery.fetchNextPage();
              }}
            />
          </>
        )}
      </div>

      {canWrite ? (
        <CreateDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          slug={slug}
          onCreated={() => {
            invalidate();
            setDialogOpen(false);
            toast.success(t('priceAdjustments.createdToast'));
          }}
          t={t}
        />
      ) : null}
    </PageContainer>
  );
}

function ActiveBadge({ active, t }: { active: boolean; t: Translate }) {
  return (
    <StatusBadge
      label={active ? t('priceAdjustments.statusActive') : t('priceAdjustments.statusInactive')}
      tone={active ? 'success' : 'neutral'}
    />
  );
}

function ToggleButton({
  row,
  t,
  busy,
  onToggle,
}: {
  row: PriceAdjustment;
  t: Translate;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <Button variant="outline" size="sm" onClick={onToggle} loading={busy} className="shrink-0">
      {row.active ? t('priceAdjustments.deactivate') : t('priceAdjustments.activate')}
    </Button>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  slug,
  onCreated,
  t,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: CompanySlug;
  onCreated: () => void;
  t: Translate;
}) {
  const [scope, setScope] = useState<PriceAdjustmentScope>('global');
  const [scopeKey, setScopeKey] = useState('');
  const [percent, setPercent] = useState('');
  const [reason, setReason] = useState('');

  const percentValue = parsePercent(percent);
  const valid = percentValue !== null && percentValue >= -100 && percentValue <= 100;
  const showPercentError = percent.trim() !== '' && !valid;

  const mutation = useMutation({
    mutationFn: () =>
      priceAdjustmentsAdminApi.create(slug, {
        scope,
        scopeKey: scope === 'global' ? undefined : scopeKey.trim() || undefined,
        adjustmentPercent: percentValue ?? 0,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      setScope('global');
      setScopeKey('');
      setPercent('');
      setReason('');
      onCreated();
    },
    onError: (err) => toast.error(errMessage(err)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('priceAdjustments.new')}</DialogTitle>
          <DialogDescription>{t('priceAdjustments.recordOnly')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <FormField label={t('priceAdjustments.scopeLabel')} htmlFor="pa-scope">
            <Select<PriceAdjustmentScope>
              id="pa-scope"
              value={scope}
              onValueChange={setScope}
              options={SCOPES.map((s) => ({ value: s, label: t(SCOPE_LABEL[s]) }))}
            />
          </FormField>

          {scope !== 'global' ? (
            <FormField label={t('priceAdjustments.scopeKeyLabel')} htmlFor="pa-key">
              <Input
                id="pa-key"
                value={scopeKey}
                onChange={(e) => setScopeKey(e.target.value)}
                maxLength={64}
              />
            </FormField>
          ) : null}

          <FormField
            label={t('priceAdjustments.percentLabel')}
            htmlFor="pa-percent"
            required
            hint={t('priceAdjustments.percentHint')}
            error={showPercentError ? t('priceAdjustments.percentInvalid') : undefined}
          >
            <Input
              id="pa-percent"
              inputMode="decimal"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="2,5"
              className="tabular-nums"
            />
          </FormField>

          <FormField label={t('priceAdjustments.reasonLabel')} htmlFor="pa-reason">
            <Textarea
              id="pa-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
            />
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!valid} loading={mutation.isPending}>
              {mutation.isPending ? t('priceAdjustments.creating') : t('priceAdjustments.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
