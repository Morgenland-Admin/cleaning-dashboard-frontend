import * as PopoverPrimitive from '@radix-ui/react-popover';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { fieldBase } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useLocale, useT } from '@/i18n';
import { cn } from '@/lib/utils';

// Values use the native input formats ("YYYY-MM-DD", "YYYY-MM-DDTHH:mm") so forms keep their state shape.

interface Ymd {
  y: number;
  m: number; // 0-based
  d: number;
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = ({ y, m, d }: Ymd) => `${y}-${pad(m + 1)}-${pad(d)}`;

function parseDay(value: string | undefined): Ymd | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : fromDate(date);
}

function parseTime(value: string | undefined): string | null {
  const match = /T(\d{2}):(\d{2})/.exec(value ?? '');
  return match ? `${match[1]}:${match[2]}` : null;
}

const fromDate = (date: Date): Ymd => ({
  y: date.getFullYear(),
  m: date.getMonth(),
  d: date.getDate(),
});
const toDate = ({ y, m, d }: Ymd) => new Date(y, m, d, 12);
const addDays = (day: Ymd, n: number) => fromDate(new Date(day.y, day.m, day.d + n, 12));
const addMonths = (day: Ymd, n: number): Ymd => {
  const last = new Date(day.y, day.m + n + 1, 0).getDate();
  const first = new Date(day.y, day.m + n, 1);
  return { y: first.getFullYear(), m: first.getMonth(), d: Math.min(day.d, last) };
};
const today = () => fromDate(new Date());

/** Weeks start on Monday (German convention), six rows so the popover never changes height. */
function monthGrid(y: number, m: number): Ymd[] {
  const first = new Date(y, m, 1, 12);
  const offset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => fromDate(new Date(y, m, 1 - offset + i, 12)));
}

