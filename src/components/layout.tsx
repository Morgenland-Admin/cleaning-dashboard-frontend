import { Suspense } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Header } from '@/components/header';
import { MobileBottomNav } from '@/components/mobile-bottom-nav';
import { OfflineBanner } from '@/components/offline-banner';
import { PwaPrompts } from '@/components/pwa-prompts';
import { Sidebar } from '@/components/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { useT } from '@/i18n';
import { SEO_HOME, seoMayOpen, useIsSeoOnly } from '@/lib/access';
import { useRefreshInboxOnWrites } from '@/lib/use-inbox-counts';
import { useApplySavedPreferences } from '@/lib/use-user-preferences';

// Pages that own their padding: the chat messenger and the blog editor workspace.
const FULL_BLEED_ROUTES = [/^\/chat(\/|$)/, /^\/blog\/(new|\d+\/edit)\/?$/];

export function AppLayout() {
  const t = useT();
  const { pathname } = useLocation();
  const isFullBleed = FULL_BLEED_ROUTES.some((re) => re.test(pathname));
  const seoOnly = useIsSeoOnly();
  // `seo` users are bounced to the blog from any other page; the backend 403s regardless.
  const blocked = seoOnly && !seoMayOpen(pathname);
  useApplySavedPreferences();
  useRefreshInboxOnWrites();

  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#main-content"
        className="sr-only z-toast rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
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
              ? 'min-w-0 flex-1 outline-none'
              : 'min-w-0 flex-1 overflow-x-clip px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-4 outline-none sm:px-5 sm:pt-5 lg:px-8 lg:pb-8 lg:pt-6'
          }
        >
          <Suspense
            fallback={
              <div className="space-y-4" role="status" aria-label={t('common.loading')}>
                <Skeleton className="h-7 w-56" />
                <Skeleton className="h-64 w-full rounded-lg" />
              </div>
            }
          >
            {blocked ? <Navigate to={SEO_HOME} replace /> : <Outlet />}
          </Suspense>
        </main>
      </div>
      <MobileBottomNav />
      <OfflineBanner />
      {/* Push alerts are order/inquiry events, which `seo` users never receive. */}
      {seoOnly ? null : <PwaPrompts />}
    </div>
  );
}
