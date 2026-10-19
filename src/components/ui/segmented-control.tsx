import { useRef, type KeyboardEvent, type ReactNode } from 'react';

import { CountPill } from '@/components/count-pill';
import { cn } from '@/lib/utils';

export interface SegmentedOption<V extends string> {
  value: V;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
  disabled?: boolean;
}

/** One-of-n choice (radiogroup, roving focus); use Tabs when there are panels to switch. */
export function SegmentedControl<V extends string>({
  value,
  onValueChange,
  options,
  label,
  size = 'default',
  overflow = 'wrap',
  className,
}: {
  value: V;
  onValueChange: (value: V) => void;
  options: SegmentedOption<V>[];
  label: string;
  size?: 'default' | 'sm';
  overflow?: 'wrap' | 'scroll';
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.filter((o) => !o.disabled);

  function move(event: KeyboardEvent, current: V) {
    const keys: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    let next: SegmentedOption<V> | undefined;
    if (event.key in keys) {
      const i = enabled.findIndex((o) => o.value === current);
      next = enabled[(i + keys[event.key] + enabled.length) % enabled.length];
    } else if (event.key === 'Home') next = enabled[0];
    else if (event.key === 'End') next = enabled[enabled.length - 1];
    if (!next) return;
    event.preventDefault();
    onValueChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'items-center gap-0.5 rounded-lg bg-muted p-0.5 text-muted-foreground ring-1 ring-inset ring-border/70',
        overflow === 'scroll'
          ? 'scroll-fade-x scrollbar-none flex max-w-full overflow-x-auto'
          : 'inline-flex max-w-full flex-wrap',
        className,
      )}
    >
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            disabled={option.disabled}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(e) => move(e, option.value)}
            className={cn(
              'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
              size === 'sm'
                ? 'h-8 px-2.5 text-xs sm:h-6 sm:px-2'
                : 'h-9 px-3 text-2sm sm:h-7 sm:px-2.5',
              selected && 'bg-card text-foreground shadow-sm',
            )}
          >
            {option.icon}
            {option.label}
            {option.count !== undefined ? (
              <CountPill tone={selected ? 'accent' : 'muted'}>{option.count}</CountPill>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
