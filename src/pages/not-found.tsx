import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { usePageTitle } from '@/lib/use-page-title';

export function NotFoundPage() {
  const t = useT();
  usePageTitle(t('errors.notFoundTitle'));
  return (
    <ErrorScreen
      icon={<Compass aria-hidden="true" />}
      title={t('errors.notFoundTitle')}
      body={t('errors.notFoundBody')}
      actions={
        <Button asChild>
          <Link to="/">{t('errors.backToOverview')}</Link>
        </Button>
      }
    />
  );
}

export function ErrorScreen({
  icon,
  title,
  body,
  actions,
  tone = 'muted',
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  actions: React.ReactNode;
  tone?: 'muted' | 'destructive';
}) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-4 py-16 text-center sm:py-24">
      <span
        className={
          tone === 'destructive'
            ? 'flex size-10 items-center justify-center rounded-lg bg-destructive-soft text-destructive [&_svg]:size-5'
            : 'flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-5'
        }
      >
        {icon}
      </span>
      <h1 className="text-title font-semibold text-foreground">{title}</h1>
      <p className="break-words text-2sm text-muted-foreground">{body}</p>
      <div className="mt-2 flex flex-wrap justify-center gap-2">{actions}</div>
    </div>
  );
}
