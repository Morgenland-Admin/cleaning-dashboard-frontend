import { Badge } from '@/components/ui/badge';

type Tone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';

export function StatusBadge({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  const variant = TONE_TO_VARIANT[tone];
  return (
    <Badge variant={variant} aria-label={label} className={className}>
      <span aria-hidden="true">{label}</span>
    </Badge>
  );
}

const TONE_TO_VARIANT: Record<
  Tone,
  'default' | 'secondary' | 'destructive' | 'outline' | 'info' | 'warning' | 'success'
> = {
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'destructive',
  neutral: 'secondary',
};
