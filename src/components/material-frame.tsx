import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

import { materialSrc, type MaterialDoc } from '@/lib/brand-materials';
import {
  sheetApi,
  type SheetInfo,
  type SheetPick,
  type SheetState,
} from '@/lib/brand-materials-export';
import { cn } from '@/lib/utils';

/** Runtime hooks the Claude Design `support.js` puts on the sheet's window. */
interface DcWindow extends Window {
  __dcRootName?: () => string;
  __dcSetProps?: (name: string, overrides: Record<string, unknown> | null) => void;
}

export interface MaterialFrameHandle {
  frame: HTMLIFrameElement | null;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Small, non-interactive card preview: the sheet's preview box scaled into a 4:3 frame. */
export function MaterialThumb({ doc, title }: { doc: MaterialDoc; title: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const height = (width * 3) / 4;
  const scale = width ? Math.min(width / doc.width, height / doc.height) : 0;
  return (
    <div ref={ref} className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
      {scale > 0 ? (
        <iframe
          src={materialSrc(doc)}
          title={title}
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
          scrolling="no"
          className="pointer-events-none absolute left-1/2 top-1/2 origin-center border-0"
          style={{
            width: doc.width,
            height: doc.height,
            transform: `translate(-50%, -50%) scale(${scale})`,
            // Same scheme as the sheet, or Chrome paints an opaque canvas behind it in dark mode.
            colorScheme: 'light',
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Full preview: the sheet at its natural width, scaled down to fit (or 1:1 with `zoom="actual"`).
 * Grows with the rendered content so multi-page A4 documents show every page.
 */
export const MaterialFrame = forwardRef<
  MaterialFrameHandle,
  {
    doc: MaterialDoc;
    title: string;
    zoom: 'fit' | 'actual';
    props?: Record<string, unknown>;
    /** Edits, placeholder values, QR markup and photos, applied inside the sheet. */
    state: SheetState;
    /** Clicking a text, placeholder, QR code or photo slot in the preview. */
    onPick?: (pick: SheetPick) => void;
    onInfo?: (info: SheetInfo) => void;
    /** sheet.js never came up, even after a fresh reload. */
    onError?: () => void;
    className?: string;
  }
>(function MaterialFrame(
  { doc, title, zoom, props, state, onPick, onInfo, onError, className },
  ref,
) {
  // Callers key the frame by document: a new sheet always starts from a fresh mount.
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [wrapRef, available] = useWidth<HTMLDivElement>();
  const [content, setContent] = useState({ width: doc.width, height: doc.height });
  const [ready, setReady] = useState(false);
  const [src, setSrc] = useState(() => materialSrc(doc));

  useImperativeHandle(ref, () => ({ frame: frameRef.current }), []);

  // A cached sheet from before sheet.js existed has no API: reload once past every cache.
  const onLoad = () => {
    if (sheetApi(frameRef.current)) {
      setReady(true);
      return;
    }
    if (!src.includes('&r=')) setSrc(`${materialSrc(doc)}&r=${Date.now()}`);
    else onError?.();
  };

  // Track the rendered size from inside the sheet; the runtime renders after React boots.
  useEffect(() => {
    if (!ready) return;
    const win = frameRef.current?.contentWindow as (Window & typeof globalThis) | null;
    const sheet = frameRef.current?.contentDocument;
    if (!win || !sheet) return;
    const measure = () => {
      const root = sheet.documentElement;
      const width = Math.max(doc.width, root.scrollWidth);
      const height = Math.max(doc.height, root.scrollHeight);
      setContent((prev) =>
        prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    const ro = new win.ResizeObserver(measure);
    ro.observe(sheet.documentElement);
    measure();
    return () => ro.disconnect();
  }, [ready, doc.width, doc.height]);

  // sheet.js reports artboards, texts, placeholders and slots after every render.
  useEffect(() => {
    if (!ready) return;
    const frame = frameRef.current;
    const win = frame?.contentWindow;
    if (!win) return;
    const update = () => {
      const info = sheetApi(frame)?.info();
      if (info) onInfo?.(info);
    };
    const pick = (event: Event) => onPick?.((event as CustomEvent<SheetPick>).detail);
    win.addEventListener('rp:update', update);
    win.addEventListener('rp:pick', pick);
    sheetApi(frame)?.setPicking(!!onPick);
    update();
    return () => {
      win.removeEventListener('rp:update', update);
      win.removeEventListener('rp:pick', pick);
    };
  }, [ready, onInfo, onPick]);

  useEffect(() => {
    if (ready) sheetApi(frameRef.current)?.setState(state);
  }, [ready, state]);

  // Template props (e.g. docType) go through the runtime once it has booted.
  const propsKey = JSON.stringify(props ?? null);
  useEffect(() => {
    if (!ready) return;
    const win = frameRef.current?.contentWindow as DcWindow | null;
    if (!win) return;
    let tries = 0;
    const id = window.setInterval(() => {
      if (win.__dcSetProps && win.__dcRootName) {
        win.__dcSetProps(win.__dcRootName(), JSON.parse(propsKey) as Record<string, unknown>);
        window.clearInterval(id);
      } else if (++tries > 40) window.clearInterval(id);
    }, 75);
    return () => window.clearInterval(id);
  }, [ready, propsKey]);

  const scale = zoom === 'actual' || !available ? 1 : Math.min(1, available / content.width);

  return (
    <div ref={wrapRef} className={cn('w-full min-w-0', zoom === 'actual' && 'overflow-x-auto')}>
      <div
        className={cn('relative mx-auto overflow-hidden', className)}
        style={{ width: content.width * scale, height: content.height * scale }}
      >
        <iframe
          ref={frameRef}
          src={src}
          title={title}
          scrolling="no"
          onLoad={onLoad}
          className="absolute left-0 top-0 origin-top-left border-0"
          style={{
            width: content.width,
            height: content.height,
            transform: scale === 1 ? undefined : `scale(${scale})`,
            colorScheme: 'light',
          }}
        />
      </div>
    </div>
  );
});
