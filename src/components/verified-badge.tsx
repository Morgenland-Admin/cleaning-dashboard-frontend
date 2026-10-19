import { ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useT } from '@/i18n';
import { partnerStatusHint, partnerStatusLabel, partnerStatusTone } from '@/lib/partners';
import { cn } from '@/lib/utils';

/** Partner verification: profile, services, location, required documents and contract. */
export function VerifiedBadge({ verified, className }: { verified: boolean; className?: string }) {
  const t = useT();
  return verified ? (
    <Badge variant="success" className={className}>
      <ShieldCheck aria-hidden="true" />
      {t('partners.verified')}
    </Badge>
  ) : (
    <Badge variant="secondary" className={className}>
      {t('partners.notVerified')}
    </Badge>
  );
}

const TONE_VARIANT = {
  info: 'info',
  warning: 'warning',
  success: 'success',
  danger: 'destructive',
  neutral: 'secondary',
} as const;

/** Partner status with what it means for dispatch on hover; `compact` fits list rows. */
export function PartnerStatusBadge({
  status,
  compact,
  className,
}: {
  status: string;
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  const label = partnerStatusLabel(t, status);
  const hint = partnerStatusHint(t, status);
  const badge = (
    <Badge
      variant={TONE_VARIANT[partnerStatusTone(status)]}
      className={cn(compact && 'px-1 py-0 text-2xs leading-4', className)}
    >
      {label}
    </Badge>
  );
  if (!hint) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}
