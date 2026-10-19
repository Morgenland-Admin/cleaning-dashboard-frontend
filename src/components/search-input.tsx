import { Loader2, Search, X } from 'lucide-react';
import { forwardRef, type InputHTMLAttributes } from 'react';

import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export const SearchInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> & {
    value: string;
    onValueChange: (value: string) => void;
    searching?: boolean;
    label?: string;
    containerClassName?: string;
  }
>(function SearchInput(
  { value, onValueChange, searching, label, placeholder, containerClassName, className, ...props },
  ref,
) {
  const t = useT();
  return (
    <div className={cn('relative w-full', containerClassName)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label ?? placeholder ?? t('common.search')}
        className={cn('pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none', className)}
        {...props}
      />
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">
        {searching ? (
          <Loader2
            className="mr-2 size-4 animate-spin text-muted-foreground"
            aria-label={t('common.loading')}
          />
        ) : value ? (
          <button
            type="button"
            onClick={() => onValueChange('')}
            aria-label={t('common.clearSearch')}
            className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-7"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
});
