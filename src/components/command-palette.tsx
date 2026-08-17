import { useQuery } from '@tanstack/react-query';
import {
  Briefcase,
  ClipboardList,
  FileText,
  Loader2,
  Mail,
  Search,
  Store,
  User,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { BrandMark } from '@/components/brand-mark';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useProject } from '@/contexts/project-context';
import { useT } from '@/i18n';
import { searchApi, type SearchHit, type SearchKind } from '@/lib/api';
import { cn } from '@/lib/utils';

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  order: Briefcase,
  customer: User,
  inquiry: ClipboardList,
  contact: Mail,
  invoice: FileText,
  partner: Store,
};

/** Minimum term the backend accepts — mirrored here so we don't fire dead requests. */
const MIN_QUERY = 2;

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const { projects, setBrandView } = useProject();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  // Typing is fast; the query fans out across brands. Debounce so a 12-character
  // term costs one request, not twelve. The highlight resets here rather than in
  // an effect watching `debounced` — same moment, one render less.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(term.trim());
      setActive(0);
    }, 180);
    return () => window.clearTimeout(id);
  }, [term]);

  // A palette should never reopen showing the last person's search. Reset on the
  // close itself, not in an effect reacting to `open`.
  function handleOpenChange(next: boolean) {
    if (!next) {
      setTerm('');
      setDebounced('');
      setActive(0);
    }
    onOpenChange(next);
  }

  const enabled = debounced.length >= MIN_QUERY;
  const { data, isFetching } = useQuery({
    queryKey: ['global-search', debounced] as const,
    enabled,
    queryFn: ({ signal }) => searchApi.query(debounced, signal),
    // Results go stale the moment anything changes, but within one palette
    // session repeated terms should not re-hit the API.
    staleTime: 15_000,
  });

  const hits = useMemo(() => data?.hits ?? [], [data]);
  // Narrowing the term can shrink the list under a stale index.
  const activeIndex = hits.length === 0 ? 0 : Math.min(active, hits.length - 1);
  const brandFor = (slug: string) => projects.find((p) => p.companySlug === slug);

  function go(hit: SearchHit) {
    // The target page reads the active brand from context, so switch first —
    // otherwise a cross-brand hit lands on the right route with the wrong tenant.
    setBrandView(hit.companySlug);
    handleOpenChange(false);
    navigate(hit.href);
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (hits.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (Math.min(i, hits.length - 1) + 1) % hits.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (Math.min(i, hits.length - 1) - 1 + hits.length) % hits.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const hit = hits[activeIndex];
      if (hit) go(hit);
    }
  }

  // Keep the highlighted row in view when navigating by keyboard.
  useEffect(() => {
    const el = listRef.current?.children[activeIndex];
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const activeId = hits[activeIndex] ? `search-hit-${activeIndex}` : undefined;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showClose={false}
        className="top-[8%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12%]"
      >
        <DialogTitle className="sr-only">{t('search.title')}</DialogTitle>

        <div className="flex items-center gap-2 border-b px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            // A command palette that does not put the caret in its field is
            // broken. Focus has to enter the modal anyway, and this is the one
            // control in it.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="text"
            role="combobox"
            aria-expanded={hits.length > 0}
            aria-controls="search-hits"
            aria-activedescendant={activeId}
            aria-label={t('search.title')}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          {isFetching ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
          ) : null}
        </div>

        <div className="max-h-[min(60svh,26rem)] overflow-y-auto overscroll-contain">
          {!enabled ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('search.hint')}
            </p>
          ) : hits.length === 0 && !isFetching ? (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('search.empty')}
            </p>
          ) : (
            <ul id="search-hits" role="listbox" aria-label={t('search.title')} ref={listRef}>
              {hits.map((hit, index) => {
                const Icon = KIND_ICON[hit.kind];
                const brand = brandFor(hit.companySlug);
                return (
                  <li key={`${hit.companySlug}:${hit.kind}:${hit.id}`}>
                    <button
                      type="button"
                      id={`search-hit-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => go(hit)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors',
                        index === activeIndex ? 'bg-muted' : 'hover:bg-muted/60',
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium">{hit.title}</span>
                          <span className="shrink-0 text-2xs uppercase tracking-wide text-muted-foreground">
                            {t(`search.kind.${hit.kind}` as never)}
                          </span>
                        </span>
                        {hit.subtitle ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {hit.subtitle}
                          </span>
                        ) : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {hit.meta ? (
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {hit.meta}
                          </span>
                        ) : null}
                        {brand ? <BrandMark brand={brand} size="xs" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t px-3 py-2 text-2xs text-muted-foreground">
          <span>{t('search.footerNav')}</span>
          <span>{t('search.footerScope')}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Global ⌘K / Ctrl-K binding.
 *
 * Ignores the shortcut while the user is typing in a field, so ⌘K inside a
 * textarea does not yank them out of a half-written reply.
 */
export function useCommandPaletteShortcut(onOpen: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      const el = document.activeElement;
      const tag = el?.tagName;
      const isEditing =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        (el instanceof HTMLElement && el.isContentEditable);
      if (isEditing) return;
      event.preventDefault();
      onOpen();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpen]);
}
