import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  CalendarClock,
  CheckSquare,
  ChevronRight,
  ClipboardList,
  FileWarning,
  FilePen,
  Inbox,
  Mail,
  MessageSquare,
  PhoneCall,
  Send,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router-dom';

import { BrandChip, BrandMark } from '@/components/brand-mark';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SectionCard } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useProject, type Project } from '@/contexts/project-context';
import { useLocale } from '@/i18n';
import { dashboardAdminApi, type DashboardActivityItem, type DashboardBrandStats } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { useNow } from '@/lib/use-now';
import { useOrderKindLabel } from '@/lib/use-order-kind-label';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';

type T = ReturnType<typeof useLocale>['t'];

const ACTIVITY_SHOWN = 10;

interface Totals {
  inquiriesNew: number;
  channels: { phone: number; email: number; web: number };
  inquiriesOpen: number;
  humanCallbacks: number;
  contactsNew: number;
  ordersOpen: number;
  ordersToday: number;
  invoicesOverdue: number;
  invoicesDraft: number;
  applicationsNew: number;
  chatUnread: number;
  tasksOpen: number;
  inquiries7d: number;
  contacts7d: number;
  orders7d: number;
  newsletter: number;
}

function sumStats(brands: DashboardBrandStats[]): Totals {
  const t: Totals = {
    inquiriesNew: 0,
    channels: { phone: 0, email: 0, web: 0 },
    inquiriesOpen: 0,
    humanCallbacks: 0,
    contactsNew: 0,
    ordersOpen: 0,
    ordersToday: 0,
    invoicesOverdue: 0,
    invoicesDraft: 0,
    applicationsNew: 0,
    chatUnread: 0,
    tasksOpen: 0,
    inquiries7d: 0,
    contacts7d: 0,
    orders7d: 0,
    newsletter: 0,
  };
  for (const b of brands) {
    t.inquiriesNew += b.inquiry.new ?? b.inquiry.openCount;
    t.channels.phone += b.inquiry.channels?.phone ?? 0;
    t.channels.email += b.inquiry.channels?.email ?? 0;
    t.channels.web += b.inquiry.channels?.web ?? 0;
    t.inquiriesOpen += b.inquiry.openCount;
    t.humanCallbacks += b.inquiry.humanCallbacks ?? 0;
    t.contactsNew += b.contact.new;
    t.ordersOpen += b.orders?.open ?? 0;
    t.ordersToday += b.orders?.today ?? 0;
    t.invoicesOverdue += b.invoices?.overdue ?? 0;
    t.invoicesDraft += b.invoices?.draft ?? 0;
    t.applicationsNew += b.partnerApplications?.new ?? 0;
    t.chatUnread += b.chat?.unread ?? 0;
    t.tasksOpen += b.tasks?.open ?? 0;
    t.inquiries7d += b.inquiry.last7Days;
    t.contacts7d += b.contact.last7Days;
    t.orders7d += b.orders?.last7Days ?? 0;
    t.newsletter += b.newsletter.confirmed;
  }
  return t;
}

interface AttentionItem {
  key: string;
  to: string;
  icon: LucideIcon;
  label: string;
  detail?: string | null;
  count: number;
  urgent?: boolean;
}

