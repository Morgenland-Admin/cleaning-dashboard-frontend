import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Camera,
  Download,
  Eye,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { LoadingState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading, type Crumb } from '@/components/page-heading';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateTimePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  catalogApi,
  ordersAdminApi,
  uploadsAdminApi,
  type CatalogTier,
  type OrderRow,
  type ReceiptContext,
  type ReceiptDraft,
  type ReceiptPhoto,
  type ReceiptPreview,
} from '@/lib/api';
import { centsToInput } from '@/lib/line-items';
import {
  MAX_PHOTOS,
  MAX_PHOTOS_PER_ITEM,
  effectiveQuantity,
  findProblem,
  formatSqm,
  isMeasured,
  itemTotalCents,
  liveTotals,
  newUid,
  pdfObjectUrl,
  toDraft,
  toEditState,
  toUploadJpeg,
  type EditItem,
  type EditState,
  type ReceiptProblem,
} from '@/lib/receipt';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency } from '@/lib/utils';

import type { CompanySlug } from '@/contexts/project-context';

type Translate = ReturnType<typeof useT>;

function problemText(t: Translate, p: ReceiptProblem): string {
  switch (p.kind) {
    case 'empty':
      return t('orders.receipt.errEmpty');
    case 'label':
      return t('orders.receipt.errLabel', { n: p.position });
    case 'dims':
      return t('orders.receipt.errDims', { n: p.position });
    case 'quantity':
      return t('orders.receipt.errQuantity', { n: p.position });
    case 'photos':
      return t('orders.receipt.photoTotalLimit', { n: MAX_PHOTOS });
  }
}

/**
 * Saving and sending write the positions back onto the order; sending also moves it to
 * "Abgeholt". The server recomputes every amount, so the totals here are a mirror.
 */
export function OrderReceiptPage() {
  const { id } = useParams();
  const orderId = id && /^\d+$/.test(id) ? Number(id) : null;
  return <OrderReceiptView key={orderId ?? 'invalid'} orderId={orderId} />;
}

