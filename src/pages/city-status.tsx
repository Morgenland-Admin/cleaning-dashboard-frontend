import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MapPin, Plus, RefreshCcw, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedControl } from '@/components/ui/segmented-control';
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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import { cityStatusAdminApi, errMessage, type CityStatus, type CityStatusValue } from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn } from '@/lib/utils';

const STATUSES: CityStatusValue[] = ['locked', 'soft_launch', 'active', 'scaling'];

const STATUS_LABEL: Record<CityStatusValue, DictKey> = {
  locked: 'cityStatus.status.locked',
  soft_launch: 'cityStatus.status.soft_launch',
  active: 'cityStatus.status.active',
  scaling: 'cityStatus.status.scaling',
};

const STATUS_DOT: Record<CityStatusValue, string> = {
  locked: 'bg-muted-foreground',
  soft_launch: 'bg-info',
  active: 'bg-success',
  scaling: 'bg-warning',
};

export function CityStatusPage() {
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  usePageTitle(t('cityStatus.title'));
  const canWrite = useCanWrite();

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
      breadcrumb={[
        { label: isAllBrands ? t('brandFilter.allBrands') : activeProject.name },
        { label: t('cityStatus.title') },
      ]}
      title={t('cityStatus.title')}
      subtitle={t('cityStatus.subtitle')}
      actions={
        isAllBrands ? undefined : (
          <>
            <RefreshButton
              onClick={() => void listQuery.refetch()}
              fetching={listQuery.isFetching}
            />
            {canWrite ? (
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus aria-hidden="true" />
                {t('cityStatus.new')}
              </Button>
            ) : null}
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
          icon={<MapPin aria-hidden="true" />}
          message={t('cityStatus.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  const rows = listQuery.data?.cities ?? [];

  return (
    <PageContainer width="full">
      {heading}

      <SegmentedControl
        label={t('cityStatus.filterStatus')}
        value={statusFilter}
        onValueChange={setStatusFilter}
        overflow="scroll"
        className="mb-4 self-start"
        options={(['all', ...STATUSES] as const).map((value) => ({
          value,
          label: value === 'all' ? t('cityStatus.filterAll') : t(STATUS_LABEL[value]),
        }))}
      />

      {listQuery.isLoading ? (
        <div className="space-y-2" role="status" aria-label={t('common.loading')}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-11 w-full rounded-lg" />
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
          icon={<MapPin aria-hidden="true" />}
          title={t('cityStatus.empty')}
          message={t('cityStatus.emptyHint')}
          action={
            canWrite ? (
              <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                <Plus aria-hidden="true" />
                {t('cityStatus.new')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto lg:max-h-[calc(100svh-17rem)] lg:overflow-y-auto lg:overscroll-contain">
            <Table containerClassName="w-full">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>{t('cityStatus.colCity')}</TableHead>
                  <TableHead>{t('cityStatus.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('cityStatus.colPartners')}</TableHead>
                  <TableHead className="text-right">{t('cityStatus.colOrders')}</TableHead>
                  <TableHead className="text-right">{t('cityStatus.colPerPartner')}</TableHead>
                  {canWrite ? (
                    <TableHead className="w-24 text-right">{t('cityStatus.colActions')}</TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <CityRow
                    key={row.id}
                    row={row}
                    t={t}
                    canWrite={canWrite}
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
          </div>
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
    </PageContainer>
  );
}

function CityRow({
  row,
  t,
  canWrite,
  statusBusy,
  recomputeBusy,
  onStatusChange,
  onRecompute,
  onDelete,
}: {
  row: CityStatus;
  t: ReturnType<typeof useT>;
  canWrite: boolean;
  statusBusy: boolean;
  recomputeBusy: boolean;
  onStatusChange: (status: CityStatusValue) => void;
  onRecompute: () => void;
  onDelete: () => void;
}) {
  return (
    <TableRow>
      <TableCell className="py-1.5">
        <span className="font-medium">{row.city}</span>
        <span className="ml-2 font-mono text-xs tabular-nums text-muted-foreground">
          {row.plzPrefix}
        </span>
      </TableCell>
      <TableCell className="py-1.5">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={cn(
              'size-2 shrink-0 rounded-full',
              STATUS_DOT[row.status] ?? 'bg-muted-foreground',
            )}
          />
          {canWrite ? (
            <>
              <Label className="sr-only" htmlFor={`city-status-${row.id}`}>
                {t('cityStatus.statusLabel')}
              </Label>
              <Select<CityStatusValue>
                id={`city-status-${row.id}`}
                size="sm"
                className="w-auto min-w-36"
                value={row.status}
                disabled={statusBusy}
                onValueChange={onStatusChange}
                options={STATUSES.map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))}
              />
            </>
          ) : (
            <span className="text-2sm">
              {(STATUS_LABEL[row.status] && t(STATUS_LABEL[row.status])) || row.status}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right tabular-nums">
        {t('cityStatus.metricPartners', {
          active: row.activePartnerCount,
          total: row.partnerCount,
        })}
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.orderCount30d}</TableCell>
      <TableCell className="text-right tabular-nums">{row.ordersPerPartner ?? '—'}</TableCell>
      {canWrite ? (
        <TableCell className="py-1.5 text-right">
          <div className="flex justify-end gap-1">
            <RowAction
              label={recomputeBusy ? t('cityStatus.recomputing') : t('cityStatus.recompute')}
              subject={row.city}
              onClick={onRecompute}
              loading={recomputeBusy}
            >
              <RefreshCcw aria-hidden="true" />
            </RowAction>
            <RowAction
              label={t('cityStatus.deleteAction')}
              subject={row.city}
              onClick={onDelete}
              danger
            >
              <Trash2 aria-hidden="true" />
            </RowAction>
          </div>
        </TableCell>
      ) : null}
    </TableRow>
  );
}

// The accessible name carries the row's city, so the button list isn't ten identical "Löschen" entries.
function RowAction({
  label,
  subject,
  onClick,
  loading,
  danger,
  children,
}: {
  label: string;
  subject: string;
  onClick: () => void;
  loading?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${label}: ${subject}`}
          onClick={onClick}
          loading={loading}
          className={cn(
            danger
              ? 'text-destructive hover:bg-destructive-soft hover:text-destructive'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('cityStatus.new')}</DialogTitle>
          <DialogDescription>{t('cityStatus.subtitle')}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) mutation.mutate();
          }}
        >
          <FormField label={t('cityStatus.cityLabel')} htmlFor="cs-city" required>
            <Input
              id="cs-city"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              maxLength={120}
              required
            />
          </FormField>

          <FormField
            label={t('cityStatus.plzPrefixLabel')}
            htmlFor="cs-plz"
            hint={t('cityStatus.plzPrefixHint')}
            required
          >
            <Input
              id="cs-plz"
              value={plzPrefix}
              onChange={(e) => setPlzPrefix(e.target.value.replace(/\D/g, '').slice(0, 5))}
              inputMode="numeric"
              className="font-mono tabular-nums"
              required
            />
          </FormField>

          <FormField label={t('cityStatus.statusLabel')} htmlFor="cs-status">
            <Select<CityStatusValue>
              id="cs-status"
              value={status}
              onValueChange={setStatus}
              options={STATUSES.map((s) => ({ value: s, label: t(STATUS_LABEL[s]) }))}
            />
          </FormField>

          {/* The backend only accepts these two flags on create. */}
          <div className="flex flex-col gap-2.5">
            <label htmlFor="cs-seo" className="flex cursor-pointer items-center gap-2 text-2sm">
              <Checkbox
                id="cs-seo"
                checked={seoPageGenerated}
                onChange={(e) => setSeo(e.target.checked)}
              />
              {t('cityStatus.seoLabel')}
            </label>
            <label htmlFor="cs-ads" className="flex cursor-pointer items-center gap-2 text-2sm">
              <Checkbox
                id="cs-ads"
                checked={googleAdsActive}
                onChange={(e) => setAds(e.target.checked)}
              />
              {t('cityStatus.adsLabel')}
            </label>
          </div>

          <FormField label={t('cityStatus.notesLabel')} htmlFor="cs-notes">
            <Textarea
              id="cs-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
              {mutation.isPending ? t('cityStatus.creating') : t('cityStatus.create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
