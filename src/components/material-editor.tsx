import { ExternalLink, ImagePlus, Loader2, QrCode, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CountPill } from '@/components/count-pill';
import { SearchInput } from '@/components/search-input';
import { SectionCard, SectionLabel } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useT } from '@/i18n';
import { isBrandValue } from '@/lib/material-data';
import { findPlaceholders } from '@/lib/material-print';
import { cn } from '@/lib/utils';

import type { SheetInfo, SheetPick } from '@/lib/brand-materials-export';
import type { QrPurpose, QrSource } from '@/lib/material-data';

export interface ResolvedQr {
  index: number;
  purpose: QrPurpose;
  board: number;
  content: string;
  base: string;
  source: QrSource;
}

export interface EditorProps {
  info: SheetInfo;
  brandName: string;
  canWrite: boolean;
  /** Text edits (this template). */
  edits: Record<string, string>;
  /** Placeholder values the brand set (all templates). */
  values: Record<string, string>;
  /** Values the company record supplies when the brand set none. */
  companyValues: Record<string, string>;
  qr: ResolvedQr[];
  /** Slots whose content does not fit in a QR code. */
  qrErrors: number[];
  qrOverrides: Record<string, string>;
  images: Record<string, string>;
  onText: (key: string, value: string | null) => void;
  onValue: (key: string, value: string | null) => void;
  onQr: (index: number, value: string | null) => void;
  onImage: (index: number, file: File | null) => Promise<void>;
  onResetTemplate: () => void;
  focus: { pick: SheetPick; at: number } | null;
  settingsLink: ReactNode;
  footer?: ReactNode;
}

const fieldId = (pick: SheetPick) =>
  'key' in pick ? `${pick.kind}:${pick.key}` : `${pick.kind}:${pick.index}`;

