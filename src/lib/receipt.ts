// Money maths mirrors backend modules/orders/receipt.ts for live totals; the server recomputes everything.
import { centsToInput, toCents, toQuantity } from '@/lib/line-items';

import type { ReceiptDraft, ReceiptDraftItem, ReceiptPhoto } from '@/lib/api';

export const MAX_PHOTOS_PER_ITEM = 6;
export const MAX_PHOTOS = 24;

// Fields are strings so "2,5" and half-typed numbers survive.
export interface EditItem {
  uid: string;
  kind: 'carpet' | 'other';
  code: string;
  label: string;
  // m² (carpet without dimensions) or count (other).
  quantity: string;
  unit: string;
  unitPrice: string;
  lengthCm: string;
  widthCm: string;
  tagNumber: string;
  condition: string;
  photos: ReceiptPhoto[];
  addons: ReceiptDraftItem['addons'];
}

export interface EditState {
  handover: ReceiptDraft['handover'];
  receivedAt: string;
  pickupFee: string;
  note: string;
  items: EditItem[];
}

let uidCounter = 0;
export function newUid(): string {
  uidCounter += 1;
  return `ri-${Date.now().toString(36)}-${uidCounter}`;
}

function numText(n: number | undefined): string {
  return n == null ? '' : String(n).replace('.', ',');
}

function unitOf(quantityLabel: string | undefined): string {
  return (quantityLabel ?? '').replace(/^[\d.,\s]+/, '').trim();
}

export function toEditState(draft: ReceiptDraft): EditState {
  return {
    handover: draft.handover,
    receivedAt: draft.receivedAt,
    pickupFee: centsToInput(draft.pickupFeeCents),
    note: draft.note ?? '',
    items: draft.items.map((it) => ({
      uid: newUid(),
      kind: it.code.startsWith('carpet.') ? 'carpet' : 'other',
      code: it.code,
      label: it.label,
      quantity: numText(it.quantity),
      unit: unitOf(it.quantityLabel),
      unitPrice: centsToInput(it.unitPriceCents),
      lengthCm: numText(it.lengthCm),
      widthCm: numText(it.widthCm),
      tagNumber: it.tagNumber ?? '',
      condition: it.condition ?? '',
      photos: it.photos,
      addons: it.addons,
    })),
  };
}

// Same rule as the backend: two decimals, never 0.
export function areaSqm(lengthCm: number, widthCm: number): number {
  return Math.max(0.01, Math.round((lengthCm * widthCm) / 100) / 100);
}

export function formatSqm(n: number, bcp47: string): string {
  return n.toLocaleString(bcp47, {
    minimumFractionDigits: n % 1 === 0 ? 0 : 1,
    maximumFractionDigits: 2,
  });
}

export function effectiveQuantity(it: EditItem): number {
  const l = toQuantity(it.lengthCm);
  const w = toQuantity(it.widthCm);
  if (l > 0 && w > 0) return areaSqm(l, w);
  return toQuantity(it.quantity);
}

export function isMeasured(it: EditItem): boolean {
  return toQuantity(it.lengthCm) > 0 && toQuantity(it.widthCm) > 0;
}

export function itemTotalCents(it: EditItem): number {
  const q = effectiveQuantity(it);
  const main = Math.round(q * toCents(it.unitPrice));
  return it.addons.reduce((sum, a) => sum + Math.round(q * a.unitPriceCents), main);
}

export interface LiveTotals {
  itemsCents: number;
  pickupFeeCents: number;
  minOrderTopUpCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}

export function liveTotals(
  state: EditState,
  ctx: { minOrderCents: number; discountCents: number; paidCents: number },
): LiveTotals {
  const itemsCents = state.items.reduce((sum, it) => sum + itemTotalCents(it), 0);
  const pickupFeeCents = Math.max(0, toCents(state.pickupFee));
  const gross = itemsCents + pickupFeeCents;
  const minOrderTopUpCents = gross < ctx.minOrderCents ? ctx.minOrderCents - gross : 0;
  const totalCents = Math.max(0, gross + minOrderTopUpCents - ctx.discountCents);
  return {
    itemsCents,
    pickupFeeCents,
    minOrderTopUpCents,
    discountCents: ctx.discountCents,
    totalCents,
    paidCents: ctx.paidCents,
    balanceCents: ctx.paidCents > 0 ? totalCents - ctx.paidCents : 0,
  };
}

export type ReceiptProblem =
  | { kind: 'empty' }
  | { kind: 'label' | 'dims' | 'quantity'; position: number }
  | { kind: 'photos' };

export function findProblem(state: EditState): ReceiptProblem | null {
  if (state.items.length === 0) return { kind: 'empty' };
  let photos = 0;
  for (const [i, it] of state.items.entries()) {
    const position = i + 1;
    if (!it.label.trim()) return { kind: 'label', position };
    const l = it.lengthCm.trim();
    const w = it.widthCm.trim();
    if ((l === '') !== (w === '') || (l && toQuantity(l) <= 0) || (w && toQuantity(w) <= 0))
      return { kind: 'dims', position };
    if (effectiveQuantity(it) <= 0) return { kind: 'quantity', position };
    photos += it.photos.length;
  }
  if (photos > MAX_PHOTOS) return { kind: 'photos' };
  return null;
}

// Quantity labels go onto the customer's document: always German, whatever the UI language.
export function toDraft(state: EditState): ReceiptDraft {
  return {
    handover: state.handover,
    receivedAt: state.receivedAt,
    pickupFeeCents: Math.max(0, toCents(state.pickupFee)),
    ...(state.note.trim() ? { note: state.note.trim() } : {}),
    items: state.items.map((it) => {
      const quantity = effectiveQuantity(it);
      const measured = isMeasured(it);
      const unit = it.kind === 'carpet' ? 'm²' : it.unit.trim();
      return {
        code: it.code,
        label: it.label.trim(),
        quantity,
        ...(!measured
          ? {
              quantityLabel: unit
                ? `${it.kind === 'carpet' ? formatSqm(quantity, 'de-DE') : quantity.toLocaleString('de-DE')} ${unit}`
                : quantity.toLocaleString('de-DE'),
            }
          : {}),
        unitPriceCents: Math.max(0, toCents(it.unitPrice)),
        ...(measured ? { lengthCm: toQuantity(it.lengthCm), widthCm: toQuantity(it.widthCm) } : {}),
        ...(it.tagNumber.trim() ? { tagNumber: it.tagNumber.trim() } : {}),
        ...(it.condition.trim() ? { condition: it.condition.trim() } : {}),
        photos: it.photos,
        addons: it.addons,
      };
    }),
  };
}

// Re-encode to a ≤1600 px JPEG: phone photos are often HEIC and the PDF renderer only decodes JPEG/PNG.
export async function toUploadJpeg(file: File, maxEdge = 1600, quality = 0.82): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    if (!blob) return file;
    const base = file.name.replace(/\.[^.]+$/, '') || 'foto';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// Caller must revoke the URL.
export function pdfObjectUrl(base64: string): string {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
}
