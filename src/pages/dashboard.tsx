import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Inbox, Mail, MessageSquare, Send } from 'lucide-react';
import { Link } from 'react-router-dom';

import { BrandChip, BrandMark } from '@/components/brand-mark';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard, SectionHeading } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject, type Project } from '@/contexts/project-context';
import { useLocale } from '@/i18n';
import { dashboardAdminApi, type DashboardActivityItem, type DashboardBrandStats } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { useNow } from '@/lib/use-now';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime, formatNumber } from '@/lib/utils';

type T = ReturnType<typeof useLocale>['t'];

export function DashboardPage() {
  const { data: session } = useSession();
  const { t, bcp47 } = useLocale();
  const { projects } = useProject();
  usePageTitle(t('nav.overview'));
  const now = useNow(60_000);
  const hour = new Date(now).getHours();

  const query = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: ({ signal }) => dashboardAdminApi.summary(signal),
  });

  const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? 'Admin';
  const greeting = t(
    hour < 11
      ? 'dashboard.greeting'
      : hour < 18
        ? 'dashboard.greetingAfternoon'
        : 'dashboard.greetingEvening',
    { name: firstName },
  );

  const brands = query.data?.brands ?? [];
  const totals = brands.reduce(
    (sum, b) => ({
      inquiries: sum.inquiries + b.inquiry.openCount,
      contacts: sum.contacts + b.contact.new,
      newsletter: sum.newsletter + b.newsletter.confirmed,
    }),
    { inquiries: 0, contacts: 0, newsletter: 0 },
  );
  const totalOpenWork = totals.contacts + totals.inquiries;

  const brandFor = (slug: string) => projects.find((p) => p.companySlug === slug);

  return (
    <PageContainer width="full">
      <PageHeading
        title={greeting}
        subtitle={
          query.error ? null : (
            <span aria-live="polite">
              {query.isLoading
                ? t('dashboard.loadingSummary')
                : totalOpenWork === 0
                  ? t('dashboard.allClear')
                  : t('dashboard.openWork', { n: totalOpenWork })}
            </span>
          )
        }
      />

      {query.error ? (
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className="flex flex-col gap-6">
          <section aria-label={t('dashboard.totalsLabel')}>
            <StatGrid className="grid-cols-1 sm:grid-cols-3 xl:grid-cols-3">
              <StatTile
                label={t('dashboard.totalInquiries')}
                icon={<Send aria-hidden="true" />}
                value={formatNumber(totals.inquiries, bcp47)}
                tone={totals.inquiries > 0 ? 'attention' : 'default'}
                loading={query.isLoading}
              />
              <StatTile
                label={t('dashboard.totalContacts')}
                icon={<MessageSquare aria-hidden="true" />}
                value={formatNumber(totals.contacts, bcp47)}
                tone={totals.contacts > 0 ? 'attention' : 'default'}
                loading={query.isLoading}
              />
              <StatTile
                label={t('dashboard.totalNewsletter')}
                icon={<Mail aria-hidden="true" />}
                value={formatNumber(totals.newsletter, bcp47)}
                loading={query.isLoading}
              />
            </StatGrid>
          </section>

          <section aria-labelledby="brands-heading" className="flex flex-col gap-3">
            <SectionHeading id="brands-heading">{t('dashboard.brandsHeading')}</SectionHeading>
            {query.isLoading ? (
              <BrandStatsSkeleton />
            ) : brands.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {brands.map((b) => (
                  <BrandStatsCard
                    key={b.slug}
                    stats={b}
                    brand={brandFor(b.slug)}
                    bcp47={bcp47}
                    t={t}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                variant="dashed"
                icon={<Inbox aria-hidden="true" />}
                message={t('dashboard.noBrands')}
              />
            )}
          </section>

          <SectionCard title={t('dashboard.activityHeading')} bodyClassName="p-0 sm:p-0">
            {query.isLoading ? (
              <LoadingState label={t('dashboard.loadingActivity')} />
            ) : query.data && query.data.activity.length > 0 ? (
              <ul className="divide-y divide-border">
                {query.data.activity.map((item) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    brand={brandFor(item.companySlug)}
                    bcp47={bcp47}
                    t={t}
                  />
                ))}
              </ul>
            ) : (
              <EmptyState size="sm" message={t('dashboard.noActivity')} />
            )}
          </SectionCard>
        </div>
      )}
    </PageContainer>
  );
}

