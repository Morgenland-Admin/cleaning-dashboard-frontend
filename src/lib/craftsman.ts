/**
 * §35a EStG (Handwerkerleistung) maths + wording, mirroring
 * `backend/src/lib/invoice-text.ts`. Duplicated on purpose: the operator has to
 * see the exact sentence before saving, and the value that ends up on the PDF
 * is always the one the server composes and stores on the invoice row.
 */

export const CRAFTSMAN_DEFAULT_VAT_RATE = 19;

/**
 * VAT contained in a gross (VAT-inclusive) labour amount — 200,00 € at 19 %
 * contain 31,93 €.
 */
export function craftsmanVatFromGross(
  grossCents: number,
  ratePercent = CRAFTSMAN_DEFAULT_VAT_RATE,
): number {
  if (!Number.isFinite(grossCents) || ratePercent <= 0) return 0;
  return Math.round((grossCents * ratePercent) / (100 + ratePercent));
}

/** "200 Euro" / "31,93 Euro" — the §35a sentence spells out the currency. */
function euroWord(cents: number): string {
  const value = cents / 100;
  return `${value.toLocaleString('de-DE', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} Euro`;
}

/**
 * The block printed above the closing line. Fixed German wording — it goes to
 * the customer's tax office, so it is never localised.
 */
export function craftsmanNoteText(grossCents: number, vatCents?: number | null): string {
  const bracket = vatCents && vatCents > 0 ? ` (inkl. ${euroWord(vatCents)} MwSt.)` : '';
  return (
    `Im Bruttorechnungsbetrag sind Arbeitskosten / Lohnanteile in Höhe von ` +
    `${euroWord(grossCents)}${bracket} enthalten, die nach § 35a EStG steuerlich absetzbar sind.`
  );
}
