import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** `as="fieldset"` is named by its heading (`aria-labelledby`); a nested <legend> would only count as the first child. */
export function SectionCard({
  title,
  description,
  actions,
  icon,
  footer,
  children,
  as = 'section',
  bodyClassName,
  className,
  headingLevel = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  as?: 'section' | 'fieldset' | 'div';
  bodyClassName?: string;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  const Root = as;
  const headingId = useId();
  return (
    <Root
      aria-labelledby={as === 'fieldset' ? headingId : undefined}
      className={cn('min-w-0 rounded-lg border bg-card text-card-foreground', className)}
    >
      <div className="flex items-start gap-3 border-b border-border px-4 py-3 sm:px-5">
        {icon ? (
          <span
            className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary [&_svg]:size-4"
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <Heading id={headingId} className="text-sm font-semibold leading-5 text-foreground">
            {title}
          </Heading>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className={cn('p-4 sm:p-5', bodyClassName)}>{children}</div> : null}
      {footer ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3 sm:px-5">
          {footer}
        </div>
      ) : null}
    </Root>
  );
}

export function SectionHeading({
  children,
  description,
  actions,
  id,
  className,
}: {
  children: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  id?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold leading-6 text-foreground">
          {children}
        </h2>
        {description ? <p className="text-2sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function SectionLabel({
  children,
  icon,
  className,
  as: As = 'h3',
}: {
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
  as?: 'h3' | 'h4' | 'p' | 'span';
}) {
  return (
    <As
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0',
        className,
      )}
    >
      {icon}
      {children}
    </As>
  );
}
