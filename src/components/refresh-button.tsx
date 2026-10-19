import { RefreshCcw } from 'lucide-react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';

export function RefreshButton({
  onClick,
  fetching,
  iconOnly,
  size = 'sm',
  className,
  ...props
}: Omit<ButtonProps, 'children' | 'loading'> & { fetching?: boolean; iconOnly?: boolean }) {
  const t = useT();
  const label = t('common.refresh');
  return (
    <Button
      type="button"
      variant="outline"
      size={iconOnly ? 'icon-sm' : size}
      onClick={onClick}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      aria-busy={fetching || undefined}
      className={cn(className)}
      {...props}
    >
      <RefreshCcw className={cn(fetching && 'animate-spin')} aria-hidden="true" />
      {iconOnly ? null : label}
    </Button>
  );
}
