import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  AtSign,
  Bell,
  ClipboardList,
  Globe,
  Inbox,
  Mail,
  MessageSquare,
  Phone,
} from 'lucide-react';
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
import { useProject, type BrandFilterId, type Project } from '@/contexts/project-context';
import { useLocale } from '@/i18n';
import {
  notificationsAdminApi,
  type InquiryChannel,
  type InquiryChannelCounts,
  type NotificationItem,
} from '@/lib/api';
import { badgeCount, useInboxCounts } from '@/lib/use-inbox-counts';
import { useNow } from '@/lib/use-now';
import { cn, formatDateTime, formatNumber } from '@/lib/utils';

type T = ReturnType<typeof useLocale>['t'];

/** Radio value for "all brands"; a slug can never contain `*`. */
const ALL = '*';
/** Newest items shown; the type rows above link to the full lists. */
const LIST_CAP = 8;
const SEEN_KEY = 'notifications-seen-latest';

const CHANNEL_ICON: Record<InquiryChannel, React.ComponentType<{ className?: string }>> = {
  phone: Phone,
  email: AtSign,
  web: Globe,
};

function readSeen(): string {
  try {
    return window.localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/*
 * Radix menus swallow Tab, so everything a keyboard user must reach (brand filter,
 * type rows, notifications) has to be a menu item.
 */
export function NotificationBell() {
  const { t, bcp47 } = useLocale();
  const { projects } = useProject();
  const brandsBySlug = useMemo(() => {
    const m = new Map<string, Project>();
    for (const p of projects) m.set(p.companySlug, p);
    return m;
  }, [projects]);

  const unreadQuery = useInboxCounts();
  const unread = unreadQuery.data;
  const [open, setOpen] = useState(false);
  const [pickedBrand, setBrandFilter] = useState<string | null>(null);
  const [seen, setSeen] = useState(readSeen);

  const activeBrands = (unread?.byBrand ?? []).filter((b) => b.count > 0);
  // A brand whose items were all handled meanwhile drops out of the filter.
  const brandFilter =
    pickedBrand && activeBrands.some((b) => b.slug === pickedBrand) ? pickedBrand : null;

  const listQuery = useQuery({
    queryKey: ['notifications-list', brandFilter ?? ALL],
    queryFn: ({ signal }) => notificationsAdminApi.list(LIST_CAP, signal, brandFilter),
    enabled: open,
  });

  const count = unread?.count ?? 0;
  const hasUnread = count > 0;
  // Pulse only when something arrived since the menu was last opened, not for the standing backlog.
  const hasFresh = hasUnread && !!unread?.latestAt && unread.latestAt > seen;

  const brandCounts = brandFilter ? unread?.byBrand.find((b) => b.slug === brandFilter) : undefined;
  const scoped = brandFilter
    ? {
        inquiry: brandCounts?.inquiry ?? 0,
        contact: brandCounts?.contact ?? 0,
        channels: brandCounts?.channels,
        count: brandCounts?.count ?? 0,
      }
    : {
        inquiry: unread?.byKind?.inquiry ?? 0,
        contact: unread?.byKind?.contact ?? 0,
        channels: unread?.inquiryChannels,
        count,
      };

  // "View all" opens the list in the brand the counts belong to.
  const targetBrand: BrandFilterId =
    brandFilter ?? (activeBrands.length === 1 ? activeBrands[0]!.slug : 'all');

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      void unreadQuery.refetch();
      if (unread?.latestAt) {
        setSeen(unread.latestAt);
        try {
          window.localStorage.setItem(SEEN_KEY, unread.latestAt);
        } catch {
          // Private mode: the pulse just shows again next session.
        }
      }
    }
  }

  const items = listQuery.data?.items ?? [];
  const hidden = Math.max(0, scoped.count - items.length);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={
            hasUnread
              ? t('notifications.bellWithCount', { n: formatNumber(count, bcp47) })
              : t('notifications.bell')
          }
          className="relative grid size-10 place-items-center rounded-md text-foreground transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-9"
        >
          <Bell className="size-[1.125rem]" aria-hidden="true" />
          {hasUnread ? (
            <>
              {hasFresh ? (
                <span
                  aria-hidden="true"
                  className="absolute right-0.5 top-0.5 flex size-4 animate-ping rounded-full bg-highlight/40 motion-reduce:animate-none"
                />
              ) : null}
              <span
                aria-hidden="true"
                className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-highlight px-1 text-3xs font-semibold tabular-nums text-highlight-foreground ring-2 ring-background"
              >
                {badgeCount(count)}
              </span>
            </>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="flex max-h-[min(36rem,calc(100svh-5rem))] w-[min(26rem,calc(100vw-1.5rem))] flex-col p-0"
      >
        <div className="shrink-0 border-b px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-foreground">{t('notifications.title')}</h2>
            {count > 0 ? (
              <Badge variant="accent" className="tabular-nums">
                {t('notifications.newCount', { n: formatNumber(count, bcp47) })}
              </Badge>
            ) : null}
          </div>
          {activeBrands.length > 1 ? (
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
                onSelect={() => setBrandFilter(null)}
              />
              {activeBrands.map((b) => {
                const brand = brandsBySlug.get(b.slug);
                return (
                  <FilterItem
                    key={b.slug}
                    value={b.slug}
                    label={brand?.shortName ?? b.name}
                    count={b.count}
                    brand={brand ?? null}
                    onSelect={() => setBrandFilter(brandFilter === b.slug ? null : b.slug)}
                  />
                );
              })}
            </DropdownMenuRadioGroup>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {unreadQuery.isLoading ? (
            <LoadingState label={t('notifications.loading')} />
          ) : unreadQuery.error && !unread ? (
            <div className="p-3">
              <ErrorState
                error={unreadQuery.error}
                onRetry={() => void unreadQuery.refetch()}
                retrying={unreadQuery.isFetching}
              />
            </div>
          ) : scoped.count === 0 ? (
            <EmptyState
              size="sm"
              icon={<Inbox aria-hidden="true" />}
              message={t('notifications.empty')}
            />
          ) : (
            <>
              <MenuSection label={t('notifications.byType')}>
                {scoped.inquiry > 0 ? (
                  <TypeRow
                    to="/inquiries?status=new"
                    brand={targetBrand}
                    icon={<ClipboardList aria-hidden="true" />}
                    label={t('notifications.typeInquiries')}
                    count={scoped.inquiry}
                    detail={channelSummary(scoped.channels, t, bcp47)}
                    bcp47={bcp47}
                  />
                ) : null}
                {scoped.contact > 0 ? (
                  <TypeRow
                    to="/contacts?status=new"
                    brand={targetBrand}
                    icon={<Mail aria-hidden="true" />}
                    label={t('notifications.typeContacts')}
                    count={scoped.contact}
                    bcp47={bcp47}
                  />
                ) : null}
              </MenuSection>

              <MenuSection label={t('notifications.newest')}>
                {listQuery.isLoading ? (
                  <LoadingState inline label={t('notifications.loading')} className="px-4" />
                ) : listQuery.error ? (
                  <div className="p-3">
                    <ErrorState
                      error={listQuery.error}
                      onRetry={() => void listQuery.refetch()}
                      retrying={listQuery.isFetching}
                    />
                  </div>
                ) : (
                  <>
                    <NewestList items={items} t={t} brandsBySlug={brandsBySlug} />
                    {hidden > 0 ? (
                      <p className="px-4 py-2 text-xs text-muted-foreground">
                        {t('notifications.more', { n: formatNumber(hidden, bcp47) })}
                      </p>
                    ) : null}
                  </>
                )}
              </MenuSection>
            </>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function channelSummary(
  channels: InquiryChannelCounts | undefined,
  t: T,
  bcp47: string,
): string | null {
  if (!channels) return null;
  const parts = (['phone', 'email', 'web'] as const)
    .filter((c) => channels[c] > 0)
    .map((c) => `${formatNumber(channels[c], bcp47)} ${t(`notifications.channel.${c}`)}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function MenuSection({ label, children }: { label: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <DropdownMenuGroup aria-labelledby={id} className="border-b py-1 last:border-b-0">
      <DropdownMenuLabel id={id} className="px-4 pb-1 pt-1.5">
        {label}
      </DropdownMenuLabel>
      {children}
    </DropdownMenuGroup>
  );
}

function TypeRow({
  to,
  brand,
  icon,
  label,
  count,
  detail,
  bcp47,
}: {
  to: string;
  brand: BrandFilterId;
  icon: React.ReactNode;
  label: string;
  count: number;
  detail?: string | null;
  bcp47: string;
}) {
  const { setBrandView } = useProject();
  return (
    <DropdownMenuItem
      asChild
      className="cursor-pointer gap-3 rounded-none px-4 py-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:py-2"
    >
      <Link to={to} onClick={() => setBrandView(brand)}>
        <span className="text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{label}</span>
          {detail ? (
            <span className="block truncate text-xs text-muted-foreground">{detail}</span>
          ) : null}
        </span>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
          {formatNumber(count, bcp47)}
        </span>
        <ArrowRight className="text-muted-foreground" aria-hidden="true" />
      </Link>
    </DropdownMenuItem>
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
      <CountPill tone="muted">{badgeCount(count)}</CountPill>
    </DropdownMenuRadioItem>
  );
}

function NewestList({
  items,
  t,
  brandsBySlug,
}: {
  items: NotificationItem[];
  t: T;
  brandsBySlug: Map<string, Project>;
}) {
  const now = useNow(60_000);
  return (
    <>
      {items.map((n) => (
        <NotificationRow
          key={n.id}
          item={n}
          now={now}
          t={t}
          brand={brandsBySlug.get(n.companySlug)}
        />
      ))}
    </>
  );
}

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
  const Icon = item.kind === 'contact' ? MessageSquare : CHANNEL_ICON[item.channel ?? 'web'];
  const kindLabel =
    item.kind === 'contact'
      ? t('dashboard.kind.contact')
      : `${t('dashboard.kind.inquiry')} · ${t(`notifications.channel.${item.channel ?? 'web'}`)}`;
  const title = item.title.trim() || t('notifications.noName');
  const message = item.message?.trim() ?? '';
  const showMessage = message.length >= 3 && message !== item.title;

  return (
    <DropdownMenuItem
      asChild
      className="cursor-pointer items-start gap-3 rounded-none px-4 py-2.5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:py-2.5"
    >
      <Link to={href} onClick={() => setBrandView(item.companySlug)}>
        <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p
              className={cn(
                'truncate text-2sm font-medium',
                item.title.trim() ? 'text-foreground' : 'italic text-muted-foreground',
              )}
            >
              {title}
            </p>
            <time
              dateTime={item.createdAt}
              title={formatDateTime(item.createdAt, bcp47)}
              className="shrink-0 text-xs tabular-nums text-muted-foreground"
            >
              {formatRelativeTime(item.createdAt, now, bcp47)}
            </time>
          </div>
          <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
            {brand ? (
              <BrandChip brand={brand} />
            ) : (
              <span className="shrink-0 font-medium text-foreground">{item.companyName}</span>
            )}
            <span className="truncate">{kindLabel}</span>
          </p>
          {showMessage ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{message}</p>
          ) : null}
        </div>
      </Link>
    </DropdownMenuItem>
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