function BrandStatsCard({
  stats,
  brand,
  bcp47,
  t,
}: {
  stats: DashboardBrandStats;
  brand: Project | undefined;
  bcp47: string;
  t: T;
}) {
  const hasOpenWork = stats.contact.new + stats.inquiry.openCount > 0;
  return (
    <SectionCard
      headingLevel={3}
      title={
        <span className="flex min-w-0 items-center gap-2">
          {brand ? <BrandMark brand={brand} size="sm" /> : null}
          <span className="truncate">{stats.name}</span>
        </span>
      }
      description={
        hasOpenWork
          ? t('dashboard.openWorkLine', {
              contact: stats.contact.new,
              inquiry: stats.inquiry.openCount,
            })
          : t('dashboard.brandAllClear')
      }
      actions={
        <Button asChild variant="ghost" size="icon-sm">
          <Link
            to={`/companies/${stats.slug}`}
            aria-label={t('dashboard.openBrand', { name: stats.name })}
          >
            <ChevronRight aria-hidden="true" />
          </Link>
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          size="sm"
          icon={<Mail aria-hidden="true" />}
          label={t('dashboard.metricNewsletter')}
          value={formatNumber(stats.newsletter.confirmed, bcp47)}
        />
        <StatTile
          size="sm"
          icon={<MessageSquare aria-hidden="true" />}
          label={t('dashboard.metricContactNew')}
          value={formatNumber(stats.contact.new, bcp47)}
          tone={stats.contact.new > 0 ? 'attention' : 'default'}
        />
        <StatTile
          size="sm"
          icon={<Send aria-hidden="true" />}
          label={t('dashboard.metricInquiryOpen')}
          value={formatNumber(stats.inquiry.openCount, bcp47)}
          tone={stats.inquiry.openCount > 0 ? 'attention' : 'default'}
        />
      </div>
    </SectionCard>
  );
}

const ACTIVITY_ICON: Record<DashboardActivityItem['kind'], React.ReactNode> = {
  contact: <MessageSquare className="size-4" aria-hidden="true" />,
  inquiry: <Send className="size-4" aria-hidden="true" />,
  newsletter: <Mail className="size-4" aria-hidden="true" />,
};

function activityHref(item: DashboardActivityItem): string {
  if (item.kind === 'contact') return `/contacts/${item.companySlug}/${item.rowId}`;
  if (item.kind === 'inquiry') return `/inquiries/${item.companySlug}/${item.rowId}`;
  return '/newsletter';
}

function ActivityRow({
  item,
  brand,
  bcp47,
  t,
}: {
  item: DashboardActivityItem;
  brand: Project | undefined;
  bcp47: string;
  t: T;
}) {
  const { setBrandView } = useProject();
  // The record page reads the active brand from context, so switch to the record's brand before navigating.
  const opensRecord = item.kind !== 'newsletter';
  const kind = t(`dashboard.kind.${item.kind}`);
  const time = formatDateTime(item.createdAt, bcp47);
  return (
    <li>
      <Link
        to={activityHref(item)}
        onClick={opensRecord ? () => setBrandView(item.companySlug) : undefined}
        className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        <span className="shrink-0 text-muted-foreground">{ACTIVITY_ICON[item.kind]}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-2sm font-medium text-foreground">
            {item.title}
            {item.subtitle ? (
              <span className="font-normal text-muted-foreground"> · {item.subtitle}</span>
            ) : null}
          </p>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
            {brand ? <BrandChip brand={brand} /> : <span>{item.companyName}</span>}
            <span className="truncate">{kind}</span>
          </p>
        </div>
        <span className="hidden shrink-0 sm:inline-flex">
          {brand ? (
            <BrandChip brand={brand} />
          ) : (
            <span className="text-xs text-muted-foreground">{item.companyName}</span>
          )}
        </span>
        <span className="hidden w-32 shrink-0 truncate text-xs text-muted-foreground sm:block">
          {kind}
        </span>
        <time
          dateTime={item.createdAt}
          className="shrink-0 text-right text-xs tabular-nums text-muted-foreground"
        >
          {time}
        </time>
      </Link>
    </li>
  );
}

function BrandStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-5 w-1/2" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
