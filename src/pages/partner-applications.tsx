import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, ChevronRight, Globe, Inbox, Mail, Phone, Send } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { BrandChip } from '@/components/brand-mark';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  ApiError,
  errMessage,
  partnerApplicationsApi,
  serviceCatalogApi,
  type PartnerApplication,
  type PartnerApplicationStatus,
} from '@/lib/api';
import {
  applicationSourceLabel,
  applicationStatusLabel,
  applicationStatusTone,
  applicationsKey,
  useApplications,
} from '@/lib/partners';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime, safeHttpUrl } from '@/lib/utils';

type Row = PartnerApplication & { _brand: Project };
type Filter = PartnerApplicationStatus | 'all';
const FILTERS: Filter[] = ['new', 'invited', 'rejected', 'all'];

const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

function applicationHref(slug: CompanySlug, id: number): string {
  return `/partner/bewerbungen/${id}?brand=${encodeURIComponent(slug)}`;
}

export function PartnerApplicationsPanel({
  brands,
  showBrand,
}: {
  brands: Project[];
  showBrand: boolean;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status') as Filter | null;
  const filter: Filter = statusParam && FILTERS.includes(statusParam) ? statusParam : 'new';
  const queries = useApplications(brands);

  const updatedKey = queries.map((q) => q.dataUpdatedAt).join('|');
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    queries.forEach((q, i) => {
      const brand = brands[i];
      if (brand) (q.data?.applications ?? []).forEach((a) => out.push({ ...a, _brand: brand }));
    });
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updatedKey tracks the query data
  }, [updatedKey, brands]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { new: 0, invited: 0, rejected: 0, all: rows.length };
    for (const r of rows) if (r.status in c) c[r.status]++;
    return c;
  }, [rows]);
  const filtered = filter === 'all' ? rows : rows.filter((r) => r.status === filter);
  const isLoading = queries.some((q) => q.isLoading);
  const error = queries.find((q) => q.error)?.error ?? null;
  const linkState = { from: location.search };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedControl
        value={filter}
        onValueChange={(next) =>
          setSearchParams(
            (prev) => {
              const p = new URLSearchParams(prev);
              if (next === 'new') p.delete('status');
              else p.set('status', next);
              return p;
            },
            { replace: true },
          )
        }
        label={t('partners.statusFilter')}
        overflow="scroll"
        className="w-fit"
        options={FILTERS.map((f) => ({
          value: f,
          label: f === 'all' ? t('partners.tabAll') : applicationStatusLabel(t, f),
          count: counts[f],
        }))}
      />

      {error ? (
        <ErrorState
          error={error}
          onRetry={() => queries.forEach((q) => void q.refetch())}
          retrying={queries.some((q) => q.isFetching)}
        />
      ) : null}

      {isLoading ? (
        <Card>
          <LoadingState label={t('partnerApps.loading')} />
        </Card>
      ) : filtered.length === 0 ? (
        error ? null : (
          <EmptyState
            variant="dashed"
            icon={<Inbox />}
            message={filter === 'new' ? t('partnerApps.emptyNew') : t('partnerApps.empty')}
          />
        )
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
            {filtered.map((a) => (
              <li
                key={`${a._brand.companySlug}:${a.id}`}
                className="relative flex items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-accent/60"
              >
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Link
                      to={applicationHref(a._brand.companySlug, a.id)}
                      state={linkState}
                      className={`min-w-0 truncate text-2sm font-medium text-foreground ${ROW_LINK}`}
                    >
                      {a.companyName}
                    </Link>
                    <StatusBadge
                      label={applicationStatusLabel(t, a.status)}
                      tone={applicationStatusTone(a.status)}
                      className="ml-auto"
                    />
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {[`${a.postalCode ?? ''} ${a.city ?? ''}`.trim(), a.contactName]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                  {showBrand ? <BrandChip brand={a._brand} /> : null}
                </div>
                <ChevronRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block lg:max-h-[calc(100svh-19rem)] lg:overflow-auto lg:overscroll-contain">
            <Table containerClassName="w-full">
              <TableHeader sticky>
                <TableRow>
                  <TableHead>{t('partnerApps.colCompany')}</TableHead>
                  <TableHead>{t('partners.colContact')}</TableHead>
                  <TableHead>{t('partners.colLocation')}</TableHead>
                  <TableHead className="text-right">{t('partnerApps.colServices')}</TableHead>
                  <TableHead>{t('partners.colStatus')}</TableHead>
                  <TableHead className="text-right">{t('partnerApps.colReceived')}</TableHead>
                  <TableHead className="w-10">
                    <span className="sr-only">{t('partners.openDetail')}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={`${a._brand.companySlug}:${a.id}`} className="relative">
                    <TableCell className="max-w-[20rem] py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          to={applicationHref(a._brand.companySlug, a.id)}
                          state={linkState}
                          className={`truncate font-medium text-foreground hover:underline ${ROW_LINK}`}
                        >
                          {a.companyName}
                        </Link>
                        {showBrand ? <BrandChip brand={a._brand} /> : null}
                      </div>
                      {a.legalForm ? (
                        <p className="truncate text-xs text-muted-foreground">{a.legalForm}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="max-w-[18rem] py-2">
                      <p className="truncate text-foreground">{a.contactName}</p>
                      <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2 tabular-nums text-muted-foreground">
                      {`${a.postalCode} ${a.city ?? ''}`.trim()}
                      <span className="block text-xs">
                        {t('partnerApps.radius', { km: a.serviceRadiusKm })}
                      </span>
                    </TableCell>
                    <TableCell className="py-2 text-right tabular-nums text-muted-foreground">
                      {a.services.length}
                    </TableCell>
                    <TableCell className="py-2">
                      <StatusBadge
                        label={applicationStatusLabel(t, a.status)}
                        tone={applicationStatusTone(a.status)}
                      />
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-right tabular-nums text-muted-foreground">
                      {formatDateTime(a.createdAt, bcp47, { dateStyle: 'medium' })}
                    </TableCell>
                    <TableCell className="w-10 py-2 text-right">
                      <ChevronRight
                        className="ml-auto size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}

export function PartnerApplicationDetailPage() {
  const t = useT();
  const location = useLocation();
  const { id: idParam } = useParams();
  const [searchParams] = useSearchParams();
  const { projects, activeProject, isAllBrands } = useProject();
  const id = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;
  const brand =
    projects.find((p) => p.companySlug === searchParams.get('brand')) ??
    (isAllBrands ? null : activeProject);

  const query = useQuery({
    queryKey: ['partner-application', brand?.companySlug ?? 'none', id ?? 0] as const,
    queryFn: ({ signal }) => partnerApplicationsApi.get(brand!.companySlug, id!, signal),
    enabled: !!brand && id !== null,
    retry: false,
  });
  usePageTitle(query.data?.application.companyName ?? t('partnerApps.title'));

  const from = (location.state as { from?: string } | null)?.from ?? '?tab=bewerbungen';
  const back = (
    <RecordNav>
      <BackLink to={`/partner${from}`}>{t('partnerApps.title')}</BackLink>
    </RecordNav>
  );

  if (brand && id !== null && query.isLoading) {
    return (
      <PageContainer>
        {back}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }
  const application = query.data?.application;
  if (!brand || !application) {
    const err = query.error;
    return (
      <PageContainer>
        {back}
        <PageHeading title={t('partnerApps.title')} />
        {err && !(err instanceof ApiError && err.status === 404) ? (
          <ErrorState
            error={err}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <EmptyState variant="dashed" icon={<Inbox />} message={t('partnerApps.notFound')} />
        )}
      </PageContainer>
    );
  }
  return (
    <ApplicationRecord
      key={`${brand.companySlug}:${application.id}`}
      application={application}
      brand={brand}
      back={back}
    />
  );
}

function ApplicationRecord({
  application: a,
  brand,
  back,
}: {
  application: PartnerApplication;
  brand: Project;
  back: ReactNode;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const queryClient = useQueryClient();
  const canWrite = useCanWrite();
  const slug = brand.companySlug;
  const [confirmInvite, setConfirmInvite] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  const catalogQuery = useQuery({
    queryKey: ['service-catalog', slug] as const,
    queryFn: ({ signal }) => serviceCatalogApi.list(slug, signal),
    staleTime: 5 * 60_000,
  });
  const serviceName = new Map(catalogQuery.data?.services.map((s) => [s.slug, s.name]) ?? []);

  function applyUpdate(next: PartnerApplication) {
    queryClient.setQueryData(['partner-application', slug, a.id], { application: next });
    void queryClient.invalidateQueries({ queryKey: applicationsKey(slug) });
  }

  const invite = useMutation({
    mutationFn: () => partnerApplicationsApi.invite(slug, a.id),
    onSuccess: (res) => {
      setConfirmInvite(false);
      applyUpdate(res.application);
      toast.success(
        t('partnerApps.invited', {
          email: a.email,
          date: formatDateTime(res.inviteExpiresAt, bcp47, { dateStyle: 'medium' }),
        }),
      );
    },
    onError: (err) => toast.error(errMessage(err), t('partnerApps.inviteFailed')),
  });

  const reject = useMutation({
    mutationFn: (reason: string) => partnerApplicationsApi.reject(slug, a.id, reason || undefined),
    onSuccess: (res) => {
      setRejectOpen(false);
      applyUpdate(res.application);
      toast.success(t('partnerApps.rejected'));
    },
    onError: (err) => toast.error(errMessage(err), t('partnerApps.rejectFailed')),
  });

  const website = a.websiteUrl ? safeHttpUrl(a.websiteUrl) : null;

  return (
    <PageContainer>
      {back}
      <PageHeading
        title={a.companyName}
        subtitle={t('partnerApps.receivedAt', { date: formatDateTime(a.createdAt, bcp47) })}
        meta={
          <>
            <StatusBadge
              label={applicationStatusLabel(t, a.status)}
              tone={applicationStatusTone(a.status)}
            />
            <BrandChip brand={brand} />
          </>
        }
        actions={
          canWrite && a.status === 'new' ? (
            <>
              <Button size="sm" variant="outline-destructive" onClick={() => setRejectOpen(true)}>
                <Ban aria-hidden="true" />
                {t('partnerApps.reject')}
              </Button>
              <Button size="sm" onClick={() => setConfirmInvite(true)} loading={invite.isPending}>
                <Send aria-hidden="true" />
                {t('partnerApps.invite')}
              </Button>
            </>
          ) : null
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {a.status === 'invited' ? (
            <Alert tone="success">
              {a.source === 'import_legacy_cleanilo'
                ? t('partnerApps.importedHint')
                : a.invitedAt
                  ? t('partnerApps.invitedHint', { date: formatDateTime(a.invitedAt, bcp47) })
                  : t('partnerApps.invitedHintNoDate')}{' '}
              <Link to="/partner" className="font-medium underline underline-offset-2">
                {t('partnerApps.toPartners')}
              </Link>
            </Alert>
          ) : a.status === 'rejected' ? (
            <Alert tone="neutral">
              {a.rejectionReason
                ? t('partnerApps.rejectedWithReason', { reason: a.rejectionReason })
                : t('partnerApps.rejectedHint')}
            </Alert>
          ) : null}

          <SectionCard title={t('partnerApps.business')}>
            <KeyValueList layout="grid">
              <KeyValue label={t('partners.fields.companyName')} value={a.companyName} />
              <KeyValue label={t('partnerApps.legalForm')} value={a.legalForm} empty="—" />
              <KeyValue label={t('partnerApps.employees')} value={a.employeeCount} empty="—" />
              <KeyValue
                label={t('partners.colLocation')}
                value={
                  <span className="tabular-nums">{`${a.postalCode} ${a.city ?? ''}`.trim()}</span>
                }
              />
              <KeyValue
                label={t('partners.edit.radius')}
                value={
                  <span className="tabular-nums">
                    {t('partnerApps.radius', { km: a.serviceRadiusKm })}
                  </span>
                }
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard
            title={t('partners.detail.servicesLabel')}
            description={String(a.services.length)}
          >
            {a.services.length > 0 ? (
              <ul className="flex flex-wrap gap-1">
                {a.services.map((s) => (
                  <li key={s}>
                    <Badge variant="secondary" title={s}>
                      {serviceName.get(s) ?? s}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-2sm text-muted-foreground">{t('partners.detail.noServices')}</p>
            )}
          </SectionCard>

          {a.message ? (
            <SectionCard title={t('partnerApps.message')}>
              <p className="whitespace-pre-wrap break-words text-2sm leading-relaxed">
                {a.message}
              </p>
            </SectionCard>
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <SectionCard title={t('partners.detail.contact')}>
            <KeyValueList layout="stacked">
              <KeyValue label={t('partnerApps.contactName')} value={a.contactName} />
              <KeyValue
                label={
                  <span className="inline-flex items-center gap-1 [&_svg]:size-3">
                    <Mail aria-hidden="true" />
                    {t('partners.fields.contactEmail')}
                  </span>
                }
                value={
                  <a
                    href={`mailto:${a.email}`}
                    className="break-all rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {a.email}
                  </a>
                }
              />
              <KeyValue
                label={
                  <span className="inline-flex items-center gap-1 [&_svg]:size-3">
                    <Phone aria-hidden="true" />
                    {t('partners.fields.contactPhone')}
                  </span>
                }
                empty="—"
                value={
                  a.phone ? (
                    <a
                      href={`tel:${a.phone}`}
                      className="rounded-sm tabular-nums text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {a.phone}
                    </a>
                  ) : null
                }
              />
              <KeyValue
                label={
                  <span className="inline-flex items-center gap-1 [&_svg]:size-3">
                    <Globe aria-hidden="true" />
                    {t('partners.fields.websiteUrl')}
                  </span>
                }
                empty="—"
                value={
                  a.websiteUrl ? (
                    website ? (
                      <a
                        href={website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all rounded-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {a.websiteUrl}
                      </a>
                    ) : (
                      <span className="break-all text-muted-foreground">{a.websiteUrl}</span>
                    )
                  ) : null
                }
              />
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('partners.detail.meta')}>
            <KeyValueList>
              <KeyValue
                label={t('partnerApps.source')}
                value={a.source ? applicationSourceLabel(t, a.source) : null}
                empty="—"
              />
              <KeyValue
                label={t('partnerApps.colReceived')}
                value={
                  <time className="tabular-nums" dateTime={a.createdAt}>
                    {formatDateTime(a.createdAt, bcp47)}
                  </time>
                }
              />
              {a.invitedAt ? (
                <KeyValue
                  label={t('partnerApps.invitedAt')}
                  value={
                    <time className="tabular-nums" dateTime={a.invitedAt}>
                      {formatDateTime(a.invitedAt, bcp47)}
                    </time>
                  }
                />
              ) : null}
            </KeyValueList>
          </SectionCard>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmInvite}
        onOpenChange={setConfirmInvite}
        title={t('partnerApps.inviteTitle')}
        description={t('partnerApps.inviteBody', { email: a.email })}
        confirmLabel={t('partnerApps.invite')}
        isPending={invite.isPending}
        onConfirm={() => invite.mutate()}
      />
      {rejectOpen ? (
        <RejectDialog
          companyName={a.companyName}
          pending={reject.isPending}
          onClose={() => setRejectOpen(false)}
          onSubmit={(reason) => reject.mutate(reason)}
        />
      ) : null}
    </PageContainer>
  );
}

function RejectDialog({
  companyName,
  pending,
  onClose,
  onSubmit,
}: {
  companyName: string;
  pending: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const t = useT();
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg" showClose={!pending}>
        <DialogHeader>
          <DialogTitle>{t('partnerApps.rejectTitle', { name: companyName })}</DialogTitle>
          <DialogDescription>{t('partnerApps.rejectBody')}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(reason.trim());
          }}
        >
          <FormField label={t('partnerApps.rejectReason')} hint={t('partnerApps.rejectReasonHint')}>
            <Textarea
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="destructive" loading={pending}>
              {t('partnerApps.reject')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
