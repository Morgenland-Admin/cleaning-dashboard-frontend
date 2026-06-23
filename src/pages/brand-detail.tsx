import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, ArrowLeft, Mail, MessageSquare, Send, Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { EmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { useT } from '@/i18n';
import { ApiError, companiesAdminApi, type CompanyListRow, type CompanyStats } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { CompanyLogoOrMark, EditBrandingForm } from '@/pages/companies';

export function BrandDetailPage() {
  const t = useT();
  const { slug = '' } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const userMeta = session?.user as { accessLevel?: string } | undefined;
  const isSuperAdmin = userMeta?.accessLevel === 'super_admin';

  const listQuery = useQuery({
    queryKey: ['companies-admin'],
    queryFn: ({ signal }) => companiesAdminApi.list(signal),
  });

  const statsQuery = useQuery({
    queryKey: ['company-stats', slug],
    queryFn: ({ signal }) => companiesAdminApi.stats(slug, signal),
    enabled: !!slug,
  });

  const company = listQuery.data?.companies.find((c) => c.slug === slug) ?? null;

  useEffect(() => {
    if (company) document.title = `${company.name} · Reinigungs-Portal`;
    return () => {
      document.title = 'Reinigungs-Portal · Operations Console';
    };
  }, [company]);

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['companies-admin'] });
    void queryClient.invalidateQueries({ queryKey: ['company-stats', slug] });
    void queryClient.invalidateQueries({ queryKey: ['projects-companies'] });
  }

  if (listQuery.isLoading) {
    return (
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-4xl flex-col p-4 sm:p-6 lg:p-8">
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2 className="size-4 animate-spin" />
          <span>{t('companies.detail.loading')}</span>
        </div>
      </div>
    );
  }

  if (listQuery.error) {
    return (
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-4xl flex-col p-4 sm:p-6 lg:p-8">
        <ErrorBanner message={(listQuery.error as Error).message} />
      </div>
    );
  }

  if (!company) {
    return (
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-4xl flex-col p-4 sm:p-6 lg:p-8">
        <PageHeading
          title={t('companies.detail.notFound')}
          subtitle={t('companies.detail.notFoundSubtitle', { slug })}
          breadcrumb={
            <Link to="/companies" className="hover:underline">
              {t('companies.title')}
            </Link>
          }
        />
        <EmptyState
          message={t('companies.detail.noAccessMessage')}
          action={
            <button
              type="button"
              onClick={() => navigate('/companies')}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm hover:bg-muted"
            >
              <ArrowLeft className="size-4" /> {t('companies.detail.backToList')}
            </button>
          }
        />
      </div>
    );
  }

  const canEdit = isSuperAdmin || company.role === 'owner' || company.role === 'admin';

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-4xl flex-col p-4 sm:p-6 lg:p-8">
      <PageHeading
        title={company.name}
        subtitle={
          <>
            <span className="font-mono">{company.slug}</span> · {t('companies.schemaLabel')} „
            {company.schemaName}"
            {!company.isActive ? (
              <>
                {' · '}
                <span className="font-medium text-warning">{t('companies.inactiveLabel')}</span>
              </>
            ) : null}
          </>
        }
        breadcrumb={
          <Link to="/companies" className="hover:underline">
            {t('companies.title')}
          </Link>
        }
        actions={<CompanyLogoOrMark company={company} size="lg" />}
      />

      <StatsRow
        stats={statsQuery.data?.stats}
        isLoading={statsQuery.isLoading}
        error={statsQuery.error as Error | null}
        t={t}
      />

      <section
        aria-labelledby="brand-edit-heading"
        className="mt-8 rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <h2 id="brand-edit-heading" className="font-serif text-xl font-semibold tracking-tight">
          {t('companies.edit.title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('companies.edit.subtitle')}</p>
        {canEdit ? (
          <EditBrandingForm
            company={company}
            onClose={() => navigate('/companies')}
            onSaved={invalidate}
          />
        ) : (
          <p className="mt-4 rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            {t('companies.edit.roleNotice', { role: company.role })}
          </p>
        )}
      </section>
    </div>
  );
}

function StatsRow({
  stats,
  isLoading,
  error,
  t,
}: {
  stats: CompanyStats | undefined;
  isLoading: boolean;
  error: Error | null;
  t: ReturnType<typeof useT>;
}) {
  if (error) return <ErrorBanner message={error.message} />;

  return (
    <div
      role="region"
      aria-label={t('companies.detail.statsRegionLabel')}
      className="grid grid-cols-1 gap-3 sm:grid-cols-3"
    >
      <StatCard
        title={t('companies.detail.newsletter')}
        icon={<Mail className="size-4" aria-hidden="true" />}
        primary={stats?.newsletter.confirmed}
        primaryLabel={t('companies.detail.newsletterPrimary')}
        secondary={[
          { label: t('companies.detail.newsletterPending'), value: stats?.newsletter.pending },
          {
            label: t('companies.detail.newsletterUnsubscribed'),
            value: stats?.newsletter.unsubscribed,
          },
        ]}
        isLoading={isLoading}
      />
      <StatCard
        title={t('companies.detail.contacts')}
        icon={<MessageSquare className="size-4" aria-hidden="true" />}
        primary={stats?.contact.new}
        primaryLabel={t('companies.detail.contactsPrimary')}
        secondary={[
          { label: t('companies.detail.contactsTotal'), value: stats?.contact.total },
          { label: t('companies.detail.contactsLast7'), value: stats?.contact.last7Days },
        ]}
        isLoading={isLoading}
      />
      <StatCard
        title={t('companies.detail.inquiries')}
        icon={<Send className="size-4" aria-hidden="true" />}
        primary={stats?.inquiry.openCount}
        primaryLabel={t('companies.detail.inquiriesPrimary')}
        secondary={[
          { label: t('companies.detail.inquiriesTotal'), value: stats?.inquiry.total },
          { label: t('companies.detail.inquiriesLast7'), value: stats?.inquiry.last7Days },
        ]}
        isLoading={isLoading}
      />
    </div>
  );
}

function StatCard({
  title,
  icon,
  primary,
  primaryLabel,
  secondary,
  isLoading,
}: {
  title: string;
  icon: React.ReactNode;
  primary: number | undefined;
  primaryLabel: string;
  secondary: Array<{ label: string; value: number | undefined }>;
  isLoading: boolean;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4">
      <header className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        <span>{title}</span>
      </header>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums" aria-busy={isLoading || undefined}>
          {isLoading ? (
            <Loader2 className="inline size-5 animate-spin" aria-hidden="true" />
          ) : (
            (primary ?? 0).toLocaleString()
          )}
        </span>
        <span className="text-xs text-muted-foreground">{primaryLabel}</span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
        {secondary.map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt>{s.label}</dt>
            <dd className="font-medium tabular-nums text-foreground">
              {isLoading ? '—' : (s.value ?? 0).toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

export type { CompanyListRow };
export { ApiError };
