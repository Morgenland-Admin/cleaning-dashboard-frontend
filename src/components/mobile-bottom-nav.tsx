import { ClipboardList, LayoutGrid, Mail, User } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { useT, type DictKey } from '@/i18n';
import { cn } from '@/lib/utils';

interface Tab {
  to: string;
  labelKey: DictKey;
  icon: React.ComponentType<{ className?: string }>;
  end?: boolean;
}

const TABS: Tab[] = [
  { to: '/', labelKey: 'mobileNav.home', icon: LayoutGrid, end: true },
  { to: '/inquiries', labelKey: 'mobileNav.inquiries', icon: ClipboardList },
  { to: '/contacts', labelKey: 'mobileNav.contacts', icon: Mail },
  { to: '/profile', labelKey: 'mobileNav.profile', icon: User },
];

export function MobileBottomNav() {
  const t = useT();
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-border bg-background/90 px-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1 backdrop-blur-md lg:hidden"
    >
      {TABS.map((tab) => (
        <TabItem key={tab.to} tab={tab} t={t} />
      ))}
    </nav>
  );
}

function TabItem({ tab, t }: { tab: Tab; t: (key: DictKey) => string }) {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.to}
      end={tab.end}
      className={({ isActive }) =>
        cn(
          'flex flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-[10px] font-medium transition-colors',
          isActive ? 'text-rust' : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'flex size-9 items-center justify-center rounded-full transition-colors',
              isActive ? 'bg-rust/10' : '',
            )}
          >
            <Icon className="size-[18px]" />
          </span>
          <span className="text-[10px]">{t(tab.labelKey)}</span>
        </>
      )}
    </NavLink>
  );
}
