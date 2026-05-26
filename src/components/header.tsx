import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu, Search } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { NotificationBell } from '@/components/notification-bell';
import { SidebarBody } from '@/components/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useLocale, type Locale } from '@/i18n';
import { authClient, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export function Header() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data } = useSession();
  const { t, locale, setLocale } = useLocale();
  const [signingOut, setSigningOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const user = data?.user;
  const displayName = user?.name?.trim() || user?.email || '';
  const initials = (displayName || '??').slice(0, 2).toUpperCase();

  async function onSignOut() {
    setSigningOut(true);
    // Clear cached data BEFORE the network call so a slow / failing signOut
    // can't leak the previous user's queries into the next paint. If signOut
    // throws we still drop the session client-side and bounce to /login.
    queryClient.clear();
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border/70 bg-background/85 px-3 backdrop-blur-md sm:gap-3 sm:px-4 lg:px-6">
      {/* Mobile menu trigger — opens the sidebar in a sheet */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={t('header.openMenu')}
            className="-ml-1 inline-flex size-9 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30 lg:hidden"
          >
            <Menu className="size-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left">
          <SheetTitle>{t('brand.name')}</SheetTitle>
          <SheetDescription>{t('brand.tagline')}</SheetDescription>
          <SidebarBody onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Search bar — full pill on desktop, icon-only on mobile */}
      <div className="relative hidden w-full max-w-[520px] sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          aria-label={t('header.searchPlaceholder')}
          placeholder={t('header.searchPlaceholder')}
          className="h-9 w-full rounded-full border border-border bg-card pl-9 pr-16 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/10"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none items-center gap-0.5 rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground md:inline-flex">
          ⌘K
        </kbd>
      </div>
      {/* Mobile-only search icon button (no input until expanded — future) */}
      <button
        type="button"
        aria-label={t('a11y.openSearch')}
        className="ml-1 inline-flex size-9 items-center justify-center rounded-md text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30 sm:hidden"
      >
        <Search className="size-4" aria-hidden="true" />
      </button>

      <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
        <NotificationBell />

        {/* Locale toggle — hidden on smallest screens, available in Settings */}
        <LocaleToggle value={locale} onChange={setLocale} className="hidden sm:flex" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-0.5 rounded-full outline-none ring-rust transition focus-visible:ring-2"
              aria-label={t('header.accountMenu')}
            >
              <Avatar className="size-8 ring-2 ring-background">
                {user?.image ? <AvatarImage src={user.image} alt={displayName} /> : null}
                <AvatarFallback className="bg-rust/15 text-[12px] font-semibold uppercase text-rust">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="text-sm font-medium">
                  {user?.name?.trim() || t('user.signedIn')}
                </span>
                <span className="truncate text-xs text-muted-foreground">{user?.email ?? ''}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/profile')}>
              {t('user.profile')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
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
      </div>
    </header>
  );
}

function LocaleToggle({
  value,
  onChange,
  className,
}: {
  value: Locale;
  onChange: (v: Locale) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Language"
      className={cn(
        'items-center rounded-full border border-border bg-card p-0.5 shadow-sm',
        className,
      )}
    >
      {(['de', 'en'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          aria-pressed={value === option}
          aria-label={option === 'de' ? 'Deutsch' : 'English'}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors',
            value === option
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