interface FieldProps {
  id?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  className?: string;
  /** Inclusive bounds as "YYYY-MM-DD". */
  min?: string;
  max?: string;
  clearable?: boolean;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

export function DatePicker({
  value,
  onValueChange,
  ...props
}: FieldProps & { value: string; onValueChange: (value: string) => void }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const [open, setOpen] = useState(false);
  const day = parseDay(value);
  const label = day
    ? toDate(day).toLocaleDateString(bcp47, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : null;

  return (
    <PickerShell
      {...props}
      open={open}
      onOpenChange={setOpen}
      label={label}
      placeholder={props.placeholder ?? t('datePicker.placeholder')}
      onClear={() => onValueChange('')}
    >
      <Calendar
        selected={day}
        min={props.min}
        max={props.max}
        onSelect={(next) => {
          onValueChange(keyOf(next));
          setOpen(false);
        }}
      />
      <Footer
        onToday={() => {
          onValueChange(keyOf(today()));
          setOpen(false);
        }}
        onClear={
          props.clearable === false
            ? undefined
            : () => {
                onValueChange('');
                setOpen(false);
              }
        }
      />
    </PickerShell>
  );
}

export function DateTimePicker({
  value,
  onValueChange,
  minuteStep = 15,
  defaultTime = '09:00',
  ...props
}: FieldProps & {
  value: string;
  onValueChange: (value: string) => void;
  minuteStep?: number;
  /** Used when a day is picked before a time. */
  defaultTime?: string;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const [open, setOpen] = useState(false);
  const day = parseDay(value);
  const time = parseTime(value);
  const label = day
    ? `${toDate(day).toLocaleDateString(bcp47, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })}, ${time ?? defaultTime}`
    : null;
  const emit = (nextDay: Ymd, nextTime: string) => onValueChange(`${keyOf(nextDay)}T${nextTime}`);

  return (
    <PickerShell
      {...props}
      open={open}
      onOpenChange={setOpen}
      label={label}
      placeholder={props.placeholder ?? t('datePicker.placeholderDateTime')}
      onClear={() => onValueChange('')}
    >
      <div className="flex gap-2">
        <Calendar
          selected={day}
          min={props.min}
          max={props.max}
          onSelect={(next) => emit(next, time ?? defaultTime)}
        />
        <TimeColumn
          value={time}
          step={minuteStep}
          fallback={defaultTime}
          onSelect={(next) => emit(day ?? today(), next)}
        />
      </div>
      <Footer
        onToday={() => emit(today(), time ?? defaultTime)}
        onClear={
          props.clearable === false
            ? undefined
            : () => {
                onValueChange('');
                setOpen(false);
              }
        }
        onDone={() => setOpen(false)}
      />
    </PickerShell>
  );
}

function PickerShell({
  open,
  onOpenChange,
  label,
  placeholder,
  onClear,
  clearable = true,
  disabled,
  required,
  id,
  className,
  children,
  min: _min,
  max: _max,
  ...aria
}: FieldProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string | null;
  placeholder: string;
  onClear: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const showClear = clearable && !!label && !disabled;
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <div className={cn('relative w-full', className)}>
        <PopoverPrimitive.Trigger
          id={id}
          type="button"
          disabled={disabled}
          aria-required={required || aria['aria-required'] || undefined}
          aria-haspopup="dialog"
          {...aria}
          className={cn(
            fieldBase,
            'group flex h-11 items-center gap-2 px-3 text-left data-[state=open]:border-ring data-[state=open]:ring-1 data-[state=open]:ring-ring sm:h-9',
            showClear && 'pr-9',
          )}
        >
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span
            className={cn(
              'min-w-0 flex-1 truncate tabular-nums',
              !label && 'text-muted-foreground',
            )}
          >
            {label ?? placeholder}
          </span>
        </PopoverPrimitive.Trigger>
        {showClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label={t('datePicker.clearValue')}
            className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-7"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          collisionPadding={12}
          aria-label={placeholder}
          // The calendar focuses the selected day itself.
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="z-50 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

function Calendar({
  selected,
  onSelect,
  min,
  max,
}: {
  selected: Ymd | null;
  onSelect: (day: Ymd) => void;
  min?: string;
  max?: string;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const minDay = parseDay(min);
  const maxDay = parseDay(max);
  const [focused, setFocused] = useState<Ymd>(() => selected ?? today());
  const gridRef = useRef<HTMLTableElement>(null);
  // Mounted when the popover opens: start on the selected day (or today).
  const moveFocus = useRef(true);

  const clamp = (day: Ymd): Ymd => {
    const k = keyOf(day);
    if (minDay && k < keyOf(minDay)) return minDay;
    if (maxDay && k > keyOf(maxDay)) return maxDay;
    return day;
  };
  const outOfRange = (day: Ymd) => {
    const k = keyOf(day);
    return (!!minDay && k < keyOf(minDay)) || (!!maxDay && k > keyOf(maxDay));
  };

  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${keyOf(focused)}"]`)?.focus();
  }, [focused]);

  const weekdays = useMemo(
    () =>
      // 1 Jan 2024 was a Monday.
      Array.from({ length: 7 }, (_, i) => {
        const date = new Date(2024, 0, 1 + i, 12);
        return {
          short: date.toLocaleDateString(bcp47, { weekday: 'short' }).replace(/\.$/, ''),
          long: date.toLocaleDateString(bcp47, { weekday: 'long' }),
        };
      }),
    [bcp47],
  );
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, m) => ({
        value: String(m),
        label: new Date(2024, m, 1, 12).toLocaleDateString(bcp47, { month: 'long' }),
      })),
    [bcp47],
  );
  const now = today();
  const fromYear = minDay?.y ?? now.y - 100;
  const toYear = maxDay?.y ?? now.y + 10;
  const years = Array.from({ length: toYear - fromYear + 1 }, (_, i) => {
    const y = String(toYear - i);
    return { value: y, label: y };
  });

  const go = (next: Ymd, focus = true) => {
    moveFocus.current = focus;
    setFocused(clamp(next));
  };

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    const weekday = (toDate(focused).getDay() + 6) % 7;
    const moves: Record<string, () => Ymd> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekday),
      End: () => addDays(focused, 6 - weekday),
      PageUp: () => addMonths(focused, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(focused, e.shiftKey ? 12 : 1),
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    go(move());
  }

  const selectedKey = selected ? keyOf(selected) : null;
  const todayKey = keyOf(now);
  const days = monthGrid(focused.y, focused.m);
  const monthLabel = toDate({ ...focused, d: 1 }).toLocaleDateString(bcp47, {
    month: 'long',
    year: 'numeric',
  });

