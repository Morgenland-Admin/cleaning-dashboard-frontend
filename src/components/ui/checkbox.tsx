import * as React from 'react';

import { cn } from '@/lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Visual tone — defaults to rust for branded affirmatives. */
  tone?: 'rust' | 'primary';
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, disabled, tone = 'rust', onChange, ...props }, ref) => {
    const checkedBg =
      tone === 'primary' ? 'border-foreground bg-foreground' : 'border-rust bg-rust';

    return (
      <span
        className={cn(
          'relative inline-grid size-4 shrink-0 cursor-pointer place-items-center rounded-[5px] border bg-card shadow-sm transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background',
          checked ? checkedBg : 'border-input',
          disabled && 'cursor-not-allowed opacity-50',
          className,
        )}
      >
        {/*
          The visual box stays 16px, but the input is inflated past it so the hit
          area is 24px square — the WCAG 2.5.8 target size, and far easier to tap.
          The inset resolves against the padding box (14px inside the 1px border),
          so 5px a side is what gets to 24, not 4.
        */}
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
            'pointer-events-none size-3 text-white transition-opacity duration-150',
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
