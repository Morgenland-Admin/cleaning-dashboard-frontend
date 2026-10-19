import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Mail, MessageSquare, Send } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionHeading } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useLocale, type useT } from '@/i18n';
import { useIsSeoOnly } from '@/lib/access';
import { companiesAdminApi, type CompanyStats } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';
import { formatNumber } from '@/lib/utils';
import { CompanyLogoOrMark, EditBrandingForm } from '@/pages/companies';

type T = ReturnType<typeof useT>;

const MEMBERSHIP_ROLES = ['owner', 'admin', 'manager', 'viewer', 'partner'] as const;

function roleLabel(role: string, t: T): string {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(role)
    ? t(`profile.role.${role as (typeof MEMBERSHIP_ROLES)[number]}`)
    : role;
}

export function BrandDetailPage() {
  const { t, bcp47 } = useLocale();
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userMeta = session?.user as { accessLevel?: string } | undefined;
  const isSuperAdmin = userMeta?.accessLevel === 'super_admin';
  const seoOnly = useIsSeoOnly();

  const listQuery = useQuery({
    queryKey: ['companies-admin'],
    queryFn: ({ signal }) => companiesAdminApi.list(signal),
  });

  const statsQuery = useQuery({
    queryKey: ['company-stats', slug],
    queryFn: ({ signal }) => companiesAdminApi.stats(slug, signal),
    // Order counts and revenue are outside the `seo` scope (backend 403s).
    enabled: !!slug && !seoOnly,
  });

  const company = listQuery.data?.companies.find((c) => c.slug === slug) ?? null;
  usePageTitle(company?.name ?? t('companies.title'));

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['companies-admin'] });
    void queryClient.invalidateQueries({ queryKey: ['company-stats', slug] });
    void queryClient.invalidateQueries({ queryKey: ['projects-companies'] });
  }

  const backLink = (
    <BackLink to="/companies" className="mb-2 self-start">
      {t('companies.title')}
    </BackLink>
  );

  if (listQuery.isLoading) {
    return (
      <PageContainer>
        {backLink}
        <LoadingState label={t('companies.detail.loading')} />
      </PageContainer>
    );
  }

  if (listQuery.error) {
    return (
      <PageContainer>
        {backLink}
        <ErrorState
          error={listQuery.error}
          onRetry={() => void listQuery.refetch()}
          retrying={listQuery.isFetching}
        />
      </PageContainer>
    );
  }

  if (!company) {
    return (
      <PageContainer>
        {backLink}
        <PageHeading
          title={t('companies.detail.notFound')}
          subtitle={t('companies.detail.notFoundSubtitle', { slug })}
        />
        <EmptyState
          variant="dashed"
          icon={<Building2 aria-hidden="true" />}
          message={t('companies.detail.noAccessMessage')}
        />
      </PageContainer>
    );
  }

  const canEdit = isSuperAdmin || company.role === 'owner' || company.role === 'admin';

  return (
    <PageContainer>
      {backLink}
      <PageHeading
        title={
          <span className="inline-flex min-w-0 items-center gap-3">
            <CompanyLogoOrMark company={company} size="sm" />
            <span className="min-w-0">{company.name}</span>
          </span>
        }
        meta={
          <>
            <span className="text-2sm text-muted-foreground">
              {company.slug} · {t('companies.schemaLabel')} „{company.schemaName}“
            </span>
            {!company.isActive ? (
              <Badge variant="warning">{t('companies.inactiveLabel')}</Badge>
            ) : null}
          </>
        }
      />

      <div className="flex flex-col gap-8">
        {seoOnly ? null : (
          <StatsRow
            stats={statsQuery.data?.stats}
            isLoading={statsQuery.isLoading}
            error={statsQuery.error}
            onRetry={() => void statsQuery.refetch()}
            retrying={statsQuery.isFetching}
            bcp47={bcp47}
            t={t}
          />
        )}

        <section aria-labelledby="brand-edit-heading" className="flex flex-col gap-4">
          <SectionHeading id="brand-edit-heading" description={t('companies.edit.subtitle')}>
            {t('companies.edit.title')}
          </SectionHeading>
          {canEdit ? (
            <EditBrandingForm
              company={company}
              onClose={() => navigate('/companies')}
              onSaved={invalidate}
            />
          ) : (
            <Alert tone="neutral">
              {t('companies.edit.roleNotice', { role: roleLabel(company.role, t) })}
            </Alert>
          )}
        </section>
      </div>
    </PageContainer>
  );
}

function StatsRow({
  stats,
  isLoading,
  error,
  onRetry,
  retrying,
  bcp47,
  t,
}: {
  stats: CompanyStats | undefined;
  isLoading: boolean;
  error: Error | null;
  onRetry: () => void;
  retrying: boolean;
  bcp47: string;
  t: T;
}) {
  if (error) return <ErrorState error={error} onRetry={onRetry} retrying={retrying} />;

  const n = (value: number | undefined) => formatNumber(value ?? 0, bcp47);
  const hint = (primaryLabel: string, rest: Array<{ label: string; value: number | undefined }>) =>
    stats
      ? [primaryLabel, ...rest.map((r) => `${n(r.value)} ${r.label}`)].join(' · ')
      : primaryLabel;

  return (
    <section aria-label={t('companies.detail.statsRegionLabel')}>
      <StatGrid className="grid-cols-1 sm:grid-cols-3 xl:grid-cols-3">
        <StatTile
          label={t('companies.detail.newsletter')}
          icon={<Mail aria-hidden="true" />}
          value={n(stats?.newsletter.confirmed)}
          loading={isLoading}
          hint={hint(t('companies.detail.newsletterPrimary'), [
            { label: t('companies.detail.newsletterPending'), value: stats?.newsletter.pending },
            {
              label: t('companies.detail.newsletterUnsubscribed'),
              value: stats?.newsletter.unsubscribed,
            },
          ])}
        />
        <StatTile
          label={t('companies.detail.contacts')}
          icon={<MessageSquare aria-hidden="true" />}
          value={n(stats?.contact.new)}
          tone={(stats?.contact.new ?? 0) > 0 ? 'attention' : 'default'}
          loading={isLoading}
          hint={hint(t('companies.detail.contactsPrimary'), [
            { label: t('companies.detail.contactsTotal'), value: stats?.contact.total },
            { label: t('companies.detail.contactsLast7'), value: stats?.contact.last7Days },
          ])}
        />
        <StatTile
          label={t('companies.detail.inquiries')}
          icon={<Send aria-hidden="true" />}
          value={n(stats?.inquiry.openCount)}
          tone={(stats?.inquiry.openCount ?? 0) > 0 ? 'attention' : 'default'}
          loading={isLoading}
          hint={hint(t('companies.detail.inquiriesPrimary'), [
            { label: t('companies.detail.inquiriesTotal'), value: stats?.inquiry.total },
            { label: t('companies.detail.inquiriesLast7'), value: stats?.inquiry.last7Days },
          ])}
        />
      </StatGrid>
    </section>
  );
}
