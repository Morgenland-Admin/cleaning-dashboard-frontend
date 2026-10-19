import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Paperclip } from 'lucide-react';
import { useMemo } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { EmailStatusBadge } from '@/components/email-log-list';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav, RecordPager } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useProject } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import { ApiError, emailsAdminApi, type EmailLogDetail, type EmailLogRow } from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime } from '@/lib/utils';
import { MailBrand, type EmailListState } from '@/pages/emails';

import type { ReactNode } from 'react';

type T = ReturnType<typeof useT>;

function refHref(row: EmailLogRow): string | null {
  if (!row.refType || row.refId == null) return null;
  switch (row.refType) {
    case 'order':
      return `/auftraege/${row.refId}`;
    case 'invoice':
      return `/rechnungen/${row.refId}`;
    case 'inquiry':
      return row.companySlug ? `/inquiries/${row.companySlug}/${row.refId}` : null;
    case 'contact':
      return row.companySlug ? `/contacts/${row.companySlug}/${row.refId}` : null;
    case 'task':
      return `/tasks/${row.refId}`;
  }
}

function formatBytes(n: number, bcp47: string): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  const mb = new Intl.NumberFormat(bcp47, { maximumFractionDigits: 1 }).format(n / 1024 / 1024);
  return `${mb} MB`;
}

function readListState(state: unknown): Partial<EmailListState> {
  if (!state || typeof state !== 'object') return {};
  const s = state as Partial<EmailListState>;
  return {
    from: typeof s.from === 'string' && s.from.startsWith('/') ? s.from : undefined,
    ids: Array.isArray(s.ids) ? s.ids.filter((n) => typeof n === 'number') : undefined,
  };
}

