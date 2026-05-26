import { useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowRight, Inbox, Loader2, Mail, MessageSquare, Send } from 'lucide-react';
import { Link } from 'react-router-dom';

import { EmptyState } from '@/components/empty-state';
import { useLocale } from '@/i18n';
import { dashboardAdminApi, type DashboardActivityItem, type DashboardBrandStats } from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime } from '@/lib/utils';

export function DashboardPage() {
  const { data: session } = useSession();
  const { t, bcp47 } = useLocale();
  usePageTitle(t('nav.overview'));

  const query = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: ({ signal }) => dashboardAdminApi.summary(signal),
  });

  const firstName = session?.user?.name?.trim().split(/\s+/)[0] ?? 'Admin';
  const greeting = t('dashboard.greeting', { name: firstName });
  const greetingParts = greeting.split(firstName);
  const greetingPre = greetingParts[0] ?? '';
  const greetingPost = greetingParts.slice(1).join(firstName);

  const totalOpenWork =
    query.data?.brands.reduce((sum, b) => sum + b.contact.new + b.inquiry.openCount, 0) ?? 0;

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-4 sm:gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="font-serif text-[28px] font-semibold leading-[1.1] tracking-tight sm:text-[36px] lg:text-[44px]">
          <span>{greetingPre}</span>
          <span className="italic text-rust">{firstName}</span>
          <span>{greetingPost}</span>
        </h1>
        <p
          className="text-[13px] leading-relaxed text-muted-foreground sm:text-sm"
          aria-live="polite"
        >
          {query.isLoading
            ? t('dashboard.loadingSummary')
            : totalOpenWork === 0
              ? t('dashboard.allClear')
              : t('dashboard.openWork', { n: totalOpenWork })}
        </p>
      </section>

      {query.error ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{(query.error as Error).message}</span>
        </div>
      ) : null}

      <section aria-labelledby="brands-heading" className="flex flex-col gap-3">
        <h2
          id="brands-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {t('dashboard.brandsHeading')}
        </h2>
        {query.isLoading ? (
          <BrandStatsSkeleton />
        ) : query.data && query.data.brands.length > 0 ? (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {query.data.brands.map((b) => (
              <BrandStatsCard key={b.slug} brand={b} t={t} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Inbox className="size-6" aria-hidden="true" />}
            message={t('dashboard.noBrands')}
          />
        )}
      </section>

      <section aria-labelledby="activity-heading" className="flex flex-col gap-3">
        <h2
          id="activity-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
        >
          {t('dashboard.activityHeading')}
        </h2>
        <div className="rounded-xl border border-border bg-card">
          {query.isLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>{t('dashboard.loadingActivity')}</span>
            </div>
          ) : query.data && query.data.activity.length > 0 ? (
            <ul className="divide-y divide-border">
              {query.data.activity.map((item) => (
                <ActivityRow key={item.id} item={item} bcp47={bcp47} t={t} />
              ))}
            </ul>
          ) : (
            <div className="p-6">
              <EmptyState message={t('dashboard.noActivity')} />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ----- subcomponents --------------------------------------------------------

function BrandStatsCard({
  brand,
  t,
}: {
  brand: DashboardBrandStats;
  t: ReturnType<typeof useLocale>['t'];
}) {
  const hasOpenWork = brand.contact.new + brand.inquiry.openCount > 0;
  return (
    <Link
      to={`/companies/${brand.slug}`}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="truncate font-medium">{brand.name}</h3>
        <ArrowRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </header>
      <dl className="grid grid-cols-3 gap-2 text-xs">
        <Metric
          icon={<Mail className="size-3.5" aria-hidden="true" />}
          label={t('dashboard.metricNewsletter')}
          value={brand.newsletter.confirmed}
        />
        <Metric
          icon={<MessageSquare className="size-3.5" aria-hidden="true" />}
          label={t('dashboard.metricContactNew')}
          value={brand.contact.new}
          highlight={brand.contact.new > 0}
        />
        <Metric
          icon={<Send className="size-3.5" aria-hidden="true" />}
          label={t('dashboard.metricInquiryOpen')}
          value={brand.inquiry.openCount}
          highlight={brand.inquiry.openCount > 0}
        />
      </dl>
      <p className="text-[11px] text-muted-foreground">
        {hasOpenWork
          ? t('dashboard.openWorkLine', {
              contact: brand.contact.new,
              inquiry: brand.inquiry.openCount,
            })
          : t('dashboard.brandAllClear')}
      </p>
    </Link>
  );
}

function Metric({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 bg-background/40 p-2">
      <span className="flex items-center gap-1 text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </span>
      <span className={'text-lg font-semibold tabular-nums' + (highlight ? ' text-rust' : '')}>
        {value.toLocaleString()}
      </span>
    </div>
  );
}

const ACTIVITY_ICON: Record<DashboardActivityItem['kind'], React.ReactNode> = {
  contact: <MessageSquare className="size-4" aria-hidden="true" />,
  inquiry: <Send className="size-4" aria-hidden="true" />,
  newsletter: <Mail className="size-4" aria-hidden="true" />,
};

function ActivityRow({
  item,
  bcp47,
  t,
}: {
  item: DashboardActivityItem;
  bcp47: string;
  t: ReturnType<typeof useLocale>['t'];
}) {
  // Detail panels are state-only on each list page (no URL deep link yet) so
  // we route to the list and the user clicks through. Acceptable for v1.
  const href =
    item.kind === 'newsletter'
      ? '/newsletter'
      : item.kind === 'contact'
        ? '/contacts'
        : '/inquiries';
  return (
    <li>
      <Link
        to={href}
        className="flex items-start gap-3 p-3 transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:p-4"
      >
        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-rust/10 text-rust">
          {ACTIVITY_ICON[item.kind]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <time
              dateTime={item.createdAt}
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
            >
              {formatDateTime(item.createdAt, bcp47)}
            </time>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            <span className="font-medium text-foreground/80">{item.companyName}</span>
            {item.subtitle ? <> · {item.subtitle}</> : null}
            {' · '}
            <span>{t(`dashboard.kind.${item.kind}`)}</span>
          </p>
        </div>
      </Link>
    </li>
  );
}

function BrandStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="h-32 animate-pulse rounded-xl border border-border bg-card/40"
        />
      ))}
    </div>
  );
}
