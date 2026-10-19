import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

import { fieldBase } from '@/components/ui/input';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  value: T;
  /** Shown in the trigger and matched by search. */
  label: string;
  /** Rich rendering for the list and trigger; `label` stays the accessible name. */
  content?: ReactNode;
  description?: string;
  /** Right-aligned secondary value, e.g. a price. */
  meta?: string;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectOptionGroup<T extends string = string> {
  label: string;
  options: SelectOption<T>[];
}

export type SelectOptions<T extends string = string> = Array<
  SelectOption<T> | SelectOptionGroup<T>
>;

interface SelectBaseProps<T extends string> {
  value: T | '';
  onValueChange: (value: T) => void;
  options: SelectOptions<T>;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  size?: 'default' | 'sm';
  /** Popover width follows the trigger; set for short triggers with long options. */
  contentClassName?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
  required?: boolean;
}

export interface SelectProps<T extends string> extends SelectBaseProps<T> {
  /** Adds a search field; on by default above SEARCH_THRESHOLD options. */
  searchable?: boolean;
  searchPlaceholder?: string;
}

const SEARCH_THRESHOLD = 12;
// Radix reserves "" for "no value", so an explicit empty option travels under this key.
const EMPTY = '__empty__';

function isGroup<T extends string>(
  o: SelectOption<T> | SelectOptionGroup<T>,
): o is SelectOptionGroup<T> {
  return 'options' in o;
}

function flatten<T extends string>(options: SelectOptions<T>): SelectOption<T>[] {
  return options.flatMap((o) => (isGroup(o) ? o.options : [o]));
}

const triggerClass = (size: 'default' | 'sm') =>
  cn(
    fieldBase,
    'group flex items-center justify-between gap-2 px-3 text-left hover:border-muted-foreground disabled:hover:border-input data-[state=open]:border-ring data-[state=open]:ring-1 data-[state=open]:ring-ring',
    size === 'sm' ? 'h-9 text-2sm sm:h-8' : 'h-11 sm:h-9',
  );

const contentClass =
  'z-50 overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1';

const itemClass =
  'relative flex w-full cursor-pointer select-none items-center gap-2.5 rounded-md py-2.5 pl-2.5 pr-8 text-sm outline-none transition-colors data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[disabled]:opacity-50 sm:py-1.5 sm:text-2sm [&_svg]:size-4 [&_svg]:shrink-0';

const groupLabelClass = 'px-2.5 pb-1 pt-2.5 text-xs font-medium text-muted-foreground';

function TriggerValue<T extends string>({
  option,
  placeholder,
}: {
  option: SelectOption<T> | undefined;
  placeholder: string;
}) {
  if (!option) return <span className="truncate text-muted-foreground">{placeholder}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      {option.icon ? <span className="shrink-0 [&_svg]:size-4">{option.icon}</span> : null}
      <span className="truncate">{option.content ?? option.label}</span>
    </span>
  );
}

