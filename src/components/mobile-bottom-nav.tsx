import { Briefcase, ClipboardList, LayoutGrid, Mail, User, type LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useT, type DictKey } from '@/i18n';
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

/**
 * App-style tab bar: icon-only with an active pill. Labels are exposed to
 * assistive tech via aria-label; the pill + dot carry the active state.
 */
export function MobileBottomNav() {
  const t = useT();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/85 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto flex max-w-md items-center justify-around px-2">
        {TABS.map((tab) => (
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
      aria-label={label}
      title={label}
      className="group flex size-12 touch-manipulation select-none items-center justify-center focus-visible:outline-none"
    >
      {({ isActive }) => (
        <span
          className={cn(
            'relative flex h-9 w-[3.25rem] items-center justify-center rounded-full transition-all duration-200',
            'group-active:scale-90 motion-reduce:transition-none motion-reduce:group-active:scale-100',
            'group-focus-visible:ring-2 group-focus-visible:ring-rust/40',
            isActive
              ? 'bg-rust/[0.14] text-rust'
              : 'text-muted-foreground group-hover:text-foreground',
          )}
        >
          <Icon
            className="size-[22px] transition-transform duration-200"
            strokeWidth={isActive ? 2.2 : 1.7}
            aria-hidden="true"
          />
          <span
            aria-hidden="true"
            className={cn(
              'absolute -bottom-[0.4rem] size-1 rounded-full bg-rust transition-opacity duration-200',
              isActive ? 'opacity-100' : 'opacity-0',
            )}
          />
        </span>
      )}
    </NavLink>
  );
}
