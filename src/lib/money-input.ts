/**
 * A typed euro amount → integer cents, or null when it is not a number.
 * Accepts "49,90", "49.90", "1.234,56", "1.234" (German grouping) and a trailing "€".
 */
export function parseEuroToCents(input: string): number | null {
  let v = input.trim().replace(/\s|€/g, '');
  if (v === '') return null;
  if (v.includes(',')) {
    // "1,234.56" is English grouping; too ambiguous to guess.
    if (/,.*\./.test(v)) return null;
    v = v.replace(/\./g, '').replace(',', '.');
  }
  // A lone dot with one or two decimals is a decimal point; any other dot groups thousands.
  else if (!/^[+-]?\d*\.\d{1,2}$/.test(v)) v = v.replace(/\./g, '');
  v = v.replace(/^([+-]?)\./, '$10.');
  if (!/^[+-]?\d+(\.\d+)?$/.test(v)) return null;
  return Math.round(Number(v) * 100);
}
