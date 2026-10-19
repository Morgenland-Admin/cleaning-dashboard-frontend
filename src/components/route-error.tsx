import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { usePageTitle } from '@/lib/use-page-title';
import { ErrorScreen, NotFoundPage } from '@/pages/not-found';

/** Mounted twice in router.tsx: around the pages (inside the shell) and on the AppLayout route (shell crashes). */
export function RouteError() {
  const error = useRouteError();
  const t = useT();
  const is404 = isRouteErrorResponse(error) && error.status === 404;
  usePageTitle(is404 ? null : t('errors.routeTitle'));

  if (is404) {
    return <NotFoundPage />;
  }

  const message =
    error instanceof Error && error.message
      ? error.message
      : typeof error === 'string' && error
        ? error
        : t('errors.unexpected');

  return (
    <ErrorScreen
      tone="destructive"
      icon={<AlertTriangle aria-hidden="true" />}
      title={t('errors.routeTitle')}
      body={message}
      actions={
        <>
          <Button type="button" variant="outline" onClick={() => window.location.reload()}>
            <RefreshCcw aria-hidden="true" />
            {t('errors.reload')}
          </Button>
          <Button asChild>
            <Link to="/">{t('errors.toOverview')}</Link>
          </Button>
        </>
      }
    />
  );
}
