import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, MapPin, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { useT, type DictKey } from '@/i18n';
import { cityStatusAdminApi, errMessage, type CityStatus, type CityStatusValue } from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';

const STATUSES: CityStatusValue[] = ['locked', 'soft_launch', 'active', 'scaling'];

const STATUS_LABEL: Record<CityStatusValue, DictKey> = {
  locked: 'cityStatus.status.locked',
  soft_launch: 'cityStatus.status.soft_launch',
  active: 'cityStatus.status.active',
  scaling: 'cityStatus.status.scaling',
};

const STATUS_TONE: Record<CityStatusValue, 'neutral' | 'info' | 'success' | 'warning'> = {
  locked: 'neutral',
  soft_launch: 'info',
  active: 'success',
  scaling: 'warning',
};

export function CityStatusPage() {
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  usePageTitle(t('cityStatus.title'));

  const slug = activeProject.companySlug;
  const [statusFilter, setStatusFilter] = useState<CityStatusValue | 'all'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CityStatus | null>(null);

  const listQuery = useQuery({
    queryKey: ['city-status', slug, statusFilter] as const,
    enabled: !isAllBrands,
    queryFn: ({ signal }) =>
      cityStatusAdminApi.list(slug, statusFilter === 'all' ? undefined : statusFilter, signal),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['city-status', slug] });

  const statusMutation = useMutation({
    mutationFn: (vars: { id: number; status: CityStatusValue }) =>
      cityStatusAdminApi.update(slug, vars.id, { status: vars.status }),
    onSuccess: invalidate,
    onError: (err) => toast.error(errMessage(err)),
  });

  const recomputeMutation = useMutation({
    mutationFn: (id: number) => cityStatusAdminApi.recompute(slug, id),
    onSuccess: invalidate,
    onError: (err) => toast.error(errMessage(err)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => cityStatusAdminApi.remove(slug, id),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(errMessage(err));
      setDeleteTarget(null);
    },
  });

  const heading = (
    <PageHeading
      breadcrumb={
        <span className="flex items-center gap-2">
          <span>{isAllBrands ? t('brandFilter.allBrands') : activeProject.name}</span>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{t('cityStatus.title')}</span>
        </span>
      }
      title={t('cityStatus.title')}
      subtitle={t('cityStatus.subtitle')}
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
              {t('cityStatus.new')}
            </Button>
          </div>
        )
      }
    />
  );

  if (isAllBrands) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        {heading}
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<MapPin className="size-8" aria-hidden="true" />}
              message={t('cityStatus.selectBrandFirst')}
            />
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = listQuery.data?.cities ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl">
      {heading}

      <div
        className="mb-4 flex flex-wrap items-center gap-2"
        role="group"
        aria-label={t('cityStatus.filterStatus')}
      >
        {(['all', ...STATUSES] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={statusFilter === value}
            onClick={() => setStatusFilter(value)}
            className={
              'inline-flex h-11 items-center rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ' +
              (statusFilter === value
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'border-border bg-card text-foreground/80 hover:bg-muted')
            }
          >
            {value === 'all' ? t('cityStatus.filterAll') : t(STATUS_LABEL[value])}
          </button>
        ))}
      </div>

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
              icon={<MapPin className="size-8" aria-hidden="true" />}
              title={t('cityStatus.empty')}
              message={t('cityStatus.emptyHint')}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('cityStatus.colCity')}</TableHead>
                  <TableHead>{t('cityStatus.colStatus')}</TableHead>
                  <TableHead>{t('cityStatus.colPartners')}</TableHead>
                  <TableHead>{t('cityStatus.colOrders')}</TableHead>
                  <TableHead>{t('cityStatus.colPerPartner')}</TableHead>
                  <TableHead className="text-right">{t('cityStatus.colActions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <CityRow
                    key={row.id}
                    row={row}
                    t={t}
                    statusBusy={statusMutation.isPending && statusMutation.variables?.id === row.id}
                    recomputeBusy={
                      recomputeMutation.isPending && recomputeMutation.variables === row.id
                    }
                    onStatusChange={(status) => statusMutation.mutate({ id: row.id, status })}
                    onRecompute={() => recomputeMutation.mutate(row.id)}
                    onDelete={() => setDeleteTarget(row)}
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

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title={t('cityStatus.deleteAction')}
        description={t('cityStatus.confirmDelete')}
        confirmLabel={t('cityStatus.deleteAction')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />
    </div>
  );
}

function CityRow({
  row,
  t,
  statusBusy,
  recomputeBusy,
  onStatusChange,
  onRecompute,
  onDelete,
}: {
  row: CityStatus;
  t: ReturnType<typeof useT>;
  statusBusy: boolean;
  recomputeBusy: boolean;
  onStatusChange: (status: CityStatusValue) => void;
  onRecompute: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{row.city}</span>
        <span className="block text-xs tabular-nums text-muted-foreground">{row.plzPrefix}</span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <StatusBadge label={t(STATUS_LABEL[row.status])} tone={STATUS_TONE[row.status]} />
          <label className="sr-only" htmlFor={`city-status-${row.id}`}>
            {t('cityStatus.statusLabel')}
          </label>
          <Select
            id={`city-status-${row.id}`}
            className="h-9 w-auto"
            value={row.status}
            disabled={statusBusy}
            onChange={(e) => onStatusChange(e.target.value as CityStatusValue)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_LABEL[s])}
              </option>
            ))}
          </Select>
        </div>
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {t('cityStatus.metricPartners', {
          active: row.activePartnerCount,
          total: row.partnerCount,
        })}
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">{row.orderCount30d}</TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {row.ordersPerPartner ?? '—'}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onRecompute} disabled={recomputeBusy}>
            {recomputeBusy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCcw className="size-4" aria-hidden="true" />
            )}
            {recomputeBusy ? t('cityStatus.recomputing') : t('cityStatus.recompute')}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={onDelete}
            aria-label={t('cityStatus.deleteAction')}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
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
  const [city, setCity] = useState('');
  const [plzPrefix, setPlzPrefix] = useState('');
  const [status, setStatus] = useState<CityStatusValue>('locked');
  const [seoPageGenerated, setSeo] = useState(false);
  const [googleAdsActive, setAds] = useState(false);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      cityStatusAdminApi.create(slug, {
        city: city.trim(),
        plzPrefix: plzPrefix.trim(),
        status,
        seoPageGenerated,
        googleAdsActive,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      setCity('');
      setPlzPrefix('');
      setStatus('locked');
      setSeo(false);
      setAds(false);
      setNotes('');
      onCreated();
    },
    onError: (err) => toast.error(errMessage(err)),
  });

  const valid = city.trim() !== '' && /^\d{1,5}$/.test(plzPrefix.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] sm:max-w-md">
        <DialogTitle>{t('cityStatus.new')}</DialogTitle>
        <DialogDescription>{t('cityStatus.subtitle')}</DialogDescription>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-city">{t('cityStatus.cityLabel')}</Label>
            <Input
              id="cs-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={120}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-plz">{t('cityStatus.plzPrefixLabel')}</Label>
            <Input
              id="cs-plz"
              value={plzPrefix}
              onChange={(e) => setPlzPrefix(e.target.value.replace(/\D/g, '').slice(0, 5))}
              inputMode="numeric"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-status">{t('cityStatus.statusLabel')}</Label>
            <Select
              id="cs-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as CityStatusValue)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(STATUS_LABEL[s])}
                </option>
              ))}
            </Select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={seoPageGenerated} onChange={(e) => setSeo(e.target.checked)} />
            {t('cityStatus.seoLabel')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={googleAdsActive} onChange={(e) => setAds(e.target.checked)} />
            {t('cityStatus.adsLabel')}
          </label>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cs-notes">{t('cityStatus.notesLabel')}</Label>
            <Textarea
              id="cs-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              {mutation.isPending ? t('cityStatus.creating') : t('cityStatus.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
