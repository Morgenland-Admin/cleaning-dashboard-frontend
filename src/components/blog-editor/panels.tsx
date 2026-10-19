import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

import { newFaqKey, type FaqDraft } from './editor-utils';

/** Upper bound the backend accepts. */
const MAX_FAQ = 50;

/** Optional questions shown below the article; collapsed until there is something in it. */
export function FaqPanel({
  items,
  onChange,
  disabled,
}: {
  items: FaqDraft[];
  onChange: (items: FaqDraft[]) => void;
  disabled: boolean;
}) {
  const t = useT();
  const panelId = useId();
  const [open, setOpen] = useState(items.length > 0);
  const lastAdded = useRef<string | null>(null);

  useEffect(() => {
    if (!lastAdded.current) return;
    document.getElementById(`${lastAdded.current}-q`)?.focus();
    lastAdded.current = null;
  }, [items.length]);

  const update = (key: string, patch: Partial<FaqDraft>) =>
    onChange(items.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const move = (index: number, dir: -1 | 1) => {
    const next = [...items];
    const [moved] = next.splice(index, 1);
    next.splice(index + dir, 0, moved!);
    onChange(next);
  };
  const add = () => {
    const key = newFaqKey();
    lastAdded.current = key;
    setOpen(true);
    onChange([...items, { key, question: '', answer: '' }]);
  };

  return (
    <section className="rounded-lg border border-border bg-card text-foreground">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md py-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform duration-fast',
              open && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <span className="text-sm font-semibold">{t('blogEditor.faqTitle')}</span>
          <span className="truncate text-xs text-muted-foreground">
            {items.length > 0
              ? items.length === 1
                ? t('blogEditor.faqCountOne')
                : t('blogEditor.faqCount', { n: items.length })
              : t('blogEditor.faqHint')}
          </span>
        </button>
        {!disabled && items.length < MAX_FAQ ? (
          <Button type="button" variant="ghost" size="xs" onClick={add}>
            <Plus aria-hidden="true" />
            {t('blogEditor.faqAdd')}
          </Button>
        ) : null}
      </div>

      {open ? (
        <div id={panelId} className="border-t border-border px-3 pb-3 pt-3">
          {items.length === 0 ? (
            <p className="text-2sm text-muted-foreground">{t('blogEditor.faqEmpty')}</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {items.map((item, i) => (
                <li key={item.key} className="flex items-start gap-2">
                  <span className="mt-2.5 w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                    {i + 1}.
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Label htmlFor={`${item.key}-q`} className="sr-only">
                      {t('blogEditor.faqQuestion')} {i + 1}
                    </Label>
                    <Input
                      id={`${item.key}-q`}
                      value={item.question}
                      onChange={(e) => update(item.key, { question: e.target.value })}
                      placeholder={t('blogEditor.faqQuestion')}
                      disabled={disabled}
                      maxLength={2000}
                      className="font-medium"
                    />
                    <Label htmlFor={`${item.key}-a`} className="sr-only">
                      {t('blogEditor.faqAnswer')} {i + 1}
                    </Label>
                    <Textarea
                      id={`${item.key}-a`}
                      value={item.answer}
                      onChange={(e) => update(item.key, { answer: e.target.value })}
                      placeholder={t('blogEditor.faqAnswer')}
                      disabled={disabled}
                      rows={3}
                      maxLength={8000}
                    />
                  </div>
                  {!disabled ? (
                    <div className="flex shrink-0 flex-col gap-0.5">
                      <IconAction
                        label={t('blogEditor.moveUp')}
                        disabled={i === 0}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp aria-hidden="true" />
                      </IconAction>
                      <IconAction
                        label={t('blogEditor.moveDown')}
                        disabled={i === items.length - 1}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown aria-hidden="true" />
                      </IconAction>
                      <IconAction
                        label={t('blogEditor.faqRemove')}
                        danger
                        onClick={() => onChange(items.filter((it) => it.key !== item.key))}
                      >
                        <Trash2 aria-hidden="true" />
                      </IconAction>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}

function IconAction({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            danger
              ? 'text-destructive hover:bg-destructive-soft hover:text-destructive'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