export function EmailDetailPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { projects, setBrandView } = useProject();
  const id = params.id && /^\d+$/.test(params.id) ? Number(params.id) : null;

  const listState = readListState(location.state);
  const backTo = listState.from ?? '/emails';
  const backLabel = backTo.startsWith('/emails') ? t('emails.breadcrumb') : t('common.back');

  const detail = useQuery({
    queryKey: ['email-detail', id] as const,
    queryFn: ({ signal }) => emailsAdminApi.get(id!, signal),
    enabled: id != null,
  });
  const tracking = useQuery({
    queryKey: ['email-tracking'] as const,
    queryFn: ({ signal }) => emailsAdminApi.tracking(signal),
    staleTime: 5 * 60_000,
  });

  const email = detail.data?.email ?? null;
  usePageTitle(email?.subject ?? t('emails.detailTitle'));

  const brand = useMemo(
    () =>
      email?.companySlug ? projects.find((p) => p.companySlug === email.companySlug) : undefined,
    [email, projects],
  );

  const trackingConnected = (() => {
    if (!tracking.data || !email) return true;
    if (email.companySlug == null) return tracking.data.system?.connected ?? true;
    return tracking.data.brands.find((b) => b.slug === email.companySlug)?.connected ?? true;
  })();

  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to={backTo}>{backLabel}</BackLink>
    </RecordNav>
  );

  if (id == null || (!email && !detail.isLoading)) {
    const error =
      detail.error && !(detail.error instanceof ApiError && detail.error.status === 404)
        ? detail.error instanceof ApiError
          ? detail.error
          : new Error(t('emails.loadFailed'))
        : null;
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('emails.detailTitle')} />
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => void detail.refetch()}
            retrying={detail.isFetching}
          />
        ) : (
          <EmptyState variant="dashed" message={t('emails.notFound')} />
        )}
      </PageContainer>
    );
  }

  if (!email) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState label={t('emails.loading')} />
      </PageContainer>
    );
  }

  const href = refHref(email);
  const events = [...email.events].sort((a, b) => a.at.localeCompare(b.at));

  function openRef() {
    if (!href || !email) return;
    // Inboxes only list the brand in view, so switch to the mail's brand first.
    if (email.companySlug) setBrandView(email.companySlug);
    navigate(href);
  }

  return (
    <PageContainer>
      {backRow(<RecordPager currentId={email.id} hrefFor={(next) => `/emails/${next}`} />)}
      <PageHeading
        title={email.subject}
        meta={
          <>
            <EmailStatusBadge row={email} />
            <MailBrand row={email} brand={brand} t={t} />
          </>
        }
        subtitle={`${t(`emails.kind.${email.kind}` as never)} · ${formatDateTime(email.createdAt, bcp47)}`}
        actions={
          <>
            {href && email.refType ? (
              <Button variant="outline" size="sm" onClick={openRef}>
                {t(`emails.openRef.${email.refType}` as never)}
                <ArrowUpRight aria-hidden="true" />
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <SectionCard title={t('emails.preview')} bodyClassName="p-0 sm:p-0">
          {email.html ? (
            // sandbox="": no scripts, forms or same-origin, so the stored mail renders as inert markup.
            // White on purpose: the surface the mail was designed for, in either theme.
            <iframe
              title={`${t('emails.preview')}: ${email.subject}`}
              srcDoc={email.html}
              sandbox=""
              className="block h-[70svh] min-h-[32rem] w-full rounded-b-lg bg-white"
            />
          ) : (
            <div className="p-4 sm:p-5">
              <Alert tone="neutral">{t('emails.previewWithheld')}</Alert>
            </div>
          )}
        </SectionCard>

        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title={t('emails.details')}>
            <EmailFacts email={email} href={href} onOpenRef={openRef} t={t} bcp47={bcp47} />
          </SectionCard>

          <SectionCard title={t('emails.timeline')}>
            {events.length === 0 ? (
              <p className="text-2sm text-muted-foreground">
                {email.status !== 'sent'
                  ? t('emails.timelineNotSent')
                  : trackingConnected
                    ? t('emails.timelineEmpty')
                    : t('emails.timelineNotConnected')}
              </p>
            ) : (
              <ol className="flex flex-col gap-2.5">
                {events.map((e) => (
                  <li key={`${e.type}:${e.at}`} className="flex items-baseline gap-2 text-2sm">
                    <span
                      className={cn(
                        'mt-1.5 size-1.5 shrink-0 rounded-full',
                        ['bounced', 'complained', 'failed'].includes(e.type)
                          ? 'bg-destructive'
                          : e.type === 'delivery_delayed' || e.type === 'suppressed'
                            ? 'bg-warning'
                            : 'bg-success',
                      )}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">
                        {t(`emails.event.${e.type}` as never)}
                      </span>
                      <span className="block text-2xs tabular-nums text-muted-foreground">
                        {formatDateTime(e.at, bcp47)}
                      </span>
                      {e.detail ? (
                        <span className="block break-words text-2xs text-muted-foreground">
                          {e.detail}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </div>
      </div>
    </PageContainer>
  );
}

function EmailFacts({
  email,
  href,
  onOpenRef,
  t,
  bcp47,
}: {
  email: EmailLogDetail;
  href: string | null;
  onOpenRef: () => void;
  t: T;
  bcp47: string;
}) {
  return (
    <KeyValueList layout="stacked">
      <KeyValue label={t('emails.to')} value={email.toAddress} />
      <KeyValue label={t('emails.from')} value={email.fromAddress} />
      <KeyValue label={t('emails.replyTo')} value={email.replyTo} />
      <KeyValue label={t('emails.kindField')} value={t(`emails.kind.${email.kind}` as never)} />
      <KeyValue
        label={t('emails.reference')}
        value={
          href && email.refType && email.refId != null ? (
            <button
              type="button"
              onClick={onOpenRef}
              className="inline-flex min-h-6 items-center gap-1 rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t(`emails.ref.${email.refType}` as never, { id: email.refId })}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </button>
          ) : null
        }
      />
      <KeyValue
        label={t('emails.sentAt')}
        value={<span className="tabular-nums">{formatDateTime(email.createdAt, bcp47)}</span>}
      />
      <KeyValue label={t('emails.sentBy')} value={email.sentByName ?? t('emails.automatic')} />
      <KeyValue
        label={t('emails.resendId')}
        value={email.resendId ? <span className="font-mono text-xs">{email.resendId}</span> : null}
      />
      <KeyValue
        label={t('emails.attachments')}
        value={
          email.attachments.length > 0 ? (
            <span className="flex min-w-0 flex-col gap-0.5">
              {email.attachments.map((a) => (
                <span key={a.filename} className="flex items-center gap-1.5 break-all">
                  <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  {a.filename}
                  <span className="shrink-0 text-2xs tabular-nums text-muted-foreground">
                    {formatBytes(a.size, bcp47)}
                  </span>
                </span>
              ))}
            </span>
          ) : null
        }
      />
      <KeyValue
        label={t('emails.error')}
        value={email.error ? <span className="text-destructive">{email.error}</span> : null}
      />
    </KeyValueList>
  );
}
