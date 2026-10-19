import {
  Briefcase,
  Building2,
  ClipboardList,
  LayoutGrid,
  Mail,
  Newspaper,
  Star,
  User,
  type LucideIcon,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useT, type DictKey } from '@/i18n';
import { useIsSeoOnly } from '@/lib/access';
import { cn } from '@/lib/utils';

interface Tab {
  to: string;
  labelKey: DictKey;
  icon: LucideIcon;
  end?: boolean;
}

const TABS: Tab[] = [
  { to: '/', labelKey: 'mobileNav.home', icon: LayoutGrid, end: true },
  { to: '/auftraege', labelKey: 'mobileNav.orders', icon: Briefcase },
  { to: '/inquiries', labelKey: 'mobileNav.inquiries', icon: ClipboardList },
  { to: '/contacts', labelKey: 'mobileNav.contacts', icon: Mail },
  { to: '/profile', labelKey: 'mobileNav.profile', icon: User },
];

/** The `seo` level's pages (see lib/access.ts). */
const SEO_TABS: Tab[] = [
  { to: '/blog', labelKey: 'nav.blog', icon: Newspaper },
  { to: '/bewertungen', labelKey: 'nav.reviews', icon: Star },
  { to: '/companies', labelKey: 'nav.companies', icon: Building2 },
  { to: '/profile', labelKey: 'mobileNav.profile', icon: User },
];

export function MobileBottomNav() {
  const t = useT();
  const tabs = useIsSeoOnly() ? SEO_TABS : TABS;
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-header border-t border-border bg-card/90 pb-[max(0.375rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch justify-around px-1">
        {tabs.map((tab) => (
          <TabItem key={tab.to} tab={tab} label={t(tab.labelKey)} />
        ))}
      </div>
    </nav>
  );
}

function TabItem({ tab, label }: { tab: Tab; label: string }) {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      className="group flex min-h-12 min-w-[3.5rem] flex-1 touch-manipulation select-none items-center justify-center focus-visible:outline-none"
    >
      {({ isActive }) => (
        <span
          className={cn(
            'flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-1 transition-colors duration-base',
            'group-focus-visible:ring-2 group-focus-visible:ring-ring',
            isActive
              ? 'bg-primary-soft text-primary'
              : 'text-muted-foreground group-hover:text-foreground',
          )}
        >
          <Icon className="size-5" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
          <span
            className={cn(
              'max-w-full truncate text-3xs leading-tight tracking-tight',
              isActive ? 'font-semibold' : 'font-medium',
            )}
          >
            {label}
          </span>
        </span>
      )}
    </NavLink>
  );
}
