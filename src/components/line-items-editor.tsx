import { ArrowDown, ArrowUp, Package, Plus, Trash2 } from 'lucide-react';

import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';

function formatEur(cents: number, bcp47: string): string {
  return new Intl.NumberFormat(bcp47, { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

type LinesUpdater = (prev: LineDraft[]) => LineDraft[];

/**
 * Reusable line-item editor shared by the invoice form and the offer composer:
 * per-line label/qty/price, package flag, up/down reorder, and a net/gross
 * price-entry toggle that backs VAT out live. State is owned by the parent.
 */
export function LineItemsEditor({
  lines,
  onLinesChange,
  priceMode,
  onPriceModeChange,
  taxRatePercent,
}: {
  lines: LineDraft[];
  onLinesChange: (updater: LinesUpdater) => void;
  priceMode: PriceMode;
  onPriceModeChange: (mode: PriceMode) => void;
  taxRatePercent: number;
}) {
  const t = useT();
  const { bcp47 } = useLocale();

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

  // Flip net ↔ gross, converting the entered values so the shown number matches
  // the new mode (net 100 ↔ gross 119 at 19 %).
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

  return (
    <fieldset>
      <div className="flex items-center justify-between gap-2">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t('invoices.form.lineItems')}
        </legend>
        <div
          className="inline-flex overflow-hidden rounded-md border border-border text-xs"
          role="group"
          aria-label={t('invoices.form.priceMode')}
        >
          {(['net', 'gross'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className={cn(
                'px-2.5 py-1 transition-colors',
                priceMode === mode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted',
              )}
              onClick={() => switchPriceMode(mode)}
            >
              {mode === 'net' ? t('invoices.form.priceNet') : t('invoices.form.priceGross')}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-3">
        {lines.map((line, idx) => (
          <div
            key={idx}
            className={cn(
              'flex flex-col gap-2 rounded-lg border p-3',
              line.isPackage ? 'border-primary/50 bg-primary/5' : 'border-border',
            )}
          >
            <FormField label={t('invoices.form.label')} required>
              <Input
                className="h-11 md:h-9"
                value={line.label}
                onChange={(e) => setLine(idx, { label: e.target.value })}
              />
            </FormField>
            <div className="flex items-end gap-2">
              <FormField label={t('invoices.form.quantity')} required className="w-20">
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  className="h-11 md:h-9"
                  value={line.quantity}
                  onChange={(e) => setLine(idx, { quantity: e.target.value })}
                />
              </FormField>
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
                  className="h-11 md:h-9"
                  value={line.unitPriceEur}
                  onChange={(e) => setLine(idx, { unitPriceEur: e.target.value })}
                />
              </FormField>
              <span className="pb-2 text-xs tabular-nums text-muted-foreground">
                {formatEur(
                  Math.round(
                    toQuantity(line.quantity) * lineNetCents(line, priceMode, taxRatePercent),
                  ),
                  bcp47,
                )}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="size-3.5 accent-primary"
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
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  aria-label={t('invoices.form.moveUp')}
                  disabled={idx === 0}
                  onClick={() => moveLine(idx, -1)}
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  aria-label={t('invoices.form.moveDown')}
                  disabled={idx === lines.length - 1}
                  onClick={() => moveLine(idx, 1)}
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  aria-label={t('invoices.form.removeLine')}
                  disabled={lines.length === 1}
                  onClick={() => onLinesChange((prev) => prev.filter((_, i) => i !== idx))}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 self-start md:min-h-8"
          onClick={() => onLinesChange((prev) => [...prev, emptyLine()])}
        >
          <Plus className="size-3.5" aria-hidden="true" />
          {t('invoices.form.addLine')}
        </Button>
      </div>
    </fieldset>
  );
}
