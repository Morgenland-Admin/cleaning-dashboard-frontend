import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import { ChevronRight, Inbox, Plus, Send } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { CountPill } from '@/components/count-pill';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SearchInput } from '@/components/search-input';
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
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PartnerStatusBadge, VerifiedBadge } from '@/components/verified-badge';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  invitesAdminApi,
  partnersAdminApi,
  type Partner,
  type PartnerStatus,
  ApiError,
} from '@/lib/api';
import { partnerHref as hrefFor, partnerStatusHint, useApplications } from '@/lib/partners';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime } from '@/lib/utils';
import { PartnerApplicationsPanel } from '@/pages/partner-applications';

type PartnerRow = Partner & { _brand: Project };
type Filter = PartnerStatus | 'all';
type View = 'partners' | 'applications';

const FILTERS: Filter[] = ['all', 'pending', 'active', 'suspended', 'rejected'];

function partnerHref(p: PartnerRow): string {
  return hrefFor(p._brand.companySlug, p.id);
}

function matchesSearch(p: Partner, needle: string): boolean {
  return [p.companyName, p.legalName, p.contactEmail, p.contactPhone, p.city, p.postalCode].some(
    (v) => v?.toLowerCase().includes(needle),
  );
}

function listError(error: unknown, t: ReturnType<typeof useT>): Error | null {
  if (!error) return null;
  if (error instanceof ApiError) {
    if (error.status === 401) return new Error(t('partners.errUnauthorized'));
    if (error.status === 403) return new Error(t('partners.errForbidden'));
    return error;
  }
  return new Error(t('partners.errGeneric'));
}

const ROW_LINK =
  'rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