function attentionItems(x: Totals, t: T, bcp47: string): AttentionItem[] {
  const channelParts = (['phone', 'email', 'web'] as const)
    .filter((c) => x.channels[c] > 0)
    .map((c) => `${formatNumber(x.channels[c], bcp47)} ${t(`notifications.channel.${c}`)}`);
  const inReview = x.inquiriesOpen - x.inquiriesNew;
  const inquiryDetail = [
    channelParts.join(' · '),
    inReview > 0 ? t('dashboard.attention.inReview', { n: formatNumber(inReview, bcp47) }) : '',
  ]
    .filter(Boolean)
    .join(' — ');
  const items: AttentionItem[] = [
    {
      key: 'ordersToday',
      to: '/auftraege',
      icon: CalendarClock,
      label: t('dashboard.attention.ordersToday'),
      count: x.ordersToday,
      urgent: true,
    },
    {
      key: 'invoicesOverdue',
      to: '/rechnungen?status=overdue',
      icon: FileWarning,
      label: t('dashboard.attention.invoicesOverdue'),
      count: x.invoicesOverdue,
      urgent: true,
    },
    {
      key: 'callbacks',
      to: '/callbacks',
      icon: PhoneCall,
      label: t('dashboard.attention.callbacks'),
      count: x.humanCallbacks,
      urgent: true,
    },
    {
      key: 'inquiries',
      to: '/inquiries?status=new',
      icon: ClipboardList,
      label: t('dashboard.attention.inquiriesNew'),
      detail: inquiryDetail || null,
      count: x.inquiriesNew,
    },
    {
      key: 'contacts',
      to: '/contacts?status=new',
      icon: Mail,
      label: t('dashboard.attention.contactsNew'),
      count: x.contactsNew,
    },
    {
      key: 'chat',
      to: '/chat',
      icon: MessageSquare,
      label: t('dashboard.attention.chatUnread'),
      count: x.chatUnread,
    },
    {
      key: 'tasks',
      to: '/tasks',
      icon: CheckSquare,
      label: t('dashboard.attention.tasksOpen'),
      count: x.tasksOpen,
    },
    {
      key: 'ordersOpen',
      to: '/auftraege?status=open',
      icon: Briefcase,
      label: t('dashboard.attention.ordersOpen'),
      count: x.ordersOpen,
    },
    {
      key: 'invoicesDraft',
      to: '/rechnungen?status=draft',
      icon: FilePen,
      label: t('dashboard.attention.invoicesDraft'),
      count: x.invoicesDraft,
    },
    {
      key: 'applications',
      to: '/partner?tab=bewerbungen',
      icon: UserPlus,
      label: t('dashboard.attention.applicationsNew'),
      count: x.applicationsNew,
    },
  ];
  return items.filter((i) => i.count > 0);
}

