import { useEditorState, type Editor } from '@tiptap/react';
import { AlertTriangle, ListTree } from 'lucide-react';

import { KeyValue, KeyValueList } from '@/components/key-value';
import { useLocale, useT } from '@/i18n';
import { cn } from '@/lib/utils';

import { readOutline, scrollToHeading } from './extensions';
import { PanelSection } from './seo-panel';

const INDENT: Record<number, string> = {
  1: 'pl-0',
  2: 'pl-0',
  3: 'pl-4',
  4: 'pl-8',
  5: 'pl-10',
  6: 'pl-12',
};

export function OutlinePanel({
  editor,
  stats,
}: {
  editor: Editor | null;
  stats: { words: number; minutes: number; internalLinks: number; images: number };
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const outline =
    useEditorState({
      editor,
      selector: ({ editor: e }) => (e ? readOutline(e) : []),
    }) ?? [];

  const rows = outline.map((item, i) => ({
    ...item,
    // The title is the H1, so the first body heading may be an H2.
    skipped: item.level > (i === 0 ? 1 : outline[i - 1]!.level) + 1,
  }));
  const number = new Intl.NumberFormat(bcp47);

  return (
    <div className="flex flex-col divide-y divide-border">
      <PanelSection title={t('blogOutline.stats')} className="pt-1">
        <KeyValueList layout="grid">
          <KeyValue
            label={t('blogOutline.words')}
            value={<span className="tabular-nums">{number.format(stats.words)}</span>}
          />
          <KeyValue
            label={t('blogOutline.readingTime')}
            value={
              <span className="tabular-nums">
                {t('blogEditor.readingTime', { n: stats.minutes })}
              </span>
            }
          />
          <KeyValue
            label={t('blogOutline.internalLinks')}
            value={<span className="tabular-nums">{stats.internalLinks}</span>}
          />
          <KeyValue
            label={t('blogOutline.images')}
            value={<span className="tabular-nums">{stats.images}</span>}
          />
        </KeyValueList>
        <p className="text-xs text-muted-foreground">{t('blogOutline.lengthNote')}</p>
      </PanelSection>

      <PanelSection title={t('blogOutline.title')} description={t('blogOutline.hint')}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-2sm text-muted-foreground">
            <ListTree className="size-5" aria-hidden="true" />
            {t('blogOutline.empty')}
          </div>
        ) : (
          <ol className="flex flex-col">
            {rows.map((item) => (
              <li key={item.pos} className={INDENT[item.level]}>
                <button
                  type="button"
                  onClick={() => editor && scrollToHeading(editor, item.pos)}
                  className={cn(
                    'flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-2sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    item.level <= 2 ? 'font-medium' : 'text-muted-foreground',
                  )}
                >
                  <span className="mt-px shrink-0 rounded-sm bg-muted px-1 text-2xs font-semibold tabular-nums text-muted-foreground">
                    H{item.level}
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    {item.text || t('blogOutline.emptyHeading')}
                  </span>
                  {item.skipped || item.level === 1 ? (
                    <span className="flex shrink-0 items-center gap-1 text-2xs font-medium text-warning">
                      <AlertTriangle className="size-3" aria-hidden="true" />
                      {item.level === 1 ? t('blogOutline.h1Body') : t('blogOutline.skipped')}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ol>
        )}
      </PanelSection>
    </div>
  );
}