  return (
    <div className="flex w-[15.75rem] flex-col gap-2">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('datePicker.previousMonth')}
          onClick={() => go(addMonths(focused, -1), false)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
          <span className="truncate text-2sm font-semibold" aria-live="polite">
            {months[focused.m]?.label}
          </span>
          <Select
            size="sm"
            value={String(focused.y)}
            onValueChange={(y) =>
              go({ ...focused, y: Number(y), d: Math.min(focused.d, 28) }, false)
            }
            options={years}
            aria-label={t('datePicker.year')}
            className="w-[5.5rem] shrink-0 px-2"
            contentClassName="min-w-[6rem]"
          />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t('datePicker.nextMonth')}
          onClick={() => go(addMonths(focused, 1), false)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      <table ref={gridRef} role="grid" aria-label={monthLabel} className="w-full border-collapse">
        <thead>
          <tr>
            {weekdays.map((w) => (
              <th
                key={w.long}
                scope="col"
                abbr={w.long}
                className="h-7 text-center text-2xs font-medium text-muted-foreground"
              >
                {w.short}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }, (_, row) => (
            <tr key={row}>
              {days.slice(row * 7, row * 7 + 7).map((day) => {
                const k = keyOf(day);
                const inMonth = day.m === focused.m;
                const isSelected = k === selectedKey;
                const isToday = k === todayKey;
                const disabled = outOfRange(day);
                return (
                  <td
                    key={k}
                    role="gridcell"
                    aria-selected={isSelected}
                    className="p-0 text-center"
                  >
                    <button
                      type="button"
                      data-day={k}
                      tabIndex={k === keyOf(focused) ? 0 : -1}
                      disabled={disabled}
                      aria-label={toDate(day).toLocaleDateString(bcp47, { dateStyle: 'full' })}
                      aria-current={isToday ? 'date' : undefined}
                      onClick={() => onSelect(day)}
                      onKeyDown={onKeyDown}
                      onFocus={() => {
                        if (k !== keyOf(focused)) setFocused(day);
                      }}
                      className={cn(
                        'relative mx-auto grid size-9 place-items-center rounded-md text-2sm tabular-nums transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40',
                        isSelected
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : 'hover:bg-accent',
                        !isSelected && !inMonth && 'text-muted-foreground',
                        !isSelected && isToday && 'font-semibold text-primary',
                      )}
                    >
                      {day.d}
                      {isToday && !isSelected ? (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-highlight"
                        />
                      ) : null}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TimeColumn({
  value,
  step,
  fallback,
  onSelect,
}: {
  value: string | null;
  step: number;
  fallback: string;
  onSelect: (time: string) => void;
}) {
  const t = useT();
  const listRef = useRef<HTMLDivElement>(null);
  const times = useMemo(() => {
    const list = Array.from({ length: Math.floor((24 * 60) / step) }, (_, i) => {
      const minutes = i * step;
      return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    });
    // A stored off-step time (e.g. 08:07) must still be visible and selected.
    if (value && !list.includes(value)) list.push(value);
    return list.sort();
  }, [step, value]);

  useEffect(() => {
    const target = listRef.current?.querySelector<HTMLElement>(
      `[data-time="${value ?? fallback}"]`,
    );
    if (target && listRef.current) {
      listRef.current.scrollTop =
        target.offsetTop - listRef.current.clientHeight / 2 + target.offsetHeight / 2;
    }
    // Only on mount: scrolling while the author picks would move the list under the pointer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex w-16 flex-col gap-2">
      <p className="flex h-8 items-center justify-center text-xs font-medium text-muted-foreground sm:h-8">
        {t('datePicker.time')}
      </p>
      <div
        ref={listRef}
        role="group"
        aria-label={t('datePicker.time')}
        className="scrollbar-none flex h-[16.5rem] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-md border border-border p-0.5"
      >
        {times.map((time) => {
          const selected = time === value;
          return (
            <button
              key={time}
              type="button"
              data-time={time}
              aria-pressed={selected}
              onClick={() => onSelect(time)}
              className={cn(
                'shrink-0 rounded-sm py-1.5 text-center text-2sm tabular-nums transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                selected ? 'bg-primary font-semibold text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {time}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Footer({
  onToday,
  onClear,
  onDone,
}: {
  onToday: () => void;
  onClear?: () => void;
  onDone?: () => void;
}) {
  const t = useT();
  return (
    <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
      <Button type="button" variant="ghost" size="xs" onClick={onToday}>
        {t('datePicker.today')}
      </Button>
      {onClear ? (
        <Button type="button" variant="ghost" size="xs" onClick={onClear}>
          {t('datePicker.clear')}
        </Button>
      ) : null}
      {onDone ? (
        <Button type="button" size="xs" className="ml-auto" onClick={onDone}>
          {t('datePicker.done')}
        </Button>
      ) : null}
    </div>
  );
}
