/** Final size of a print piece; `fitWidth` = the artboard may be shorter than the page. */
export interface PrintSize {
  width: number;
  height: number;
  unit: 'mm' | 'px';
  fitWidth?: boolean;
}

export interface BoardSize {
  width: number;
  height: number;
}

const TOLERANCE = 0.04;
const PNG_DPI = 300;
const PNG_MAX_SIDE = 8000;

/** Pairs each artboard with the print size whose aspect ratio it matches (either orientation). */
export function matchPrintSizes(
  boards: BoardSize[],
  sizes: PrintSize[] | undefined,
): (PrintSize | null)[] {
  return boards.map((board) => {
    const ratio = board.width / board.height;
    for (const size of sizes ?? []) {
      for (const [w, h] of [
        [size.width, size.height],
        [size.height, size.width],
      ] as const) {
        const pageRatio = w / h;
        const close = Math.abs(pageRatio - ratio) / ratio <= TOLERANCE;
        const shorter = size.fitWidth && w < h && ratio >= pageRatio;
        if (close || shorter) return { ...size, width: w, height: h };
      }
    }
    return null;
  });
}

/** Scale for a PNG: 300 dpi for mm sizes, exact pixels for px sizes, capped for huge formats. */
export function pngPixelRatio(board: BoardSize, size: PrintSize | null): number {
  let ratio = 2;
  if (size?.unit === 'px') ratio = size.width / board.width;
  else if (size?.unit === 'mm') ratio = ((size.width / 25.4) * PNG_DPI) / board.width;
  const cap = PNG_MAX_SIDE / Math.max(board.width, board.height);
  return Math.max(1, Math.min(ratio, cap));
}

/** "85 × 55 mm" / "1080 × 1080 px" for the details panel. */
export function formatPrintSize(size: PrintSize | null): string | null {
  if (!size) return null;
  if (size.unit === 'px') return `${size.width} × ${size.height} px`;
  const cm = size.width >= 400 || size.height >= 400;
  return cm ? `${size.width / 10} × ${size.height / 10} cm` : `${size.width} × ${size.height} mm`;
}

const PLACEHOLDER = /\[[^\]\n]{1,60}\]/g;

/** Bracketed placeholders, e.g. "[PLATZHALTER]", "[ Kundenname / Firma ]", "[0800-NUMMER]". */
export function findPlaceholders(text: string): string[] {
  return [...new Set(text.match(PLACEHOLDER) ?? [])];
}

/** "Vorderseite · 85 × 55 mm" → "vorderseite", for file names. */
export function boardSlug(name: string | null | undefined, index: number): string {
  const parts = (name ?? '').split('·');
  const first =
    parts.find((part) => /seite|post|story|rund|rechteck/i.test(part)) ??
    parts.find((part) => /[a-zäöü]/i.test(part)) ??
    '';
  const slug = first
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || `seite-${index + 1}`;
}
