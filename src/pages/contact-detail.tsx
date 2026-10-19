import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  CheckCheck,
  Inbox,
  Mail,
  MailOpen,
  MoreHorizontal,
  Phone,
  Reply,
  Send,
  UserRound,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { AttachmentGallery } from '@/components/attachment-gallery';
import { BackLink } from '@/components/back-link';
import { BrandChip } from '@/components/brand-mark';
import { ClaudeChatBox } from '@/components/claude-chat-box';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  contactApi,
  errMessage,
  type ContactMessage,
  type ContactReply,
  type ContactStatus,
  ApiError,
} from '@/lib/api';
import { useClaudeAssist } from '@/lib/use-claude-assist';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';
import { BrandRecordPager } from '@/pages/inbox-components';
import {
  TEXT_LINK,
  contactPath,
  contactStatusMeta,
  displayName,
  isImportedSource,
  loadError,
  readBrandListState,
  sourceLabel,
  usableEmail,
  type Translate,
} from '@/pages/inbox-shared';

type DetailData = { message: ContactMessage | null; replies: ContactReply[] };

// The brand comes from the URL, so the page works from any brand view.
export function ContactDetailPage() {
  const t = useT();
  const location = useLocation();
  const { slug, id: idParam } = useParams();
  const { projects } = useProject();

  const brand = projects.find((p) => p.companySlug === slug) ?? null;
  const id = idParam && /^\d+$/.test(idParam) ? Number(idParam) : null;

  // Same key the reply mutation writes into.
  const query = useQuery({
    queryKey: ['contact-detail', brand?.companySlug ?? 'none', id ?? 0] as const,
    queryFn: ({ signal }) => contactApi.get(brand!.companySlug, id!, signal),
    enabled: !!brand && id !== null,
  });

  const message = query.data?.message ?? null;
  usePageTitle(message?.subject || (message ? displayName(t, message) : t('contacts.title')));

  const from = readBrandListState(location.state).from;
  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to={`/contacts${from && !from.startsWith('/') ? from : ''}`}>
        {t('contacts.title')}
      </BackLink>
    </RecordNav>
  );

  if (brand && id !== null && query.isLoading) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState className="min-h-64" label={t('contacts.inboxLoading')} />
      </PageContainer>
    );
  }

  if (!brand || id === null || !message) {
    const error = loadError(query.error, t, 'contacts');
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('contacts.title')} />
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : (
          <EmptyState variant="dashed" icon={<Inbox />} message={t('contacts.notFound')} />
        )}
      </PageContainer>
    );
  }

  return (
    <ContactRecord
      key={`${brand.companySlug}:${message.id}`}
      message={message}
      replies={query.data?.replies ?? []}
      brand={brand}
      backRow={backRow}
    />
  );
}

