// §35a EStG wording, mirroring backend `lib/invoice-text.ts` so the operator previews the exact sentence;
// the server's stored value is what lands on the PDF.

export const CRAFTSMAN_DEFAULT_VAT_RATE = 19;

export function craftsmanVatFromGross(
  grossCents: number,
  ratePercent = CRAFTSMAN_DEFAULT_VAT_RATE,
): number {
  if (!Number.isFinite(grossCents) || ratePercent <= 0) return 0;
  return Math.round((grossCents * ratePercent) / (100 + ratePercent));
}

function euroWord(cents: number): string {
  const value = cents / 100;
  return `${value.toLocaleString('de-DE', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} Euro`;
}

// Fixed German wording: it goes to the customer's tax office, never localised.
export function craftsmanNoteText(grossCents: number, vatCents?: number | null): string {
  const bracket = vatCents && vatCents > 0 ? ` (inkl. ${euroWord(vatCents)} MwSt.)` : '';
  return (
    `Im Bruttorechnungsbetrag sind Arbeitskosten / Lohnanteile in Höhe von ` +
    `${euroWord(grossCents)}${bracket} enthalten, die nach § 35a EStG steuerlich absetzbar sind.`
  );
}
