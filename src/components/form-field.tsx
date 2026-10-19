import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

/** Injects id and aria-invalid/describedby into its single child control. */
export function FormField({
  label,
  hint,
  error,
  required,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const t = useT();
  const autoId = useId();
  const id = htmlFor ?? `field-${autoId}`;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const enhancedChild = (() => {
    const onlyChild = Children.only(children);
    if (!isValidElement(onlyChild)) return onlyChild;
    type ControlProps = {
      id?: string;
      required?: boolean;
      'aria-required'?: boolean;
      'aria-invalid'?: boolean;
      'aria-describedby'?: string;
    };
    const el = onlyChild as ReactElement<ControlProps>;
    return cloneElement(el, {
      id: el.props.id ?? id,
      required: el.props.required ?? required,
      'aria-required': required || undefined,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': describedBy,
    });
  })();

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-0.5 text-destructive">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> ({t('common.required')})</span> : null}
      </Label>
      {enhancedChild}
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
