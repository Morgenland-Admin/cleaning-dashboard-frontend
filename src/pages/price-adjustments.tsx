import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, RefreshCcw, Tag } from 'lucide-react';
import { useState } from 'react';

import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    onSuccess: invalidate,
    onError: (err) => toast.error(errMessage(err)),
  });

  const heading = (
    <PageHeading
      breadcrumb={
        <span className="flex items-center gap-2">
          <span>{isAllBrands ? t('brandFilter.allBrands') : activeProject.name}</span>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{t('priceAdjustments.title')}</span>
        </span>
      }
      title={t('priceAdjustments.title')}
      subtitle={t('priceAdjustments.subtitle')}
      actions={
        isAllBrands ? undefined : (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="h-11"
              onClick={() => void listQuery.refetch()}
              disabled={listQuery.isFetching}
            >
              <RefreshCcw
                className={listQuery.isFetching ? 'size-4 animate-spin' : 'size-4'}
                aria-hidden="true"
              />
              {t('common.refresh')}
            </Button>
            <Button className="h-11" onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              {t('priceAdjustments.new')}
            </Button>
          </div>
        )
      }
    />
  );

  if (isAllBrands) {
    return (
      <div className="mx-auto w-full max-w-4xl">
        {heading}
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Tag className="size-8" aria-hidden="true" />}
              message={t('priceAdjustments.selectBrandFirst')}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = listQuery.data?.adjustments ?? [];

  return (
    <div className="mx-auto w-full max-w-4xl">
      {heading}

      <p className="mb-4 text-sm text-muted-foreground">{t('priceAdjustments.recordOnly')}</p>

      {listQuery.isLoading ? (
        <div className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Tag className="size-8" aria-hidden="true" />}
              title={t('priceAdjustments.empty')}
              message={t('priceAdjustments.emptyHint')}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('priceAdjustments.colScope')}</TableHead>
                  <TableHead>{t('priceAdjustments.colPercent')}</TableHead>
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
          </CardContent>
        </Card>
      )}

      <CreateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        slug={slug}
        onCreated={() => {
          invalidate();
          setDialogOpen(false);
        }}
        t={t}
      />
    </div>
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
      <TableCell className="tabular-nums">
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
      <TableCell className="text-right">
        <Button variant="outline" size="sm" onClick={onToggle} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
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
      <DialogContent className="w-[94vw] sm:max-w-md">
        <DialogTitle>{t('priceAdjustments.new')}</DialogTitle>
        <DialogDescription>{t('priceAdjustments.recordOnly')}</DialogDescription>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-scope">{t('priceAdjustments.scopeLabel')}</Label>
            <Select
              id="pa-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as PriceAdjustmentScope)}
            >
              {SCOPES.map((s) => (
                <option key={s} value={s}>
                  {t(SCOPE_LABEL[s])}
                </option>
              ))}
            </Select>
          </div>

          {scope !== 'global' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pa-key">{t('priceAdjustments.scopeKeyLabel')}</Label>
              <Input
                id="pa-key"
                value={scopeKey}
                onChange={(e) => setScopeKey(e.target.value)}
                maxLength={64}
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-percent">{t('priceAdjustments.percentLabel')}</Label>
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
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pa-reason">{t('priceAdjustments.reasonLabel')}</Label>
            <Textarea
              id="pa-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
            />
          </div>

          <DialogFooter className="mt-1">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={mutation.isPending}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {mutation.isPending ? t('priceAdjustments.creating') : t('priceAdjustments.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