function OptionBody<T extends string>({
  option,
  wrapLabel = (node) => node,
}: {
  option: SelectOption<T>;
  wrapLabel?: (node: ReactNode) => ReactNode;
}) {
  return (
    <>
      {option.icon ? <span className="shrink-0">{option.icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{wrapLabel(option.content ?? option.label)}</span>
        {option.description ? (
          <span className="block truncate text-xs text-muted-foreground">{option.description}</span>
        ) : null}
      </span>
      {option.meta ? (
        <span className="shrink-0 pl-2 text-xs tabular-nums text-muted-foreground">
          {option.meta}
        </span>
      ) : null}
    </>
  );
}

/** Form select. Short lists open a listbox with typeahead; long ones get a search field. */
export function Select<T extends string>({
  searchable,
  searchPlaceholder,
  ...props
}: SelectProps<T>) {
  const count = useMemo(() => flatten(props.options).length, [props.options]);
  if (searchable ?? count > SEARCH_THRESHOLD) {
    return <Combobox {...props} searchPlaceholder={searchPlaceholder} />;
  }
  return <ListSelect {...props} />;
}

function ListSelect<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  disabled,
  id,
  className,
  size = 'default',
  contentClassName,
  required,
  ...aria
}: SelectBaseProps<T>) {
  const t = useT();
  const flat = flatten(options);
  const selected = flat.find((o) => o.value === value);
  const hasEmpty = flat.some((o) => o.value === '');
  const toKey = (v: string) => (v === '' ? EMPTY : v);

  const renderItem = (o: SelectOption<T>) => (
    <SelectPrimitive.Item
      key={o.value || EMPTY}
      value={toKey(o.value)}
      textValue={o.label}
      disabled={o.disabled}
      className={itemClass}
    >
      {/* ItemText also feeds Radix's hidden native <select>; without it the value resets on change. */}
      <OptionBody
        option={o}
        wrapLabel={(node) => <SelectPrimitive.ItemText>{node}</SelectPrimitive.ItemText>}
      />
      <SelectPrimitive.ItemIndicator className="absolute right-2.5 inline-flex text-primary">
        <Check aria-hidden="true" />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );

  return (
    <SelectPrimitive.Root
      value={value === '' ? (hasEmpty ? EMPTY : '') : value}
      onValueChange={(v) => {
        if (v === '') return;
        onValueChange((v === EMPTY ? '' : v) as T);
      }}
      disabled={disabled}
      required={required}
    >
      <SelectPrimitive.Trigger id={id} className={cn(triggerClass(size), className)} {...aria}>
        <TriggerValue option={selected} placeholder={placeholder ?? t('common.choose')} />
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-fast group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          collisionPadding={12}
          className={cn(
            contentClass,
            'max-h-[min(22rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] max-w-[min(32rem,calc(100vw-1.5rem))]',
            contentClassName,
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o, i) =>
              isGroup(o) ? (
                <SelectPrimitive.Group key={`g${i}`}>
                  <SelectPrimitive.Label className={groupLabelClass}>
                    {o.label}
                  </SelectPrimitive.Label>
                  {o.options.map(renderItem)}
                </SelectPrimitive.Group>
              ) : (
                renderItem(o)
              ),
            )}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * Searchable select. With a `value` that is never set (e.g. "add from catalogue") it works as a
 * picker that always shows the placeholder.
 */
export function Combobox<T extends string>({
  value,
  onValueChange,
  options,
  placeholder,
  searchPlaceholder,
  disabled,
  id,
  className,
  size = 'default',
  contentClassName,
  required,
  triggerIcon,
  emptyText,
  ...aria
}: SelectBaseProps<T> & {
  searchPlaceholder?: string;
  /** Leading icon in the trigger, e.g. a plus for pickers that add something. */
  triggerIcon?: ReactNode;
  emptyText?: string;
}) {
  const t = useT();
  const uid = useId();
  const listId = `${uid}-list`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const flat = flatten(options);
  const selected = flat.find((o) => o.value === value);

  const groups = useMemo(() => {
    const terms = normalize(query).split(/\s+/).filter(Boolean);
    const matches = (o: SelectOption<T>, groupLabel: string) =>
      terms.every((term) =>
        normalize(`${o.label} ${o.description ?? ''} ${o.meta ?? ''} ${groupLabel}`).includes(term),
      );
    const out: { label: string | null; options: SelectOption<T>[] }[] = [];
    for (const o of options) {
      if (isGroup(o)) {
        const hits = o.options.filter((x) => matches(x, o.label));
        if (hits.length) out.push({ label: o.label, options: hits });
      } else if (matches(o, '')) {
        const last = out[out.length - 1];
        if (last && last.label === null) last.options.push(o);
        else out.push({ label: null, options: [o] });
      }
    }
    return out;
  }, [options, query]);
  const visible = groups.flatMap((g) => g.options);

  // Scrolls the list only; scrollIntoView would also move the page while the popover is positioning.
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !el) return;
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight)
      list.scrollTop = bottom - list.clientHeight;
  }, [active, open]);

  function choose(o: SelectOption<T> | undefined) {
    if (!o || o.disabled) return;
    onValueChange(o.value);
    setOpen(false);
  }

  function move(delta: number) {
    if (!visible.length) return;
    let next = active;
    for (let i = 0; i < visible.length; i++) {
      next = (next + delta + visible.length) % visible.length;
      if (!visible[next]!.disabled) break;
    }
    setActive(next);
  }

  function openWith(seed: string) {
    setQuery(seed);
    const start = seed ? -1 : flat.findIndex((o) => o.value === value);
    setActive(Math.max(0, start));
    setOpen(true);
  }

  let index = -1;
  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) openWith('');
        else {
          setOpen(false);
          setQuery('');
        }
      }}
    >
      <PopoverPrimitive.Trigger
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-required={aria['aria-required'] ?? (required || undefined)}
        onKeyDown={(e) => {
          if (open) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            openWith('');
          } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== ' ') {
            e.preventDefault();
            openWith(e.key);
          }
        }}
        className={cn(triggerClass(size), className)}
        {...aria}
      >
        <span className="flex min-w-0 items-center gap-2">
          {triggerIcon ? (
            <span className="shrink-0 text-muted-foreground [&_svg]:size-4">{triggerIcon}</span>
          ) : null}
          <TriggerValue option={selected} placeholder={placeholder ?? t('common.choose')} />
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-fast group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={12}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus({ preventScroll: true });
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            triggerRef.current?.focus({ preventScroll: true });
          }}
          className={cn(
            contentClass,
            'flex max-h-[min(26rem,var(--radix-popover-content-available-height))] w-[max(var(--radix-popover-trigger-width),18rem)] max-w-[calc(100vw-1.5rem)] flex-col',
            contentClassName,
          )}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={visible[active] ? `${uid}-o${active}` : undefined}
              aria-label={searchPlaceholder ?? t('common.searchOptions')}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  move(1);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  move(-1);
                } else if (e.key === 'Home' && query === '') {
                  e.preventDefault();
                  setActive(0);
                } else if (e.key === 'End' && query === '') {
                  e.preventDefault();
                  setActive(Math.max(0, visible.length - 1));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  choose(visible[active]);
                }
              }}
              placeholder={searchPlaceholder ?? t('common.searchOptions')}
              autoComplete="off"
              spellCheck={false}
              className="h-11 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:h-10 sm:text-sm"
            />
          </div>
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={aria['aria-label'] ?? placeholder}
            className="relative min-h-0 flex-1 overflow-y-auto p-1"
          >
            {visible.length === 0 ? (
              <p className="px-2.5 py-6 text-center text-2sm text-muted-foreground">
                {emptyText ?? t('common.noMatches')}
              </p>
            ) : (
              groups.map((g, gi) => (
                <div
                  key={g.label ?? `u${gi}`}
                  role="group"
                  aria-labelledby={g.label ? `${uid}-g${gi}` : undefined}
                >
                  {g.label ? (
                    <div id={`${uid}-g${gi}`} className={groupLabelClass}>
                      {g.label}
                    </div>
                  ) : null}
                  {g.options.map((o) => {
                    index += 1;
                    const i = index;
                    const isSelected = o.value === value && value !== '';
                    return (
                      // Keyboard lives on the search field (aria-activedescendant), as the ARIA combobox pattern prescribes.
                      // eslint-disable-next-line jsx-a11y/click-events-have-key-events
                      <div
                        key={o.value || EMPTY}
                        id={`${uid}-o${i}`}
                        role="option"
                        tabIndex={-1}
                        data-index={i}
                        aria-selected={isSelected}
                        aria-disabled={o.disabled || undefined}
                        data-highlighted={i === active ? '' : undefined}
                        data-disabled={o.disabled ? '' : undefined}
                        onPointerMove={() => i !== active && setActive(i)}
                        // Keep focus in the search field.
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => choose(o)}
                        className={cn(itemClass, isSelected && 'font-medium')}
                      >
                        <OptionBody option={o} />
                        {isSelected ? (
                          <Check className="absolute right-2.5 text-primary" aria-hidden="true" />
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
