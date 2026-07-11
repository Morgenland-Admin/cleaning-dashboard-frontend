export type PriceMode = 'net' | 'gross';

export interface LineDraft {
  label: string;
  quantity: string;
  /** Unit price as typed — read as net or gross per the active priceMode. */
  unitPriceEur: string;
  isPackage: boolean;
}

export function emptyLine(): LineDraft {
  return { label: '', quantity: '1', unitPriceEur: '', isPackage: false };
}

export function toCents(eur: string): number {
  const n = Number(eur.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function toQuantity(value: string): number {
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function netFromGrossCents(grossCents: number, ratePercent: number): number {
  return Math.round(grossCents / (1 + ratePercent / 100));
}

export function grossFromNetCents(netCents: number, ratePercent: number): number {
  return Math.round(netCents * (1 + ratePercent / 100));
}

export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Per-line NET cents, backing VAT out of the entered value in gross mode. */
export function lineNetCents(l: LineDraft, priceMode: PriceMode, ratePercent: number): number {
  const unit = toCents(l.unitPriceEur);
  return priceMode === 'gross' ? netFromGrossCents(unit, ratePercent) : unit;
}

export function computeSubtotalCents(
  lines: LineDraft[],
  priceMode: PriceMode,
  ratePercent: number,
): number {
  return lines.reduce(
    (sum, l) => sum + Math.round(toQuantity(l.quantity) * lineNetCents(l, priceMode, ratePercent)),
    0,
  );
}