/** Right-hand panel: placeholders, QR codes, photos and every text on the artboards. */
export function MaterialEditor(props: EditorProps) {
  const t = useT();
  const { info, focus } = props;
  const refs = useRef(new Map<string, HTMLElement>());
  const [query, setQuery] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  // A click in the preview clears the search so the field is in the list.
  const [seenFocus, setSeenFocus] = useState(focus);
  if (focus !== seenFocus) {
    setSeenFocus(focus);
    setQuery('');
  }

  useEffect(() => {
    if (!focus) return;
    const id = fieldId(focus.pick);
    const frame = window.requestAnimationFrame(() => {
      const el = refs.current.get(id);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.querySelector<HTMLElement>('textarea, input:not([type=file]), button')?.focus({
        preventScroll: true,
      });
      setFlash(id);
    });
    const clear = window.setTimeout(() => setFlash(null), 1600);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(clear);
    };
  }, [focus]);

  const register = (id: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  const openPlaceholders = info.placeholders.filter(
    (p) => !(props.values[p.key]?.trim() || props.companyValues[p.key]),
  ).length;
  const changedTexts = Object.keys(props.edits).length;
  const templateChanges =
    changedTexts + Object.keys(props.qrOverrides).length + Object.keys(props.images).length;

  const boardLabel = (i: number) =>
    info.boards.length > 1
      ? (info.boards[i]?.name?.split('·')[0]?.trim() ?? t('materials.pageN', { n: i + 1 }))
      : null;

  const textGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q
      ? info.fields.filter((f) =>
          `${f.key}\n${props.edits[f.key] ?? ''}\n${f.filled}`.toLowerCase().includes(q),
        )
      : info.fields;
    return info.boards
      .map((_, i) => ({ board: i, fields: shown.filter((f) => f.board === i) }))
      .filter((g) => g.fields.length);
  }, [info, props.edits, query]);

  const ring = (id: string) => flash === id && 'ring-2 ring-primary ring-offset-2 ring-offset-card';

  return (
    <div className="space-y-4">
      {info.placeholders.length ? (
        <SectionCard
          title={t('materials.placeholdersGroup')}
          description={t('materials.placeholdersHint', { brand: props.brandName })}
          actions={
            openPlaceholders ? (
              <Badge variant="warning">{t('materials.openCount', { n: openPlaceholders })}</Badge>
            ) : (
              <Badge variant="success">{t('materials.allFilled')}</Badge>
            )
          }
          bodyClassName="space-y-3 px-4 py-3"
        >
          {info.placeholders.map((p) => {
            const id = `placeholder:${p.key}`;
            const own = props.values[p.key];
            const company = props.companyValues[p.key];
            const fromCompany = !own?.trim() && !!company;
            return (
              <div key={p.key} ref={register(id)} className="space-y-1">
                <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">{p.label}</span>
                  <span className="text-muted-foreground">
                    {fromCompany
                      ? t('materials.fromCompany')
                      : isBrandValue(p.key)
                        ? t('materials.allTemplates')
                        : t('materials.thisTemplate')}
                  </span>
                </label>
                <Input
                  id={id}
                  value={own ?? ''}
                  placeholder={company ?? p.token}
                  disabled={!props.canWrite}
                  onChange={(e) => props.onValue(p.key, e.target.value || null)}
                  className={cn(
                    'h-9 text-2sm',
                    !own?.trim() && !fromCompany && 'border-warning/60 bg-warning-soft',
                    ring(id),
                  )}
                />
              </div>
            );
          })}
        </SectionCard>
      ) : null}

      {props.qr.length ? (
        <SectionCard
          title={t('materials.qrTitle')}
          description={t('materials.qrHint')}
          icon={<QrCode />}
          bodyClassName="space-y-3 px-4 py-3"
        >
          {props.qr.map((code) => {
            const id = `qr:${code.index}`;
            const isUrl = /^https?:\/\//i.test(code.content);
            const where = boardLabel(code.board);
            return (
              <div key={code.index} ref={register(id)} className="space-y-1">
                <label htmlFor={id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-foreground">
                    {t(`materials.purpose.${code.purpose}`)}
                    {where ? ` · ${where}` : ''}
                  </span>
                  <span className="text-muted-foreground">
                    {t(`materials.qrSource.${code.source}`)}
                  </span>
                </label>
                <div className="flex gap-1.5">
                  <Input
                    id={id}
                    value={props.qrOverrides[code.index] ?? ''}
                    placeholder={code.base}
                    disabled={!props.canWrite}
                    onChange={(e) => props.onQr(code.index, e.target.value || null)}
                    className={cn('h-9 min-w-0 flex-1 text-2sm', ring(id))}
                  />
                  {isUrl ? (
                    <Button variant="outline" size="icon-sm" asChild>
                      <a
                        href={code.content}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t('materials.qrOpen')}
                        title={code.content}
                      >
                        <ExternalLink aria-hidden="true" />
                      </a>
                    </Button>
                  ) : null}
                </div>
                {props.qrErrors.includes(code.index) ? (
                  <p className="text-2xs text-destructive">{t('materials.qrTooLong')}</p>
                ) : (
                  <p className="break-all text-2xs text-muted-foreground">
                    {t('materials.qrEncodes', { content: code.content })}
                  </p>
                )}
              </div>
            );
          })}
          <div className="text-xs">{props.settingsLink}</div>
        </SectionCard>
      ) : null}

      {info.images.length ? (
        <SectionCard
          title={t('materials.imagesTitle')}
          description={t('materials.imagesHint')}
          icon={<ImagePlus />}
          bodyClassName="space-y-3 px-4 py-3"
        >
          {info.images.map((slot) => (
            <ImageSlotField
              key={slot.index}
              containerRef={register(`image:${slot.index}`)}
              label={slot.label.replace(/^Foto-Platzhalter\s*·?\s*/i, '') || slot.label}
              url={props.images[slot.index]}
              canWrite={props.canWrite}
              highlight={flash === `image:${slot.index}`}
              onPick={(file) => props.onImage(slot.index, file)}
            />
          ))}
        </SectionCard>
      ) : null}

      <SectionCard
        title={t('materials.textsGroup')}
        description={t('materials.editorHint')}
        actions={changedTexts ? <CountPill>{changedTexts}</CountPill> : undefined}
        bodyClassName="px-4 py-3"
      >
        {info.fields.length > 10 ? (
          <SearchInput
            value={query}
            onValueChange={setQuery}
            label={t('materials.searchTexts')}
            placeholder={t('materials.searchTexts')}
            containerClassName="mb-3"
          />
        ) : null}
        {textGroups.length === 0 ? (
          <p className="py-4 text-center text-2sm text-muted-foreground">
            {t('materials.noTexts')}
          </p>
        ) : (
          <div className="space-y-4">
            {textGroups.map((group) => (
              <div key={group.board} className="space-y-2">
                {boardLabel(group.board) ? (
                  <SectionLabel>{boardLabel(group.board)}</SectionLabel>
                ) : null}
                {group.fields.map((field) => {
                  const id = `text:${field.key}`;
                  const changed = field.key in props.edits;
                  const value = changed ? props.edits[field.key]! : field.filled;
                  return (
                    <div key={field.key} ref={register(id)} className="space-y-1">
                      <Textarea
                        aria-label={field.key}
                        value={value}
                        disabled={!props.canWrite}
                        rows={Math.min(4, Math.max(1, Math.ceil(value.length / 36)))}
                        onChange={(e) =>
                          props.onText(
                            field.key,
                            e.target.value === field.filled ? null : e.target.value,
                          )
                        }
                        className={cn(
                          'min-h-0 resize-none py-1.5 text-2sm',
                          changed && 'border-primary/60',
                          findPlaceholders(value).length > 0 && 'bg-warning-soft',
                          ring(id),
                        )}
                      />
                      {changed ? (
                        <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
                          <span className="min-w-0 break-words">
                            {t('materials.original', { text: field.key })}
                          </span>
                          <button
                            type="button"
                            onClick={() => props.onText(field.key, null)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <RotateCcw className="size-3" aria-hidden="true" />
                            {t('materials.resetField')}
                          </button>
                        </div>
                      ) : field.count > 1 ? (
                        <p className="text-xs text-muted-foreground">
                          {t('materials.usedTimes', { n: field.count })}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <div className="min-w-0 text-xs text-muted-foreground">{props.footer}</div>
          <Button
            variant="outline-destructive"
            size="xs"
            disabled={!templateChanges || !props.canWrite}
            onClick={() => setConfirmReset(true)}
          >
            {t('materials.resetAll')}
          </Button>
        </div>
      </SectionCard>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t('materials.resetAllTitle')}
        description={t('materials.resetAllBody', { n: templateChanges })}
        confirmLabel={t('materials.resetAll')}
        isDangerous
        onConfirm={() => {
          props.onResetTemplate();
          setConfirmReset(false);
        }}
      />
    </div>
  );
}

function ImageSlotField({
  containerRef,
  label,
  url,
  canWrite,
  highlight,
  onPick,
}: {
  containerRef: (el: HTMLElement | null) => void;
  label: string;
  url: string | undefined;
  canWrite: boolean;
  highlight: boolean;
  onPick: (file: File | null) => Promise<void>;
}) {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const run = async (file: File | null) => {
    setBusy(true);
    try {
      await onPick(file);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  return (
    <div
      ref={containerRef}
      className={cn(
        'flex items-center gap-3 rounded-md border p-2',
        highlight && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
      )}
    >
      <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        {url ? (
          <img src={url} alt="" className="size-full object-cover" />
        ) : (
          <ImagePlus className="size-5 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate text-2sm text-foreground" title={label}>
          {label}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => void run(e.target.files?.[0] ?? null)}
          />
          <Button
            variant="outline"
            size="xs"
            disabled={!canWrite || busy}
            onClick={() => input.current?.click()}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {url ? t('materials.imageReplace') : t('materials.imageUpload')}
          </Button>
          {url ? (
            <Button
              variant="ghost"
              size="xs"
              disabled={!canWrite || busy}
              onClick={() => void run(null)}
              aria-label={t('materials.imageRemove')}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
