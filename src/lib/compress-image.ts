export const MAX_WIDTH = 1600;
export const MAX_HEIGHT = 2400;
const QUALITY = 0.82;

/** Scales down to fit MAX_WIDTH × MAX_HEIGHT, never up. */
export function fitWithin(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

const EXT: Record<string, string> = {
  'image/webp': 'webp',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function renamed(name: string, type: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image';
  return `${base}.${EXT[type]}`;
}

/** Resizes and re-encodes as WebP (JPEG/PNG where the browser can't encode WebP); returns the original when that wouldn't make it smaller or on any failure. */
export async function compressImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const encode = (type: string) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, QUALITY));
    let blob = await encode('image/webp');
    // Safari can't encode WebP (returns PNG): still resize, keeping alpha for PNG/WebP sources.
    if (blob?.type !== 'image/webp') {
      blob = await encode(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png');
    }
    if (!blob || !EXT[blob.type] || blob.size >= file.size) return file;
    return new File([blob], renamed(file.name, blob.type), { type: blob.type });
  } catch {
    return file;
  }
}
