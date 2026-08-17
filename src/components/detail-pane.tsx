import { useCallback, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';

import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { useIsDesktop } from '@/lib/use-is-desktop';
import { cn } from '@/lib/utils';

/**
 * Keep a master–detail selection in the URL instead of component state.
 *
 * Buys three things the old `useState` could not: the record survives a reload,
 * the row is linkable ("look at ?order=1421"), and the phone's back gesture
 * closes the detail instead of leaving the page.
 *
 * Opening a detail pushes a history entry; switching to a sibling record
 * replaces it — so back is always one step out of the detail, never a walk
 * through every row that was browsed.
 */
export function useSelectedId(param: string): [number | null, (id: number | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(param);
  const selectedId = raw && /^\d+$/.test(raw) ? Number(raw) : null;
  const hasSelection = selectedId != null;

  const setSelectedId = useCallback(
    (id: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (id == null) next.delete(param);
          else next.set(param, String(id));
          return next;
        },
        { replace: hasSelection },
      );
    },
    [param, setSearchParams, hasSelection],
  );

  return [selectedId, setSelectedId];
}

/**
 * Same as {@link useSelectedId} for the cross-brand inboxes, where a row is only
 * identified by brand *and* id. Serialised as `?<param>=<slug>:<id>`.
 */
export function useSelectedBrandRef<S extends string>(
  param: string,
): [{ companySlug: S; id: number } | null, (ref: { companySlug: S; id: number } | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(param);
  const match = raw ? /^([a-z0-9_-]{2,63}):(\d+)$/.exec(raw) : null;
  const selected = match ? { companySlug: match[1] as S, id: Number(match[2]) } : null;
  const hasSelection = selected != null;

  const setSelected = useCallback(
    (ref: { companySlug: S; id: number } | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (ref == null) next.delete(param);
          else next.set(param, `${ref.companySlug}:${ref.id}`);
          return next;
        },
        { replace: hasSelection },
      );
    },
    [param, setSearchParams, hasSelection],
  );

  return [selected, setSelected];
}

interface DetailPaneProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the mobile sheet. Not painted — the panel has its own header. */
  title: string;
  /**
   * Whether the desktop column should stick and scroll on its own. Pass `false`
   * when the panel inside already does that — nesting two sticky scroll
   * containers gives you two scrollbars and neither behaves.
   */
  desktopSticky?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The detail half of a master–detail page, rendered the way the viewport wants.
 *
 * At `lg` and up it is a sticky column next to the list. Below `lg` it becomes a
 * full-screen sheet over the list, because a single-column grid put the panel
 * *underneath* a list box that owns its own scroll — tapping a row scrolled
 * nothing into view and read as a dead tap.
 *
 * The panel keeps its own header and close control, so the sheet renders no
 * chrome of its own.
 */
export function DetailPane({
  open,
  onClose,
  title,
  desktopSticky = true,
  className,
  children,
}: DetailPaneProps) {
  const isDesktop = useIsDesktop();

  if (!open) return null;

  if (isDesktop) {
    return (
      <aside
        className={cn(
          desktopSticky &&
            'lg:sticky lg:top-6 lg:max-h-[calc(100svh-3rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain',
          className,
        )}
      >
        {children}
      </aside>
    );
  }

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        side="right"
        variant="content"
        showClose={false}
        className="max-w-none gap-0 overflow-y-auto overscroll-contain p-0 sm:max-w-none"
      >
        <SheetTitle>{title}</SheetTitle>
        {children}
      </SheetContent>
    </Sheet>
  );
}
