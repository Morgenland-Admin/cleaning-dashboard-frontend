import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleDashed,
  CircleX,
  Download,
  FileText,
  Globe,
  Mail,
  MessageSquare,
  MoreHorizontal,
  PauseOctagon,
  Pencil,
  Phone,
  Store,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { BrandChip } from '@/components/brand-mark';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CountPill } from '@/components/count-pill';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav } from '@/components/record-pager';
import { SectionCard, SectionLabel } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { PartnerStatusBadge, VerifiedBadge } from '@/components/verified-badge';
import { type CompanySlug, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  ApiError,
  chatAdminApi,
  errMessage,
  partnersAdminApi,
  serviceCatalogApi,
  type PartnerChecklist,
  type PartnerDetailResponse,
  type PartnerDocument,
  type PartnerDocumentState,
  type PartnerOfferStatus,
  type PartnerStatus,
  type PartnerUpdate,
} from '@/lib/api';
import {
  CHAT_PARTNER_STATUSES,
  chatHref,
  docKindLabel,
  docStateLabel,
  docStateTone,
  offerStatusLabel,
  partnerDetailKey,
  partnerHref,
  stripeStatusLabel,
  usePartnerRecord,
} from '@/lib/partners';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime, safeHttpUrl } from '@/lib/utils';

const STATS_ORDER: PartnerOfferStatus[] = [
  'offered',
  'accepted',
  'declined',
  'expired',
  'withdrawn',
];

type ListState = { from?: string; ids?: { slug: CompanySlug; id: number }[] } | null;

function loadError(error: unknown, t: ReturnType<typeof useT>): Error | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 401) return new Error(t('partners.errUnauthorized'));
    if (error.status === 403) return new Error(t('partners.errForbidden'));
    if (error.status === 404) return null;
    return error;
  }
  return new Error(t('partners.errGeneric'));
}

export function PartnerDetailPage() {
  const t = useT();
  const location = useLocation();
  const { id: idParam } = useParams();
  const id = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;
  const record = usePartnerRecord(id);
  usePageTitle(record.data?.partner.companyName ?? t('partners.title'));

  const state = location.state as ListState;
  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to={`/partner${state?.from ?? ''}`}>{t('partners.title')}</BackLink>
    </RecordNav>
  );

  if (record.isLoading) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }

  if (!record.data || !record.brand) {
    const error = record.data ? null : loadError(record.error, t);
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('partners.title')} />
        {error ? (
          <ErrorState error={error} onRetry={record.refetch} retrying={record.isFetching} />
        ) : (
          <EmptyState variant="dashed" icon={<Store />} message={t('partners.notFound')} />
        )}
      </PageContainer>
    );
  }

  return (
    <PartnerRecord
      key={`${record.brand.companySlug}:${record.data.partner.id}`}
      data={record.data}
      brand={record.brand}
      state={state}
      backRow={backRow}
    />
  );
}

