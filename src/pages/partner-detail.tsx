import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Globe,
  Mail,
  PauseOctagon,
  Phone,
  Store,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { BrandChip } from '@/components/brand-mark';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav } from '@/components/record-pager';
import { SectionCard, SectionLabel } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import {
  ApiError,
  errMessage,
  partnersAdminApi,
  type Partner,
  type PartnerStatus,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime, safeHttpUrl } from '@/lib/utils';

const STATUS_TONE: Record<PartnerStatus, 'info' | 'warning' | 'success' | 'danger' | 'neutral'> = {
  pending: 'warning',
  active: 'success',
  suspended: 'neutral',
  rejected: 'danger',
};

const STATUS_KEY: Record<PartnerStatus, string> = {
  pending: 'partners.status.pending',
  active: 'partners.status.active',
  suspended: 'partners.status.suspended',
  rejected: 'partners.status.rejected',
};

type ListState = { from?: string; ids?: { slug: CompanySlug; id: number }[] } | null;

function partnerPath(slug: CompanySlug, id: number): string {
  return `/partner/${id}?brand=${encodeURIComponent(slug)}`;
}

function loadError(error: unknown, t: ReturnType<typeof useT>): Error | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 401) return new Error(t('partners.errUnauthorized'));
    if (error.status === 403) return new Error(t('partners.errForbidden'));
    return error;
  }
  return new Error(t('partners.errGeneric'));
}

