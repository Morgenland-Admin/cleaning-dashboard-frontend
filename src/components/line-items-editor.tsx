import { ArrowDown, ArrowUp, Package, Plus, Trash2 } from 'lucide-react';
import { useId } from 'react';

import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useLocale, useT } from '@/i18n';
import {
  centsToInput,
  emptyLine,
  grossFromNetCents,
  lineNetCents,
  netFromGrossCents,
  toCents,
  toQuantity,
  type LineDraft,
  type PriceMode,
} from '@/lib/line-items';
import { cn, formatCurrency } from '@/lib/utils';

type LinesUpdater = (prev: LineDraft[]) => LineDraft[];

/**
 * `hidePrices` = Paketrechnung shape: no price controls, the parent enters one package price.
 * `showTitle={false}` when it sits in a section that already is the "Positionen" group.
 */
export function LineItemsEditor({
  lines,
  onLinesChange,
  priceMode,
  onPriceModeChange,
  taxRatePercent,
  hidePrices = false,
  showTitle = true,
}: {
  lines: LineDraft[];
  onLinesChange: (updater: LinesUpdater) => void;
  priceMode: PriceMode;
  onPriceModeChange: (mode: PriceMode) => void;
  taxRatePercent: number;
  hidePrices?: boolean;
  showTitle?: boolean;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const titleId = useId();

  function setLine(idx: number, patch: Partial<LineDraft>) {
    onLinesChange((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  function moveLine(idx: number, dir: -1 | 1) {
    onLinesChange((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx]!;
      next[idx] = next[j]!;
      next[j] = tmp;
      return next;
    });
  }

  // Converts the entered values on flip so the shown number matches the new mode.
  function switchPriceMode(next: PriceMode) {
    if (next === priceMode) return;
    onLinesChange((prev) =>
      prev.map((l) => {
        const cents = toCents(l.unitPriceEur);
        if (!l.unitPriceEur.trim() || cents === 0) return l;
        const converted =
          next === 'gross'
            ? grossFromNetCents(cents, taxRatePercent)
            : netFromGrossCents(cents, taxRatePercent);
        return { ...l, unitPriceEur: centsToInput(converted) };
      }),
    );
    onPriceModeChange(next);
  }

  // Named by the visible title: a <legend> only counts as the fieldset's name
  // as its first child, and this header row also has to hold the net/gross switch.
  const Root = showTitle ? 'fieldset' : 'div';
  return (
    <Root aria-labelledby={showTitle ? titleId : undefined} className="min-w-0">
      {showTitle || !hidePrices ? (
        <div
          className={cn('flex items-center gap-2', showTitle ? 'justify-between' : 'justify-end')}
        >
          {showTitle ? (
            <span id={titleId} className="text-xs font-medium text-muted-foreground">
              {t('invoices.form.lineItems')}
            </span>
          ) : null}
          {hidePrices ? null : (
            <SegmentedControl
              size="sm"
              label={t('invoices.form.priceMode')}
              value={priceMode}
              onValueChange={switchPriceMode}
              options={[
                { value: 'net', label: t('invoices.form.priceNet') },
                { value: 'gross', label: t('invoices.form.priceGross') },
              ]}
            />
          )}
        </div>
      ) : null}
      <div className="mt-2 flex flex-col gap-3">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3',
              line.isPackage ? 'border-primary/40 bg-primary-soft' : 'border-border',
            )}
          >
            <FormField label={t('invoices.form.label')} required>
              <Input value={line.label} onChange={(e) => setLine(idx, { label: e.target.value })} />
            </FormField>
            <FormField label={t('invoices.form.lineNote')} hint={t('invoices.form.lineNoteHint')}>
              <Input value={line.note} onChange={(e) => setLine(idx, { note: e.target.value })} />
            </FormField>
            <div className="flex items-end gap-2">
              <FormField label={t('invoices.form.quantity')} required className="w-24">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  value={line.quantity}
                  onChange={(e) => setLine(idx, { quantity: e.target.value })}
                />
              </FormField>
              {hidePrices ? null : (
                <>
                  <FormField
                    label={
                      priceMode === 'gross'
                        ? t('invoices.form.unitPriceGross')
                        : t('invoices.form.unitPriceNet')
                    }
                    required
                    className="flex-1"
                  >
                    <Input
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={line.unitPriceEur}
                      onChange={(e) => setLine(idx, { unitPriceEur: e.target.value })}
                    />
                  </FormField>
                  <span className="pb-3.5 text-xs tabular-nums text-muted-foreground sm:pb-2.5">
                    {formatCurrency(
                      Math.round(
                        toQuantity(line.quantity) * lineNetCents(line, priceMode, taxRatePercent),
                      ) / 100,
                      'EUR',
                      bcp47,
                    )}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Checkbox
                  checked={line.isPackage}
                  onChange={(e) => setLine(idx, { isPackage: e.target.checked })}
                />
                <Package className="size-3.5" aria-hidden="true" />
                {t('invoices.form.markAsPackage')}
              </label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={t('invoices.form.moveUp')}
                  title={t('invoices.form.moveUp')}
                  disabled={idx === 0}
                  onClick={() => moveLine(idx, -1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  aria-label={t('invoices.form.moveDown')}
                  title={t('invoices.form.moveDown')}
                  disabled={idx === lines.length - 1}
                  onClick={() => moveLine(idx, 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
                  aria-label={t('invoices.form.removeLine')}
                  title={t('invoices.form.removeLine')}
                  disabled={lines.length === 1}
                  onClick={() => onLinesChange((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() => onLinesChange((prev) => [...prev, emptyLine()])}
        >
          <Plus aria-hidden="true" />
          {t('invoices.form.addLine')}
        </Button>
      </div>
    </Root>
  );
}

/** Amounts in cents. */
export function LineItemsTotals({
  subtotalCents,
  taxCents,
  totalCents,
  taxRatePercent,
  currency = 'EUR',
  className,
}: {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  taxRatePercent: number;
  currency?: string;
  className?: string;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const money = (cents: number) => formatCurrency(cents / 100, currency, bcp47);
  return (
    <dl
      className={cn('grid gap-1 rounded-md border border-border bg-muted p-3 text-2sm', className)}
    >
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">{t('invoices.form.subtotal')}</dt>
        <dd className="tabular-nums">{money(subtotalCents)}</dd>
      </div>
      <div className="flex justify-between gap-3">
        <dt className="text-muted-foreground">
          {t('invoices.form.tax')} ({taxRatePercent} %)
        </dt>
        <dd className="tabular-nums">{money(taxCents)}</dd>
      </div>
      <div className="mt-1 flex justify-between gap-3 border-t border-border pt-2 font-semibold">
        <dt>{t('invoices.form.total')}</dt>
        <dd className="tabular-nums">{money(totalCents)}</dd>
      </div>
    </dl>
  );
}
