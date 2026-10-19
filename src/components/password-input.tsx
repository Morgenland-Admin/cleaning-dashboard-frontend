import { Eye, EyeOff, Lock } from 'lucide-react';
import { forwardRef, useState, type InputHTMLAttributes } from 'react';

import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Pass `visible` + `onVisibleChange` to share one toggle between a password and its confirmation. */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    visible?: boolean;
    onVisibleChange?: (visible: boolean) => void;
    showIcon?: boolean;
  }
>(function PasswordInput({ visible, onVisibleChange, showIcon = true, className, ...props }, ref) {
  const t = useT();
  const [ownVisible, setOwnVisible] = useState(false);
  const shown = visible ?? ownVisible;
  const toggle = () => (onVisibleChange ? onVisibleChange(!shown) : setOwnVisible(!shown));
  return (
    <div className="relative">
      {showIcon ? (
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
      <Input
        ref={ref}
        type={shown ? 'text' : 'password'}
        className={cn(showIcon && 'pl-9', 'pr-11 sm:pr-10', className)}
        {...props}
      />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={shown}
        aria-label={shown ? t('common.hidePassword') : t('common.showPassword')}
        className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:size-7"
      >
        {shown ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
});
