import { boardSlug, pngPixelRatio, type BoardSize, type PrintSize } from '@/lib/material-print';

export const SHEET_VERSION = 2;

export interface SheetField {
  /** Original text (whitespace-collapsed); identical texts share one field. */
  key: string;
  /** Text with placeholder values filled in. */
  filled: string;
  board: number;
  count: number;
}

export interface SheetPlaceholder {
  /** "USt-IdNr. · [PLATZHALTER]" or "[ Kundenname / Firma ]". */
  key: string;
  label: string;
  token: string;
  board: number;
  count: number;
}

export interface SheetQr {
  index: number;
  purpose: string;
  board: number;
  color: string;
}

export interface SheetImage extends BoardSize {
  index: number;
  label: string;
  fit: 'cover' | 'contain';
  board: number;
}

export interface SheetBoard extends BoardSize {
  name: string | null;
}

export interface SheetInfo {
  version: number;
  boards: SheetBoard[];
  notes: string[];
  fields: SheetField[];
  placeholders: SheetPlaceholder[];
  qr: SheetQr[];
  images: SheetImage[];
}

export interface SheetState {
  edits: Record<string, string>;
  values: Record<string, string>;
  /** Slot index → generated QR SVG markup. */
  qr: Record<string, string>;
  /** Slot index → image URL. */
  images: Record<string, string>;
}

export type SheetPick =
  | { kind: 'text' | 'placeholder'; key: string }
  | { kind: 'qr' | 'image'; index: number };

/** `window.__rp` from public/brand-materials/runtime/sheet.js. */
export interface SheetApi {
  version: number;
  info: () => SheetInfo;
  boardElement: (index: number) => HTMLElement | null;
  setState: (state: SheetState) => void;
  setPicking: (on: boolean) => void;
  setHighlight: (on: boolean) => void;
  preparePrint: (pages: (PrintSize | null)[]) => () => void;
}

export function sheetApi(frame: HTMLIFrameElement | null | undefined): SheetApi | null {
  const win = frame?.contentWindow as (Window & { __rp?: SheetApi }) | null | undefined;
  const api = win?.__rp;
  return api && api.version >= SHEET_VERSION ? api : null;
}

/**
 * Print dialog (Save as PDF): every artboard becomes its own page at its real size, without the
 * designer's notes. Chrome suggests the document title as the file name.
 */
export function printSheet(
  frame: HTMLIFrameElement,
  opts: { pages: (PrintSize | null)[]; fileName: string },
) {
  const api = sheetApi(frame);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!api || !win || !doc) throw new Error('sheet not loaded');
  const restore = api.preparePrint(opts.pages);
  const previous = doc.title;
  doc.title = opts.fileName;
  try {
    win.focus();
    win.print();
  } finally {
    doc.title = previous;
    restore();
  }
}

/** One PNG per artboard (300 dpi for print pieces, exact pixels for social posts). */
export async function downloadSheetPngs(
  frame: HTMLIFrameElement,
  opts: { boards: SheetBoard[]; pages: (PrintSize | null)[]; fileName: string },
) {
  const api = sheetApi(frame);
  if (!api) throw new Error('sheet not loaded');
  const { toPng } = await import('html-to-image');
  const several = opts.boards.length > 1;
  api.setHighlight(false);
  try {
    for (const [i, board] of opts.boards.entries()) {
      const node = api.boardElement(i);
      if (!node) continue;
      const url = await toPng(node, {
        width: board.width,
        height: board.height,
        pixelRatio: pngPixelRatio(board, opts.pages[i] ?? null),
        style: { boxShadow: 'none', borderRadius: '0', margin: '0' },
      });
      const a = document.createElement('a');
      a.href = url;
      a.download = several
        ? `${opts.fileName}-${boardSlug(board.name, i)}.png`
        : `${opts.fileName}.png`;
      a.click();
    }
  } finally {
    api.setHighlight(true);
  }
}

/** QR code as SVG markup in the slot's own colour on a transparent background. */
export async function qrMarkup(content: string, color: string): Promise<string> {
  const QRCode = await import('qrcode');
  const dark = /^#[0-9a-f]{6}$/i.test(color) ? color : '#000000';
  return QRCode.toString(content, {
    type: 'svg',
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark, light: '#0000' },
  });
}
