import { Badge } from '@/components/ui/badge';

type Tone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';

/** The label is the accessible text (a name on a plain <span> is ignored by screen readers). */
export function StatusBadge({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Badge variant={TONE_TO_VARIANT[tone] ?? 'secondary'} className={className}>
      {label}
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
