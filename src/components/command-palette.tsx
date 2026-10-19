import { useQuery } from '@tanstack/react-query';
import {
  Archive,
  Briefcase,
  ClipboardList,
  CornerDownLeft,
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

import { BrandChip } from '@/components/brand-mark';
import { ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useProject, type Project } from '@/contexts/project-context';
import { useT, type DictKey } from '@/i18n';
import { useIsAdmin } from '@/lib/access';
import { searchApi, type SearchHit, type SearchKind } from '@/lib/api';
import { NAV, type NavItem } from '@/lib/nav';
import { humanizeSlug, useOrderKindLabel } from '@/lib/use-order-kind-label';
import { cn } from '@/lib/utils';
import { STATUS_LABEL } from '@/pages/orders-shared';

type T = ReturnType<typeof useT>;

const KIND_ICON: Record<SearchKind, LucideIcon> = {
  order: Briefcase,
  customer: User,
  inquiry: ClipboardList,
  contact: Mail,
  invoice: FileText,
  partner: Store,
};

/** Mirrors the backend's minimum term length so no dead requests are fired. */
const MIN_QUERY = 2;
const MAX_PAGES = 6;

const CONTACT_STATUS: Record<string, DictKey> = {
  new: 'contacts.tabNew',
  read: 'contacts.tabRead',
  replied: 'contacts.tabReplied',
  archived: 'contacts.tabArchived',
};

/** Server status slugs, translated; an unknown one is humanized rather than shown blank. */
function statusLabel(hit: SearchHit, t: T): string | null {
  const s = hit.status;
  if (!s) return null;
  let key: string | undefined;
  if (hit.kind === 'order') key = STATUS_LABEL[s as keyof typeof STATUS_LABEL];
  else if (hit.kind === 'contact') key = CONTACT_STATUS[s];
  else if (hit.kind === 'inquiry') key = `inquiries.status.${s}`;
  else if (hit.kind === 'invoice') key = `invoices.status.${s}`;
  else if (hit.kind === 'partner') key = `partners.status.${s}`;
  return (key ? t(key as DictKey) : '') || humanizeSlug(s);
}

function hitTitle(hit: SearchHit, t: T): string {
  if (hit.title.trim()) return hit.title;
  if (hit.kind === 'invoice') return t('search.draftInvoice', { id: hit.id });
  if (hit.kind === 'partner') return t('search.partnerFallback', { id: hit.id });
  return t('search.noName');
}

function hrefFor(hit: SearchHit): string {
  switch (hit.kind) {
    case 'order':
      return `/auftraege/${hit.id}`;
    case 'customer':
      return `/customers/${hit.id}`;
    case 'inquiry':
      return `/inquiries/${hit.companySlug}/${hit.id}`;
    case 'contact':
      return `/contacts/${hit.companySlug}/${hit.id}`;
    case 'invoice':
      return `/rechnungen/${hit.id}`;
    case 'partner':
      return `/partner/${hit.id}?brand=${encodeURIComponent(hit.companySlug)}`;
    default:
      return hit.href;
  }
}

type Option =
  | { type: 'page'; key: string; item: NavItem; label: string }
  | { type: 'hit'; key: string; hit: SearchHit }
  | { type: 'legacy'; key: string };

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const navigate = useNavigate();
  const isAdmin = useIsAdmin();
  const { projects, setBrandView } = useProject();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebounced(term.trim());
      setActive(0);
    }, 180);
    return () => window.clearTimeout(id);
  }, [term]);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setTerm('');
      setDebounced('');
      setActive(0);
    }
    onOpenChange(next);
  }

  const enabled = debounced.length >= MIN_QUERY;
  const { data, isFetching, error, refetch } = useQuery({
    queryKey: ['global-search', debounced] as const,
    enabled,
    queryFn: ({ signal }) => searchApi.query(debounced, signal),
    staleTime: 15_000,
  });

  const options = useMemo<Option[]>(() => {
    const needle = term.trim().toLowerCase();
    const pages: Option[] = NAV.flatMap((g) => g.items)
      .filter((item) => isAdmin || !item.adminOnly)
      .map((item) => ({ item, label: t(item.labelKey) }))
      .filter(
        ({ label }) =>
          !needle ||
          label
            .toLowerCase()
            .split(/[\s·&-]+/)
            .some((word) => word.startsWith(needle)),
      )
      .slice(0, needle ? 3 : MAX_PAGES)
      .map(({ item, label }) => ({ type: 'page', key: `page:${item.to}`, item, label }));
    const hits: Option[] = enabled
      ? (data?.hits ?? []).map((hit) => ({
          type: 'hit',
          key: `${hit.companySlug}:${hit.kind}:${hit.id}`,
          hit,
        }))
      : [];
    const legacy: Option[] = enabled && isAdmin ? [{ type: 'legacy', key: 'legacy' }] : [];
    // While searching, records come first so Enter opens the best hit, not a page.
    return enabled ? [...hits, ...pages, ...legacy] : pages;
  }, [term, enabled, data, isAdmin, t]);

  const activeIndex = options.length === 0 ? 0 : Math.min(active, options.length - 1);
  const brandFor = (slug: string) => projects.find((p) => p.companySlug === slug);

  function choose(option: Option) {
    handleOpenChange(false);
    if (option.type === 'page') {
      navigate(option.item.to);
    } else if (option.type === 'legacy') {
      navigate(`/altdaten?q=${encodeURIComponent(debounced)}`);
    } else {
      // Switch brand first: the target page reads the active brand from context.
      setBrandView(option.hit.companySlug);
      navigate(hrefFor(option.hit));
    }
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (options.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => (Math.min(i, options.length - 1) + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => (Math.min(i, options.length - 1) - 1 + options.length) % options.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      // Results for the typed term are not in yet; Enter would open a stale option.
      if (term.trim().length >= MIN_QUERY && (term.trim() !== debounced || isFetching)) return;
      const option = options[activeIndex];
      if (option) choose(option);
    }
  }

  useEffect(() => {
    const el = listRef.current?.querySelector(`#search-option-${activeIndex}`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const activeId = options[activeIndex] ? `search-option-${activeIndex}` : undefined;
  const hitCount = options.filter((o) => o.type === 'hit').length;
  const firstHit = options.findIndex((o) => o.type === 'hit');
  const firstPage = options.findIndex((o) => o.type === 'page');

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
            // Focus has to enter the modal; this is its one control.
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="text"
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls="search-options"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={t('search.title')}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            enterKeyHint="search"
            className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:text-sm"
          />
          {isFetching ? (
            <Loader2
              className="size-4 shrink-0 animate-spin text-muted-foreground"
              aria-hidden="true"
            />
          ) : null}
        </div>

        <div className="relative max-h-[min(60svh,28rem)] overflow-y-auto overscroll-contain">
          {enabled && error && !isFetching ? (
            <div className="p-3">
              <ErrorState title={t('search.failed')} error={error} onRetry={() => void refetch()} />
            </div>
          ) : null}
          {options.length > 0 ? (
            <ul
              id="search-options"
              role="listbox"
              aria-label={t('search.title')}
              ref={listRef}
              className="p-1"
            >
              {options.map((option, index) => (
                <li key={option.key} role="presentation">
                  {index === firstPage ? <GroupLabel>{t('search.goTo')}</GroupLabel> : null}
                  {index === firstHit ? <GroupLabel>{t('search.records')}</GroupLabel> : null}
                  <OptionButton
                    id={`search-option-${index}`}
                    selected={index === activeIndex}
                    onHover={() => setActive(index)}
                    onChoose={() => choose(option)}
                  >
                    {option.type === 'page' ? (
                      <PageOption item={option.item} label={option.label} />
                    ) : option.type === 'legacy' ? (
                      <LegacyOption term={debounced} t={t} />
                    ) : (
                      <HitOption hit={option.hit} brand={brandFor(option.hit.companySlug)} t={t} />
                    )}
                  </OptionButton>
                </li>
              ))}
            </ul>
          ) : null}
          {!enabled ? (
            <p className="px-4 pb-4 pt-2 text-center text-xs text-muted-foreground">
              {t('search.hint')}
            </p>
          ) : !error && !isFetching && hitCount === 0 ? (
            <p role="status" className="px-4 pb-4 pt-2 text-center text-2sm text-muted-foreground">
              {t('search.empty')}
            </p>
          ) : null}
        </div>

        <div className="hidden items-center justify-between gap-3 border-t px-3 py-2 text-2xs text-muted-foreground sm:flex">
          <span>{t('search.footerNav')}</span>
          <span>{t('search.footerScope')}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden="true" className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted-foreground">
      {children}
    </div>
  );
}

function OptionButton({
  id,
  selected,
  onHover,
  onChoose,
  children,
}: {
  id: string;
  selected: boolean;
  onHover: () => void;
  onChoose: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={selected}
      tabIndex={-1}
      onMouseMove={onHover}
      onClick={onChoose}
      className={cn(
        'flex min-h-11 w-full items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors duration-fast sm:min-h-0',
        selected ? 'bg-accent' : 'hover:bg-accent/60',
      )}
    >
      {children}
    </button>
  );
}

function PageOption({ item, label }: { item: NavItem; label: string }) {
  const Icon = item.icon;
  return (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-2sm font-medium text-foreground">{label}</span>
      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    </>
  );
}

function LegacyOption({ term, t }: { term: string; t: T }) {
  return (
    <>
      <Archive className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-2sm font-medium text-foreground">
          {t('search.inLegacy', { term })}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {t('search.inLegacyHint')}
        </span>
      </span>
    </>
  );
}

function HitOption({ hit, brand, t }: { hit: SearchHit; brand: Project | undefined; t: T }) {
  const kindLabel = useOrderKindLabel(hit.kind === 'order' ? hit.companySlug : null);
  const Icon = KIND_ICON[hit.kind] ?? Search;
  const title = hitTitle(hit, t);
  const status = statusLabel(hit, t);
  const subtitle = [
    hit.kind === 'order' && hit.orderKind ? kindLabel(hit.orderKind) : null,
    hit.subtitle,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span
            className={cn(
              'truncate text-2sm font-medium',
              hit.title.trim() ? 'text-foreground' : 'italic text-muted-foreground',
            )}
          >
            {title}
          </span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {t(`search.kind.${hit.kind}`) || hit.kind}
            {status ? ` · ${status}` : ''}
          </span>
        </span>
        {subtitle ? (
          <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        {hit.imported ? <Badge variant="secondary">{t('search.imported')}</Badge> : null}
        {hit.meta ? (
          <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
            {hit.meta}
          </span>
        ) : null}
        {brand ? <BrandChip brand={brand} /> : null}
      </span>
    </>
  );
}

/** Global ⌘K / Ctrl-K; ignored while typing in a field. */
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