function ContactRecord({
  message,
  replies,
  brand,
  backRow,
}: {
  message: ContactMessage;
  replies: ContactReply[];
  brand: Project;
  backRow: (pager?: ReactNode) => ReactNode;
}) {
  const t = useT();
  const { bcp47 } = useLocale();
  const queryClient = useQueryClient();
  const { setBrandView } = useProject();
  const canWrite = useCanWrite();
  const companySlug = brand.companySlug;
  const detailKey = ['contact-detail', companySlug, message.id] as const;
  const email = usableEmail(message.email);
  const status = contactStatusMeta(t, message.status);
  const name = displayName(t, message);
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];

  function invalidateLists() {
    for (const key of ['contacts-infinite', 'contacts', 'contacts-counts']) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }

  const statusMutation = useMutation({
    mutationFn: (status: ContactStatus) => contactApi.updateStatus(companySlug, message.id, status),
    onSuccess: (res) => {
      queryClient.setQueryData<DetailData>(detailKey, (prev) => ({
        message: res.message,
        replies: prev?.replies ?? [],
      }));
      invalidateLists();
    },
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: t('contacts.statusUpdateFailed'),
        description: errMessage(err),
      });
    },
  });

  const replyMutation = useMutation({
    mutationFn: (body: string) => contactApi.reply(companySlug, message.id, body),
    onSuccess: ({ reply, message: updated }) => {
      queryClient.setQueryData<DetailData>(detailKey, (prev) => ({
        message: updated,
        replies: [...(prev?.replies ?? []), reply],
      }));
      invalidateLists();
    },
  });

  const replyError =
    replyMutation.error instanceof ApiError
      ? replyMutation.error.message
      : replyMutation.error
        ? t('contacts.replyFailed')
        : null;

  const metadataEntries = Object.entries(
    message.metadata && typeof message.metadata === 'object' ? message.metadata : {},
  ).filter(([, v]) => v !== null && v !== undefined && v !== '');

  return (
    <PageContainer>
      {backRow(
        <BrandRecordPager
          slug={companySlug}
          id={message.id}
          hrefFor={(ref) => contactPath(ref.slug, ref.id)}
        />,
      )}
      <PageHeading
        title={message.subject || t('contacts.detailNoSubject')}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-medium text-foreground">{name}</span>
            {email ? (
              <>
                <span aria-hidden="true">·</span>
                <a href={`mailto:${email}`} className={cn(TEXT_LINK, 'break-all')}>
                  {email}
                </a>
              </>
            ) : null}
            {message.phone ? (
              <>
                <span aria-hidden="true">·</span>
                <PhoneLink phone={message.phone} />
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <time dateTime={message.createdAt} className="tabular-nums">
              {formatDateTime(message.createdAt, bcp47)}
            </time>
          </span>
        }
        meta={
          <>
            <Badge variant={status.variant}>{status.label}</Badge>
            <BrandChip brand={brand} />
          </>
        }
        actions={
          canWrite ? (
            <StatusActions
              status={message.status}
              onChange={(next) => statusMutation.mutate(next)}
              disabled={statusMutation.isPending}
              pendingStatus={statusMutation.isPending ? (statusMutation.variables ?? null) : null}
              t={t}
            />
          ) : null
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title={t('contacts.conversationTitle')}>
            <ol className="flex flex-col gap-3">
              <li>
                <MessageBlock
                  name={name}
                  subtitle={t('contacts.originalMessage')}
                  timestamp={formatDateTime(message.createdAt, bcp47)}
                  iso={message.createdAt}
                  body={message.message}
                  tone="incoming"
                />
              </li>
              {replies.map((r) => (
                <li key={r.id}>
                  <MessageBlock
                    name={r.sentByName || brand.name}
                    subtitle={t('contacts.replyFromAdmin')}
                    timestamp={formatDateTime(r.createdAt, bcp47)}
                    iso={r.createdAt}
                    body={r.body}
                    tone="outgoing"
                  />
                </li>
              ))}
            </ol>
          </SectionCard>

          {canWrite ? (
            email ? (
              <SectionCard
                title={t('contacts.replyTitle')}
                description={
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    <Mail className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">
                      {t('contacts.replyEmailLabel')}{' '}
                      <span className="font-medium text-foreground">{email}</span>
                    </span>
                  </span>
                }
              >
                <ReplyComposer
                  to={email}
                  companySlug={companySlug}
                  contactId={message.id}
                  onSend={(body) => replyMutation.mutateAsync(body)}
                  isSending={replyMutation.isPending}
                  error={replyError}
                  t={t}
                />
              </SectionCard>
            ) : (
              <Alert tone="info">{t('contacts.noReplyPossible')}</Alert>
            )
          ) : null}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          <SectionCard title={t('contacts.senderTitle')}>
            <KeyValueList layout="stacked">
              <KeyValue label={t('contacts.colSender')} value={name} />
              <KeyValue
                label={t('contacts.detailEmail')}
                empty="—"
                value={
                  email ? (
                    <a href={`mailto:${email}`} className={cn(TEXT_LINK, 'break-all')}>
                      {email}
                    </a>
                  ) : message.email ? (
                    <span className="text-muted-foreground">{t('inbox.placeholderEmail')}</span>
                  ) : null
                }
              />
              <KeyValue
                label={t('contacts.detailPhone')}
                value={message.phone ? <PhoneLink phone={message.phone} /> : null}
              />
              <KeyValue
                label={t('contacts.detailLocale')}
                value={message.locale ? message.locale.toUpperCase() : null}
              />
              <KeyValue
                label={t('contacts.detailMarketing')}
                value={message.consentMarketing ? t('common.yes') : t('common.no')}
              />
              {message.customerId ? (
                <KeyValue
                  label={t('inquiries.colCustomer')}
                  value={
                    <Link
                      to={`/customers/${message.customerId}`}
                      onClick={() => setBrandView(brand.id)}
                      className={cn(TEXT_LINK, 'inline-flex items-center gap-1')}
                    >
                      <UserRound className="size-3.5" aria-hidden="true" />
                      {t('inbox.openCustomer')}
                    </Link>
                  }
                />
              ) : null}
            </KeyValueList>
          </SectionCard>

          <SectionCard title={t('contacts.statusTitle')}>
            <KeyValueList>
              <KeyValue
                label={t('contacts.detailStatus')}
                value={<Badge variant={status.variant}>{status.label}</Badge>}
              />
              <KeyValue label={t('contacts.detailSource')} value={sourceLabel(t, message.source)} />
              <KeyValue
                label={t('contacts.colReceived')}
                value={<DateValue iso={message.createdAt} bcp47={bcp47} />}
              />
              {message.handledAt ? (
                <KeyValue
                  label={t('contacts.detailHandled')}
                  value={<DateValue iso={message.handledAt} bcp47={bcp47} />}
                />
              ) : null}
              {message.repliedAt ? (
                <KeyValue
                  label={t('contacts.detailReplied')}
                  value={<DateValue iso={message.repliedAt} bcp47={bcp47} />}
                />
              ) : null}
            </KeyValueList>
            {isImportedSource(message.source) ? (
              <p className="mt-3 text-xs text-muted-foreground">{t('inbox.importedHint')}</p>
            ) : null}
          </SectionCard>

          {attachments.length > 0 ? (
            <SectionCard
              title={t('contacts.attachmentsTitle')}
              description={String(attachments.length)}
            >
              <AttachmentGallery
                companySlug={companySlug}
                attachments={attachments}
                className="grid grid-cols-2 gap-2"
              />
            </SectionCard>
          ) : null}

          {metadataEntries.length > 0 ? (
            <SectionCard title={t('contacts.metadataTitle')}>
              <KeyValueList layout="stacked">
                {metadataEntries.map(([k, v]) => (
                  <KeyValue key={k} label={prettyMetaLabel(k)} value={formatMetaValue(v, t)} />
                ))}
              </KeyValueList>
            </SectionCard>
          ) : null}
        </aside>
      </div>
    </PageContainer>
  );
}

function PhoneLink({ phone }: { phone: string }) {
  return (
    <a
      href={`tel:${phone.replace(/[^\d+]/g, '')}`}
      className={cn(TEXT_LINK, 'inline-flex items-center gap-1 tabular-nums')}
    >
      <Phone className="size-3" aria-hidden="true" />
      {phone}
    </a>
  );
}

function StatusActions({
  status,
  onChange,
  disabled,
  pendingStatus,
  t,
}: {
  status: string;
  onChange: (status: ContactStatus) => void;
  disabled: boolean;
  pendingStatus: ContactStatus | null;
  t: Translate;
}) {
  const NEXT: Partial<Record<string, ContactStatus>> = {
    new: 'read',
    read: 'replied',
    replied: 'archived',
  };
  const all: { target: ContactStatus; label: string; icon: ReactNode }[] = [
    { target: 'read', label: t('contacts.actionMarkRead'), icon: <MailOpen aria-hidden="true" /> },
    {
      target: 'replied',
      label: t('contacts.actionMarkReplied'),
      icon: <Reply aria-hidden="true" />,
    },
    {
      target: 'archived',
      label: t('contacts.actionArchive'),
      icon: <Archive aria-hidden="true" />,
    },
    { target: 'new', label: t('contacts.actionReset'), icon: <CheckCheck aria-hidden="true" /> },
  ];
  const primaryTarget = NEXT[status];
  const primary = all.find((a) => a.target === primaryTarget);
  const rest = all.filter((a) => a.target !== status && a.target !== primaryTarget);

  return (
    <>
      {primary ? (
        <Button
          size="sm"
          variant="outline"
          disabled={disabled}
          loading={pendingStatus === primary.target}
          onClick={() => onChange(primary.target)}
        >
          {primary.icon}
          {primary.label}
        </Button>
      ) : null}
      {rest.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={disabled}
              aria-label={t('contacts.moreActions')}
              title={t('contacts.moreActions')}
              loading={pendingStatus !== null && pendingStatus !== primaryTarget}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {rest.map((a) => (
              <DropdownMenuItem key={a.target} onSelect={() => onChange(a.target)}>
                {a.icon}
                {a.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}

function MessageBlock({
  name,
  subtitle,
  timestamp,
  iso,
  body,
  tone,
}: {
  name: string;
  subtitle: string;
  timestamp: string;
  iso: string;
  body: string;
  tone: 'incoming' | 'outgoing';
}) {
  const isOutgoing = tone === 'outgoing';
  return (
    <article
      className={cn(
        'flex flex-col gap-1',
        isOutgoing ? 'items-end pl-6 sm:pl-12' : 'items-start pr-6 sm:pr-12',
      )}
    >
      <div className="flex max-w-full flex-wrap items-baseline gap-x-2 px-1 text-xs text-muted-foreground">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span>{subtitle}</span>
        <time dateTime={iso} className="tabular-nums">
          {timestamp}
        </time>
      </div>
      <p
        className={cn(
          'max-w-full whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-2sm leading-relaxed text-foreground',
          isOutgoing ? 'bg-primary-soft' : 'bg-muted',
        )}
      >
        {body}
      </p>
    </article>
  );
}

function ReplyComposer({
  to,
  companySlug,
  contactId,
  onSend,
  isSending,
  error,
  t,
}: {
  to: string;
  companySlug: CompanySlug;
  contactId: number;
  onSend: (body: string) => Promise<unknown>;
  isSending: boolean;
  error: string | null;
  t: Translate;
}) {
  const [body, setBody] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sentTimerRef = useRef<number | null>(null);

  const assist = useClaudeAssist({
    kind: 'contact_reply',
    companySlug,
    refId: contactId,
    getCurrent: () => body,
    apply: (text) => {
      setBody(text);
      setLocalError(null);
      setJustSent(false);
    },
    updatedLabel: t('ai.updated'),
  });

  useEffect(() => {
    return () => {
      if (sentTimerRef.current !== null) {
        window.clearTimeout(sentTimerRef.current);
      }
    };
  }, []);

  // Button and ⌘↵ both ask first: the mail leaves immediately once sent.
  function requestSend() {
    if (!body.trim()) {
      setLocalError(t('contacts.replyEmpty'));
      return;
    }
    setLocalError(null);
    setConfirmOpen(true);
  }

  async function handleSend() {
    setLocalError(null);
    try {
      await onSend(body);
      setConfirmOpen(false);
      setBody('');
      setJustSent(true);
      if (sentTimerRef.current !== null) window.clearTimeout(sentTimerRef.current);
      sentTimerRef.current = window.setTimeout(() => setJustSent(false), 2400);
    } catch {
      /* error surfaced via the prop */
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      requestSend();
    }
  }

  const shownError = localError ?? error;

  return (
    <div className="flex flex-col gap-3">
      {/* Focus-within paints the whole composer like a field: the textarea and Claude box inside are borderless. */}
      <div className="overflow-hidden rounded-lg border border-input bg-card transition-colors duration-fast focus-within:border-ring focus-within:ring-1 focus-within:ring-ring">
        <Textarea
          rows={8}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (localError) setLocalError(null);
            if (justSent) setJustSent(false);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('contacts.replyPlaceholder')}
          disabled={isSending}
          aria-label={t('contacts.replyPlaceholder')}
          className="min-h-[180px] resize-none rounded-none border-0 bg-transparent px-3.5 py-3 text-base leading-relaxed shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 sm:text-2sm"
        />
        <ClaudeChatBox
          editablePrompt={{ kind: 'contact_reply', companySlug }}
          busy={assist.busy}
          history={assist.history}
          placeholder={t('ai.placeholder')}
          idleHint={body.trim() ? t('ai.idleRefine') : t('ai.idleFresh')}
          busyHint={t('ai.writing')}
          sendLabel={t('ai.send')}
          quickActions={[
            {
              label: t('ai.draftReply'),
              run: () => assist.run(undefined, t('ai.draftReply'), { fresh: true }),
            },
            {
              label: t('ai.shorter'),
              run: () => assist.run('Deutlich kürzer formulieren.', t('ai.shorter')),
            },
            {
              label: t('ai.friendlier'),
              run: () => assist.run('Wärmer und freundlicher formulieren.', t('ai.friendlier')),
            },
          ]}
          onSend={(instruction) => assist.run(instruction, instruction)}
        />
      </div>

      {shownError ? <Alert tone="destructive">{shownError}</Alert> : null}
      {justSent ? <Alert tone="success">{t('contacts.replySentToast')}</Alert> : null}

      <div className="flex items-center justify-end gap-2">
        <kbd className="hidden items-center gap-0.5 rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-3xs text-muted-foreground sm:inline-flex">
          ⌘↩
        </kbd>
        <Button onClick={requestSend} disabled={body.trim() === ''} loading={isSending}>
          <Send aria-hidden="true" />
          {t('contacts.replySend')}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('contacts.confirmSendReplyTitle')}
        description={t('contacts.confirmSendReplyBody', { to })}
        confirmLabel={t('contacts.replySend')}
        onConfirm={() => void handleSend()}
        isPending={isSending}
      />
    </div>
  );
}

function DateValue({ iso, bcp47 }: { iso: string; bcp47: string }) {
  return (
    <time dateTime={iso} className="tabular-nums">
      {formatDateTime(iso, bcp47)}
    </time>
  );
}

function prettyMetaLabel(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function formatMetaValue(v: unknown, t: ReturnType<typeof useT>): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? t('common.yes') : t('common.no');
  if (typeof v === 'number') return v.toLocaleString();
  if (Array.isArray(v)) return v.map((item) => formatMetaValue(item, t)).join(', ');
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}