export function DashboardPage() {
  const { data: session } = useSession();
  const { t, bcp47 } = useLocale();
  const { projects, activeProject, isAllBrands } = useProject();
  usePageTitle(t('nav.overview'));
  const now = useNow(60_000);
  const hour = new Date(now).getHours();

  const query = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: ({ signal }) => dashboardAdminApi.summary(signal),
    refetchInterval: 120_000,
  });

  const firstName = session?.user?.name?.trim().split(/\s+/)[0] || t('dashboard.fallbackName');
  const greeting = t(
    hour < 11
      ? 'dashboard.greeting'
      : hour < 18
        ? 'dashboard.greetingAfternoon'
        : 'dashboard.greetingEvening',
    { name: firstName },
  );

  const allBrands = query.data?.brands ?? [];
  const brands = isAllBrands
    ? allBrands
    : allBrands.filter((b) => b.slug === activeProject.companySlug);
  const totals = sumStats(brands);
  const attention = attentionItems(totals, t, bcp47);
  const attentionTotal = attention.reduce((n, i) => n + i.count, 0);
  const activity = (query.data?.activity ?? [])
    .filter((a) => isAllBrands || a.companySlug === activeProject.companySlug)
    .slice(0, ACTIVITY_SHOWN);
  const scopeLabel = isAllBrands ? t('brandFilter.allBrands') : activeProject.name;
  const brandFor = (slug: string) => projects.find((p) => p.companySlug === slug);

  return (
    <PageContainer width="full">
      <PageHeading
        title={greeting}
        subtitle={
          query.error ? null : query.isLoading ? (
            t('dashboard.loadingSummary')
          ) : (
            <>
              <span className="font-medium text-foreground">{scopeLabel}</span>
              {' · '}
              {attentionTotal === 0 ? t('dashboard.allClear') : t('dashboard.attentionSubtitle')}
            </>
          )
        }
        actions={<RefreshButton fetching={query.isFetching} onClick={() => void query.refetch()} />}
      />

      {query.error && !query.data ? (
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <SectionCard
              title={t('dashboard.attention.title')}
              description={t('dashboard.attention.description')}
              bodyClassName="p-0 sm:p-0"
            >
              {query.isLoading ? (
                <AttentionSkeleton />
              ) : attention.length === 0 ? (
                <EmptyState
                  size="sm"
                  icon={<Inbox aria-hidden="true" />}
                  title={t('dashboard.allClearTitle')}
                  message={t('dashboard.allClear')}
                />
              ) : (
                <ul className="divide-y divide-border">
                  {attention.map((item) => (
                    <AttentionRow key={item.key} item={item} bcp47={bcp47} />
                  ))}
                </ul>
              )}
            </SectionCard>

            <section aria-labelledby="dashboard-week" className="flex flex-col gap-3">
              <h2 id="dashboard-week" className="text-sm font-semibold text-foreground">
                {t('dashboard.weekHeading')}
              </h2>
              <StatGrid className="grid-cols-2 sm:grid-cols-4 xl:grid-cols-4">
                <StatTile
                  label={t('dashboard.metric.inquiries7d')}
                  icon={<Send aria-hidden="true" />}
                  value={formatNumber(totals.inquiries7d, bcp47)}
                  loading={query.isLoading}
                />
                <StatTile
                  label={t('dashboard.metric.orders7d')}
                  icon={<Briefcase aria-hidden="true" />}
                  value={formatNumber(totals.orders7d, bcp47)}
                  loading={query.isLoading}
                />
                <StatTile
                  label={t('dashboard.metric.contacts7d')}
                  icon={<MessageSquare aria-hidden="true" />}
                  value={formatNumber(totals.contacts7d, bcp47)}
                  loading={query.isLoading}
                />
                <StatTile
                  label={t('dashboard.metric.newsletter')}
                  icon={<Mail aria-hidden="true" />}
                  value={formatNumber(totals.newsletter, bcp47)}
                  loading={query.isLoading}
                />
              </StatGrid>
            </section>

            {isAllBrands && (query.isLoading || allBrands.length > 1) ? (
              <section aria-labelledby="dashboard-brands" className="flex flex-col gap-3">
                <h2 id="dashboard-brands" className="text-sm font-semibold text-foreground">
                  {t('dashboard.brandsHeading')}
                </h2>
                {query.isLoading ? (
                  <BrandStatsSkeleton />
                ) : (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {allBrands.map((b) => (
                      <BrandStatsCard
                        key={b.slug}
                        stats={b}
                        brand={brandFor(b.slug)}
                        bcp47={bcp47}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </section>
            ) : null}
            {!query.isLoading && allBrands.length === 0 ? (
              <EmptyState
                variant="dashed"
                icon={<Inbox aria-hidden="true" />}
                message={t('dashboard.noBrands')}
              />
            ) : null}
          </div>

          <SectionCard
            title={t('dashboard.activityHeading')}
            description={t('dashboard.activityDescription')}
            bodyClassName="p-0 sm:p-0"
            className="self-start"
          >
            {query.isLoading ? (
              <LoadingState label={t('dashboard.loadingActivity')} />
            ) : activity.length > 0 ? (
              <ul className="divide-y divide-border">
                {activity.map((item) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    brand={isAllBrands ? brandFor(item.companySlug) : undefined}
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

function AttentionRow({ item, bcp47 }: { item: AttentionItem; bcp47: string }) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.to}
        className="flex min-h-12 items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-md [&_svg]:size-4',
            item.urgent ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground',
          )}
          aria-hidden="true"
        >
          <Icon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-2sm font-medium text-foreground">{item.label}</span>
          {item.detail ? (
            <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
          ) : null}
        </span>
        <span
          className={cn(
            'shrink-0 text-base font-semibold tabular-nums',
            item.urgent ? 'text-primary' : 'text-foreground',
          )}
        >
          {formatNumber(item.count, bcp47)}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </Link>
    </li>
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
  const { setBrandView } = useProject();
  const inquiriesNew = stats.inquiry.new ?? stats.inquiry.openCount;
  const ordersOpen = stats.orders?.open ?? 0;
  return (
    <SectionCard
      headingLevel={3}
      title={
        <span className="flex min-w-0 items-center gap-2">
          {brand ? <BrandMark brand={brand} size="sm" /> : null}
          <span className="truncate">{stats.name}</span>
        </span>
      }
      actions={
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() => setBrandView(stats.slug)}
          aria-label={t('dashboard.showBrand', { name: stats.name })}
        >
          {t('dashboard.showBrandShort')}
          <ChevronRight aria-hidden="true" />
        </Button>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          size="sm"
          icon={<ClipboardList aria-hidden="true" />}
          label={t('dashboard.metric.inquiriesNew')}
          value={formatNumber(inquiriesNew, bcp47)}
          tone={inquiriesNew > 0 ? 'attention' : 'default'}
        />
        <StatTile
          size="sm"
          icon={<MessageSquare aria-hidden="true" />}
          label={t('dashboard.metric.contactsNew')}
          value={formatNumber(stats.contact.new, bcp47)}
          tone={stats.contact.new > 0 ? 'attention' : 'default'}
        />
        <StatTile
          size="sm"
          icon={<Briefcase aria-hidden="true" />}
          label={t('dashboard.metric.ordersOpen')}
          value={formatNumber(ordersOpen, bcp47)}
        />
      </div>
    </SectionCard>
  );
}

function activityHref(item: DashboardActivityItem): string {
  switch (item.kind) {
    case 'contact':
      return `/contacts/${item.companySlug}/${item.rowId}`;
    case 'inquiry':
      return `/inquiries/${item.companySlug}/${item.rowId}`;
    case 'order':
      return `/auftraege/${item.rowId}`;
    default:
      return '/newsletter';
  }
}

const ACTIVITY_ICON: Record<string, LucideIcon> = {
  contact: MessageSquare,
  inquiry: Send,
  newsletter: Mail,
  order: Briefcase,
};

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
  const kindLabel = useOrderKindLabel(item.kind === 'order' ? item.companySlug : null);
  const Icon = ACTIVITY_ICON[item.kind] ?? Inbox;
  const kind = t(`dashboard.kind.${item.kind}`) || item.kind;
  const subtitle =
    item.kind === 'order'
      ? [kindLabel(item.orderKind), item.subtitle].filter(Boolean).join(' · ')
      : item.subtitle;
  const title = item.title.trim() || t('notifications.noName');
  return (
    <li>
      <Link
        to={activityHref(item)}
        // The record page reads the active brand from context.
        onClick={item.kind === 'newsletter' ? undefined : () => setBrandView(item.companySlug)}
        className="flex items-start gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-5"
      >
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-3">
            <span
              className={cn(
                'truncate text-2sm font-medium',
                item.title.trim() ? 'text-foreground' : 'italic text-muted-foreground',
              )}
            >
              {title}
            </span>
            <time
              dateTime={item.createdAt}
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
            >
              {formatDateTime(item.createdAt, bcp47, {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </time>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {brand ? <BrandChip brand={brand} /> : null}
            <span className="shrink-0">{kind}</span>
            {subtitle ? <span className="truncate">· {subtitle}</span> : null}
          </span>
        </span>
      </Link>
    </li>
  );
}

function AttentionSkeleton() {
  return (
    <div className="divide-y divide-border" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 sm:px-5">
          <Skeleton className="size-8" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-10" />
        </div>
      ))}
    </div>
  );
}

function BrandStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3 rounded-lg border bg-card p-4">
          <Skeleton className="h-5 w-1/2" />
          <div className="grid grid-cols-3 gap-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        </div>
      ))}
    </div>
  );
}
