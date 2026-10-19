import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Tag } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import {
  errMessage,
  priceAdjustmentsAdminApi,
  type PriceAdjustment,
  type PriceAdjustmentScope,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { formatShortDate } from '@/lib/utils';

const SCOPES: PriceAdjustmentScope[] = ['global', 'service', 'zone'];

const SCOPE_LABEL: Record<PriceAdjustmentScope, DictKey> = {
  global: 'priceAdjustments.scope.global',
  service: 'priceAdjustments.scope.service',
  zone: 'priceAdjustments.scope.zone',
};

export function PriceAdjustmentsPage() {
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('priceAdjustments.title'));

  const slug = activeProject.companySlug;
  const [dialogOpen, setDialogOpen] = useState(false);

  const listQuery = useQuery({
    queryKey: ['price-adjustments', slug] as const,
    enabled: !isAllBrands,
    queryFn: ({ signal }) => priceAdjustmentsAdminApi.list(slug, undefined, signal),
  });

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
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus aria-hidden="true" />
              {t('priceAdjustments.new')}
            </Button>
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

  const rows = listQuery.data?.adjustments ?? [];

  return (
    <PageContainer width="full">
      {heading}

      <div className="flex flex-col gap-4">
        <Alert tone="info">{t('priceAdjustments.recordOnly')}</Alert>

        {listQuery.isLoading ? (
          <div className="space-y-2" role="status" aria-label={t('common.loading')}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        ) : listQuery.error && !listQuery.data ? (
          <ErrorState
            error={listQuery.error}
            onRetry={() => void listQuery.refetch()}
            retrying={listQuery.isFetching}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            variant="dashed"
            icon={<Tag aria-hidden="true" />}
            title={t('priceAdjustments.empty')}
            message={t('priceAdjustments.emptyHint')}
            action={
              <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus aria-hidden="true" />
                {t('priceAdjustments.new')}
              </Button>
            }
          />
        ) : (
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('priceAdjustments.colScope')}</TableHead>
                  <TableHead className="text-right">{t('priceAdjustments.colPercent')}</TableHead>
                  <TableHead>{t('priceAdjustments.colReason')}</TableHead>
                  <TableHead>{t('priceAdjustments.colValidity')}</TableHead>
                  <TableHead>{t('priceAdjustments.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('priceAdjustments.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <AdjustmentRow
                    key={row.id}
                    row={row}
                    bcp47={bcp47}
                    t={t}
                    busy={toggleMutation.isPending && toggleMutation.variables?.id === row.id}
                    onToggle={() => toggleMutation.mutate({ id: row.id, active: !row.active })}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

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
    </PageContainer>
  );
}

function AdjustmentRow({
  row,
  bcp47,
  t,
  busy,
  onToggle,
}: {
  row: PriceAdjustment;
  bcp47: string;
  t: ReturnType<typeof useT>;
  busy: boolean;
  onToggle: () => void;
}) {
  const validity = [
    row.validFrom ? formatShortDate(row.validFrom, bcp47) : null,
    row.validTo ? formatShortDate(row.validTo, bcp47) : null,
  ];
  return (
    <TableRow>
      <TableCell>
        {t(SCOPE_LABEL[row.scope])}
        {row.scopeKey ? <span className="text-muted-foreground"> · {row.scopeKey}</span> : null}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {Number(row.adjustmentPercent) > 0 ? '+' : ''}
        {row.adjustmentPercent}%
      </TableCell>
      <TableCell className="max-w-xs truncate text-muted-foreground">{row.reason ?? '—'}</TableCell>
      <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
        {validity[0] || validity[1] ? `${validity[0] ?? '…'} – ${validity[1] ?? '…'}` : '—'}
      </TableCell>
      <TableCell>
        <StatusBadge
          label={
            row.active ? t('priceAdjustments.statusActive') : t('priceAdjustments.statusInactive')
          }
          tone={row.active ? 'success' : 'neutral'}
        />
      </TableCell>
      <TableCell className="py-2 text-right">
        <Button variant="ghost" size="xs" onClick={onToggle} loading={busy}>
          {row.active ? t('priceAdjustments.deactivate') : t('priceAdjustments.activate')}
        </Button>
      </TableCell>
    </TableRow>
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
  slug: ReturnType<typeof useProject>['activeProject']['companySlug'];
  onCreated: () => void;
  t: ReturnType<typeof useT>;
}) {
  const [scope, setScope] = useState<PriceAdjustmentScope>('global');
  const [scopeKey, setScopeKey] = useState('');
  const [percent, setPercent] = useState('');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      priceAdjustmentsAdminApi.create(slug, {
        scope,
        scopeKey: scope === 'global' ? undefined : scopeKey.trim() || undefined,
        adjustmentPercent: Number(percent),
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

  const percentValue = Number(percent);
  const valid =
    percent.trim() !== '' &&
    !Number.isNaN(percentValue) &&
    percentValue >= -100 &&
    percentValue <= 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('priceAdjustments.new')}</DialogTitle>
          <DialogDescription>{t('priceAdjustments.recordOnly')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
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

          <FormField label={t('priceAdjustments.percentLabel')} htmlFor="pa-percent" required>
            <Input
              id="pa-percent"
              type="number"
              inputMode="decimal"
              min={-100}
              max={100}
              step={0.5}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              required
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
