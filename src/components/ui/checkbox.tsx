import * as React from 'react';

import { cn } from '@/lib/utils';

export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, disabled, onChange, ...props }, ref) => {
    return (
      <span
        className={cn(
          'relative inline-grid size-4 shrink-0 cursor-pointer place-items-center rounded-sm border bg-card shadow-xs transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background',
          checked ? 'border-transparent bg-primary' : 'border-input hover:border-muted-foreground',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        {/* The input is inflated to a 24px hit area (WCAG 2.5.8): 5px a side, because the inset
            resolves against the 14px padding box. */}
        <input
          ref={ref}
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={onChange}
          className="peer absolute -inset-[5px] m-0 cursor-pointer appearance-none rounded-[7px] opacity-0 disabled:cursor-not-allowed"
          {...props}
        />
        <svg
          viewBox="0 0 16 16"
          aria-hidden="true"
          className={cn(
            'pointer-events-none size-3 text-primary-foreground transition-opacity duration-fast',
            checked ? 'opacity-100' : 'opacity-0',
          )}
        >
          <path
            d="M3.5 8.5 L6.5 11.5 L12.5 5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  },
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
