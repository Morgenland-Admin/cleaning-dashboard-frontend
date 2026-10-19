import { ExternalLink, Link2, Mail, Phone, X } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode, type Ref } from 'react';
import { Link } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { ChatFileLink, ChatImageGrid } from '@/components/chat-attachments';
import { ChatAvatar } from '@/components/chat-avatar';
import { CountPill } from '@/components/count-pill';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet';
import { PartnerStatusBadge } from '@/components/verified-badge';
import { useLocale } from '@/i18n';
import { formatBytes, sharedItems, type ThreadMessage } from '@/lib/chat';
import { partnerHref } from '@/lib/partners';
import { formatDateTime, safeHttpUrl } from '@/lib/utils';

import type { CompanySlug, Project } from '@/contexts/project-context';
import type { ChatConversation } from '@/lib/api';

const PHOTOS_SHOWN = 6;
const FILES_SHOWN = 4;
const LINKS_SHOWN = 5;

export type ChatDetailsProps = {
  companySlug: CompanySlug;
  conversation: ChatConversation;
  partnerName: string;
  contact: { email: string | null; phone: string | null };
  /** Set when the list mixes brands. */
  brand?: Project | null;
  messages: ThreadMessage[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

/** Third column from `xl`. */
export function ChatDetailsColumn({
  id,
  headingRef,
  onClose,
  ...props
}: ChatDetailsProps & {
  id: string;
  headingRef: Ref<HTMLHeadingElement>;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const headingId = useId();
  return (
    <aside
      id={id}
      aria-labelledby={headingId}
      className="flex w-72 shrink-0 flex-col border-l border-border bg-card 2xl:w-80"
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border pl-4 pr-2">
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="rounded-sm text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('chat.details')}
        </h2>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={t('chat.hideDetails')}
          title={t('chat.hideDetails')}
          className="text-muted-foreground hover:text-foreground"
        >
          <X aria-hidden="true" />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ChatDetailsBody {...props} />
      </div>
    </aside>
  );
}

/** Below `xl` the same panel slides in from the right. */
export function ChatDetailsSheet({
  open,
  onOpenChange,
  ...props
}: ChatDetailsProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useLocale();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        variant="content"
        aria-describedby={undefined}
        className="gap-0 p-0 sm:max-w-sm"
      >
        <SheetTitle>{t('chat.detailsFor', { partner: props.partnerName })}</SheetTitle>
        <div
          aria-hidden="true"
          className="flex h-14 shrink-0 items-center border-b border-border pl-4 pr-12 text-sm font-semibold text-foreground"
        >
          {t('chat.details')}
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          <ChatDetailsBody {...props} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ChatDetailsBody({
  companySlug,
  conversation,
  partnerName,
  contact,
  brand,
  messages,
  hasMore,
  loadingMore,
  onLoadMore,
}: ChatDetailsProps) {
  const { t, bcp47 } = useLocale();
  const shared = useMemo(() => sharedItems(messages), [messages]);
  const [allPhotos, setAllPhotos] = useState(false);
  const [allFiles, setAllFiles] = useState(false);
  const [allLinks, setAllLinks] = useState(false);
  const day = (iso: string) => formatDateTime(iso, bcp47, { dateStyle: 'medium' });
  const person =
    conversation.partnerName && conversation.partnerName !== partnerName
      ? conversation.partnerName
      : null;

  return (
    <div className="space-y-6 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <ChatAvatar name={partnerName} size="lg" />
        <div className="min-w-0 max-w-full">
          <p className="text-sm font-semibold text-foreground [overflow-wrap:anywhere]">
            {partnerName}
          </p>
          {person ? <p className="text-xs text-muted-foreground">{person}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          <PartnerStatusBadge status={conversation.partnerStatus} />
          {brand ? <BrandChip brand={brand} /> : null}
        </div>
        <Button asChild variant="outline" size="sm" className="mt-1">
          <Link to={partnerHref(companySlug, conversation.partnerId)}>
            <ExternalLink aria-hidden="true" />
            {t('chat.openPartner')}
          </Link>
        </Button>
      </div>

      <DetailsSection title={t('chat.contact')}>
        {contact.email || contact.phone ? (
          <ul className="-mx-2 space-y-0.5">
            {contact.email ? (
              <li>
                <a href={`mailto:${contact.email}`} className={ROW}>
                  <Mail aria-hidden="true" />
                  <span className="min-w-0 truncate">{contact.email}</span>
                </a>
              </li>
            ) : null}
            {contact.phone ? (
              <li>
                <a href={`tel:${contact.phone}`} className={ROW}>
                  <Phone aria-hidden="true" />
                  <span className="min-w-0 truncate tabular-nums">{contact.phone}</span>
                </a>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t('chat.noContact')}</p>
        )}
      </DetailsSection>

      <DetailsSection title={t('chat.conversation')}>
        <KeyValueList className="text-xs">
          {brand ? <KeyValue label={t('chat.brandLabel')} value={brand.name} /> : null}
          <KeyValue
            label={t('chat.startedAt')}
            value={conversation.createdAt ? day(conversation.createdAt) : null}
            empty="—"
          />
          <KeyValue
            label={t('chat.lastMessage')}
            value={
              conversation.lastMessageAt ? formatDateTime(conversation.lastMessageAt, bcp47) : null
            }
            empty="—"
          />
        </KeyValueList>
      </DetailsSection>

      <DetailsSection title={t('chat.sharedPhotos')} count={shared.images.length}>
        {shared.images.length ? (
          <>
            <ChatImageGrid
              companySlug={companySlug}
              images={shared.images.map((i) => i.attachment)}
              limit={allPhotos ? undefined : PHOTOS_SHOWN}
              className="grid-cols-3 gap-1.5"
              tileClassName="aspect-square rounded-lg"
            />
            <ShowAll
              total={shared.images.length}
              limit={PHOTOS_SHOWN}
              expanded={allPhotos}
              onToggle={() => setAllPhotos((v) => !v)}
            />
          </>
        ) : (
          <Empty>{t('chat.noSharedPhotos')}</Empty>
        )}
      </DetailsSection>

      <DetailsSection title={t('chat.sharedFiles')} count={shared.files.length}>
        {shared.files.length ? (
          <>
            <ul className="space-y-1">
              {(allFiles ? shared.files : shared.files.slice(0, FILES_SHOWN)).map((f) => (
                <li key={f.attachment.key}>
                  <ChatFileLink
                    companySlug={companySlug}
                    file={f.attachment}
                    meta={[
                      f.attachment.size > 0 ? formatBytes(f.attachment.size, bcp47) : null,
                      day(f.at),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  />
                </li>
              ))}
            </ul>
            <ShowAll
              total={shared.files.length}
              limit={FILES_SHOWN}
              expanded={allFiles}
              onToggle={() => setAllFiles((v) => !v)}
            />
          </>
        ) : (
          <Empty>{t('chat.noSharedFiles')}</Empty>
        )}
      </DetailsSection>

      <DetailsSection title={t('chat.sharedLinks')} count={shared.links.length}>
        {shared.links.length ? (
          <>
            <ul className="-mx-2 space-y-0.5">
              {(allLinks ? shared.links : shared.links.slice(0, LINKS_SHOWN)).map((l) => {
                const href = safeHttpUrl(l.href);
                if (!href) return null;
                const path = l.href.replace(/^https?:\/\/[^/]+/, '');
                return (
                  <li key={l.href}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={t('chat.openLink', { host: l.host })}
                      title={l.href}
                      className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors duration-fast hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                      >
                        <Link2 className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-medium text-foreground">
                          {l.host}
                        </span>
                        <span className="block truncate text-2xs text-muted-foreground">
                          {day(l.at)}
                          {path && path !== '/' ? ` · ${path}` : ''}
                        </span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
            <ShowAll
              total={shared.links.length}
              limit={LINKS_SHOWN}
              expanded={allLinks}
              onToggle={() => setAllLinks((v) => !v)}
            />
          </>
        ) : (
          <Empty>{t('chat.noSharedLinks')}</Empty>
        )}
      </DetailsSection>

      <div className="flex flex-col items-start gap-1.5 border-t border-border pt-3 text-2xs text-muted-foreground">
        <p>{hasMore ? t('chat.fromLoaded') : t('chat.fromAll')}</p>
        {hasMore ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onLoadMore}
            loading={loadingMore}
          >
            {loadingMore ? t('chat.loadingOlder') : t('chat.loadOlder')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

const ROW =
  'flex min-h-10 items-center gap-2.5 rounded-md px-2 py-1.5 text-xs text-foreground transition-colors duration-fast hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground';

function DetailsSection({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {title}
        {count ? <CountPill>{count}</CountPill> : null}
      </h3>
      {children}
    </section>
  );
}

function ShowAll({
  total,
  limit,
  expanded,
  onToggle,
}: {
  total: number;
  limit: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useLocale();
  if (total <= limit) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      onClick={onToggle}
      aria-expanded={expanded}
      className="-ml-2 mt-1 text-primary hover:text-primary"
    >
      {expanded ? t('chat.showLess') : t('chat.showAll', { n: total })}
    </Button>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground">{children}</p>;
}
