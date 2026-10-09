import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  ImageUp,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { errMessage, uploadPublicImage } from '@/lib/api';
import {
  ACCEPTED_IMAGE_LABEL,
  formatBytes,
  MAX_IMAGE_BYTES,
  OG_HEIGHT,
  OG_WIDTH,
} from '@/lib/blog-utils';
import { cn } from '@/lib/utils';

import { newFaqKey, type FaqDraft } from './editor-utils';
import { IMAGE_MIME } from './extensions';

import type { CompanySlug } from '@/contexts/project-context';

/** Sidebar box in the WordPress "meta box" shape: titled card, padded body. */
export function Panel({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn('rounded-xl border border-border bg-card shadow-sm', className)}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-3">
        <h2 id={id} className="text-sm font-semibold">
          {title}
        </h2>
        {aside}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function CounterBadge({ current, min, max }: { current: number; min: number; max: number }) {
  const tone =
    current === 0
      ? 'text-muted-foreground'
      : current > max || current < min
        ? 'text-warning'
        : 'text-success';
  return (
    <span className={cn('text-xs tabular-nums', tone)}>
      {current}/{max}
    </span>
  );
}

// --- Featured image --------------------------------------------------------

export function FeaturedImagePanel({
  companySlug,
  image,
  onChange,
  disabled,
}: {
  companySlug: CompanySlug;
  image: string | null;
  onChange: (url: string | null) => void;
  disabled: boolean;
}) {
  const t = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function accept(file: File | undefined) {
    if (!file || disabled) return;
    if (!IMAGE_MIME.includes(file.type)) {
      toast.error(t('blog.imageTypeError'));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(t('blog.imageTooLarge', { max: formatBytes(MAX_IMAGE_BYTES) }));
      return;
    }
    setBusy(true);
    try {
      onChange(await uploadPublicImage(companySlug, file));
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title={t('blog.featuredImage')}
      aside={
        !image ? (
          <span className="text-xs font-medium text-warning">{t('blogEditor.required')}</span>
        ) : null
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_MIME.join(',')}
        className="hidden"
        onChange={(e) => {
          void accept(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void accept(e.dataTransfer.files?.[0]);
        }}
        disabled={busy || disabled}
        aria-label={image ? t('blog.replaceImage') : t('blog.uploadImage')}
        className={cn(
          'group relative flex aspect-[1200/630] w-full flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          image ? 'border-transparent' : 'border-border bg-muted hover:bg-muted/70',
          dragging && 'border-primary bg-primary/5',
        )}
      >
        {image ? (
          <>
            <img src={image} alt="" className="size-full object-cover" />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-ink/60 py-2 text-sm font-medium text-parchment opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <ImageUp className="size-4" aria-hidden="true" />
              {t('blog.replaceImage')}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 px-4 text-center text-2sm text-muted-foreground">
            <UploadCloud className="size-6" aria-hidden="true" />
            {t('blog.dropHint')}
          </span>
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-card/70">
            <Loader2 className="size-6 animate-spin" aria-hidden="true" />
            <span className="sr-only">{t('blog.uploading')}</span>
          </span>
        ) : null}
      </button>
      <p className="mt-2 text-2xs text-muted-foreground">
        {t('blog.imageRecommendation', {
          w: String(OG_WIDTH),
          h: String(OG_HEIGHT),
          types: ACCEPTED_IMAGE_LABEL,
          max: formatBytes(MAX_IMAGE_BYTES),
        })}
      </p>
      {image && !disabled ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => onChange(null)}
        >
          <X aria-hidden="true" />
          {t('blogEditor.removeImage')}
        </Button>
      ) : null}
    </Panel>
  );
}

// --- Checklist -------------------------------------------------------------

export type CheckState = 'ok' | 'warn' | 'missing';

export function Checklist({ items }: { items: Array<{ label: string; state: CheckState }> }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-2 text-2sm">
          {item.state === 'ok' ? (
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          ) : item.state === 'warn' ? (
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
          ) : (
            <CircleDashed
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <span className={cn(item.state === 'ok' ? 'text-foreground/80' : 'text-foreground')}>
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  );
}

// --- FAQ -------------------------------------------------------------------

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

  return (
    <Panel
      title={t('blogEditor.faqTitle')}
      aside={<span className="text-xs text-muted-foreground">{t('blogEditor.faqHint')}</span>}
    >
      {items.length === 0 ? (
        <p className="text-2sm text-muted-foreground">{t('blogEditor.faqEmpty')}</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {items.map((item, i) => (
            <li key={item.key} className="rounded-lg border border-border/80 bg-muted/20 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                  {i + 1}.
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Label htmlFor={`${item.key}-q`} className="sr-only">
                    {t('blogEditor.faqQuestion')}
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
                    {t('blogEditor.faqAnswer')}
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
                <div className="flex shrink-0 flex-col gap-0.5">
                  <IconBtn
                    label={t('blogEditor.moveUp')}
                    disabled={disabled || i === 0}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden="true" />
                  </IconBtn>
                  <IconBtn
                    label={t('blogEditor.moveDown')}
                    disabled={disabled || i === items.length - 1}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden="true" />
                  </IconBtn>
                  <IconBtn
                    label={t('blogEditor.faqRemove')}
                    disabled={disabled}
                    danger
                    onClick={() => onChange(items.filter((it) => it.key !== item.key))}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </IconBtn>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-4"
        disabled={disabled || items.length >= 50}
        onClick={() => {
          const key = newFaqKey();
          lastAdded.current = key;
          onChange([...items, { key, question: '', answer: '' }]);
        }}
      >
        <Plus aria-hidden="true" />
        {t('blogEditor.faqAdd')}
      </Button>
    </Panel>
  );
}

function IconBtn({
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
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-md transition-colors sm:size-8',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30',
        danger
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
