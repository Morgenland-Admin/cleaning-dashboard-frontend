import { useQuery } from '@tanstack/react-query';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useCallback, useState } from 'react';
import { NavLink, useMatch } from 'react-router-dom';

import { BrandFilter } from '@/components/brand-filter';
import { BrandBlock } from '@/components/brand-logo';
import { CountPill } from '@/components/count-pill';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject } from '@/contexts/project-context';
import { useT, type DictKey } from '@/i18n';
import { seoMayOpen, useCanWrite, useIsAdmin, useIsSeoOnly } from '@/lib/access';
import { chatAdminApi } from '@/lib/api';
import { NAV, type NavItem } from '@/lib/nav';
import { badgeCount, useBrandInboxCounts } from '@/lib/use-inbox-counts';
import { cn } from '@/lib/utils';

type NavBadge = { text: string; srLabel: string; tone: 'muted' | 'highlight' };

const COLLAPSED_KEY = 'reinigungs-portal-sidebar-collapsed';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

// Below lg the same body renders inside the header's sheet.
export function Sidebar() {
  const [collapsed, setCollapsedState] = useState(readCollapsed);
  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      window.localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Private mode: storage is unavailable, the choice just does not persist.
    }
  }, []);

  return (
    <aside
      data-collapsed={collapsed || undefined}
      className={cn(
        'sticky top-0 hidden h-svh shrink-0 flex-col self-start border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-base lg:flex',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <SidebarBody collapsed={collapsed} onToggleCollapsed={() => setCollapsed(!collapsed)} />
    </aside>
  );
}

interface SidebarBodyProps {
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export function SidebarBody({
  onNavigate,
  collapsed = false,
  onToggleCollapsed,
}: SidebarBodyProps) {
  const t = useT();
  const seoOnly = useIsSeoOnly();
  const canWrite = useCanWrite();
  const isAdmin = useIsAdmin();
  const inbox = useBrandInboxCounts();
  const inboxBadge = (item: NavItem): NavBadge | undefined => {
    const n = item.inbox ? inbox[item.inbox] : 0;
    return n > 0
      ? { text: badgeCount(n), srLabel: t('nav.newCount', { n }), tone: 'muted' }
      : undefined;
  };
  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter(
      (item) =>
        (isAdmin || !item.adminOnly) &&
        (canWrite || !item.writeOnly) &&
        (seoOnly ? seoMayOpen(item.to) && item.live !== 'chat' : true),
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 py-3">
      <div
        className={cn(
          'flex items-center gap-2',
          collapsed ? 'flex-col px-3' : 'justify-between pl-4 pr-2',
        )}
      >
        <BrandBlock compact={collapsed} size={28} />
        {onToggleCollapsed ? (
          <CollapseToggle collapsed={collapsed} onToggle={onToggleCollapsed} t={t} />
        ) : null}
      </div>

      <div className={collapsed ? 'flex justify-center px-3' : 'px-3'}>
        <BrandFilter collapsed={collapsed} />
      </div>

      <nav
        aria-label={t('a11y.mainNavigation')}
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3 pb-2"
      >
        {groups.map((group, i) => (
          <div key={group.labelKey ?? i} className="flex flex-col gap-px">
            {group.labelKey ? (
              collapsed ? (
                <div className="mx-auto mb-1 h-px w-6 bg-sidebar-border" aria-hidden="true" />
              ) : (
                <div className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">
                  {t(group.labelKey)}
                </div>
              )
            ) : null}
            {group.items.map((item) =>
              item.live === 'chat' ? (
                <ChatNavEntry
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  t={t}
                />
              ) : (
                <NavItemLink
                  key={item.to}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                  badge={inboxBadge(item)}
                  t={t}
                />
              ),
            )}
          </div>
        ))}
      </nav>
    </div>
  );
}

function CollapseToggle({
  collapsed,
  onToggle,
  t,
}: {
  collapsed: boolean;
  onToggle: () => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const label = collapsed ? t('nav.expand') : t('nav.collapse');
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onToggle}
          aria-label={label}
          aria-expanded={!collapsed}
          className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function NavItemLink({
  item,
  collapsed,
  onNavigate,
  badge,
  t,
}: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
  badge?: NavBadge;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const { to, labelKey, icon: Icon, end } = item;
  const label = t(labelKey);
  // Active state from the router, not NavLink's className function: Radix Slot
  // (TooltipTrigger asChild) stringifies it into every branch's classes.
  const isActive = !!useMatch({ path: to, end: !!end });
  const link = (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={cn(
        'group relative flex h-10 items-center gap-2.5 rounded-md text-2sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:h-8',
        collapsed ? 'mx-auto w-10 justify-center' : 'px-2.5',
        isActive
          ? 'bg-primary-soft font-semibold text-foreground'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon
        className={cn(
          'size-4 shrink-0',
          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground',
        )}
        aria-hidden="true"
      />
      {collapsed ? (
        <span className="sr-only">{label}</span>
      ) : (
        <span className="flex-1 truncate">{label}</span>
      )}
      {badge && !collapsed ? (
        <CountPill tone={badge.tone === 'highlight' ? 'solid' : 'muted'} aria-hidden>
          {badge.text}
        </CountPill>
      ) : null}
      {badge && collapsed && badge.tone === 'highlight' ? (
        <span
          className="absolute right-1.5 top-1.5 size-2 rounded-full bg-highlight ring-2 ring-sidebar"
          aria-hidden="true"
        />
      ) : null}
      {badge ? <span className="sr-only">, {badge.srLabel}</span> : null}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">
        {label}
        {badge ? ` (${badge.text})` : ''}
      </TooltipContent>
    </Tooltip>
  );
}

function ChatNavEntry(props: {
  item: NavItem;
  collapsed: boolean;
  onNavigate?: () => void;
  t: (key: DictKey, vars?: Record<string, string | number>) => string;
}) {
  const { activeProject, isAllBrands } = useProject();
  const slug = isAllBrands ? null : activeProject.companySlug;
  const query = useQuery({
    queryKey: ['chat-conversations', slug],
    queryFn: ({ signal }) => chatAdminApi.conversations(slug!, signal),
    enabled: !!slug,
    refetchInterval: 30_000,
    placeholderData: (prev) => prev,
  });

  const unread =
    query.data?.conversations.reduce((sum, c) => sum + (c.unreadForAdmin ?? 0), 0) ?? 0;

  return (
    <NavItemLink
      {...props}
      badge={
        unread > 0
          ? {
              text: badgeCount(unread),
              srLabel: props.t('nav.unreadCount', { n: unread }),
              tone: 'highlight',
            }
          : undefined
      }
    />
  );
}
