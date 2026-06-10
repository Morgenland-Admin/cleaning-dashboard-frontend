import { useQueryClient, useQuery } from '@tanstack/react-query';
import {
  AtSign,
  Briefcase,
  Building2,
  CheckSquare,
  ChevronUp,
  ClipboardList,
  Database,
  LayoutGrid,
  LogOut,
  Mail,
  MessageSquare,
  Receipt,
  RefreshCcw,
  Settings as SettingsIcon,
  Star,
  Tag,
  User,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { BrandFilter } from '@/components/brand-filter';
import { BrandBlock } from '@/components/brand-logo';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProject } from '@/contexts/project-context';
import { useT, type DictKey } from '@/i18n';
import { chatAdminApi } from '@/lib/api';
import { authClient, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

type NavItem = {
  to: string;
  labelKey: DictKey;
  icon: React.ComponentType<{ className?: string }>;
  badge?: { value: string; tone?: 'neutral' | 'rust' };
  end?: boolean;
};

const primaryNav: NavItem[] = [
  { to: '/', labelKey: 'nav.overview', icon: LayoutGrid, end: true },
  { to: '/auftraege', labelKey: 'nav.auftraege', icon: Briefcase },
  { to: '/rechnungen', labelKey: 'nav.invoices', icon: Receipt },
  { to: '/abos', labelKey: 'nav.subscriptions', icon: RefreshCcw },
  { to: '/inquiries', labelKey: 'nav.inquiries', icon: ClipboardList },
  { to: '/contacts', labelKey: 'nav.contacts', icon: Mail },
  { to: '/bewertungen', labelKey: 'nav.reviews', icon: Star },
  { to: '/newsletter', labelKey: 'nav.newsletter', icon: AtSign },
  { to: '/partner', labelKey: 'nav.partner', icon: Users },
  // /chat is rendered separately so it can show a live unread badge.
  { to: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare },
  { to: '/exports', labelKey: 'nav.exports', icon: Database },
  { to: '/pricing', labelKey: 'nav.pricing', icon: Tag },
  { to: '/companies', labelKey: 'nav.companies', icon: Building2 },
];

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-72 shrink-0 flex-col gap-4 self-start border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground lg:flex">
      <SidebarBody />
    </aside>
  );
}

interface SidebarBodyProps {
  onNavigate?: () => void;
}

export function SidebarBody({ onNavigate }: SidebarBodyProps = {}) {
  const t = useT();
  return (
    <>
      <BrandBlock className="px-1 pt-1" />

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        <SectionLabel>{t('nav.section')}</SectionLabel>
        <nav className="flex flex-col gap-0.5">
          {primaryNav.map((item) => (
            <span key={item.to} className="contents">
              {item.to === '/companies' ? <ChatNavEntry onNavigate={onNavigate} t={t} /> : null}
              <NavItem item={item} onNavigate={onNavigate} t={t} />
            </span>
          ))}
        </nav>
      </div>

      <BrandFilter />

      <UserCard onNavigate={onNavigate} />
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

function NavItem({
  item,
  onNavigate,
  t,
}: {
  item: NavItem;
  onNavigate?: () => void;
  t: (key: DictKey) => string;
}) {
  const { to, labelKey, icon: Icon, end, badge } = item;
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/40 focus-visible:ring-offset-1',
          isActive
            ? 'bg-rust/[0.10] text-rust before:absolute before:-left-0.5 before:bottom-1.5 before:top-1.5 before:w-0.5 before:rounded-full before:bg-rust hover:bg-rust/[0.14]'
            : 'text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )
      }
    >
      <Icon className="size-4 shrink-0 opacity-90" aria-hidden="true" />
      <span className="flex-1 truncate">{t(labelKey)}</span>
      {badge ? (
        <span
          className={cn(
            'flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums',
            badge.tone === 'rust'
              ? 'bg-rust text-primary-foreground'
              : 'bg-sidebar-border text-sidebar-foreground/80',
          )}
        >
          {badge.value}
        </span>
      ) : null}
    </NavLink>
  );
}

function ChatNavEntry({ onNavigate, t }: { onNavigate?: () => void; t: (key: DictKey) => string }) {
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

  const item: NavItem = {
    to: '/chat',
    labelKey: 'nav.chat',
    icon: MessageSquare,
    badge: unread > 0 ? { value: unread > 99 ? '99+' : String(unread), tone: 'rust' } : undefined,
  };
  return <NavItem item={item} onNavigate={onNavigate} t={t} />;
}

function UserCard({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useSession();
  const t = useT();
  const [signingOut, setSigningOut] = useState(false);

  const user = data?.user;
  const name = user?.name?.trim() || user?.email || '—';
  const email = user?.email ?? '';
  const initials = (name === '—' ? '??' : name.slice(0, 2)).toUpperCase();

  async function onSignOut() {
    setSigningOut(true);
    // Clear cache before signOut so a slow/failing call can't leak previous user's queries.
    queryClient.clear();
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
      onNavigate?.();
      navigate('/login', { replace: true });
    }
  }

  function go(path: string) {
    onNavigate?.();
    navigate(path);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={t('header.accountMenu')}
          className="group flex w-full items-center gap-2.5 rounded-xl border border-sidebar-border bg-sidebar-accent/40 p-2.5 text-left transition-colors hover:bg-sidebar-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30"
        >
          <Avatar className="size-9 shrink-0 ring-2 ring-background">
            {user?.image ? <AvatarImage src={user.image} alt={name} /> : null}
            <AvatarFallback className="bg-rust/15 text-[12px] font-semibold uppercase text-rust">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col leading-tight">
            <span className="truncate text-[13px] font-semibold">{name}</span>
            <span className="truncate text-[11px] text-muted-foreground">{email}</span>
          </div>
          <ChevronUp className="size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-60">
        <DropdownMenuItem onSelect={() => go('/profile')}>
          <User className="size-4" />
          {t('user.profile')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => go('/settings')}>
          <SettingsIcon className="size-4" />
          {t('user.settings')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={(e) => {
            e.preventDefault();
            void onSignOut();
          }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="size-4" />
          {signingOut ? t('user.signingOut') : t('user.signOut')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