function OrderReceiptView({ orderId }: { orderId: number | null }) {
  const t = useT();
  const { activeProject } = useProject();
  // Same contract as the order page: the active brand is the order's brand.
  const companySlug = activeProject.companySlug;
  const location = useLocation();
  usePageTitle(t('orders.receipt.title'));
  const orderHref = orderId != null ? `/auftraege/${orderId}` : '/auftraege';

  const detail = useQuery({
    queryKey: ['order-detail', companySlug, orderId],
    enabled: orderId != null,
    queryFn: ({ signal }) => ordersAdminApi.get(companySlug, orderId!, signal),
  });
  const ctxQuery = useQuery({
    queryKey: ['order-receipt', companySlug, orderId],
    queryFn: ({ signal }) => ordersAdminApi.getReceipt(companySlug, orderId!, signal),
    enabled: orderId != null,
    // Always start from the order as it is now, never a cached draft, and never
    // refetch underneath the operator: a new fetch remounts the editor.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const order = detail.data?.order;
  const backLink = (
    <BackLink to={orderHref} state={location.state} className="mb-3 self-start">
      {order?.orderNumber ?? t('orders.detailTitle')}
    </BackLink>
  );

  if (detail.isLoading || ctxQuery.isLoading) {
    return (
      <PageContainer>
        {backLink}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }

  const failed =
    orderId == null ? new Error(t('orders.loadFailed')) : (detail.error ?? ctxQuery.error);
  if (failed || !order || !ctxQuery.data) {
    return (
      <PageContainer>
        {backLink}
        <PageHeading title={t('orders.receipt.title')} />
        <ErrorState
          error={failed instanceof ApiError ? failed : new Error(t('orders.receipt.loadFailed'))}
          onRetry={() => {
            void detail.refetch();
            void ctxQuery.refetch();
          }}
          retrying={detail.isFetching || ctxQuery.isFetching}
        />
      </PageContainer>
    );
  }

  return (
    <ReceiptFlow
      key={ctxQuery.dataUpdatedAt}
      ctx={ctxQuery.data}
      companySlug={companySlug}
      order={order}
      orderHref={orderHref}
      breadcrumb={[
        { label: activeProject.name },
        { label: t('orders.title'), to: '/auftraege' },
        {
          label: order.orderNumber ?? t('orders.detailTitle'),
          to: orderHref,
          state: location.state,
        },
        { label: t('orders.receipt.title') },
      ]}
    />
  );
}

function ReceiptFlow({
  ctx,
  companySlug,
  order,
  orderHref,
  breadcrumb,
}: {
  ctx: ReceiptContext;
  companySlug: CompanySlug;
  order: OrderRow;
  orderHref: string;
  breadcrumb: Crumb[];
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  const [state, setState] = useState<EditState>(() => toEditState(ctx.draft));
  const [baseline, setBaseline] = useState(() => JSON.stringify(state));
  const dirty = JSON.stringify(state) !== baseline;
  const { blocker, allowLeave } = useLeaveGuard(dirty);

  const [step, setStep] = useState<'edit' | 'preview'>('edit');
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);
  const [preview, setPreview] = useState<{ data: ReceiptPreview; draft: ReceiptDraft } | null>(
    null,
  );
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pdfUrl) return;
    return () => URL.revokeObjectURL(pdfUrl);
  }, [pdfUrl]);
  const [confirmSend, setConfirmSend] = useState(false);
  const [showProblem, setShowProblem] = useState(false);

  const [localUrls, setLocalUrls] = useState<Record<string, string>>({});
  const localUrlsRef = useRef(localUrls);
  useEffect(() => {
    localUrlsRef.current = localUrls;
  }, [localUrls]);
  useEffect(() => () => Object.values(localUrlsRef.current).forEach(URL.revokeObjectURL), []);
  const [uploading, setUploading] = useState<Record<string, number>>({});

  const catalogQuery = useQuery({
    queryKey: ['catalog', companySlug],
    queryFn: ({ signal }) => catalogApi.forBrand(companySlug, signal),
    staleTime: 5 * 60 * 1000,
  });
  const carpetTiers = useMemo<CatalogTier[]>(
    () => catalogQuery.data?.services.find((s) => s.kind === 'teppichreinigung')?.tiers ?? [],
    [catalogQuery.data],
  );
  const addonTiers = catalogQuery.data?.addons ?? [];

  const totals = liveTotals(state, ctx);
  const deltaCents = totals.totalCents - order.totalCents;
  const problem = findProblem(state);
  const isUploading = Object.values(uploading).some((n) => n > 0);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['order-detail', companySlug, order.id] });
    await queryClient.invalidateQueries({
      queryKey: ['orders-infinite', companySlug],
      exact: false,
    });
    await queryClient.invalidateQueries({ queryKey: ['orders-cross'], exact: false });
  };

  const save = useMutation({
    mutationFn: () => ordersAdminApi.saveReceipt(companySlug, order.id, toDraft(state)),
    onSuccess: async (res) => {
      setBaseline(JSON.stringify(state));
      await invalidate();
      toast.success(t('orders.receipt.saved'));
      if (res.invoiceDraftStale) toast({ title: t('orders.receipt.invoiceStale') });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.receipt.saveFailed')),
  });

  const loadPreview = useMutation({
    mutationFn: (draft: ReceiptDraft) =>
      ordersAdminApi.previewReceipt(companySlug, order.id, draft).then((data) => ({ data, draft })),
    onSuccess: (res) => {
      setPreview(res);
      setPdfUrl(pdfObjectUrl(res.data.pdfBase64));
      setStep('preview');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.receipt.previewFailed')),
  });

  const send = useMutation({
    // Send exactly what was previewed, not whatever the editor holds now.
    mutationFn: (draft: ReceiptDraft) => ordersAdminApi.sendReceipt(companySlug, order.id, draft),
    onSuccess: async (res) => {
      await invalidate();
      toast.success(res.emailed ? t('orders.receipt.sent') : t('orders.receipt.sentNoMail'));
      if (res.totals.balanceCents > 0)
        toast({
          title: t('orders.receipt.balanceOpen', {
            amount: formatCurrency(res.totals.balanceCents / 100, 'EUR', bcp47),
          }),
        });
      else if (res.totals.balanceCents < 0)
        toast({
          title: t('orders.receipt.balanceCredit', {
            amount: formatCurrency(-res.totals.balanceCents / 100, 'EUR', bcp47),
          }),
        });
      if (res.invoiceDraftStale) toast({ title: t('orders.receipt.invoiceStale') });
      allowLeave();
      navigate(orderHref, { state: location.state });
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('orders.receipt.sendFailed')),
  });

  function patch(next: Partial<EditState>) {
    setState((s) => ({ ...s, ...next }));
  }
  function patchItem(uid: string, next: Partial<EditItem>) {
    setState((s) => ({
      ...s,
      items: s.items.map((it) => (it.uid === uid ? { ...it, ...next } : it)),
    }));
  }

  function setHandover(handover: EditState['handover']) {
    if (handover === state.handover) return;
    // A workshop drop-off has no pickup fee; switching back restores the booked one.
    const bookedFee = order.pickupMode === 'pickup' ? order.pickupFeeCents : 0;
    patch({ handover, pickupFee: centsToInput(handover === 'drop_off' ? 0 : bookedFee) });
  }

  function changeCarpetType(it: EditItem, tierCode: string) {
    const tier = carpetTiers.find((c) => c.code === tierCode);
    if (!tier) return;
    patchItem(it.uid, {
      code: `carpet.${tier.code}`,
      label: `Teppichreinigung · ${tier.label}`,
      unitPrice: centsToInput(tier.unitPriceCents),
      addons: it.addons.map((a) => {
        const addon = addonTiers.find((x) => `addon.${x.code}` === a.code);
        return addon ? { ...a, label: `${addon.label} (${tier.label})` } : a;
      }),
    });
  }

  function toggleAddon(it: EditItem, addon: CatalogTier, on: boolean) {
    const code = `addon.${addon.code}`;
    const typeLabel = carpetTiers.find((c) => `carpet.${c.code}` === it.code)?.label;
    patchItem(it.uid, {
      addons: on
        ? [
            ...it.addons.filter((a) => a.code !== code),
            {
              code,
              label: typeLabel ? `${addon.label} (${typeLabel})` : addon.label,
              unitPriceCents: addon.unitPriceCents,
            },
          ]
        : it.addons.filter((a) => a.code !== code),
    });
  }

  function addItem(kind: EditItem['kind']) {
    const tier = carpetTiers[0];
    const item: EditItem = {
      uid: newUid(),
      kind,
      code: kind === 'carpet' && tier ? `carpet.${tier.code}` : 'manual',
      label: kind === 'carpet' && tier ? `Teppichreinigung · ${tier.label}` : '',
      quantity: kind === 'carpet' ? '' : '1',
      unit: kind === 'carpet' ? 'm²' : 'Stück',
      unitPrice: kind === 'carpet' && tier ? centsToInput(tier.unitPriceCents) : '',
      lengthCm: '',
      widthCm: '',
      tagNumber: '',
      condition: '',
      photos: [],
      addons: [],
    };
    setState((s) => ({ ...s, items: [...s.items, item] }));
  }

  async function addPhotos(uid: string, files: File[]) {
    const item = state.items.find((it) => it.uid === uid);
    if (!item) return;
    const total = state.items.reduce((n, it) => n + it.photos.length, 0);
    const room = Math.min(MAX_PHOTOS_PER_ITEM - item.photos.length, MAX_PHOTOS - total);
    if (files.length > room)
      toast.error(
        room < MAX_PHOTOS_PER_ITEM - item.photos.length
          ? t('orders.receipt.photoTotalLimit', { n: MAX_PHOTOS })
          : t('orders.receipt.photoLimit', { n: MAX_PHOTOS_PER_ITEM }),
      );
    const picked = files.slice(0, Math.max(0, room));
    if (!picked.length) return;
    setUploading((u) => ({ ...u, [uid]: (u[uid] ?? 0) + picked.length }));
    await Promise.all(
      picked.map(async (file) => {
        try {
          const jpeg = await toUploadJpeg(file);
          const att = await uploadsAdminApi.uploadDirect(companySlug, jpeg, {
            folder: 'receipts',
          });
          const localUrl = URL.createObjectURL(jpeg);
          setLocalUrls((m) => ({ ...m, [att.key]: localUrl }));
          const photo: ReceiptPhoto = {
            key: att.key,
            name: att.name,
            size: att.size,
            ...(att.contentType ? { contentType: att.contentType } : {}),
          };
          setState((s) => ({
            ...s,
            items: s.items.map((it) =>
              it.uid === uid ? { ...it, photos: [...it.photos, photo] } : it,
            ),
          }));
        } catch (err) {
          toast.error(err instanceof ApiError ? err.message : t('orders.receipt.uploadFailed'));
        } finally {
          setUploading((u) => ({ ...u, [uid]: Math.max(0, (u[uid] ?? 1) - 1) }));
        }
      }),
    );
  }

  function goPreview() {
    if (problem) {
      setShowProblem(true);
      return;
    }
    setShowProblem(false);
    loadPreview.mutate(toDraft(state));
  }

  const header = (
    <>
      <PageHeading
        title={t('orders.receipt.title')}
        subtitle={t('orders.receipt.subtitle', {
          number: order.orderNumber,
          customer: order.customerName,
        })}
        breadcrumb={breadcrumb}
        className="mb-3"
      />
      <ol className="mb-5 flex items-center gap-2 text-2sm" aria-label={t('orders.receipt.steps')}>
        {(['edit', 'preview'] as const).map((s, i) => (
          <li
            key={s}
            aria-current={step === s ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1',
              step === s ? 'bg-primary-soft font-medium text-primary' : 'text-muted-foreground',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-5 place-items-center rounded-full text-2xs font-semibold tabular-nums',
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {i + 1}
            </span>
            {s === 'edit' ? t('orders.receipt.stepEdit') : t('orders.receipt.stepPreview')}
          </li>
        ))}
      </ol>
    </>
  );

  if (step === 'preview' && preview) {
    const lock = preview.data.moneyLockReason;
    return (
      <PageContainer>
        {header}
        <div className="space-y-4 pb-5">
          <KeyValueList layout="grid">
            <KeyValue
              label={t('orders.receipt.to')}
              value={<span className="break-all font-medium">{preview.data.to}</span>}
            />
            <KeyValue
              label={t('orders.receipt.subject')}
              value={<span className="font-medium">{preview.data.subject}</span>}
            />
          </KeyValueList>
          <Alert tone="info">
            {preview.data.statusAction === 'advance'
              ? t('orders.receipt.willAdvance', { status: t('orders.status.pickedUp') })
              : t('orders.receipt.willResend')}
          </Alert>
          {preview.data.deltaCents !== 0 && (
            <Alert tone="warning">
              {t('orders.receipt.changesTotal', {
                delta: `${preview.data.deltaCents > 0 ? '+' : ''}${formatCurrency(preview.data.deltaCents / 100, 'EUR', bcp47)}`,
              })}
            </Alert>
          )}
          {preview.data.invoiceDraftStale && (
            <Alert tone="warning">{t('orders.receipt.invoiceStale')}</Alert>
          )}
          {lock && <Alert tone="destructive">{lock}</Alert>}
          <Tabs defaultValue="email">
            <TabsList variant="line">
              <TabsTrigger value="email">{t('orders.receipt.tabEmail')}</TabsTrigger>
              <TabsTrigger value="pdf">{t('orders.receipt.tabPdf')}</TabsTrigger>
            </TabsList>
            <TabsContent value="email">
              <iframe
                title={t('orders.receipt.tabEmail')}
                srcDoc={preview.data.html}
                // No scripts; same-origin only so the frame renders in-process.
                sandbox="allow-same-origin"
                className="h-[70vh] min-h-96 w-full rounded-lg border border-border bg-white"
              />
            </TabsContent>
            <TabsContent value="pdf">
              {pdfUrl && (
                <object
                  data={`${pdfUrl}#toolbar=0`}
                  type="application/pdf"
                  aria-label={t('orders.receipt.tabPdf')}
                  className="h-[70vh] min-h-96 w-full rounded-lg border border-border bg-white"
                >
                  <a
                    href={pdfUrl}
                    download={preview.data.filename}
                    className="m-3 inline-block rounded-sm text-xs font-medium text-primary underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('orders.receipt.download')}
                  </a>
                </object>
              )}
            </TabsContent>
          </Tabs>
        </div>
        <FormActionBar>
          <Button variant="ghost" className="mr-auto" onClick={() => setStep('edit')}>
            <ArrowLeft aria-hidden="true" />
            {t('orders.receipt.back')}
          </Button>
          {pdfUrl && (
            <Button asChild variant="outline">
              <a href={pdfUrl} download={preview.data.filename}>
                <Download aria-hidden="true" />
                {t('orders.receipt.download')}
              </a>
            </Button>
          )}
          <Button onClick={() => setConfirmSend(true)} disabled={!!lock} loading={send.isPending}>
            <Send aria-hidden="true" />
            {t('orders.receipt.send')}
          </Button>
        </FormActionBar>
        <ConfirmDialog
          open={confirmSend}
          onOpenChange={setConfirmSend}
          title={t('orders.receipt.sendConfirmTitle')}
          description={t('orders.receipt.sendConfirmBody', { email: preview.data.to })}
          confirmLabel={t('orders.receipt.send')}
          isPending={send.isPending}
          onConfirm={() => {
            setConfirmSend(false);
            send.mutate(preview.draft);
          }}
        />
        <LeaveGuardDialog
          blocker={blocker}
          title={t('orders.receipt.discardTitle')}
          description={t('orders.receipt.discardBody')}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      {header}
      <div className="pb-5">
        <div className="gap-5 xl:grid xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <div className="space-y-1.5">
                {/* aria-hidden: the group's accessible name is `label`. */}
                <p aria-hidden="true" className="text-2sm font-medium leading-5 text-foreground">
                  {t('orders.receipt.handover')}
                </p>
                <SegmentedControl
                  label={t('orders.receipt.handover')}
                  value={state.handover}
                  onValueChange={setHandover}
                  options={[
                    { value: 'pickup', label: t('orders.receipt.handoverPickup') },
                    { value: 'drop_off', label: t('orders.receipt.handoverDropOff') },
                  ]}
                />
              </div>
              <FormField label={t('orders.receipt.receivedAt')}>
                <DateTimePicker
                  value={state.receivedAt}
                  onValueChange={(v) => patch({ receivedAt: v })}
                  className="sm:w-72"
                />
              </FormField>
              {state.handover === 'pickup' && (
                <FormField label={t('orders.receipt.pickupFee')}>
                  <Input
                    inputMode="decimal"
                    value={state.pickupFee}
                    onChange={(e) => patch({ pickupFee: e.target.value })}
                    className="sm:w-28"
                  />
                </FormField>
              )}
            </div>

            <section aria-labelledby="receipt-positions" className="space-y-3">
              <h3 id="receipt-positions" className="text-sm font-semibold text-foreground">
                {t('orders.receipt.positions')}
              </h3>
              {state.items.map((it, i) => (
                <ItemCard
                  key={it.uid}
                  item={it}
                  position={i + 1}
                  canRemove={state.items.length > 1}
                  carpetTiers={carpetTiers}
                  addonTiers={addonTiers}
                  companySlug={companySlug}
                  localUrls={localUrls}
                  uploading={uploading[it.uid] ?? 0}
                  bcp47={bcp47}
                  onPatch={(next) => patchItem(it.uid, next)}
                  onTypeChange={(code) => changeCarpetType(it, code)}
                  onToggleAddon={(addon, on) => toggleAddon(it, addon, on)}
                  onAddPhotos={(files) => void addPhotos(it.uid, files)}
                  onRemove={() =>
                    setState((s) => ({ ...s, items: s.items.filter((x) => x.uid !== it.uid) }))
                  }
                />
              ))}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => addItem('carpet')}>
                  <Plus aria-hidden="true" />
                  {t('orders.receipt.addCarpet')}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => addItem('other')}>
                  <Plus aria-hidden="true" />
                  {t('orders.receipt.addOther')}
                </Button>
              </div>
            </section>

            <FormField label={t('orders.receipt.note')}>
              <Textarea
                rows={2}
                value={state.note}
                onChange={(e) => patch({ note: e.target.value })}
                placeholder={t('orders.receipt.notePlaceholder')}
                maxLength={2000}
              />
            </FormField>
          </div>

          <aside className="mt-5 xl:sticky xl:top-[4.5rem] xl:mt-0 xl:self-start">
            <TotalsCard
              totals={totals}
              deltaCents={deltaCents}
              voucherCode={ctx.voucherCode}
              lockReason={deltaCents !== 0 ? ctx.moneyLockReason : null}
              bcp47={bcp47}
            />
          </aside>
        </div>
      </div>

      <FormActionBar>
        {showProblem && problem ? (
          <p role="alert" className="mr-auto flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            {problemText(t, problem)}
          </p>
        ) : null}
        <Button variant="ghost" className="hidden sm:inline-flex" asChild>
          <Link to={orderHref} state={location.state}>
            {t('common.cancel')}
          </Link>
        </Button>
        <Button
          variant="outline"
          disabled={!!problem || isUploading || !dirty}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          <Save aria-hidden="true" />
          {t('orders.receipt.save')}
        </Button>
        <Button onClick={goPreview} disabled={isUploading} loading={loadPreview.isPending}>
          <Eye aria-hidden="true" />
          {t('orders.receipt.preview')}
        </Button>
      </FormActionBar>
      <LeaveGuardDialog
        blocker={blocker}
        title={t('orders.receipt.discardTitle')}
        description={t('orders.receipt.discardBody')}
      />
    </PageContainer>
  );
}

function ItemCard({
  item,
  position,
  canRemove,
  carpetTiers,
  addonTiers,
  companySlug,
  localUrls,
  uploading,
  bcp47,
  onPatch,
  onTypeChange,
  onToggleAddon,
  onAddPhotos,
  onRemove,
}: {
  item: EditItem;
  position: number;
  canRemove: boolean;
  carpetTiers: CatalogTier[];
  addonTiers: CatalogTier[];
  companySlug: CompanySlug;
  localUrls: Record<string, string>;
  uploading: number;
  bcp47: string;
  onPatch: (next: Partial<EditItem>) => void;
  onTypeChange: (tierCode: string) => void;
  onToggleAddon: (addon: CatalogTier, on: boolean) => void;
  onAddPhotos: (files: File[]) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);
  const carpet = item.kind === 'carpet';
  const measured = isMeasured(item);
  const tierCode = item.code.startsWith('carpet.') ? item.code.slice('carpet.'.length) : '';
  const knownTier = carpetTiers.some((c) => c.code === tierCode);
  const fullPhotos = item.photos.length >= MAX_PHOTOS_PER_ITEM;
  // Extras the brand sells, plus any booked one the catalog no longer lists.
  const extras = [
    ...addonTiers.map((a) => ({ code: `addon.${a.code}`, tier: a as CatalogTier | null })),
    ...item.addons
      .filter((a) => !addonTiers.some((x) => `addon.${x.code}` === a.code))
      .map((a) => ({ code: a.code, tier: null })),
  ];

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2sm font-semibold">
          {t('orders.receipt.position', { n: position })}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">
            {formatCurrency(itemTotalCents(item) / 100, 'EUR', bcp47)}
          </span>
          {canRemove && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={t('orders.receipt.removeItem', { n: position })}
              onClick={onRemove}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr]">
        {carpet && (
          <FormField label={t('orders.receipt.type')}>
            <Select
              value={knownTier ? tierCode : ''}
              onValueChange={(v) => v !== '' && onTypeChange(v)}
              options={[
                ...(knownTier ? [] : [{ value: '', label: item.label }]),
                ...carpetTiers.map((c) => ({
                  value: c.code,
                  label: c.label,
                  meta: `${formatCurrency(c.unitPriceCents / 100, 'EUR', bcp47)}/m²`,
                })),
              ]}
            />
          </FormField>
        )}
        <FormField label={t('orders.receipt.label')} className={carpet ? '' : 'sm:col-span-2'}>
          <Input value={item.label} onChange={(e) => onPatch({ label: e.target.value })} />
        </FormField>
      </div>

      {carpet ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <FormField label={t('orders.receipt.length')}>
            <Input
              inputMode="decimal"
              value={item.lengthCm}
              onChange={(e) => onPatch({ lengthCm: e.target.value })}
            />
          </FormField>
          <FormField label={t('orders.receipt.width')}>
            <Input
              inputMode="decimal"
              value={item.widthCm}
              onChange={(e) => onPatch({ widthCm: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('orders.receipt.area')}
            hint={measured ? t('orders.receipt.areaFromSize') : undefined}
          >
            <Input
              inputMode="decimal"
              readOnly={measured}
              value={measured ? formatSqm(effectiveQuantity(item), bcp47) : item.quantity}
              onChange={(e) => onPatch({ quantity: e.target.value })}
              className={measured ? 'bg-muted/40' : undefined}
            />
          </FormField>
          <FormField label={t('orders.receipt.pricePerSqm')}>
            <Input
              inputMode="decimal"
              value={item.unitPrice}
              onChange={(e) => onPatch({ unitPrice: e.target.value })}
            />
          </FormField>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <FormField label={t('orders.receipt.quantity')}>
            <Input
              inputMode="decimal"
              value={item.quantity}
              onChange={(e) => onPatch({ quantity: e.target.value })}
            />
          </FormField>
          <FormField label={t('orders.receipt.unit')}>
            <Input
              value={item.unit}
              placeholder={t('orders.receipt.unitPlaceholder')}
              onChange={(e) => onPatch({ unit: e.target.value })}
            />
          </FormField>
          <FormField label={t('orders.receipt.unitPrice')}>
            <Input
              inputMode="decimal"
              value={item.unitPrice}
              onChange={(e) => onPatch({ unitPrice: e.target.value })}
            />
          </FormField>
        </div>
      )}

      {carpet && extras.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-2sm font-medium leading-5 text-foreground">
            {t('orders.receipt.extras')}
          </legend>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {extras.map(({ code, tier }) => {
              const booked = item.addons.find((a) => a.code === code);
              // A booked extra keeps its booked price; the catalog price is for new ones.
              const price = booked?.unitPriceCents ?? tier?.unitPriceCents ?? 0;
              return (
                <label key={code} className="flex cursor-pointer items-center gap-2 text-2sm">
                  <Checkbox
                    checked={!!booked}
                    onChange={(e) =>
                      tier
                        ? onToggleAddon(tier, e.target.checked)
                        : onPatch({ addons: item.addons.filter((a) => a.code !== code) })
                    }
                  />
                  <span>
                    {tier?.label ?? booked?.label}{' '}
                    <span className="text-muted-foreground">
                      {t('orders.receipt.perSqm', {
                        price: formatCurrency(price / 100, 'EUR', bcp47),
                      })}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      )}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,10rem)_1fr]">
        <FormField label={t('orders.receipt.tag')}>
          <Input
            value={item.tagNumber}
            maxLength={40}
            onChange={(e) => onPatch({ tagNumber: e.target.value })}
          />
        </FormField>
        <FormField label={t('orders.receipt.condition')}>
          <Textarea
            rows={2}
            value={item.condition}
            maxLength={1000}
            placeholder={t('orders.receipt.conditionPlaceholder')}
            onChange={(e) => onPatch({ condition: e.target.value })}
          />
        </FormField>
      </div>

      <div className="space-y-1.5">
        <p className="text-2sm font-medium leading-5 text-foreground">
          {t('orders.receipt.photos')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {item.photos.map((p, i) => (
            <PhotoThumb
              key={p.key}
              companySlug={companySlug}
              photo={p}
              localUrl={localUrls[p.key]}
              alt={t('orders.receipt.photoAlt', { n: i + 1, pos: position })}
              removeLabel={t('orders.receipt.removePhoto', { n: i + 1 })}
              onRemove={() => onPatch({ photos: item.photos.filter((x) => x.key !== p.key) })}
            />
          ))}
          {uploading > 0 &&
            Array.from({ length: uploading }, (_, i) => (
              <div
                key={`up-${i}`}
                role="status"
                className="flex size-20 items-center justify-center rounded-md border border-dashed border-border-strong"
                aria-label={t('orders.receipt.uploading')}
              >
                <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
              </div>
            ))}
          {!fullPhotos && (
            <>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="flex size-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong px-1 text-center text-2xs text-muted-foreground transition-colors duration-fast hover:bg-accent/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Camera className="size-4" aria-hidden="true" />
                {t('orders.receipt.addPhotos')}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                onChange={(e) => {
                  const files = Array.from(e.target.files ?? []);
                  e.target.value = '';
                  if (files.length) onAddPhotos(files);
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PhotoThumb({
  companySlug,
  photo,
  localUrl,
  alt,
  removeLabel,
  onRemove,
}: {
  companySlug: CompanySlug;
  photo: ReceiptPhoto;
  localUrl: string | undefined;
  alt: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  // Same cache key as AttachmentGallery — backend TTL is 10 min, keep 8.
  const signed = useQuery({
    queryKey: ['upload-url', companySlug, photo.key],
    queryFn: ({ signal }) => uploadsAdminApi.signDownload(companySlug, photo.key, signal),
    enabled: !localUrl,
    staleTime: 8 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
  const src = localUrl ?? signed.data?.downloadUrl;
  return (
    <div className="relative size-20 overflow-hidden rounded-md border border-border bg-muted">
      {src ? (
        <img src={src} alt={alt} className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      )}
      <button
        type="button"
        aria-label={removeLabel}
        onClick={onRemove}
        className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-card/90 text-foreground shadow-sm transition-colors hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

function TotalsCard({
  totals,
  deltaCents,
  voucherCode,
  lockReason,
  bcp47,
}: {
  totals: ReturnType<typeof liveTotals>;
  deltaCents: number;
  voucherCode: string | null;
  lockReason: string | null;
  bcp47: string;
}) {
  const t = useT();
  const row = (label: string, cents: number, cls?: string) => (
    <KeyValue
      label={label}
      value={
        <span className={cn('tabular-nums', cls)}>{formatCurrency(cents / 100, 'EUR', bcp47)}</span>
      }
    />
  );
  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-2sm">
      <KeyValueList>
        {row(t('orders.receipt.totalItems'), totals.itemsCents)}
        {totals.pickupFeeCents > 0 && row(t('orders.receipt.totalPickup'), totals.pickupFeeCents)}
        {totals.minOrderTopUpCents > 0 &&
          row(t('orders.receipt.totalMinOrder'), totals.minOrderTopUpCents)}
        {totals.discountCents > 0 &&
          row(
            voucherCode
              ? `${t('orders.receipt.totalDiscount')} (${voucherCode})`
              : t('orders.receipt.totalDiscount'),
            -totals.discountCents,
          )}
      </KeyValueList>
      <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
        <span className="font-medium text-foreground">{t('orders.receipt.total')}</span>
        <span className="text-lg font-semibold tabular-nums">
          {formatCurrency(totals.totalCents / 100, 'EUR', bcp47)}
        </span>
      </div>
      {totals.paidCents > 0 && (
        <KeyValueList className="border-t border-border pt-2">
          {row(t('orders.receipt.paid'), totals.paidCents)}
          {totals.balanceCents > 0 &&
            row(t('orders.receipt.open'), totals.balanceCents, 'font-semibold text-warning')}
          {totals.balanceCents < 0 &&
            row(t('orders.receipt.credit'), -totals.balanceCents, 'font-semibold text-info')}
        </KeyValueList>
      )}
      {deltaCents !== 0 && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {t('orders.receipt.changesTotal', {
            delta: `${deltaCents > 0 ? '+' : ''}${formatCurrency(deltaCents / 100, 'EUR', bcp47)}`,
          })}
        </p>
      )}
      {lockReason && <Alert tone="destructive">{lockReason}</Alert>}
    </div>
  );
}
