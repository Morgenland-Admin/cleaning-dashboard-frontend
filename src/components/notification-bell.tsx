import { useQuery } from '@tanstack/react-query';
import {
  Bell,
  ClipboardList,
  Inbox,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import {
  DropdownMenu,
  DropdownMenuContent,
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
import { cn, formatDateTime } from '@/lib/utils';

export function NotificationBell() {
  const { t, bcp47 } = useLocale();
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
          className={cn(
            'relative inline-flex size-9 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30',
            hasUnread && 'text-foreground',
          )}
        >
          <Bell className="size-4" aria-hidden="true" />
          {hasUnread ? (
            <>
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rust px-1 text-[10px] font-semibold text-primary-foreground ring-2 ring-background"
              >
                {badgeText}
              </span>
              <span
                aria-hidden="true"
                className="absolute -right-0.5 -top-0.5 flex size-4 animate-ping rounded-full bg-rust/40"
              />
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={10}
        className="w-[22rem] overflow-hidden rounded-xl border-border bg-card p-0 shadow-lg sm:w-[26rem]"
      >
        <NotificationsHeader
          t={t}
          count={count}
          unread={unreadQuery.data ?? null}
          brandsBySlug={brandsBySlug}
          brandFilter={brandFilter}
          onBrandFilterChange={setBrandFilter}
        />

        <div className="max-h-[28rem] overflow-y-auto bg-background/40">
          {listQuery.isLoading ? (
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-center gap-2 px-3 py-10 text-sm text-muted-foreground"
            >
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>{t('notifications.loading')}</span>
            </div>
          ) : listQuery.error ? (
            <p role="alert" className="px-4 py-10 text-center text-sm text-destructive">
              {(listQuery.error as Error).message}
            </p>
          ) : !listQuery.data || listQuery.data.items.length === 0 ? (
            <EmptyState label={t('notifications.empty')} />
          ) : filteredItems.length === 0 ? (
            <EmptyState
              label={t('notifications.emptyForBrand', {
                brand: brandsBySlug.get(brandFilter ?? '')?.shortName ?? '—',
              })}
            />
          ) : (
            <GroupedList items={filteredItems} bcp47={bcp47} t={t} brandsBySlug={brandsBySlug} />
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
  t: ReturnType<typeof useLocale>['t'];
  count: number;
  unread: NotificationsUnreadResponse | null;
  brandsBySlug: Map<string, Project>;
  brandFilter: string | null;
  onBrandFilterChange: (slug: string | null) => void;
}) {
  const brandChips = (unread?.byBrand ?? []).filter((b) => b.count > 0);
  const showFilter = brandChips.length > 1;
  return (
    <div className="border-b border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex size-7 items-center justify-center rounded-lg bg-rust-soft/60 text-rust ring-1 ring-rust/15">
            <Inbox className="size-3.5" aria-hidden="true" />
          </span>
          <h2 className="font-serif text-base leading-none text-foreground">
            {t('notifications.title')}
          </h2>
        </div>
        {count > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rust/10 px-2 py-0.5 text-[11px] font-medium text-rust">
            <span aria-hidden="true" className="size-1.5 animate-pulse-dot rounded-full bg-rust" />
            {t('notifications.openCount', { n: count })}
          </span>
        ) : null}
      </div>

      {showFilter ? (
        <div
          role="tablist"
          aria-label={t('notifications.filterAria')}
          className="-mx-1 mt-3 flex flex-wrap gap-1.5 px-1"
        >
          <FilterChip
            active={brandFilter === null}
            onClick={() => onBrandFilterChange(null)}
            label={t('notifications.filterAll')}
            count={count}
            mark={null}
          />
          {brandChips.map((b) => {
            const brand = brandsBySlug.get(b.slug);
            const active = brandFilter === b.slug;
            return (
              <FilterChip
                key={b.slug}
                active={active}
                onClick={() => onBrandFilterChange(active ? null : b.slug)}
                label={brand?.shortName ?? b.name}
                count={b.count}
                mark={brand ?? null}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
  mark,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  mark: Project | null;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'group/chip inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-1 pr-2 text-[11px] font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40',
        active
          ? 'border-rust/60 bg-rust text-primary-foreground shadow-sm'
          : 'border-border bg-background/60 text-foreground hover:border-foreground/40 hover:bg-background',
      )}
    >
      {mark ? (
        <BrandMark brand={mark} size="xs" />
      ) : (
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-4 items-center justify-center rounded-full text-[8px] font-bold',
            active
              ? 'bg-primary-foreground/15 text-primary-foreground'
              : 'bg-rust-soft/60 text-rust',
          )}
        >
          ∗
        </span>
      )}
      <span className="truncate">{label}</span>
      <span
        className={cn(
          'font-mono tabular-nums',
          active ? 'text-primary-foreground/80' : 'text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  );
}

type Bucket = 'today' | 'yesterday' | 'week' | 'older';

function bucketFor(iso: string, now = new Date()): Bucket {
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
  bcp47,
  t,
  brandsBySlug,
}: {
  items: NotificationItem[];
  bcp47: string;
  t: ReturnType<typeof useLocale>['t'];
  brandsBySlug: Map<string, Project>;
}) {
  const groups = useMemo(() => {
    const map = new Map<Bucket, NotificationItem[]>();
    const now = new Date();
    for (const it of items) {
      const b = bucketFor(it.createdAt, now);
      const arr = map.get(b) ?? [];
      arr.push(it);
      map.set(b, arr);
    }
    return (['today', 'yesterday', 'week', 'older'] as Bucket[])
      .map((b) => ({ bucket: b, items: map.get(b) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [items]);

  return (
    <ul className="divide-y divide-border/60">
      {groups.map(({ bucket, items: gItems }) => (
        <li key={bucket}>
          <div className="sticky top-0 z-10 bg-background/80 px-4 py-1.5 backdrop-blur-sm">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(`notifications.bucket.${bucket}` as never)}
            </h3>
          </div>
          <ul>
            {gItems.map((n) => (
              <NotificationRow
                key={n.id}
                item={n}
                bcp47={bcp47}
                t={t}
                brand={brandsBySlug.get(n.companySlug)}
              />
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

const KIND_ICON: Record<NotificationKind, React.ComponentType<{ className?: string }>> = {
  contact: MessageSquare,
  inquiry: Send,
};

function NotificationRow({
  item,
  bcp47,
  t,
  brand,
}: {
  item: NotificationItem;
  bcp47: string;
  t: ReturnType<typeof useLocale>['t'];
  brand: Project | undefined;
}) {
  const href = item.kind === 'contact' ? '/contacts' : '/inquiries';
  const KindIcon = KIND_ICON[item.kind];
  const relative = formatRelativeTime(item.createdAt, bcp47);
  const fullTime = formatDateTime(item.createdAt, bcp47);
  const message = item.message?.trim() ?? '';
  const showMessage = message.length >= 3 && message !== item.title;

  return (
    <li>
      <Link
        to={href}
        className="group relative flex items-start gap-3 px-4 py-3 transition-all hover:bg-rust-soft/40 focus-visible:bg-rust-soft/40 focus-visible:outline-none"
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-3 left-0 w-0.5 origin-center scale-y-0 rounded-r-sm bg-rust transition-transform group-hover:scale-y-100"
        />

        <span className="relative shrink-0">
          {brand ? (
            <BrandMark brand={brand} size="md" />
          ) : (
            <span
              aria-hidden="true"
              className="inline-flex size-7 items-center justify-center rounded-md bg-muted text-muted-foreground"
            >
              <Mail className="size-3.5" />
            </span>
          )}
          <span
            aria-hidden="true"
            className="absolute -bottom-1 -right-1 inline-flex size-4 items-center justify-center rounded-full bg-rust text-primary-foreground ring-2 ring-card"
          >
            <KindIcon className="size-2.5" />
          </span>
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
            <time
              dateTime={item.createdAt}
              title={fullTime}
              className="shrink-0 font-mono text-[10px] uppercase tabular-nums tracking-wide text-muted-foreground"
            >
              {relative}
            </time>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            <span className="font-medium text-foreground/80">
              {brand?.shortName ?? item.companyName}
            </span>
            <span aria-hidden="true" className="mx-1.5 text-muted-foreground/50">
              ·
            </span>
            <span>{t(`dashboard.kind.${item.kind}`)}</span>
          </p>
          {showMessage ? (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground/90">
              {message}
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <span className="inline-flex size-10 items-center justify-center rounded-full bg-rust-soft/40 text-rust">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function NotificationsFooter({ t }: { t: ReturnType<typeof useLocale>['t'] }) {
  return (
    <div className="grid grid-cols-2 border-t border-border bg-card">
      <Link
        to="/contacts"
        className="flex items-center justify-center gap-1.5 border-r border-border px-4 py-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <Mail className="size-3.5" aria-hidden="true" />
        {t('notifications.viewContacts')}
      </Link>
      <Link
        to="/inquiries"
        className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted/60 hover:text-foreground"
      >
        <ClipboardList className="size-3.5" aria-hidden="true" />
        {t('notifications.viewInquiries')}
      </Link>
    </div>
  );
}

function formatRelativeTime(iso: string, bcp47: string): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
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
