import { AlertCircle, Check, Loader2, Upload, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { type CompanySlug } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import { errMessage, type CsvImportRejectReason, type CsvImportSummary } from '@/lib/api';
import { cn } from '@/lib/utils';

const REASONS: CsvImportRejectReason[] = [
  'invalid_email',
  'duplicate',
  'own_domain',
  'system_address',
  'disposable_domain',
];

type T = ReturnType<typeof useT>;

/**
 * CSV import sheet shared by the newsletter and customers pages. Reads its
 * labels from `${i18nPrefix}.import*` keys, so both modules reuse the same
 * key shape. The two pages differ only in the import API, sample href, and an
 * optional brand chip in the header.
 */
export function CsvImportSheet({
  companySlug,
  brandName,
  i18nPrefix,
  sampleHref,
  importFn,
  onImported,
  triggerClassName,
  headerChip,
  disabled,
  disabledTitle,
}: {
  companySlug: CompanySlug;
  brandName: string;
  i18nPrefix: string;
  sampleHref: string;
  importFn: (
    companySlug: CompanySlug,
    body: { csv: string; dryRun?: boolean },
  ) => Promise<{ summary: CsvImportSummary }>;
  onImported: () => void;
  triggerClassName?: string;
  headerChip?: ReactNode;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const k = (suffix: string) => `${i18nPrefix}.${suffix}` as never;

  const [open, setOpen] = useState(false);
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<CsvImportSummary | null>(null);
  const [busy, setBusy] = useState<false | 'preview' | 'apply'>(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CsvImportSummary | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function reset() {
    setFileText('');
    setFileName('');
    setPreview(null);
    setDone(null);
    setError(null);
    setDragOver(false);
  }

  async function readFile(f: File) {
    reset();
    setFileName(f.name);
    setFileText(await f.text());
  }

  async function runPreview() {
    if (!fileText) return;
    setBusy('preview');
    setError(null);
    try {
      const res = await importFn(companySlug, { csv: fileText, dryRun: true });
      setPreview(res.summary);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!fileText) return;
    setBusy('apply');
    setError(null);
    try {
      const res = await importFn(companySlug, { csv: fileText });
      setDone(res.summary);
      onImported();
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (disabled) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title={disabledTitle}
        className={triggerClassName}
      >
        <Upload className="size-3.5" aria-hidden="true" />
        {t(k('import'))}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        <Upload className="size-3.5" aria-hidden="true" />
        {t(k('import'))}
      </Button>

      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-6 overflow-y-auto sm:max-w-lg"
        >
          <div className="flex flex-col gap-2">
            {headerChip}
            <SheetTitle className="font-serif text-xl tracking-tight">
              {t(k('importTitle'))}
            </SheetTitle>
            <SheetDescription>{t(k('importSubtitle'), { brand: brandName })}</SheetDescription>
          </div>

          {!fileName ? (
            <label
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void readFile(f);
              }}
              className={cn(
                'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed bg-card/50 px-6 py-10 text-center transition-colors',
                dragOver
                  ? 'border-rust bg-rust-soft/30'
                  : 'border-border hover:border-foreground/30 hover:bg-card',
              )}
            >
              <span
                className={cn(
                  'inline-flex size-12 items-center justify-center rounded-full ring-1 transition-colors',
                  dragOver
                    ? 'bg-rust text-primary-foreground ring-rust'
                    : 'bg-rust-soft/60 text-rust ring-rust/20',
                )}
                aria-hidden="true"
              >
                <Upload className="size-5" />
              </span>
              <div>
                <p className="text-sm font-medium text-foreground">{t(k('dropzoneTitle'))}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{t(k('dropzoneHint'))}</p>
              </div>
              <a
                href={sampleHref}
                download
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] text-rust underline-offset-2 hover:underline"
              >
                {t(k('importSampleLink'))}
              </a>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                }}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span className="inline-flex size-10 items-center justify-center rounded-md bg-rust-soft/60 text-rust ring-1 ring-rust/15">
                <Upload className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{fileName}</p>
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  {(fileText.length / 1024).toLocaleString(bcp47, { maximumFractionDigits: 1 })} KB
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" />
                {t('common.cancel')}
              </Button>
            </div>
          )}

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive"
            >
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          {(preview || done) && (
            <ImportSummaryCard
              summary={done ?? preview!}
              isFinal={!!done}
              i18nPrefix={i18nPrefix}
              t={t}
            />
          )}

          <div className="mt-auto flex flex-col gap-2">
            {done ? (
              <SheetClose asChild>
                <Button>
                  <Check className="size-4" />
                  {t('common.close')}
                </Button>
              </SheetClose>
            ) : (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  disabled={!fileText || busy !== false}
                  onClick={runPreview}
                >
                  {busy === 'preview' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t(k('importPreview'))}
                </Button>
                <Button className="flex-1" disabled={!preview || busy !== false} onClick={apply}>
                  {busy === 'apply' ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t(k('importApply'), { n: preview ? preview.parsedRows - preview.skipped : 0 })}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ImportSummaryCard({
  summary,
  isFinal,
  i18nPrefix,
  t,
}: {
  summary: CsvImportSummary;
  isFinal: boolean;
  i18nPrefix: string;
  t: T;
}) {
  const k = (suffix: string) => `${i18nPrefix}.${suffix}` as never;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {isFinal ? t(k('importDone')) : t(k('importDryRun'))}
      </p>
      <div className="mt-2 grid grid-cols-3 gap-3 border-b border-border pb-3">
        <Stat label={t(k('importStat.parsed'))} value={summary.parsedRows} />
        <Stat label={t(k('importStat.imported'))} value={summary.imported} tone="good" />
        <Stat label={t(k('importStat.skipped'))} value={summary.skipped} tone="warn" />
      </div>
      <ul className="mt-3 flex flex-col gap-1 text-[12px]">
        {REASONS.filter((r) => summary.byReason[r] > 0).map((r) => (
          <li key={r} className="flex items-center justify-between gap-3 text-muted-foreground">
            <span>{t(k(`importReason.${r}`))}</span>
            <span className="font-mono tabular-nums text-foreground">{summary.byReason[r]}</span>
          </li>
        ))}
      </ul>
      {summary.sampleRejects.length > 0 ? (
        <details className="mt-3 text-[11px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            {t(k('importShowRejects'), { n: summary.sampleRejects.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-0.5 font-mono text-[11px] text-muted-foreground">
            {summary.sampleRejects.map((r, i) => (
              <li key={i} className="truncate">
                <span className="text-foreground/70">L{r.line}:</span> {r.email}{' '}
                <span className="text-rust">[{r.reject}]</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  const cls =
    tone === 'good'
      ? 'text-emerald-700 dark:text-emerald-300'
      : tone === 'warn'
        ? 'text-rust'
        : 'text-foreground';
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn('font-mono text-lg font-medium tabular-nums', cls)}>{value}</span>
    </div>
  );
}
