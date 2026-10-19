import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Briefcase, Clock, Hand, Heart, Smile, type LucideIcon } from 'lucide-react';
import { useId, useMemo, useRef, useState } from 'react';

import { SearchInput } from '@/components/search-input';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/i18n';
import {
  EMOJI_CATEGORIES,
  moveInGrid,
  pushRecent,
  readRecentEmoji,
  searchEmoji,
  writeRecentEmoji,
  type EmojiCategoryId,
  type GridKey,
} from '@/lib/emoji';

const GRID_KEYS = new Set<string>([
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
] satisfies GridKey[]);

const CATEGORY_KEY = {
  smileys: 'chat.emojiCategory.smileys',
  gestures: 'chat.emojiCategory.gestures',
  symbols: 'chat.emojiCategory.symbols',
  objects: 'chat.emojiCategory.objects',
} as const satisfies Record<EmojiCategoryId, string>;

const ICON: Record<EmojiCategoryId | 'recent', LucideIcon> = {
  recent: Clock,
  smileys: Smile,
  gestures: Hand,
  symbols: Heart,
  objects: Briefcase,
};

type Section = { id: string; label: string; emojis: string[]; offset: number };

/** Curated emoji popover; `keepOpen` is true for Shift+click / Shift+Enter (several in a row). */
export function ChatEmojiPicker({ onPick }: { onPick: (char: string, keepOpen: boolean) => void }) {
  const { t } = useLocale();
  const baseId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [backToComposer, setBackToComposer] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => (query.trim() ? searchEmoji(query) : null), [query]);
  const groups: Array<Omit<Section, 'offset'>> = results
    ? [{ id: 'results', label: t('chat.emojiResults'), emojis: results }]
    : [
        ...(recent.length ? [{ id: 'recent', label: t('chat.emojiRecent'), emojis: recent }] : []),
        ...EMOJI_CATEGORIES.map((c) => ({
          id: c.id,
          label: t(CATEGORY_KEY[c.id]),
          emojis: c.emojis.map((e) => e.char),
        })),
      ];
  // Flat cell index of each section's first emoji, for the single roving tab stop.
  const sections: Section[] = groups.map((g, i) => ({
    ...g,
    offset: groups.slice(0, i).reduce((n, prev) => n + prev.emojis.length, 0),
  }));

  function changeOpen(next: boolean) {
    if (next) {
      // The recent row stays put while the picker is open, so focus never lands on a shifted cell.
      setRecent(readRecentEmoji());
      setQuery('');
      setActive(0);
      setBackToComposer(false);
    }
    setOpen(next);
  }

  const buttons = () =>
    Array.from(gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-emoji]') ?? []);

  function focusAt(index: number) {
    const target = buttons()[index];
    if (!target) return;
    setActive(index);
    target.focus();
    target.scrollIntoView({ block: 'nearest' });
  }

  function pick(char: string, keepOpen: boolean) {
    writeRecentEmoji(pushRecent(readRecentEmoji(), char));
    onPick(char, keepOpen);
    if (!keepOpen) {
      setBackToComposer(true);
      setOpen(false);
    }
  }

  function onCellKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    const target = e.currentTarget;
    if (GRID_KEYS.has(e.key)) {
      const list = buttons();
      const index = list.indexOf(target);
      if (index < 0) return;
      e.preventDefault();
      const next = moveInGrid(
        list.map((b) => ({ x: b.offsetLeft, y: b.offsetTop })),
        index,
        e.key as GridKey,
      );
      if (next === index && e.key === 'ArrowUp') searchRef.current?.focus();
      else focusAt(next);
    } else if (e.key === 'Enter' && e.shiftKey && target.dataset.emoji) {
      e.preventDefault();
      pick(target.dataset.emoji, true);
    }
  }

  function jumpTo(sectionId: string) {
    const section = document.getElementById(`${baseId}-${sectionId}`);
    const grid = gridRef.current;
    if (!section || !grid) return;
    grid.scrollTop = section.offsetTop;
    const first = section.querySelector<HTMLButtonElement>('[data-emoji]');
    if (first) {
      setActive(buttons().indexOf(first));
      first.focus({ preventScroll: true });
    }
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t('chat.emojiButton')}
          title={t('chat.emojiButton')}
          className="shrink-0 rounded-full text-muted-foreground hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground sm:size-10"
        >
          <Smile aria-hidden="true" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="end"
          sideOffset={10}
          collisionPadding={12}
          aria-label={t('chat.emojiPicker')}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            // Phones: no search focus, or the on-screen keyboard would cover the grid.
            if (window.matchMedia('(pointer: coarse)').matches) focusAt(0);
            else searchRef.current?.focus();
          }}
          onCloseAutoFocus={(e) => {
            // After a pick the composer puts the caret back into the textarea itself.
            if (backToComposer) e.preventDefault();
          }}
          className="z-50 flex w-[min(22rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <div className="border-b border-border p-2">
            <SearchInput
              ref={searchRef}
              value={query}
              onValueChange={(v) => {
                setQuery(v);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  focusAt(0);
                } else if (e.key === 'Enter' && results?.[0]) {
                  e.preventDefault();
                  pick(results[0], e.shiftKey);
                }
              }}
              placeholder={t('chat.emojiSearchPlaceholder')}
              label={t('chat.emojiSearch')}
              className="sm:h-9"
            />
          </div>
          <div
            ref={gridRef}
            className="relative max-h-64 overflow-y-auto overscroll-contain px-2 pb-2"
          >
            {results && results.length === 0 ? (
              <p role="status" className="px-2 py-8 text-center text-xs text-muted-foreground">
                {t('chat.emojiNoMatch')}
              </p>
            ) : (
              sections.map((section) => (
                <div
                  key={section.id}
                  id={`${baseId}-${section.id}`}
                  role="group"
                  aria-labelledby={`${baseId}-${section.id}-label`}
                >
                  <p
                    id={`${baseId}-${section.id}-label`}
                    className="sticky top-0 z-10 bg-popover px-1 pb-1 pt-2 text-2xs font-medium text-muted-foreground"
                  >
                    {section.label}
                  </p>
                  <div className="grid grid-cols-8 gap-0.5">
                    {section.emojis.map((char, i) => {
                      const index = section.offset + i;
                      return (
                        <button
                          key={`${section.id}:${char}`}
                          type="button"
                          data-emoji={char}
                          tabIndex={index === active ? 0 : -1}
                          onFocus={() => setActive(index)}
                          onKeyDown={onCellKeyDown}
                          onClick={(e) => pick(char, e.shiftKey)}
                          className="flex aspect-square min-w-0 items-center justify-center rounded-md text-lg leading-none transition-colors duration-fast hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {char}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
          {results ? null : (
            <nav
              aria-label={t('chat.emojiCategories')}
              className="flex justify-between border-t border-border px-1 py-0.5"
            >
              {sections.map((section) => {
                const Icon = ICON[section.id as keyof typeof ICON];
                return (
                  <Button
                    key={section.id}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => jumpTo(section.id)}
                    aria-label={section.label}
                    title={section.label}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Icon aria-hidden="true" />
                  </Button>
                );
              })}
            </nav>
          )}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