export function PartnersPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('partners.title'));
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const canWrite = useCanWrite();
  const statusParam = searchParams.get('status') as Filter | null;
  const tab: Filter = statusParam && FILTERS.includes(statusParam) ? statusParam : 'all';
  const search = searchParams.get('q') ?? '';
  const setSearch = useCallback(
    (next: string) =>
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next) p.set('q', next);
          else p.delete('q');
          return p;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  const setTab = useCallback(
    (next: Filter) =>
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === 'all') p.delete('status');
          else p.set('status', next);
          return p;
        },
        { replace: true },
      ),
    [setSearchParams],
  );
  const [inviteOpen, setInviteOpen] = useState(false);
  const view: View = searchParams.get('tab') === 'bewerbungen' ? 'applications' : 'partners';
  const setView = (next: View) =>
    setSearchParams(
      () => {
        const p = new URLSearchParams();
        if (next === 'applications') p.set('tab', 'bewerbungen');
        return p;
      },
      { replace: true },
    );

  const brandList = isAllBrands ? projects : [activeProject];
  const applicationQueries = useApplications(brandList);
  const newApplications = applicationQueries.reduce(
    (n, q) => n + (q.data?.applications.filter((a) => a.status === 'new').length ?? 0),
    0,
  );
  const queries = useQueries({
    queries: brandList.map((b) => ({
      queryKey: ['partners', b.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        partnersAdminApi.list(b.companySlug, signal),
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const firstError = queries.find((q) => q.error)?.error as Error | undefined;

  function refetch() {
    queries.forEach((q) => q.refetch());
  }

  // `useQueries` returns a fresh array every render; this key changes only when a query resolves new data.
  const queriesUpdatedKey = queries.map((q) => q.dataUpdatedAt).join('|');
  const partners = useMemo<PartnerRow[]>(() => {
    const out: PartnerRow[] = [];
    queries.forEach((q, i) => {
      const brand = brandList[i];
      if (!brand) return;
      (q.data?.partners ?? []).forEach((p) => out.push({ ...p, _brand: brand }));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see queriesUpdatedKey
  }, [queriesUpdatedKey, brandList]);

  const needle = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      partners.filter(
        (p) => (tab === 'all' || p.status === tab) && (!needle || matchesSearch(p, needle)),
      ),
    [partners, tab, needle],
  );

  const linkState = useMemo(
    () => ({
      from: location.search,
      ids: filtered.map((p) => ({ slug: p._brand.companySlug, id: p.id })),
    }),
    [filtered, location.search],
  );

  const counts = useMemo(() => {
    const c: Record<Filter, number> = {
      all: partners.length,
      pending: 0,
      active: 0,
      suspended: 0,
      rejected: 0,
    };
    for (const p of partners) if (p.status in c) c[p.status]++;
    return c;
  }, [partners]);

  // Legacy `?partner=<id>` / `<slug>:<id>` links redirect to the record page.
  const legacy = searchParams.get('partner');
  const legacyMatch = legacy ? /^(?:([a-z0-9_-]{2,63}):)?(\d+)$/.exec(legacy) : null;
  if (legacyMatch) {
    const [, slug, id] = legacyMatch;
    return (
      <Navigate replace to={`/partner/${id}${slug ? `?brand=${encodeURIComponent(slug)}` : ''}`} />
    );
  }

  const error = listError(firstError ?? null, t);

  const tabs: { value: Filter; label: string }[] = [
    { value: 'all', label: t('partners.tabAll') },
    { value: 'pending', label: t('partners.tabPending') },
    { value: 'active', label: t('partners.tabActive') },
    { value: 'suspended', label: t('partners.tabSuspended') },
    { value: 'rejected', label: t('partners.tabRejected') },
  ];

  const brandLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  // Invite and create write into one brand, so both stay off in the all-brands view.
  const writeHint = isAllBrands ? t('partners.selectBrandFirst') : undefined;

  return (
    <PageContainer width="full">
      <PageHeading
        title={t('partners.title')}
        subtitle={t('partners.subtitleFor', { brand: brandLabel })}
        breadcrumb={[{ label: brandLabel }, { label: t('partners.title') }]}
        actions={
          <>
            <RefreshButton onClick={() => refetch()} fetching={isFetching} />
            {canWrite ? (
              // A disabled button gets no pointer events, so the hint sits on a wrapper.
              <span title={writeHint} className="inline-flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setInviteOpen(true)}
                  disabled={isAllBrands}
                >
                  <Send aria-hidden="true" />
                  {t('partners.inviteCta')}
                </Button>
                {isAllBrands ? (
                  <Button size="sm" disabled>
                    <Plus aria-hidden="true" />
                    {t('partners.createCta')}
                  </Button>
                ) : (
                  <Button size="sm" asChild>
                    <Link to="/partner/neu">
                      <Plus aria-hidden="true" />
                      {t('partners.createCta')}
                    </Link>
                  </Button>
                )}
              </span>
            ) : null}
          </>
        }
      />

      <Tabs value={view} onValueChange={(v) => setView(v as View)}>
        <TabsList variant="line" overflow="scroll" className="mb-4">
          <TabsTrigger value="partners">{t('partners.viewPartners')}</TabsTrigger>
          <TabsTrigger value="applications">
            {t('partnerApps.title')}
            {newApplications > 0 ? (
              <CountPill tone={view === 'applications' ? 'accent' : 'muted'}>
                {newApplications}
              </CountPill>
            ) : null}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="applications" className="mt-0">
          <PartnerApplicationsPanel brands={brandList} showBrand={isAllBrands} />
        </TabsContent>
        <TabsContent value="partners" className="mt-0">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <SegmentedControl
                value={tab}
                onValueChange={setTab}
                label={t('partners.statusFilter')}
                overflow="scroll"
                className="w-fit min-w-0"
                options={tabs.map((s) => ({ ...s, count: counts[s.value] }))}
              />
              {partners.length > 5 ? (
                <SearchInput
                  value={search}
                  onValueChange={setSearch}
                  placeholder={t('partners.searchPlaceholder')}
                  containerClassName="sm:max-w-sm xl:w-72 xl:shrink-0"
                />
              ) : null}
            </div>
            {tab !== 'all' ? (
              <p className="-mt-1 text-xs text-muted-foreground">{partnerStatusHint(t, tab)}</p>
            ) : null}

            {error ? <ErrorState error={error} onRetry={refetch} retrying={isFetching} /> : null}

            {isLoading ? (
              <Card>
                <LoadingState label={t('partners.inboxLoading')} />
              </Card>
            ) : filtered.length === 0 ? (
              error ? null : (
                <EmptyState
                  variant="dashed"
                  icon={<Inbox />}
                  message={needle ? t('partners.noSearchResults') : t('partners.inboxEmpty')}
                />
              )
            ) : (
              <>
                <p className="sr-only" aria-live="polite">
                  {filtered.length === 1
                    ? t('partners.countSingular', { count: filtered.length })
                    : t('partners.countPlural', { count: filtered.length })}
                </p>

                <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card md:hidden">
                  {filtered.map((p) => (
                    <PartnerMobileRow
                      key={`${p._brand.companySlug}:${p.id}`}
                      partner={p}
                      showBrand={isAllBrands}
                      linkState={linkState}
                      t={t}
                    />
                  ))}
                </ul>

                {/* The box is the scroll container, so the sticky header anchors to it; the Table's own wrapper must not scroll. */}
                <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block lg:max-h-[calc(100svh-17rem)] lg:overflow-auto lg:overscroll-contain">
                  <Table containerClassName="w-full">
                    <TableHeader sticky>
                      <TableRow>
                        <TableHead>{t('partners.colWorkshop')}</TableHead>
                        <TableHead>{t('partners.colContact')}</TableHead>
                        <TableHead>{t('partners.colLocation')}</TableHead>
                        <TableHead>{t('partners.colStatus')}</TableHead>
                        <TableHead className="text-right">
                          {t('partners.detail.createdAt')}
                        </TableHead>
                        <TableHead className="w-10">
                          <span className="sr-only">{t('partners.openDetail')}</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((p) => (
                        <PartnerTableRow
                          key={`${p._brand.companySlug}:${p.id}`}
                          partner={p}
                          showBrand={isAllBrands}
                          linkState={linkState}
                          bcp47={bcp47}
                          t={t}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      {inviteOpen && !isAllBrands ? (
        <InvitePartnerModal
          companySlug={activeProject.companySlug}
          onClose={() => setInviteOpen(false)}
          onDone={(email) => {
            setInviteOpen(false);
            toast.success(t('partners.invite.sent', { email }));
            void queryClient.invalidateQueries({
              queryKey: ['partners', activeProject.companySlug],
            });
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function placeOf(p: Partner): string | null {
  return [p.postalCode, p.city].filter(Boolean).join(' ') || null;
}

type LinkState = { from: string; ids: { slug: CompanySlug; id: number }[] };

function PartnerTableRow({
  partner: p,
  showBrand,
  linkState,
  bcp47,
  t,
}: {
  partner: PartnerRow;
  showBrand: boolean;
  linkState: LinkState;
  bcp47: string;
  t: ReturnType<typeof useT>;
}) {
  const place = placeOf(p);
  const showLegal = !!p.legalName && p.legalName !== p.companyName;
  return (
    <TableRow className="relative">
      <TableCell className="max-w-[20rem] py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            to={partnerHref(p)}
            state={linkState}
            className={`truncate font-medium text-foreground hover:underline ${ROW_LINK}`}
            title={t('partners.openDetail')}
          >
            {p.companyName ?? t('partners.detail.noCompany')}
          </Link>
          {showBrand ? <BrandChip brand={p._brand} /> : null}
        </div>
        {showLegal ? <p className="truncate text-xs text-muted-foreground">{p.legalName}</p> : null}
      </TableCell>
      <TableCell className="max-w-[18rem] py-2">
        {p.contactEmail ? (
          <p className="truncate text-foreground">{p.contactEmail}</p>
        ) : (
          <p className="text-muted-foreground">—</p>
        )}
        {p.contactPhone ? (
          <p className="truncate text-xs tabular-nums text-muted-foreground">{p.contactPhone}</p>
        ) : null}
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 tabular-nums text-muted-foreground">
        {place ?? '—'}
      </TableCell>
      <TableCell className="py-2">
        <div className="flex flex-wrap items-center gap-1">
          <PartnerStatusBadge status={p.status} />
          {p.verified ? <VerifiedBadge verified /> : null}
        </div>
      </TableCell>
      <TableCell className="whitespace-nowrap py-2 text-right tabular-nums text-muted-foreground">
        {formatDateTime(p.createdAt, bcp47, { dateStyle: 'medium' })}
      </TableCell>
      <TableCell className="w-10 py-2 text-right">
        <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      </TableCell>
    </TableRow>
  );
}

function PartnerMobileRow({
  partner: p,
  showBrand,
  linkState,
  t,
}: {
  partner: PartnerRow;
  showBrand: boolean;
  linkState: LinkState;
  t: ReturnType<typeof useT>;
}) {
  const place = placeOf(p);
  return (
    <li className="relative flex items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-accent/60">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <Link
            to={partnerHref(p)}
            state={linkState}
            className={`min-w-0 truncate text-2sm font-medium text-foreground ${ROW_LINK}`}
          >
            {p.companyName ?? t('partners.detail.noCompany')}
          </Link>
          {p.verified ? <VerifiedBadge verified className="ml-auto" /> : null}
          <PartnerStatusBadge status={p.status} className={p.verified ? undefined : 'ml-auto'} />
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {[place, p.contactEmail ?? p.contactPhone].filter(Boolean).join(' · ') || '—'}
        </p>
        {showBrand ? <BrandChip brand={p._brand} /> : null}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </li>
  );
}

function InvitePartnerModal({
  companySlug,
  onClose,
  onDone,
}: {
  companySlug: CompanySlug;
  onClose: () => void;
  onDone: (email: string) => void;
}) {
  const t = useT();
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      invitesAdminApi.create({
        email: email.trim(),
        companySlug,
        audience: 'partner',
        role: 'partner',
        accessLevel: 'none',
        partner: {
          companyName: companyName.trim(),
          contactPhone: contactPhone.trim() || undefined,
          city: city.trim() || undefined,
        },
      }),
    onSuccess: () => onDone(email.trim()),
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  return (
    <PartnerDialog
      title={t('partners.invite.title')}
      description={t('partners.invite.description', { status: t('partners.status.pending') })}
      onClose={onClose}
      isPending={mutation.isPending}
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!email.trim() || !companyName.trim()) {
            setError(t('partners.form.requiredError'));
            return;
          }
          mutation.mutate();
        }}
      >
        <FormField label={t('partners.form.email')} required>
          <Input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        <FormField label={t('partners.form.companyName')} required>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
        </FormField>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label={t('partners.form.phone')}>
            <Input
              type="tel"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
            />
          </FormField>
          <FormField label={t('partners.form.city')}>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </FormField>
        </div>
        {error ? <Alert tone="destructive">{error}</Alert> : null}
        <PartnerDialogFooter
          onCancel={onClose}
          submitLabel={t('partners.invite.submit')}
          submitIcon={<Send aria-hidden="true" />}
          isPending={mutation.isPending}
        />
      </form>
    </PartnerDialog>
  );
}

function PartnerDialog({
  title,
  description,
  onClose,
  isPending,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  isPending: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o && !isPending) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl" showClose={!isPending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

function PartnerDialogFooter({
  onCancel,
  submitLabel,
  submitIcon,
  isPending,
}: {
  onCancel: () => void;
  submitLabel: string;
  submitIcon?: ReactNode;
  isPending: boolean;
}) {
  const t = useT();
  return (
    <DialogFooter>
      <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" loading={isPending}>
        {submitIcon}
        {submitLabel}
      </Button>
    </DialogFooter>
  );
}
