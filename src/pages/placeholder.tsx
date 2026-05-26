import { Construction } from 'lucide-react';

import { useProject } from '@/contexts/project-context';
import { useT, type DictKey } from '@/i18n';

interface PlaceholderPageProps {
  /** Translation key resolving to the page title (under placeholder.*). */
  titleKey: DictKey;
  description?: string;
}

export function PlaceholderPage({ titleKey, description }: PlaceholderPageProps) {
  const { activeProject } = useProject();
  const t = useT();
  return (
    <div className="mx-auto w-full max-w-[1320px]">
      <div className="mb-6">
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
          {t(titleKey)}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {description ?? t('placeholder.description', { brand: activeProject.name })}
        </p>
      </div>
      <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 text-center text-sm text-muted-foreground">
        <div className="flex size-10 items-center justify-center rounded-full bg-rust/15 text-rust">
          <Construction className="size-5" />
        </div>
        <div>
          <div className="font-medium text-foreground/80">{t('placeholder.title')}</div>
          <div className="mt-1 text-xs">{t('placeholder.body')}</div>
        </div>
      </div>
    </div>
  );
}
