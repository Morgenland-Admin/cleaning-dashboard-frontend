import { useQuery } from '@tanstack/react-query';
import { Bell, ClipboardList, Inbox, Mail, MessageSquare, Send } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandChip, BrandMark } from '@/components/brand-mark';
import { CountPill } from '@/components/count-pill';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProject, type Project } from '@/contexts/project-context';
import { useLocale } from '@/i18n';
import {
  notificationsAdminApi,
  type NotificationItem,
  type NotificationKind,
  type NotificationsUnreadResponse,
} from '@/lib/api';
import { useNow } from '@/lib/use-now';
import { cn, formatDateTime } from '@/lib/utils';

type T = ReturnType<typeof useLocale>['t'];

/** Radio value for "all brands"; a slug can never contain `*`. */
const ALL = '*';

/*
 * Radix menus swallow Tab, so everything a keyboard user must reach (brand filter,
 * notifications, footer links) has to be a menu item.
 */
export function NotificationBell() {
  const { t } = useLocale();
  const { projects } = useProject();
  const brandsBySlug = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.companySlug, p);
    return m;
  }, [projects]);

  const unreadQuery = useQuery({
    queryKey: ['notifications-unread'],
    queryFn: ({ signal }) => notificationsAdminApi.unreadCount(signal),
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });

  const count = unreadQuery.data?.count ?? 0;
  const hasUnread = count > 0;
  const badgeText = count > 99 ? '99+' : String(count);

  const listQuery = useQuery({
    queryKey: ['notifications-list'],
    queryFn: ({ signal }) => notificationsAdminApi.list(20, signal),
    enabled: false,
  });

  const [brandFilter, setBrandFilter] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const items = listQuery.data?.items ?? [];
    return brandFilter ? items.filter((it) => it.companySlug === brandFilter) : items;
  }, [listQuery.data, brandFilter]);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) void listQuery.refetch();
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            hasUnread ? t('notifications.bellWithCount', { n: count }) : t('notifications.bell')
          }
          className="relative grid size-10 place-items-center rounded-md text-foreground transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-9"
        >
          <Bell className="size-[1.125rem]" aria-hidden="true" />
          {hasUnread ? (
            <>
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 flex size-4 animate-ping rounded-full bg-highlight/40 motion-reduce:animate-none"
              />
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-highlight px-1 text-3xs font-semibold tabular-nums text-highlight-foreground ring-2 ring-background"
              >
                {badgeText}
              </span>
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-[min(26rem,calc(100vw-1.5rem))] p-0"
      >
        <NotificationsHeader
          t={t}
          count={count}
          unread={unreadQuery.data ?? null}
          brandsBySlug={brandsBySlug}
          brandFilter={brandFilter}
          onBrandFilterChange={setBrandFilter}
        />

        <div className="max-h-[28rem] overflow-y-auto overscroll-contain">
          {listQuery.isLoading ? (
            <LoadingState label={t('notifications.loading')} />
          ) : listQuery.error ? (
            <div className="p-3">
              <ErrorState
                error={listQuery.error}
                onRetry={() => void listQuery.refetch()}
                retrying={listQuery.isFetching}
              />
            </div>
          ) : !listQuery.data || listQuery.data.items.length === 0 ? (
            <EmptyState
              size="sm"
              icon={<Inbox aria-hidden="true" />}
              message={t('notifications.empty')}
            />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              size="sm"
              message={t('notifications.emptyForBrand', {
                brand: brandsBySlug.get(brandFilter ?? '')?.shortName ?? '—',
              })}
            />
          ) : (
            <GroupedList items={filteredItems} t={t} brandsBySlug={brandsBySlug} />
          )}
        </div>

        <NotificationsFooter t={t} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function NotificationsHeader({
  t,
  count,
  unread,
  brandsBySlug,
  brandFilter,
  onBrandFilterChange,
}: {
  t: T;
  count: number;
  unread: NotificationsUnreadResponse | null;
  brandsBySlug: Map<string, Project>;
  brandFilter: string | null;
  onBrandFilterChange: (slug: string | null) => void;
}) {
  const brandChips = (unread?.byBrand ?? []).filter((b) => b.count > 0);
  const showFilter = brandChips.length > 1;
  return (
    <div className="border-b px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">{t('notifications.title')}</h2>
        {count > 0 ? (
          <Badge variant="accent" className="tabular-nums">
            {t('notifications.openCount', { n: count })}
          </Badge>
        ) : null}
      </div>

      {showFilter ? (
        <DropdownMenuRadioGroup
          value={brandFilter ?? ALL}
          // Selection is handled per item so clicking the active brand again clears the filter.
          onValueChange={() => undefined}
          aria-label={t('notifications.filterAria')}
          className="mt-2.5 flex flex-wrap gap-1.5"
        >
          <FilterItem
            value={ALL}
            label={t('notifications.filterAll')}
            count={count}
            brand={null}
            onSelect={() => onBrandFilterChange(null)}
          />
          {brandChips.map((b) => {
            const brand = brandsBySlug.get(b.slug);
            const active = brandFilter === b.slug;
            return (
              <FilterItem
                key={b.slug}
                value={b.slug}
                label={brand?.shortName ?? b.name}
                count={b.count}
                brand={brand ?? null}
                onSelect={() => onBrandFilterChange(active ? null : b.slug)}
              />
            );
          })}
        </DropdownMenuRadioGroup>
      ) : null}
    </div>
  );
}

function FilterItem({
  value,
  label,
  count,
  brand,
  onSelect,
}: {
  value: string;
  label: string;
  count: number;
  brand: Project | null;
  onSelect: () => void;
}) {
  return (
    <DropdownMenuRadioItem
      value={value}
      onSelect={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        'inline-flex h-7 cursor-pointer gap-1.5 rounded-sm border border-border-strong bg-card py-0 pl-1.5 pr-1.5 text-xs font-medium text-foreground sm:py-0 [&>span:first-child]:hidden',
        'focus-visible:ring-2 focus-visible:ring-ring data-[state=checked]:border-primary/40 data-[state=checked]:bg-primary-soft data-[state=checked]:text-primary',
      )}
    >
      {brand ? <BrandMark brand={brand} size="xs" /> : null}
      <span className="truncate">{label}</span>
      <CountPill tone="muted">{count}</CountPill>
    </DropdownMenuRadioItem>
  );
}

type Bucket = 'today' | 'yesterday' | 'week' | 'older';

function bucketFor(iso: string, now: Date): Bucket {
  const d = new Date(iso);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400_000);
  const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400_000);
  if (d >= startOfToday) return 'today';
  if (d >= startOfYesterday) return 'yesterday';
  if (d >= startOfWeek) return 'week';
  return 'older';
}