// The admin API has no get-by-id for partners: the record is read from the brand's partner list (same query key as the list page).
export function PartnerDetailPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { id: idParam } = useParams();
  const [searchParams] = useSearchParams();
  const { activeProject, projects, isAllBrands } = useProject();

  const id = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;
  const brandParam = searchParams.get('brand');
  const linkedBrand = projects.find((p) => p.companySlug === brandParam) ?? null;
  const candidates: Project[] = linkedBrand
    ? [linkedBrand]
    : isAllBrands
      ? projects
      : [activeProject];

  const queries = useQueries({
    queries: candidates.map((b) => ({
      queryKey: ['partners', b.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        partnersAdminApi.list(b.companySlug, signal),
      enabled: id !== null,
    })),
  });

  let partner: Partner | null = null;
  let brand: Project | null = null;
  if (id !== null) {
    for (let i = 0; i < queries.length; i++) {
      const hit = queries[i]?.data?.partners.find((p) => p.id === id);
      if (hit) {
        partner = hit;
        brand = candidates[i] ?? null;
        break;
      }
    }
  }
  const isLoading = !partner && queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const error = partner ? null : loadError(queries.find((q) => q.error)?.error, t);

  usePageTitle(partner?.companyName ?? t('partners.title'));

  const state = location.state as ListState;
  const backTo = `/partner${state?.from ?? ''}`;

  const updateMutation = useMutation({
    mutationFn: (vars: {
      companySlug: CompanySlug;
      id: number;
      status?: PartnerStatus;
      internalNotes?: string | null;
    }) =>
      partnersAdminApi.update(vars.companySlug, vars.id, {
        status: vars.status,
        internalNotes: vars.internalNotes,
      }),
    onSuccess: ({ partner: updated }, vars) => {
      queryClient.setQueryData<{ partners: Partner[] } | undefined>(
        ['partners', vars.companySlug],
        (prev) =>
          prev ? { partners: prev.partners.map((p) => (p.id === updated.id ? updated : p)) } : prev,
      );
      if (vars.internalNotes !== undefined) toast({ title: t('partners.notesSaved') });
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('partners.updateFailed'),
        description: errMessage(err),
      });
    },
  });

  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to={backTo}>{t('partners.title')}</BackLink>
    </RecordNav>
  );

  if (isLoading) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }

  if (!partner || !brand) {
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('partners.title')} />
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => queries.forEach((q) => void q.refetch())}
            retrying={isFetching}
          />
        ) : (
          <EmptyState variant="dashed" icon={<Store />} message={t('partners.notFound')} />
        )}
      </PageContainer>
    );
  }

  const current = partner;
  const currentBrand = brand;
  const pendingStatus = updateMutation.isPending
    ? (updateMutation.variables?.status ?? null)
    : null;
  const savingNotes =
    updateMutation.isPending && updateMutation.variables?.internalNotes !== undefined;

  function setStatus(status: PartnerStatus) {
    updateMutation.mutate({ companySlug: currentBrand.companySlug, id: current.id, status });
  }

  return (
    <PageContainer>
      {backRow(
        <RecordPager
          state={state}
          slug={currentBrand.companySlug}
          id={current.id}
          onGo={(slug, id) => navigate(partnerPath(slug, id), { state, replace: true })}
          t={t}
        />,
      )}
      <PageHeading
        title={current.companyName ?? t('partners.detail.noCompany')}
        subtitle={
          current.legalName && current.legalName !== current.companyName
            ? current.legalName
            : undefined
        }
        meta={
          <>
            <StatusBadge
              label={t(STATUS_KEY[current.status] as never)}
              tone={STATUS_TONE[current.status]}
            />
            <BrandChip brand={currentBrand} />
          </>
        }
        actions={
          <>
            <StatusActions
              status={current.status}
              onChange={setStatus}
              disabled={updateMutation.isPending}
              pendingStatus={pendingStatus}
              t={t}
            />
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title={t('partners.masterData')}>
            <KeyValueList layout="grid">
              <KeyValue
                label={t('partners.fields.companyName')}
                value={current.companyName}
                empty="—"
              />
              <KeyValue
                label={t('partners.fields.legalName')}
                value={current.legalName}
                empty="—"
              />
              <KeyValue
                label={t('partners.fields.registrationNumber')}
                value={current.registrationNumber}
                empty="—"
              />
              <KeyValue
                label={t('partners.detail.address')}
                empty="—"
                value={
                  current.addressLine1 ? (
                    <address className="not-italic leading-relaxed">
                      {current.addressLine1}
                      {current.addressLine2 ? <>, {current.addressLine2}</> : null}
                      <br />
                      {current.postalCode ? `${current.postalCode} ` : ''}
                      {current.city ?? ''}
                      {current.region ? <>, {current.region}</> : null}
                      {current.country ? <> · {current.country}</> : null}
                    </address>
                  ) : null
                }
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('partners.bankTax')}>
            <KeyValueList layout="grid">
              <KeyValue
                label={t('partners.fields.iban')}
                value={current.iban ? <span className="tabular-nums">{current.iban}</span> : null}
                empty="—"
              />
              <KeyValue
                label={t('partners.fields.bic')}
                value={current.bic ? <span className="tabular-nums">{current.bic}</span> : null}
                empty="—"
              />
              <KeyValue label={t('partners.fields.taxId')} value={current.taxId} empty="—" />
              <KeyValue label={t('partners.fields.vatId')} value={current.vatId} empty="—" />
              <KeyValue
                label={t('partners.fields.commissionRate')}
                value={
                  current.commissionRate ? (
                    <span className="tabular-nums">{current.commissionRate} %</span>
                  ) : null
                }
                empty="—"
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('partners.detail.services')}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <SectionLabel>{t('partners.detail.servicesLabel')}</SectionLabel>
                {current.services.length > 0 ? (
                  <ul className="flex flex-wrap gap-1">
                    {current.services.map((s) => (
                      <li key={s}>
                        <Badge variant="secondary">{s}</Badge>
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
                <SectionLabel>{t('partners.detail.areasLabel')}</SectionLabel>
                {current.serviceAreas.length > 0 ? (
                  <ul className="flex flex-wrap gap-1">
                    {current.serviceAreas.map((a) => (
                      <li key={a}>
                        <Badge variant="outline">{a}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-2sm text-muted-foreground">{t('partners.detail.noAreas')}</p>
                )}
              </div>
            </div>
          </SectionCard>

          <NotesCard
            key={`${currentBrand.companySlug}:${current.id}`}
            initial={current.internalNotes ?? ''}
            disabled={updateMutation.isPending}
            saving={savingNotes}
            onSave={(notes) =>
              updateMutation.mutate({
                companySlug: currentBrand.companySlug,
                id: current.id,
                internalNotes: notes,
              })
            }
            t={t}
          />
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <SectionCard title={t('partners.detail.contact')}>
            <KeyValueList layout="stacked">
              <KeyValue
                label={<FactLabel icon={<Mail />}>{t('partners.fields.contactEmail')}</FactLabel>}
                empty="—"
                value={
                  current.contactEmail ? (
                    <a
                      href={`mailto:${current.contactEmail}`}
                      className="break-all rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {current.contactEmail}
                    </a>
                  ) : null
                }
              />
              <KeyValue
                label={<FactLabel icon={<Phone />}>{t('partners.fields.contactPhone')}</FactLabel>}
                empty="—"
                value={
                  current.contactPhone ? (
                    <a
                      href={`tel:${current.contactPhone}`}
                      className="rounded-sm tabular-nums text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {current.contactPhone}
                    </a>
                  ) : null
                }
              />
              <KeyValue
                label={<FactLabel icon={<Globe />}>{t('partners.fields.websiteUrl')}</FactLabel>}
                empty="—"
                value={current.websiteUrl ? <WebsiteValue url={current.websiteUrl} /> : null}
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('partners.detail.meta')}>
            <KeyValueList>
              <KeyValue
                label={t('partners.colStatus')}
                value={
                  <StatusBadge
                    label={t(STATUS_KEY[current.status] as never)}
                    tone={STATUS_TONE[current.status]}
                  />
                }
              />
              <KeyValue label={t('partners.brand')} value={<BrandChip brand={currentBrand} />} />
              <KeyValue
                label={t('partners.detail.createdAt')}
                value={<DateValue iso={current.createdAt} bcp47={bcp47} />}
              />
              <KeyValue
                label={t('partners.updatedAt')}
                value={<DateValue iso={current.updatedAt} bcp47={bcp47} />}
              />
              {current.approvedAt ? (
                <KeyValue
                  label={t('partners.detail.approvedAt')}
                  value={<DateValue iso={current.approvedAt} bcp47={bcp47} />}
                />
              ) : null}
              {current.suspendedAt ? (
                <KeyValue
                  label={t('partners.detail.suspendedAt')}
                  value={<DateValue iso={current.suspendedAt} bcp47={bcp47} />}
                />
              ) : null}
            </KeyValueList>
          </SectionCard>
        </aside>
      </div>
    </PageContainer>
  );
}

function StatusActions({
  status,
  onChange,
  disabled,
  pendingStatus,
  t,
}: {
  status: PartnerStatus;
  onChange: (status: PartnerStatus) => void;
  disabled: boolean;
  pendingStatus: PartnerStatus | null;
  t: ReturnType<typeof useT>;
}) {
  // pending/suspended → approve; rejected → reopen; active has no forward step.
  const primary: PartnerStatus | null =
    status === 'pending' || status === 'suspended'
      ? 'active'
      : status === 'rejected'
        ? 'pending'
        : null;

  const all: {
    target: PartnerStatus;
    label: string;
    icon: ReactNode;
    variant: ButtonProps['variant'];
  }[] = [
    {
      target: 'active',
      label: t('partners.actions.approve'),
      icon: <Check aria-hidden="true" />,
      variant: 'outline',
    },
    {
      target: 'suspended',
      label: t('partners.actions.suspend'),
      icon: <PauseOctagon aria-hidden="true" />,
      variant: 'outline',
    },
    {
      target: 'rejected',
      label: t('partners.actions.reject'),
      icon: <Ban aria-hidden="true" />,
      variant: 'outline-destructive',
    },
    {
      target: 'pending',
      label: t('partners.actions.reopen'),
      icon: <CheckCheck aria-hidden="true" />,
      variant: 'outline',
    },
  ];
  const actions = all
    .filter((a) => a.target !== status)
    .sort((a, b) => Number(b.target === primary) - Number(a.target === primary));

  return (
    <>
      {actions.map((a) => (
        <Button
          key={a.target}
          size="sm"
          variant={a.target === primary ? 'default' : a.variant}
          disabled={disabled}
          loading={pendingStatus === a.target}
          onClick={() => onChange(a.target)}
        >
          {a.icon}
          {a.label}
        </Button>
      ))}
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
    <div className="flex items-center gap-1">
      <Button
        variant="outline"
        size="icon-sm"
        disabled={!prev}
        onClick={() => prev && onGo(prev.slug, prev.id)}
        aria-label={t('partners.prevRecord')}
        title={t('partners.prevRecord')}
      >
        <ChevronLeft aria-hidden="true" />
      </Button>
      <span className="px-1 text-xs tabular-nums text-muted-foreground">
        {index + 1} / {ids.length}
      </span>
      <Button
        variant="outline"
        size="icon-sm"
        disabled={!next}
        onClick={() => next && onGo(next.slug, next.id)}
        aria-label={t('partners.nextRecord')}
        title={t('partners.nextRecord')}
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
