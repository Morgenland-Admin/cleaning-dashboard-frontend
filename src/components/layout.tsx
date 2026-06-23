import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { Header } from '@/components/header';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { PwaPrompts } from '@/components/pwa-prompts';
import { Sidebar } from '@/components/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/i18n';

// Routes that strip `<main>` padding (own their own scroll container).
const FULL_BLEED_ROUTES = ['/chat'];

export function AppLayout() {
  const t = useT();
  const { pathname } = useLocation();
  const isFullBleed = FULL_BLEED_ROUTES.some((p) => pathname.startsWith(p));

  return (
    <div className="flex min-h-svh bg-muted/30">
      {/* WCAG 2.4.1 skip link */}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t('a11y.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main
          id="main-content"
          tabIndex={-1}
          className={
            isFullBleed
              ? 'flex-1 outline-none'
              : 'flex-1 p-3 pb-[calc(4.75rem+env(safe-area-inset-bottom))] outline-none sm:p-4 sm:pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:p-6 lg:pb-6'
          }
        >
          <Suspense
            fallback={
              <div className="space-y-3">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileBottomNav />
      <PwaPrompts />
    </div>
  );
}