function GroupedList({
  items,
  t,
  brandsBySlug,
}: {
  items: NotificationItem[];
  t: T;
  brandsBySlug: Map<string, Project>;
}) {
  const now = useNow(60_000);
  const groups = useMemo(() => {
    const map = new Map<Bucket, NotificationItem[]>();
    const nowDate = new Date(now);
    for (const it of items) {
      const b = bucketFor(it.createdAt, nowDate);
      const arr = map.get(b) ?? [];
      arr.push(it);
      map.set(b, arr);
    }
    return (['today', 'yesterday', 'week', 'older'] as Bucket[])
      .map((b) => ({ bucket: b, items: map.get(b) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [items, now]);

  return (
    <>
      {groups.map(({ bucket, items: gItems }) => (
        <BucketGroup key={bucket} label={t(`notifications.bucket.${bucket}` as never)}>
          {gItems.map((n) => (
            <NotificationRow
              key={n.id}
              item={n}
              now={now}
              t={t}
              brand={brandsBySlug.get(n.companySlug)}
            />
          ))}
        </BucketGroup>
      ))}
    </>
  );
}

function BucketGroup({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <DropdownMenuGroup aria-labelledby={id} className="border-b last:border-b-0">
      <DropdownMenuLabel
        id={id}
        className="sticky top-0 z-10 bg-popover/95 px-4 py-1.5 backdrop-blur-sm"
      >
        {label}
      </DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  );
}

const KIND_ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  contact: MessageSquare,
  inquiry: Send,
};

function NotificationRow({
  item,
  now,
  t,
  brand,
}: {
  item: NotificationItem;
  now: number;
  t: T;
  brand: Project | undefined;
}) {
  const { bcp47 } = useLocale();
  const { setBrandView } = useProject();
  // Switch to the record's brand first: the page reads the active brand from context.
  const href =
    item.kind === 'contact'
      ? `/contacts/${item.companySlug}/${item.rowId}`
      : `/inquiries/${item.companySlug}/${item.rowId}`;
  const KindIcon = KIND_ICON[item.kind];
  const relative = formatRelativeTime(item.createdAt, now, bcp47);
  const fullTime = formatDateTime(item.createdAt, bcp47);
  const message = item.message?.trim() ?? '';
  const showMessage = message.length >= 3 && message !== item.title;

  return (
    <DropdownMenuItem
      asChild
      className="cursor-pointer scroll-mt-8 items-start gap-3 rounded-none px-4 py-2.5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:py-2.5"
    >
      <Link to={href} onClick={() => setBrandView(item.companySlug)}>
        <KindIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate text-2sm font-medium text-foreground">{item.title}</p>
            <time
              dateTime={item.createdAt}
              title={fullTime}
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
            >
              {relative}
            </time>
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {brand ? (
              <BrandChip brand={brand} />
            ) : (
              <span className="shrink-0 font-medium text-foreground">{item.companyName}</span>
            )}
            <span className="truncate">{t(`dashboard.kind.${item.kind}`)}</span>
          </p>
          {showMessage ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{message}</p>
          ) : null}
        </div>
      </Link>
    </DropdownMenuItem>
  );
}

function NotificationsFooter({ t }: { t: T }) {
  const item =
    'cursor-pointer justify-center gap-1.5 rounded-none px-4 py-2.5 text-xs font-medium focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:py-2.5';
  return (
    <div className="grid grid-cols-2 divide-x border-t">
      <DropdownMenuItem asChild className={item}>
        <Link to="/contacts">
          <Mail aria-hidden="true" />
          {t('notifications.viewContacts')}
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild className={item}>
        <Link to="/inquiries">
          <ClipboardList aria-hidden="true" />
          {t('notifications.viewInquiries')}
        </Link>
      </DropdownMenuItem>
    </div>
  );
}

function formatRelativeTime(iso: string, now: number, bcp47: string): string {
  const target = new Date(iso).getTime();
  const diffSec = Math.round((target - now) / 1000);
  const abs = Math.abs(diffSec);

  const rtf = new Intl.RelativeTimeFormat(bcp47, {
    numeric: 'auto',
    style: 'short',
  });

  if (abs < 45) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(diffSec / 86400), 'day');
  return new Date(iso).toLocaleDateString(bcp47, {
    day: 'numeric',
    month: 'short',
  });
}
