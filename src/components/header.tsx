import { useQueryClient } from '@tanstack/react-query';
import { LogOut, Menu, Monitor, Moon, Search, Settings, Sun, User } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { BrandBlock } from '@/components/brand-logo';
import { CommandPalette, useCommandPaletteShortcut } from '@/components/command-palette';
import { NotificationBell } from '@/components/notification-bell';
import { SidebarBody } from '@/components/sidebar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
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
import { useTheme, type Theme } from '@/contexts/theme-context';
import { useLocale, type Locale } from '@/i18n';
import { useIsSeoOnly } from '@/lib/access';
import { authClient, useSession } from '@/lib/auth-client';
import { useUserPreferences } from '@/lib/use-user-preferences';

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export function Header() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Global search and notifications are outside the `seo` scope (their APIs 403).
  const seoOnly = useIsSeoOnly();
  useCommandPaletteShortcut(() => {
    if (!seoOnly) setPaletteOpen(true);
  });
  const { data } = useSession();
  const { t, locale } = useLocale();
  const { theme } = useTheme();
  const { update: updatePreferences } = useUserPreferences();
  const [signingOut, setSigningOut] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const user = data?.user;
  const displayName = user?.name?.trim() || user?.email || '';
  const initials = (displayName || '??').slice(0, 2).toUpperCase();

  async function onSignOut() {
    setSigningOut(true);
    // Clear cached data before the network call so a failing signOut cannot leak
    // the previous user's queries.
    queryClient.clear();
    try {
      await authClient.signOut();
    } finally {
      setSigningOut(false);
      navigate('/login', { replace: true });
    }
  }

  return (
    <header className="sticky top-0 z-header flex h-14 items-center gap-2 border-b border-border bg-background/85 px-3 backdrop-blur-md supports-[backdrop-filter]:bg-background/75 sm:gap-3 sm:px-4 lg:px-6">
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label={t('header.openMenu')}
            className="-ml-1 grid size-10 place-items-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0">
          <SheetTitle>{t('brand.name')}</SheetTitle>
          <SheetDescription>{t('brand.tagline')}</SheetDescription>
          <SidebarBody onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <BrandBlock compact size={28} className="lg:hidden" />

      {seoOnly ? null : (
        <>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="group relative hidden h-9 w-full max-w-md items-center rounded-md border border-border-strong bg-card pl-9 pr-16 text-left text-2sm text-muted-foreground shadow-xs transition-colors hover:border-input hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex"
          >
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <span className="truncate">{t('search.placeholder')}</span>
            <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none items-center rounded border border-border bg-muted px-1.5 text-2xs font-medium text-muted-foreground md:inline-flex">
              {IS_MAC ? '⌘K' : 'Ctrl K'}
            </kbd>
          </button>
          <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        </>
      )}

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        {seoOnly ? null : (
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label={t('search.title')}
            className="grid size-10 place-items-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
          >
            <Search className="size-[1.125rem]" aria-hidden="true" />
          </button>
        )}
        {seoOnly ? null : <NotificationBell />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-1 rounded-full outline-none ring-offset-background transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={t('header.accountMenu')}
            >
              <Avatar className="size-8">
                {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
                <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col">
                <span className="truncate text-2sm font-medium text-foreground">
                  {user?.name?.trim() || t('user.signedIn')}
                </span>
                <span className="truncate text-xs text-muted-foreground">{user?.email ?? ''}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/profile')}>
              <User aria-hidden="true" />
              {t('user.profile')}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
              <Settings aria-hidden="true" />
              {t('user.settings')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('header.appearance')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={theme}
              onValueChange={(v) => updatePreferences({ theme: v as Theme })}
            >
              <DropdownMenuRadioItem value="light" className="gap-2">
                <Sun className="size-4 text-muted-foreground" aria-hidden="true" />
                {t('header.themeLight')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark" className="gap-2">
                <Moon className="size-4 text-muted-foreground" aria-hidden="true" />
                {t('header.themeDark')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="system" className="gap-2">
                <Monitor className="size-4 text-muted-foreground" aria-hidden="true" />
                {t('header.themeSystem')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('header.language')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={locale}
              onValueChange={(v) => updatePreferences({ locale: v as Locale })}
            >
              <DropdownMenuRadioItem value="de" lang="de">
                Deutsch
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="en" lang="en">
                English
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={signingOut}
              onSelect={(e) => {
                e.preventDefault();
                void onSignOut();
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut aria-hidden="true" />
              {signingOut ? t('user.signingOut') : t('user.signOut')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
