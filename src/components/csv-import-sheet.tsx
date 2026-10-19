import { Check, FileText, Upload, X } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { KeyValue, KeyValueList } from '@/components/key-value';
import { SectionLabel } from '@/components/section';
import { StatTile } from '@/components/stat-tile';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

// Built here: a plain link to the API sample would miss the brand header and resolve against the dashboard origin.
const SAMPLE_CSV_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(
  'email,first_name,last_name\r\nanna.muster@example.com,Anna,Muster\r\nthomas.beispiel@example.com,Thomas,Beispiel\r\n',
)}`;

/** Shared by the newsletter and customers pages; labels come from `${i18nPrefix}.import*` keys. */
export function CsvImportSheet({
  companySlug,
  brandName,
  i18nPrefix,
  sampleFileName,
  importFn,
  onImported,
  triggerClassName,
  headerChip,
  disabled,
  disabledTitle,
  requireConsentAttestation,
}: {
  companySlug: CompanySlug;
  brandName: string;
  i18nPrefix: string;
  sampleFileName: string;
  importFn: (
    companySlug: CompanySlug,
    body: { csv: string; dryRun?: boolean; attestConsent?: boolean },
  ) => Promise<{ summary: CsvImportSummary }>;
  onImported: () => void;
  triggerClassName?: string;
  headerChip?: ReactNode;
  disabled?: boolean;
  disabledTitle?: string;
  /**
   * Renders a required consent-attestation checkbox (UWG §7) and forwards `attestConsent`;
   * Apply stays blocked until it is ticked.
   */
  requireConsentAttestation?: boolean;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const k = (suffix: string) => `${i18nPrefix}.${suffix}` as never;
  const ids = useId();
  const dropTitleId = `${ids}-drop-title`;
  const dropHintId = `${ids}-drop-hint`;

  const [open, setOpen] = useState(false);
  const [fileText, setFileText] = useState('');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<CsvImportSummary | null>(null);
  const [busy, setBusy] = useState<false | 'preview' | 'apply'>(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<CsvImportSummary | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [attested, setAttested] = useState(false);

  function reset() {
    setFileText('');
    setFileName('');
    setPreview(null);
    setDone(null);
    setError(null);
    setDragOver(false);
    setAttested(false);
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
      const res = await importFn(companySlug, {
        csv: fileText,
        dryRun: true,
        ...(requireConsentAttestation ? { attestConsent: attested } : {}),
      });
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
      const res = await importFn(companySlug, {
        csv: fileText,
        ...(requireConsentAttestation ? { attestConsent: attested } : {}),
      });
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
        <Upload aria-hidden="true" />
        {t(k('import'))}
      </Button>
    );
  }

  const title = t(k('importTitle'));
  const subtitle = t(k('importSubtitle'), { brand: brandName });

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={triggerClassName}
        onClick={() => setOpen(true)}
      >
        <Upload aria-hidden="true" />
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
          variant="content"
          className="flex flex-col gap-6 overflow-y-auto sm:max-w-lg"
        >
          {/* Title/description stay sr-only to name the dialog; the visible copy is aria-hidden so it
              is not read twice. */}
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{subtitle}</SheetDescription>
          <div className="flex flex-col gap-2 pr-10">
            {headerChip ? <div className="flex">{headerChip}</div> : null}
            <div aria-hidden="true" className="space-y-1">
              <p className="text-base font-semibold text-foreground">{title}</p>
              <p className="text-2sm text-muted-foreground">{subtitle}</p>
            </div>
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
                'group flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2',
                dragOver
                  ? 'border-primary bg-primary-soft'
                  : 'border-border-strong bg-card hover:bg-accent/60',
              )}
            >
              <span
                className={cn(
                  'inline-flex size-12 items-center justify-center rounded-full transition-colors',
                  dragOver ? 'bg-primary text-primary-foreground' : 'bg-primary-soft text-primary',
                )}
                aria-hidden="true"
              >
                <Upload className="size-5" />
              </span>
              <div>
                <p id={dropTitleId} className="text-sm font-medium text-foreground">
                  {t(k('dropzoneTitle'))}
                </p>
                <p id={dropHintId} className="mt-1 text-xs text-muted-foreground">
                  {t(k('dropzoneHint'))}
                </p>
              </div>
              <a
                href={SAMPLE_CSV_HREF}
                download={sampleFileName}
                onClick={(e) => e.stopPropagation()}
                className="rounded-sm text-xs text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t(k('importSampleLink'))}
              </a>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                aria-labelledby={dropTitleId}
                aria-describedby={dropHintId}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readFile(f);
                }}
                className="sr-only"
              />
            </label>
          ) : (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
              <span
                className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
                aria-hidden="true"
              >
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{fileName}</p>
                <p className="text-xs tabular-nums text-muted-foreground">
                  {(fileText.length / 1024).toLocaleString(bcp47, { maximumFractionDigits: 1 })} KB
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <X aria-hidden="true" />
                {t('common.cancel')}
              </Button>
            </div>
          )}

          {error ? <Alert tone="destructive">{error}</Alert> : null}

          {(preview || done) && (
            <ImportSummary
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
                  <Check aria-hidden="true" />
                  {t('common.close')}
                </Button>
              </SheetClose>
            ) : (
              <>
                {requireConsentAttestation ? (
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-2sm leading-5 text-foreground">
                    <Checkbox
                      checked={attested}
                      onChange={(e) => setAttested(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>{t(k('importConsentLabel'))}</span>
                  </label>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    disabled={!fileText || busy !== false}
                    loading={busy === 'preview'}
                    onClick={runPreview}
                  >
                    {t(k('importPreview'))}
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={
                      !preview || busy !== false || (requireConsentAttestation && !attested)
                    }
                    loading={busy === 'apply'}
                    title={
                      requireConsentAttestation && !attested
                        ? t(k('importConsentRequired'))
                        : undefined
                    }
                    onClick={apply}
                  >
                    {t(k('importApply'), { n: preview ? preview.parsedRows - preview.skipped : 0 })}
                  </Button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function ImportSummary({
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
  const reasonLabel = (reason: CsvImportRejectReason | undefined) =>
    reason && REASONS.includes(reason) ? t(k(`importReason.${reason}`)) : (reason ?? '');
  const reasons = REASONS.filter((r) => summary.byReason[r] > 0);

  return (
    <section className="flex flex-col gap-3" aria-live="polite">
      <SectionLabel>{isFinal ? t(k('importDone')) : t(k('importDryRun'))}</SectionLabel>
      <div className="grid grid-cols-3 gap-2">
        <StatTile size="sm" label={t(k('importStat.parsed'))} value={summary.parsedRows} />
        <StatTile
          size="sm"
          label={t(k('importStat.imported'))}
          value={summary.imported}
          tone="success"
        />
        <StatTile
          size="sm"
          label={t(k('importStat.skipped'))}
          value={summary.skipped}
          tone={summary.skipped > 0 ? 'attention' : 'default'}
        />
      </div>
      {reasons.length > 0 ? (
        <KeyValueList className="rounded-lg border border-border bg-card px-3 py-2.5">
          {reasons.map((r) => (
            <KeyValue
              key={r}
              label={t(k(`importReason.${r}`))}
              value={<span className="tabular-nums">{summary.byReason[r]}</span>}
            />
          ))}
        </KeyValueList>
      ) : null}
      {summary.sampleRejects.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {t(k('importShowRejects'), { n: summary.sampleRejects.length })}
          </summary>
          <ul className="mt-2 flex flex-col gap-0.5 text-xs text-muted-foreground">
            {summary.sampleRejects.map((r, i) => (
              <li key={i} className="truncate">
                <span className="tabular-nums text-foreground">L{r.line}:</span>{' '}
                <span className="font-mono">{r.email}</span>
                {r.reject ? <span> · {reasonLabel(r.reject)}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
