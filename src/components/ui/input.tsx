import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Shared chrome for Input, Textarea and Select. `text-base` below `sm` because iOS Safari
 * zooms focused fields under 16px; `aria-invalid` paints the error state.
 */
export const fieldBase =
  'w-full rounded-md border border-input bg-card text-base text-foreground shadow-xs transition-colors placeholder:text-muted-foreground hover:border-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 disabled:hover:border-input aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive sm:text-sm';

// Native pickers follow `color-scheme`; these trim the browser chrome that does not match the fields.
const typeClasses: Partial<Record<string, string>> = {
  number:
    '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none',
  search: '[&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden',
  date: 'pr-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-date-and-time-value]:text-left',
  'datetime-local':
    'pr-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 hover:[&::-webkit-calendar-picker-indicator]:opacity-100 [&::-webkit-date-and-time-value]:text-left',
  time: 'pr-2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-date-and-time-value]:text-left',
};

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          fieldBase,
          'flex h-11 px-3 py-1 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground sm:h-9',
          type ? typeClasses[type] : undefined,
          props.readOnly && 'bg-muted/50 hover:border-input',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
