import { Info, Mail, Phone } from 'lucide-react';

import { ChatAvatar } from '@/components/chat-avatar';
import { Button } from '@/components/ui/button';
import { PartnerStatusBadge } from '@/components/verified-badge';
import { useLocale } from '@/i18n';
import { cn } from '@/lib/utils';

import type { Ref } from 'react';

export type SocketStatus = 'connecting' | 'open' | 'closed';

export function ChatThreadHeader({
  partnerName,
  partnerStatus,
  contact,
  wsStatus,
  partnerTyping,
  detailsOpen,
  detailsId,
  infoRef,
  onToggleDetails,
}: {
  partnerName: string;
  partnerStatus?: string;
  contact: { email: string | null; phone: string | null };
  wsStatus: SocketStatus;
  partnerTyping: boolean;
  detailsOpen: boolean;
  /** Set while the details column is in the DOM. */
  detailsId?: string;
  infoRef: Ref<HTMLButtonElement>;
  onToggleDetails: () => void;
}) {
  const { t } = useLocale();
  const statusText =
    wsStatus === 'open'
      ? t('chat.statusLive')
      : wsStatus === 'connecting'
        ? t('chat.statusConnecting')
        : t('chat.statusOffline');

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-card pl-3 pr-2 sm:pl-4">
      <ChatAvatar name={partnerName} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-sm font-semibold leading-5 text-foreground">
            {partnerName}
          </h2>
          {partnerStatus && partnerStatus !== 'active' ? (
            <PartnerStatusBadge status={partnerStatus} compact />
          ) : null}
        </div>
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span
            aria-hidden="true"
            className={cn(
              'size-1.5 shrink-0 rounded-full',
              wsStatus === 'open'
                ? 'bg-success'
                : wsStatus === 'connecting'
                  ? 'bg-warning'
                  : 'bg-border-strong',
            )}
          />
          <span className="truncate">
            {partnerTyping ? t('chat.partnerTyping', { partner: partnerName }) : statusText}
          </span>
        </p>
      </div>
      <div className="flex shrink-0 items-center">
        {contact.email ? (
          <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
            <a
              href={`mailto:${contact.email}`}
              aria-label={t('chat.emailPartner', { email: contact.email })}
              title={contact.email}
            >
              <Mail aria-hidden="true" />
            </a>
          </Button>
        ) : null}
        {contact.phone ? (
          <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
            <a
              href={`tel:${contact.phone}`}
              aria-label={t('chat.callPartner', { phone: contact.phone })}
              title={contact.phone}
            >
              <Phone aria-hidden="true" />
            </a>
          </Button>
        ) : null}
        <Button
          ref={infoRef}
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleDetails}
          aria-label={t('chat.details')}
          title={detailsOpen ? t('chat.hideDetails') : t('chat.showDetails')}
          aria-expanded={detailsOpen}
          aria-controls={detailsId}
          className={cn(
            'text-muted-foreground',
            detailsOpen && 'bg-accent text-foreground hover:bg-accent',
          )}
        >
          <Info aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
