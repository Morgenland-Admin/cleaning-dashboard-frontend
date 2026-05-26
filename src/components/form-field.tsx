import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Label } from '@/components/ui/label';

/** Form control wrapper that injects id + aria-invalid/describedby into its single child. */
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
    <div className={'space-y-1.5' + (className ? ` ${className}` : '')}>
      <Label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-primary">
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (erforderlich)</span> : null}
      </Label>
      {enhancedChild}
      {hint ? (
        <p id={hintId} className="text-[11px] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