function PartnerRecord({
  data,
  brand,
  state,
  backRow,
}: {
  data: PartnerDetailResponse;
  brand: Project;
  state: ListState;
  backRow: (pager?: ReactNode) => ReactNode;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  const { partner, checklist, documents, contractAcceptances, offerStats, assignedOrders } = data;
  const slug = brand.companySlug;
  const detailKey = partnerDetailKey(slug, partner.id);

  const catalogQuery = useQuery({
    queryKey: ['service-catalog', slug] as const,
    queryFn: ({ signal }) => serviceCatalogApi.list(slug, signal),
    staleTime: 5 * 60_000,
  });
  const serviceName = new Map(catalogQuery.data?.services.map((s) => [s.slug, s.name]) ?? []);

  const updateMutation = useMutation({
    mutationFn: (patch: PartnerUpdate) => partnersAdminApi.update(slug, partner.id, patch),
    onSuccess: (res, patch) => {
      queryClient.setQueryData<PartnerDetailResponse>(detailKey, (prev) =>
        prev ? { ...prev, partner: res.partner, checklist: res.checklist } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: ['partners', slug] });
      if (patch.internalNotes !== undefined) toast({ title: t('partners.notesSaved') });
    },
    onError: (err) =>
      toast({
        variant: 'destructive',
        title: t('partners.updateFailed'),
        description: errMessage(err),
      }),
  });
  const pendingStatus = updateMutation.isPending
    ? (updateMutation.variables?.status ?? null)
    : null;
  const savingNotes =
    updateMutation.isPending && updateMutation.variables?.internalNotes !== undefined;
  const [confirmStatus, setConfirmStatus] = useState<Exclude<PartnerStatus, 'pending'> | null>(
    null,
  );
  const partnerName = partner.companyName ?? t('partners.detail.noCompany');

  function requestStatus(status: PartnerStatus) {
    if (status === 'pending') updateMutation.mutate({ status });
    else setConfirmStatus(status);
  }

  // Same key as the sidebar badge, so this is usually served from cache.
  const canChat = !!partner.userId && CHAT_PARTNER_STATUSES.includes(partner.status);
  const chatQuery = useQuery({
    queryKey: ['chat-conversations', slug],
    queryFn: ({ signal }) => chatAdminApi.conversations(slug, signal),
    enabled: canChat,
    staleTime: 30_000,
  });
  const unread =
    chatQuery.data?.conversations.find((c) => c.partnerUserId === partner.userId)?.unreadForAdmin ??
    0;

  return (
    <PageContainer>
      {backRow(
        <RecordPager
          state={state}
          slug={slug}
          id={partner.id}
          onGo={(s, id) => navigate(partnerHref(s, id), { state, replace: true })}
          t={t}
        />,
      )}
      <PageHeading
        title={partnerName}
        subtitle={
          partner.legalName && partner.legalName !== partner.companyName
            ? partner.legalName
            : undefined
        }
        meta={
          <>
            <PartnerStatusBadge status={partner.status} />
            <VerifiedBadge verified={checklist.verified} />
            <BrandChip brand={brand} />
          </>
        }
        actions={
          <>
            {canChat ? (
              <Button size="sm" variant="outline" asChild>
                <Link to={chatHref(slug, partner.userId)}>
                  <MessageSquare aria-hidden="true" />
                  {t('partners.detail.message')}
                  {unread > 0 ? (
                    <>
                      <CountPill tone="solid">
                        <span aria-hidden="true">{unread > 99 ? '99+' : unread}</span>
                      </CountPill>
                      <span className="sr-only">{t('chat.unreadCount', { n: unread })}</span>
                    </>
                  ) : null}
                </Link>
              </Button>
            ) : null}
            {canWrite ? (
              <>
                <Button size="sm" variant="outline" asChild>
                  <Link
                    to={`/partner/${partner.id}/bearbeiten?brand=${encodeURIComponent(slug)}`}
                    state={state}
                  >
                    <Pencil aria-hidden="true" />
                    {t('common.edit')}
                  </Link>
                </Button>
                <StatusActions
                  status={partner.status}
                  onRequest={requestStatus}
                  disabled={updateMutation.isPending}
                  pendingStatus={pendingStatus}
                  t={t}
                />
              </>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <ChecklistCard checklist={checklist} />

          <DocumentsCard
            slug={slug}
            partnerId={partner.id}
            documents={documents}
            canWrite={canWrite}
            onReviewed={() => queryClient.invalidateQueries({ queryKey: detailKey })}
          />

          <SectionCard title={t('partners.detail.services')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <SectionLabel>{t('partners.detail.servicesLabel')}</SectionLabel>
                {partner.services.length > 0 ? (
                  <ul className="flex flex-wrap gap-1">
                    {partner.services.map((s) => (
                      <li key={s}>
                        <Badge variant="secondary" title={s}>
                          {serviceName.get(s) ?? s}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-2sm text-muted-foreground">
                    {t('partners.detail.noServices')}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <SectionLabel>{t('partners.detail.areaLabel')}</SectionLabel>
                <p className="text-2sm tabular-nums">
                  {partner.postalCode
                    ? t('partners.detail.radiusAround', {
                        km: partner.serviceRadiusKm,
                        place: [partner.postalCode, partner.city].filter(Boolean).join(' '),
                      })
                    : t('partners.detail.radiusOnly', { km: partner.serviceRadiusKm })}
                </p>
                {partner.lat == null ? (
                  <p className="text-xs text-warning">{t('partners.detail.noLocation')}</p>
                ) : null}
                {partner.serviceAreas.length > 0 ? (
                  <ul className="flex flex-wrap gap-1 pt-1">
                    {partner.serviceAreas.map((a) => (
                      <li key={a}>
                        <Badge variant="outline">{a}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </SectionCard>

          <SectionCard title={t('partners.masterData')}>
            <KeyValueList layout="grid">
              <KeyValue
                label={t('partners.fields.companyName')}
                value={partner.companyName}
                empty="—"
              />
              <KeyValue
                label={t('partners.fields.legalName')}
                value={partner.legalName}
                empty="—"
              />
              <KeyValue
                label={t('partners.fields.registrationNumber')}
                value={partner.registrationNumber}
                empty="—"
              />
              <KeyValue
                label={t('partners.detail.address')}
                empty="—"
                value={
                  partner.addressLine1 ? (
                    <address className="not-italic leading-relaxed">
                      {partner.addressLine1}
                      {partner.addressLine2 ? <>, {partner.addressLine2}</> : null}
                      <br />
                      {partner.postalCode ? `${partner.postalCode} ` : ''}
                      {partner.city ?? ''}
                      {partner.region ? <>, {partner.region}</> : null}
                      {partner.country ? <> · {partner.country}</> : null}
                    </address>
                  ) : null
                }
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('partners.bankTax')}>
            <KeyValueList layout="grid">
              <KeyValue
                label={t('partners.fields.commissionRate')}
                value={
                  <span className="tabular-nums">
                    {partner.commissionRate != null
                      ? `${Number(partner.commissionRate).toLocaleString(bcp47)} %`
                      : t('partners.commissionDefault')}
                  </span>
                }
              />
              <KeyValue
                label={t('partners.fields.iban')}
                value={partner.iban ? <span className="tabular-nums">{partner.iban}</span> : null}
                empty="—"
              />
              <KeyValue
                label={t('partners.fields.bic')}
                value={partner.bic ? <span className="tabular-nums">{partner.bic}</span> : null}
                empty="—"
              />
              <KeyValue label={t('partners.fields.taxId')} value={partner.taxId} empty="—" />
              <KeyValue label={t('partners.fields.vatId')} value={partner.vatId} empty="—" />
            </KeyValueList>
          </SectionCard>

          {canWrite ? (
            <NotesCard
              initial={partner.internalNotes ?? ''}
              disabled={updateMutation.isPending}
              saving={savingNotes}
              onSave={(notes) => updateMutation.mutate({ internalNotes: notes })}
              t={t}
            />
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <SectionCard title={t('partners.detail.contact')}>
            <KeyValueList layout="stacked">
              <KeyValue
                label={<FactLabel icon={<Mail />}>{t('partners.fields.contactEmail')}</FactLabel>}
                empty="—"
                value={
                  partner.contactEmail ? (
                    <a
                      href={`mailto:${partner.contactEmail}`}
                      className="break-all rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {partner.contactEmail}
                    </a>
                  ) : null
                }
              />
              <KeyValue
                label={<FactLabel icon={<Phone />}>{t('partners.fields.contactPhone')}</FactLabel>}
                empty="—"
                value={
                  partner.contactPhone ? (
                    <a
                      href={`tel:${partner.contactPhone}`}
                      className="rounded-sm tabular-nums text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {partner.contactPhone}
                    </a>
                  ) : null
                }
              />
              <KeyValue
                label={<FactLabel icon={<Globe />}>{t('partners.fields.websiteUrl')}</FactLabel>}
                empty="—"
                value={partner.websiteUrl ? <WebsiteValue url={partner.websiteUrl} /> : null}
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('partners.detail.jobs')}>
            <KeyValueList>
              <KeyValue
                label={t('partners.detail.assignedOrders')}
                value={<span className="tabular-nums">{assignedOrders}</span>}
              />
              {STATS_ORDER.map((s) => (
                <KeyValue
                  key={s}
                  label={t('partners.detail.offersBy', { status: offerStatusLabel(t, s) })}
                  value={<span className="tabular-nums">{offerStats[s] ?? 0}</span>}
                />
              ))}
              <KeyValue
                label={t('partners.detail.rating')}
                value={
                  partner.rating != null ? (
                    <span className="tabular-nums">
                      {Number(partner.rating).toLocaleString(bcp47, { maximumFractionDigits: 1 })} (
                      {partner.ratingCount})
                    </span>
                  ) : null
                }
                empty="—"
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('partners.detail.contract')}>
            {contractAcceptances.length === 0 ? (
              <p className="text-2sm text-muted-foreground">{t('partners.detail.noContract')}</p>
            ) : (
              <ol className="space-y-2 text-2sm">
                {contractAcceptances.map((a) => (
                  <li key={a.id}>
                    <span className="font-medium tabular-nums">{a.version}</span>
                    <span className="text-muted-foreground">
                      {' · '}
                      <time className="tabular-nums" dateTime={a.acceptedAt}>
                        {formatDateTime(a.acceptedAt, bcp47)}
                      </time>
                    </span>
                    {a.ipAddress ? (
                      <span className="block text-xs tabular-nums text-muted-foreground">
                        {t('partners.detail.acceptedFrom', { ip: a.ipAddress })}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard title={t('partners.detail.meta')}>
            <KeyValueList>
              <KeyValue
                label={t('partners.colStatus')}
                value={<PartnerStatusBadge status={partner.status} />}
              />
              <KeyValue label={t('partners.brand')} value={<BrandChip brand={brand} />} />
              <KeyValue
                label={t('partners.detail.payouts')}
                value={
                  <StatusBadge
                    label={
                      checklist.payouts.ok
                        ? t('partners.detail.payoutsReady')
                        : t('partners.detail.payoutsNotReady')
                    }
                    tone={checklist.payouts.ok ? 'success' : 'neutral'}
                  />
                }
              />
              <KeyValue
                label={t('partners.detail.createdAt')}
                value={<DateValue iso={partner.createdAt} bcp47={bcp47} />}
              />
              <KeyValue
                label={t('partners.updatedAt')}
                value={<DateValue iso={partner.updatedAt} bcp47={bcp47} />}
              />
              {partner.approvedAt ? (
                <KeyValue
                  label={t('partners.detail.approvedAt')}
                  value={<DateValue iso={partner.approvedAt} bcp47={bcp47} />}
                />
              ) : null}
              {partner.suspendedAt ? (
                <KeyValue
                  label={t('partners.detail.suspendedAt')}
                  value={<DateValue iso={partner.suspendedAt} bcp47={bcp47} />}
                />
              ) : null}
            </KeyValueList>
          </SectionCard>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmStatus !== null}
        onOpenChange={(open) => !open && setConfirmStatus(null)}
        title={
          confirmStatus ? t(STATUS_CONFIRM[confirmStatus].title, { partner: partnerName }) : ''
        }
        description={
          confirmStatus ? t(STATUS_CONFIRM[confirmStatus].body, { partner: partnerName }) : ''
        }
        confirmLabel={confirmStatus ? t(STATUS_CONFIRM[confirmStatus].cta) : ''}
        isDangerous={confirmStatus === 'rejected'}
        isPending={updateMutation.isPending}
        onConfirm={() =>
          confirmStatus &&
          updateMutation.mutate(
            { status: confirmStatus },
            { onSettled: () => setConfirmStatus(null) },
          )
        }
      />
    </PageContainer>
  );
}

function ChecklistCard({ checklist }: { checklist: PartnerChecklist }) {
  const t = useT();
  const items: { key: string; label: string; ok: boolean; detail?: string; optional?: boolean }[] =
    [
      { key: 'profile', label: t('partners.check.profile'), ok: checklist.profileComplete },
      { key: 'services', label: t('partners.check.services'), ok: checklist.servicesSet },
      { key: 'location', label: t('partners.check.location'), ok: checklist.locationSet },
      ...checklist.documents.map((d) => ({
        key: `doc:${d.kind}`,
        label: docKindLabel(t, d.kind),
        ok: d.state === 'approved',
        detail: docStateLabel(t, d.state),
      })),
      {
        key: 'contract',
        label: t('partners.check.contract'),
        ok: checklist.contract.ok,
        detail: checklist.contract.required
          ? checklist.contract.accepted
            ? t('partners.check.contractAccepted', {
                accepted: checklist.contract.accepted,
                required: checklist.contract.required,
              })
            : t('partners.check.contractOpen', { required: checklist.contract.required })
          : t('partners.check.contractNone'),
      },
      {
        key: 'payouts',
        label: t('partners.check.payouts'),
        ok: checklist.payouts.ok,
        detail: stripeStatusLabel(t, checklist.payouts.status),
        optional: true,
      },
    ];
  return (
    <SectionCard
      title={t('partners.check.title')}
      description={checklist.verified ? t('partners.check.allDone') : t('partners.check.hint')}
      actions={<VerifiedBadge verified={checklist.verified} />}
    >
      <ul className="grid gap-x-6 gap-y-2 text-2sm sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            {item.ok ? (
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
            ) : item.optional ? (
              <CircleDashed
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
            ) : (
              <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            )}
            <span className="min-w-0">
              <span className="text-foreground">{item.label}</span>
              <span className="sr-only">
                {': '}
                {item.ok ? t('partners.check.done') : t('partners.check.open')}
              </span>
              {item.optional ? (
                <span className="text-muted-foreground"> {t('common.optional')}</span>
              ) : null}
              {item.detail ? (
                <span className="block text-xs text-muted-foreground">{item.detail}</span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function formatBytes(n: number | null, bcp47: string): string | null {
  if (n == null) return null;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024)).toLocaleString(bcp47)} KB`;
  return `${(n / 1024 / 1024).toLocaleString(bcp47, { maximumFractionDigits: 1 })} MB`;
}

function DocumentsCard({
  slug,
  partnerId,
  documents,
  canWrite,
  onReviewed,
}: {
  slug: CompanySlug;
  partnerId: number;
  documents: PartnerDocument[];
  canWrite: boolean;
  onReviewed: () => Promise<void>;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const [review, setReview] = useState<{ doc: PartnerDocument; mode: 'approve' | 'reject' } | null>(
    null,
  );
  const [downloading, setDownloading] = useState<number | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function download(doc: PartnerDocument) {
    setDownloading(doc.id);
    try {
      const { downloadUrl } = await partnersAdminApi.documentDownload(slug, partnerId, doc.id);
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      toast.error(errMessage(err), t('partners.docs.downloadFailed'));
    } finally {
      setDownloading(null);
    }
  }

  const reviewMutation = useMutation({
    mutationFn: (vars: {
      doc: PartnerDocument;
      status: 'approved' | 'rejected';
      rejectionReason?: string;
      expiresAt?: string | null;
    }) =>
      partnersAdminApi.reviewDocument(slug, partnerId, vars.doc.id, {
        status: vars.status,
        rejectionReason: vars.rejectionReason,
        expiresAt: vars.expiresAt,
      }),
    onSuccess: async (_res, vars) => {
      setReview(null);
      await onReviewed();
      toast.success(
        vars.status === 'approved' ? t('partners.docs.approved') : t('partners.docs.rejected'),
      );
    },
    onError: (err) => toast.error(errMessage(err), t('partners.docs.reviewFailed')),
  });

  return (
    <SectionCard title={t('partners.docs.title')} description={t('partners.docs.hint')}>
      {documents.length === 0 ? (
        <p className="text-2sm text-muted-foreground">{t('partners.docs.empty')}</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {documents.map((doc) => {
            const expired =
              doc.status === 'approved' && doc.expiresAt != null && doc.expiresAt < today;
            const state: PartnerDocumentState = expired ? 'expired' : doc.status;
            const facts = [
              doc.fileName,
              formatBytes(doc.sizeBytes, bcp47),
              t('partners.docs.uploadedAt', {
                date: formatDateTime(doc.createdAt, bcp47, { dateStyle: 'medium' }),
              }),
              doc.expiresAt
                ? t('partners.docs.validUntil', {
                    date: formatDateTime(`${doc.expiresAt}T12:00:00`, bcp47, {
                      dateStyle: 'medium',
                    }),
                  })
                : null,
            ].filter(Boolean);
            return (
              <li key={doc.id} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
                <FileText
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-2sm font-medium">{docKindLabel(t, doc.kind)}</span>
                    <StatusBadge label={docStateLabel(t, state)} tone={docStateTone(state)} />
                  </div>
                  <p className="text-xs tabular-nums text-muted-foreground [overflow-wrap:anywhere]">
                    {facts.join(' · ')}
                  </p>
                  {doc.status === 'rejected' && doc.rejectionReason ? (
                    <p className="text-xs text-destructive">
                      {t('partners.docs.reason', { reason: doc.rejectionReason })}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1">
                  <Button
                    type="button"
                    size="xs"
                    variant="ghost"
                    loading={downloading === doc.id}
                    onClick={() => void download(doc)}
                    aria-label={t('partners.docs.downloadNamed', {
                      name: doc.fileName ?? docKindLabel(t, doc.kind),
                    })}
                  >
                    <Download aria-hidden="true" />
                    {t('partners.docs.download')}
                  </Button>
                  {canWrite && doc.status !== 'approved' ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      onClick={() => setReview({ doc, mode: 'approve' })}
                    >
                      <Check aria-hidden="true" />
                      {t('partners.docs.approve')}
                    </Button>
                  ) : null}
                  {canWrite && doc.status !== 'rejected' ? (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline-destructive"
                      onClick={() => setReview({ doc, mode: 'reject' })}
                    >
                      <Ban aria-hidden="true" />
                      {t('partners.docs.reject')}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {review ? (
        <ReviewDialog
          doc={review.doc}
          mode={review.mode}
          pending={reviewMutation.isPending}
          onClose={() => setReview(null)}
          onSubmit={(input) =>
            reviewMutation.mutate({
              doc: review.doc,
              status: review.mode === 'approve' ? 'approved' : 'rejected',
              ...input,
            })
          }
        />
      ) : null}
    </SectionCard>
  );
}

function ReviewDialog({
  doc,
  mode,
  pending,
  onClose,
  onSubmit,
}: {
  doc: PartnerDocument;
  mode: 'approve' | 'reject';
  pending: boolean;
  onClose: () => void;
  onSubmit: (input: { rejectionReason?: string; expiresAt?: string | null }) => void;
}) {
  const t = useT();
  const [expiresAt, setExpiresAt] = useState(doc.expiresAt ?? '');
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const kind = docKindLabel(t, doc.kind);
  const reasonMissing = mode === 'reject' && reason.trim() === '';
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg" showClose={!pending}>
        <DialogHeader>
          <DialogTitle>
            {mode === 'approve'
              ? t('partners.docs.approveTitle', { kind })
              : t('partners.docs.rejectTitle', { kind })}
          </DialogTitle>
          <DialogDescription>
            {mode === 'approve' ? t('partners.docs.approveBody') : t('partners.docs.rejectBody')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
            if (reasonMissing) return;
            onSubmit(
              mode === 'approve'
                ? { expiresAt: expiresAt || null }
                : { rejectionReason: reason.trim() },
            );
          }}
        >
          {mode === 'approve' ? (
            <FormField label={t('partners.docs.expiresAt')} hint={t('partners.docs.expiresHint')}>
              <DatePicker value={expiresAt} onValueChange={setExpiresAt} />
            </FormField>
          ) : (
            <FormField
              label={t('partners.docs.reasonLabel')}
              required
              error={submitted && reasonMissing ? t('partners.docs.reasonRequired') : undefined}
            >
              <Textarea
                rows={3}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('partners.docs.reasonPlaceholder')}
              />
            </FormField>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              variant={mode === 'approve' ? 'default' : 'destructive'}
              loading={pending}
            >
              {mode === 'approve' ? t('partners.docs.approve') : t('partners.docs.reject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const STATUS_CONFIRM: Record<
  Exclude<PartnerStatus, 'pending'>,
  { title: DictKey; body: DictKey; cta: DictKey }
> = {
  active: {
    title: 'partners.confirm.approveTitle',
    body: 'partners.confirm.approveBody',
    cta: 'partners.actions.approve',
  },
  suspended: {
    title: 'partners.confirm.suspendTitle',
    body: 'partners.confirm.suspendBody',
    cta: 'partners.actions.suspend',
  },
  rejected: {
    title: 'partners.confirm.rejectTitle',
    body: 'partners.confirm.rejectBody',
    cta: 'partners.actions.reject',
  },
};

const STATUS_ACTIONS: {
  target: PartnerStatus;
  label: DictKey;
  icon: ReactNode;
  danger?: boolean;
}[] = [
  { target: 'active', label: 'partners.actions.approve', icon: <Check aria-hidden="true" /> },
  {
    target: 'suspended',
    label: 'partners.actions.suspend',
    icon: <PauseOctagon aria-hidden="true" />,
  },
  {
    target: 'rejected',
    label: 'partners.actions.reject',
    icon: <Ban aria-hidden="true" />,
    danger: true,
  },
  { target: 'pending', label: 'partners.actions.reopen', icon: <CheckCheck aria-hidden="true" /> },
];

/** Next step as the main button, the rest in the menu. */
const STATUS_FLOW: Record<PartnerStatus, { primary: PartnerStatus | null; more: PartnerStatus[] }> =
  {
    pending: { primary: 'active', more: ['rejected'] },
    active: { primary: null, more: ['suspended', 'rejected'] },
    suspended: { primary: 'active', more: ['rejected'] },
    rejected: { primary: 'pending', more: ['active'] },
  };

function StatusActions({
  status,
  onRequest,
  disabled,
  pendingStatus,
  t,
}: {
  status: PartnerStatus;
  onRequest: (status: PartnerStatus) => void;
  disabled: boolean;
  pendingStatus: PartnerStatus | null;
  t: ReturnType<typeof useT>;
}) {
  const flow = STATUS_FLOW[status] ?? STATUS_FLOW.pending;
  const main = STATUS_ACTIONS.find((a) => a.target === flow.primary);
  const more = STATUS_ACTIONS.filter((a) => flow.more.includes(a.target));

  return (
    <>
      {main ? (
        <Button
          size="sm"
          disabled={disabled}
          loading={pendingStatus === main.target}
          onClick={() => onRequest(main.target)}
        >
          {main.icon}
          {t(main.label)}
        </Button>
      ) : null}
      {more.length > 0 ? (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon-sm"
              variant="outline"
              disabled={disabled}
              aria-label={t('partners.actions.more')}
              title={t('partners.actions.more')}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {more.map((a) => (
              <DropdownMenuItem
                key={a.target}
                onSelect={() => onRequest(a.target)}
                className={a.danger ? 'text-destructive focus:text-destructive' : undefined}
              >
                {a.icon}
                {t(a.label)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

function RecordPager({
  state,
  slug,
  id,
  onGo,
  t,
}: {
  state: ListState;
  slug: CompanySlug;
  id: number;
  onGo: (slug: CompanySlug, id: number) => void;
  t: ReturnType<typeof useT>;
}) {
  const ids = state?.ids ?? [];
  const index = ids.findIndex((r) => r.slug === slug && r.id === id);
  if (index === -1 || ids.length < 2) return null;
  const prev = index > 0 ? ids[index - 1] : undefined;
  const next = index < ids.length - 1 ? ids[index + 1] : undefined;
  return (
    <div
      role="group"
      aria-label={t('common.position', { n: index + 1, total: ids.length })}
      className="flex items-center gap-0.5"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!prev}
        onClick={() => prev && onGo(prev.slug, prev.id)}
        aria-label={t('partners.prevRecord')}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span
        aria-hidden="true"
        className="min-w-12 text-center text-xs tabular-nums text-muted-foreground"
      >
        {index + 1} / {ids.length}
      </span>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={!next}
        onClick={() => next && onGo(next.slug, next.id)}
        aria-label={t('partners.nextRecord')}
      >
        <ChevronRight aria-hidden="true" />
      </Button>
    </div>
  );
}

function NotesCard({
  initial,
  disabled,
  saving,
  onSave,
  t,
}: {
  initial: string;
  disabled: boolean;
  saving: boolean;
  onSave: (notes: string | null) => void;
  t: ReturnType<typeof useT>;
}) {
  const [notes, setNotes] = useState(initial);
  const dirty = notes !== initial;
  return (
    <SectionCard
      title={t('partners.detail.notes')}
      footer={
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || disabled}
          loading={saving}
          onClick={() => onSave(notes.trim() === '' ? null : notes)}
        >
          {t('partners.detail.saveNotes')}
        </Button>
      }
    >
      <Textarea
        id="partner-internal-notes"
        aria-label={t('partners.detail.notes')}
        rows={5}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={t('partners.detail.notesPlaceholder')}
      />
    </SectionCard>
  );
}

function WebsiteValue({ url }: { url: string }) {
  const safeUrl = safeHttpUrl(url);
  if (!safeUrl) {
    // Refuse unsafe schemes (e.g. javascript:); show raw text only.
    return <span className="break-all text-muted-foreground">{url}</span>;
  }
  return (
    <a
      href={safeUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {url}
    </a>
  );
}

function DateValue({ iso, bcp47 }: { iso: string; bcp47: string }) {
  return (
    <time dateTime={iso} className="tabular-nums">
      {formatDateTime(iso, bcp47)}
    </time>
  );
}

function FactLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 [&_svg]:size-3 [&_svg]:shrink-0">
      <span aria-hidden="true" className="contents">
        {icon}
      </span>
      {children}
    </span>
  );
}
