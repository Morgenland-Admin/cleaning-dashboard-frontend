import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  ClipboardList,
  FileText,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Send,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { CountPill } from '@/components/count-pill';
import { CustomerAddresses } from '@/components/customer-addresses';
import { EmailLogList } from '@/components/email-log-list';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RecordNav, RecordPager } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { StatGrid, StatTile } from '@/components/stat-tile';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { useLocale, useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  customersAdminApi,
  errMessage,
  type CustomerLinkedKind,
  type CustomerLinkedRows,
  type NewsletterProfileStatus,
} from '@/lib/api';
import {
  contactEmail,
  customerTitle,
  customerTypeLabel,
  labelOr,
  tierBadge,
} from '@/lib/customer-display';
import { humanizeSlug, useOrderKindLabel } from '@/lib/use-order-kind-label';
import { usePageTitle } from '@/lib/use-page-title';
import { formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';
import { type InvoicePrefill } from '@/pages/invoice-form';

type Tone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';
type T = ReturnType<typeof useT>;

const TABS = [
  'orders',
  'invoices',
  'inquiries',
  'contacts',
  'emails',
  'addresses',
  'newsletter',
] as const;
type TabValue = (typeof TABS)[number];

const PAGE_SIZE = 20;

const INVOICE_STATUS_TONE: Record<string, Tone> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  void: 'neutral',
};

const NEWSLETTER_TONE: Record<NewsletterProfileStatus, Tone> = {
  confirmed: 'success',
  pending: 'warning',
  unsubscribed: 'neutral',
  none: 'neutral',
};

const ORDER_STATUS_LABEL: Record<string, DictKey> = {
  pending: 'orders.status.pending',
  payment_pending: 'orders.status.paymentPending',
  paid: 'orders.status.paid',
  accepted: 'orders.status.accepted',
  picked_up: 'orders.status.pickedUp',
  in_cleaning: 'orders.status.inCleaning',
  ready: 'orders.status.ready',
  delivered: 'orders.status.delivered',
  completed: 'orders.status.completed',
  cancelled: 'orders.status.cancelled',
  partially_refunded: 'orders.status.partiallyRefunded',
  refunded: 'orders.status.refunded',
};

const ORDER_STATUS_TONE: Record<string, Tone> = {
  pending: 'neutral',
  payment_pending: 'warning',
  paid: 'info',
  accepted: 'info',
  picked_up: 'info',
  in_cleaning: 'info',
  ready: 'info',
  delivered: 'success',
  completed: 'success',
  cancelled: 'danger',
  partially_refunded: 'warning',
  refunded: 'danger',
};

const INQUIRY_STATUS_TONE: Record<string, Tone> = {
  new: 'info',
  in_review: 'warning',
  quoted: 'info',
  won: 'success',
  lost: 'neutral',
};

const CONTACT_STATUS_LABEL: Record<string, DictKey> = {
  new: 'contacts.statusNew',
  read: 'contacts.statusRead',
  replied: 'contacts.statusReplied',
  archived: 'contacts.statusArchived',
};

const CONTACT_STATUS_TONE: Record<string, Tone> = {
  new: 'info',
  read: 'warning',
  replied: 'success',
  archived: 'neutral',
};

function mappedLabel(t: T, map: Record<string, DictKey>, value: string): string {
  const key = map[value];
  return key ? t(key) : humanizeSlug(value);
}

function shortDate(iso: string, bcp47: string): string {
  return formatDateTime(iso, bcp47, { dateStyle: 'short' });
}

export function CustomerDetailPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const canWrite = useCanWrite();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const slug = activeProject.companySlug;

  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: TabValue = TABS.includes(rawTab as TabValue) ? (rawTab as TabValue) : 'orders';

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['customer-overview', slug, id] as const,
    enabled: !isAllBrands && Number.isFinite(id),
    queryFn: ({ signal }) => customersAdminApi.overview(slug, id, signal),
  });

  const title = query.data ? customerTitle(query.data.customer, t) : t('customers.title');
  usePageTitle(title);

  const recompute = useMutation({
    mutationFn: () => customersAdminApi.recomputeTier(slug, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customer-overview', slug, id] });
      void queryClient.invalidateQueries({ queryKey: ['customers', slug] });
    },
    onError: (err) => setActionError(errMessage(err)),
  });

  const remove = useMutation({
    mutationFn: () => customersAdminApi.delete(slug, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['customers', slug] });
      navigate('/customers');
    },
    onError: (err) => {
      setConfirmingDelete(false);
      setActionError(errMessage(err));
    },
  });

  function selectTab(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === 'orders') next.delete('tab');
        else next.set('tab', value);
        return next;
      },
      // Keeps the list's prev/next state; replace so Back leaves the record in one step.
      { replace: true, state: location.state },
    );
  }

  const backRow = (pager?: ReactNode) => (
    <RecordNav pager={pager}>
      <BackLink to="/customers">{t('customers.backToList')}</BackLink>
    </RecordNav>
  );

  if (isAllBrands) {
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('customers.title')} />
        <EmptyState
          variant="dashed"
          icon={<Users aria-hidden="true" />}
          message={t('customers.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  if (query.isLoading) {
    return (
      <PageContainer>
        {backRow()}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }

  if (query.error || !query.data) {
    return (
      <PageContainer>
        {backRow()}
        <PageHeading title={t('customers.title')} />
        <ErrorState
          error={query.error ?? new Error(t('customers.notFound'))}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }

  const { customer, addresses, newsletter, stats } = query.data;
  const email = contactEmail(customer.email);
  const tier = tierBadge(customer.loyaltyTier, t);
  const invoicePrefill: InvoicePrefill = {
    customerId: customer.id,
    recipientName: customer.name ?? undefined,
    recipientCompany: customer.companyName ?? undefined,
    recipientVatId: customer.vatId ?? undefined,
    customerType: customer.customerType === 'business' ? 'b2b' : 'b2c',
    recipientEmail: email ?? undefined,
    addressLine1: customer.addressLine1 ?? undefined,
    addressLine2: customer.addressLine2 ?? undefined,
    postalCode: customer.postalCode ?? undefined,
    city: customer.city ?? undefined,
    paymentTermsDays: customer.defaultPaymentTermsDays,
  };
  const defaultAddress = addresses.find((a) => a.isDefault) ?? null;
  // Fall back to the customer row's address for records that predate the address book.
  const source = defaultAddress ?? customer;
  const placeLines = [
    source.addressLine1,
    source.addressLine2,
    [source.postalCode, source.city].filter(Boolean).join(' '),
  ].filter((line): line is string => !!line);
  // A bare country (the column defaults to "DE") is not an address; it needs a street or city.
  const addressLines = placeLines.length
    ? [
        ...(defaultAddress ? [defaultAddress.company, defaultAddress.name] : []),
        ...placeLines,
        source.country,
      ].filter((line): line is string => !!line)
    : [];
  const showCompany = !!customer.companyName && customer.companyName !== title;
  const tabCount: Partial<Record<TabValue, number>> = {
    orders: stats.orders,
    invoices: stats.invoices,
    inquiries: stats.inquiries,
    contacts: stats.contacts,
    emails: stats.emails,
    addresses: addresses.length,
  };
  const emailHref = `/customers/${customer.id}/email`;

  const subtitleParts: ReactNode[] = [];
  if (showCompany) {
    subtitleParts.push(
      <span key="company" className="inline-flex items-center gap-1.5 text-foreground">
        <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
        {customer.companyName}
      </span>,
    );
  }
  if (email && email !== title) {
    subtitleParts.push(
      <a key="email" href={`mailto:${email}`} className={INLINE_LINK}>
        {email}
      </a>,
    );
  }
  if (customer.phone && customer.phone !== title) {
    subtitleParts.push(
      <a key="phone" href={`tel:${customer.phone.replace(/\s+/g, '')}`} className={INLINE_LINK}>
        {customer.phone}
      </a>,
    );
  }

  return (
    <PageContainer>
      {backRow(<RecordPager currentId={id} hrefFor={(next) => `/customers/${next}`} />)}

      <PageHeading
        title={title}
        subtitle={
          subtitleParts.length > 0 ? (
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
              {subtitleParts.map((part, i) => (
                <span key={i} className="inline-flex items-center gap-1.5">
                  {i > 0 ? <span aria-hidden="true">·</span> : null}
                  {part}
                </span>
              ))}
            </span>
          ) : undefined
        }
        meta={
          <>
            <StatusBadge
              label={customerTypeLabel(customer.customerType, t)}
              tone={customer.customerType === 'business' ? 'info' : 'neutral'}
            />
            <StatusBadge label={tier.label} tone={tier.tone} />
            {email ? null : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="warning" tabIndex={0} className="cursor-help">
                    {t('customers.nonContactable')}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>{t('customers.nonContactableHint')}</TooltipContent>
              </Tooltip>
            )}
          </>
        }
        actions={
          canWrite ? (
            <>
              {email ? (
                <Button variant="outline" size="sm" asChild>
                  <Link to={emailHref}>
                    <Send aria-hidden="true" />
                    {t('customers.sendEmail')}
                  </Link>
                </Button>
              ) : (
                <Tooltip>
                  <TooltipTrigger asChild>
                    {/* aria-disabled, not disabled: it stays focusable so the tooltip can explain why. */}
                    <Button
                      variant="outline"
                      size="sm"
                      aria-disabled="true"
                      className="cursor-not-allowed opacity-50"
                      onClick={(e) => e.preventDefault()}
                    >
                      <Send aria-hidden="true" />
                      {t('customers.sendEmail')}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('customers.sendEmailUnavailable')}</TooltipContent>
                </Tooltip>
              )}
              <Button
                size="sm"
                onClick={() => navigate('/rechnungen/neu', { state: { prefill: invoicePrefill } })}
              >
                <FileText aria-hidden="true" />
                {t('invoices.newInvoice')}
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/customers/${customer.id}/edit`}>
                  <Pencil aria-hidden="true" />
                  {t('customers.edit')}
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    loading={recompute.isPending}
                    aria-label={t('customers.moreActions')}
                    title={t('customers.moreActions')}
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    disabled={recompute.isPending}
                    onSelect={() => recompute.mutate()}
                  >
                    <Sparkles aria-hidden="true" />
                    {t('customers.recomputeTier')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setConfirmingDelete(true)}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 aria-hidden="true" />
                    {t('customers.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-5">
        {actionError ? (
          <Alert tone="destructive" onDismiss={() => setActionError(null)}>
            {actionError}
          </Alert>
        ) : null}

        <StatGrid>
          <StatTile
            size="sm"
            label={t('customers.stat.orders')}
            value={formatNumber(stats.orders, bcp47)}
          />
          <StatTile
            size="sm"
            label={t('customers.stat.invoices')}
            value={formatNumber(stats.invoices, bcp47)}
            hint={
              stats.issuedInvoices > 0
                ? t('customers.stat.invoicesHint', {
                    count: formatNumber(stats.issuedInvoices, bcp47),
                    amount: formatCurrency(stats.invoicedCents / 100, 'EUR', bcp47),
                  })
                : undefined
            }
          />
          <StatTile
            size="sm"
            label={t('customers.stat.lifetimeSpend')}
            value={formatCurrency(stats.lifetimeSpentCents / 100, 'EUR', bcp47)}
            hint={t('customers.stat.lifetimeSpendHint')}
          />
          <StatTile
            size="sm"
            label={t('customers.stat.openAmount')}
            value={formatCurrency(stats.openInvoicedCents / 100, 'EUR', bcp47)}
            hint={
              stats.overdueInvoices > 0
                ? t('customers.stat.overdueHint', {
                    count: formatNumber(stats.overdueInvoices, bcp47),
                  })
                : stats.openInvoices > 0
                  ? t('customers.stat.openAmountHint', {
                      count: formatNumber(stats.openInvoices, bcp47),
                    })
                  : undefined
            }
            tone={stats.overdueInvoices > 0 ? 'danger' : 'default'}
          />
          <StatTile
            size="sm"
            label={t('customers.stat.openInquiries')}
            value={formatNumber(stats.openInquiries, bcp47)}
          />
          <StatTile
            size="sm"
            label={t('customers.stat.memberSince')}
            value={formatDateTime(customer.createdAt, bcp47, { dateStyle: 'medium' })}
          />
        </StatGrid>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <Tabs value={tab} onValueChange={selectTab} className="min-w-0">
            <TabsList variant="line" overflow="scroll">
              {TABS.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {t(`customers.tab.${value}`)}
                  {tabCount[value] !== undefined ? <CountPill>{tabCount[value]}</CountPill> : null}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="orders" className="mt-4">
              <OrdersList slug={slug} customerId={customer.id} bcp47={bcp47} />
            </TabsContent>
            <TabsContent value="invoices" className="mt-4">
              <InvoicesList slug={slug} customerId={customer.id} bcp47={bcp47} />
            </TabsContent>
            <TabsContent value="inquiries" className="mt-4">
              <InquiriesList slug={slug} customerId={customer.id} bcp47={bcp47} />
            </TabsContent>
            <TabsContent value="contacts" className="mt-4">
              <ContactsList slug={slug} customerId={customer.id} bcp47={bcp47} />
            </TabsContent>
            <TabsContent value="emails" className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  {email
                    ? t('customers.emailHistoryHint', { email })
                    : t('customers.emailHistoryHintNoAddress')}
                </p>
                {canWrite && email ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link to={emailHref}>
                      <Send aria-hidden="true" />
                      {t('customers.sendEmail')}
                    </Link>
                  </Button>
                ) : null}
              </div>
              <EmailLogList
                parentKey={['customer-overview', slug, id]}
                brand={slug}
                filter={{ customerId: customer.id }}
                empty={
                  <SectionEmpty
                    icon={<Mail aria-hidden="true" />}
                    message={t('customers.noEmails')}
                  />
                }
              />
            </TabsContent>
            <TabsContent value="addresses" className="mt-4">
              <CustomerAddresses slug={slug} customerId={customer.id} addresses={addresses} />
            </TabsContent>
            <TabsContent value="newsletter" className="mt-4">
              <NewsletterPanel
                status={stats.newsletterStatus}
                subscribedAt={newsletter?.createdAt ?? null}
                bcp47={bcp47}
              />
            </TabsContent>
          </Tabs>

          <aside className="flex min-w-0 flex-col gap-5" aria-label={t('customers.profile')}>
            <SectionCard title={t('customers.profile')}>
              <KeyValueList>
                <KeyValue
                  label={t('customers.form.email')}
                  value={
                    email ? (
                      <a href={`mailto:${email}`} className={`break-all ${INLINE_LINK}`}>
                        {email}
                      </a>
                    ) : null
                  }
                  empty={t('customers.noEmail')}
                />
                <KeyValue
                  label={t('customers.form.phone')}
                  value={
                    customer.phone ? (
                      <a
                        href={`tel:${customer.phone.replace(/\s+/g, '')}`}
                        className={`inline-flex items-center gap-1 ${INLINE_LINK}`}
                        aria-label={t('customers.callPhone', { phone: customer.phone })}
                      >
                        <Phone className="size-3.5" aria-hidden="true" />
                        {customer.phone}
                      </a>
                    ) : null
                  }
                  empty="—"
                />
                <KeyValue
                  label={t('customers.customerId')}
                  value={<span className="tabular-nums">#{customer.id}</span>}
                />
                <KeyValue
                  label={t('customers.form.customerType')}
                  value={customerTypeLabel(customer.customerType, t)}
                />
                <KeyValue label={t('customers.form.companyName')} value={customer.companyName} />
                <KeyValue label={t('customers.form.jobPosition')} value={customer.jobPosition} />
                <KeyValue label={t('customers.form.department')} value={customer.department} />
                <KeyValue label={t('customers.form.vatId')} value={customer.vatId} />
                <KeyValue label={t('customers.form.taxNumber')} value={customer.taxNumber} />
                <KeyValue
                  label={t('customers.form.website')}
                  value={
                    customer.website ? <span className="break-all">{customer.website}</span> : null
                  }
                />
                <KeyValue
                  label={t('customers.form.salutation')}
                  value={
                    customer.salutation
                      ? labelOr(
                          t,
                          `customers.salutationOpt.${customer.salutation}`,
                          customer.salutation,
                        )
                      : null
                  }
                />
                <KeyValue
                  label={t('customers.form.dateOfBirth')}
                  value={
                    customer.dateOfBirth
                      ? formatDateTime(customer.dateOfBirth, bcp47, { dateStyle: 'medium' })
                      : null
                  }
                />
                <KeyValue
                  label={t('customers.form.language')}
                  value={
                    customer.language
                      ? labelOr(t, `customers.lang.${customer.language}`, customer.language)
                      : null
                  }
                />
                <KeyValue
                  label={t('customers.form.preferredChannel')}
                  value={
                    customer.preferredChannel
                      ? labelOr(
                          t,
                          `customers.channel.${customer.preferredChannel}`,
                          customer.preferredChannel,
                        )
                      : null
                  }
                />
                <KeyValue
                  label={t('customers.form.defaultPaymentTerms')}
                  value={
                    customer.defaultPaymentTermsDays != null ? (
                      <span className="tabular-nums">{customer.defaultPaymentTermsDays}</span>
                    ) : null
                  }
                />
                <KeyValue
                  label={t('customers.tags')}
                  value={
                    customer.tags.length > 0 ? (
                      <span className="inline-flex flex-wrap justify-end gap-1">
                        {customer.tags.map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </span>
                    ) : null
                  }
                />
                <KeyValue
                  label={t('customers.form.marketingOptIn')}
                  value={
                    <Badge variant={customer.marketingOptIn ? 'success' : 'secondary'}>
                      {customer.marketingOptIn ? t('common.yes') : t('common.no')}
                    </Badge>
                  }
                />
                <KeyValue
                  label={t('customers.newsletterStatus')}
                  value={
                    <StatusBadge
                      label={labelOr(
                        t,
                        `customers.newsletterState.${stats.newsletterStatus}`,
                        stats.newsletterStatus,
                      )}
                      tone={NEWSLETTER_TONE[stats.newsletterStatus] ?? 'neutral'}
                    />
                  }
                />
              </KeyValueList>
            </SectionCard>

            <SectionCard title={t('customers.defaultAddress')}>
              {addressLines.length > 0 ? (
                <address className="text-2sm not-italic leading-relaxed text-foreground">
                  {addressLines.map((line, i) => (
                    <span key={i} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              ) : (
                <p className="text-2sm text-muted-foreground">{t('customers.noAddress')}</p>
              )}
            </SectionCard>

            {customer.internalNotes ? (
              <SectionCard title={t('customers.form.internalNotes')}>
                <p className="whitespace-pre-wrap text-2sm text-foreground">
                  {customer.internalNotes}
                </p>
              </SectionCard>
            ) : null}
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmingDelete(false);
        }}
        title={t('customers.confirmDeleteTitle')}
        description={t('customers.confirmDeleteBody', { email: title })}
        confirmLabel={t('customers.delete')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </PageContainer>
  );
}

const INLINE_LINK =
  'rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** First-cell link is stretched over the row: one real link per row for keyboard and screen-reader users. */
const ROW_LINK =
  'block rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

function SectionEmpty({ icon, message }: { icon: ReactNode; message: string }) {
  return <EmptyState size="sm" variant="dashed" icon={icon} message={message} />;
}

/** One paged list of the customer's linked records; cached under the overview key so edits refresh it. */
function useLinkedRecords<K extends CustomerLinkedKind>(
  slug: CompanySlug,
  customerId: number,
  kind: K,
) {
  const query = useInfiniteQuery({
    queryKey: ['customer-overview', slug, customerId, kind] as const,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      customersAdminApi.linked(
        slug,
        customerId,
        kind,
        { limit: PAGE_SIZE, cursor: pageParam },
        signal,
      ),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows: CustomerLinkedRows[K][] = query.data?.pages.flatMap((p) => p[kind]) ?? [];
  return { query, rows };
}

function LinkedList<K extends CustomerLinkedKind>({
  linked,
  empty,
  head,
  renderRow,
}: {
  linked: ReturnType<typeof useLinkedRecords<K>>;
  empty: ReactNode;
  head: ReactNode;
  renderRow: (row: CustomerLinkedRows[K]) => ReactNode;
}) {
  const t = useT();
  const { query, rows } = linked;
  if (query.isLoading) return <LoadingState inline />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    );
  }
  if (rows.length === 0) return empty;
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>{head}</TableRow>
          </TableHeader>
          <TableBody>{rows.map(renderRow)}</TableBody>
        </Table>
      </div>
      {query.hasNextPage ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('customers.loadMore')}
        </Button>
      ) : null}
    </div>
  );
}

interface ListProps {
  slug: CompanySlug;
  customerId: number;
  bcp47: string;
}

/** Date column is desktop-only; on phones the date joins the first cell's second line. */
function DateCell({ iso, bcp47 }: { iso: string; bcp47: string }) {
  return (
    <TableCell className="hidden whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground sm:table-cell">
      {shortDate(iso, bcp47)}
    </TableCell>
  );
}

function MobileDate({ iso, bcp47 }: { iso: string; bcp47: string }) {
  return <span className="tabular-nums sm:hidden"> · {shortDate(iso, bcp47)}</span>;
}

function OrdersList({ slug, customerId, bcp47 }: ListProps) {
  const t = useT();
  const kindLabel = useOrderKindLabel(slug);
  const linked = useLinkedRecords(slug, customerId, 'orders');
  return (
    <LinkedList
      linked={linked}
      empty={
        <SectionEmpty icon={<Briefcase aria-hidden="true" />} message={t('customers.noOrders')} />
      }
      head={
        <>
          <TableHead>{t('customers.table.order')}</TableHead>
          <TableHead>{t('customers.table.status')}</TableHead>
          <TableHead className="text-right">{t('customers.table.amount')}</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            {t('customers.table.date')}
          </TableHead>
        </>
      }
      renderRow={(o) => (
        <TableRow key={o.id} className="relative cursor-pointer">
          <TableCell className="max-w-0 sm:max-w-none">
            <Link to={`/auftraege/${o.id}`} className={ROW_LINK}>
              <span className="block truncate font-medium tabular-nums text-foreground">
                {o.orderNumber || `#${o.id}`}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {kindLabel(o.kind)}
                <MobileDate iso={o.createdAt} bcp47={bcp47} />
              </span>
            </Link>
          </TableCell>
          <TableCell>
            <StatusBadge
              label={mappedLabel(t, ORDER_STATUS_LABEL, o.status)}
              tone={ORDER_STATUS_TONE[o.status] ?? 'neutral'}
            />
          </TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums">
            {formatCurrency(o.totalCents / 100, o.currency, bcp47)}
          </TableCell>
          <DateCell iso={o.createdAt} bcp47={bcp47} />
        </TableRow>
      )}
    />
  );
}

function InvoicesList({ slug, customerId, bcp47 }: ListProps) {
  const t = useT();
  const linked = useLinkedRecords(slug, customerId, 'invoices');
  return (
    <LinkedList
      linked={linked}
      empty={
        <SectionEmpty icon={<FileText aria-hidden="true" />} message={t('customers.noInvoices')} />
      }
      head={
        <>
          <TableHead>{t('customers.table.invoice')}</TableHead>
          <TableHead>{t('customers.table.status')}</TableHead>
          <TableHead className="text-right">{t('customers.table.amount')}</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            {t('customers.table.date')}
          </TableHead>
        </>
      }
      renderRow={(i) => (
        <TableRow key={i.id} className="relative cursor-pointer">
          <TableCell className="max-w-0 sm:max-w-none">
            <Link to={`/rechnungen/${i.id}`} className={ROW_LINK}>
              <span className="block truncate font-medium tabular-nums text-foreground">
                {i.number ?? labelOr(t, 'invoices.status.draft', 'draft')}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {i.subject || i.recipientName}
                {i.orderId ? ` · #${i.orderId}` : ''}
                <MobileDate iso={i.sentAt ?? i.createdAt} bcp47={bcp47} />
              </span>
            </Link>
          </TableCell>
          <TableCell>
            <StatusBadge
              label={labelOr(t, `invoices.status.${i.status}`, i.status)}
              tone={INVOICE_STATUS_TONE[i.status] ?? 'neutral'}
            />
          </TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums">
            {formatCurrency(i.totalCents / 100, i.currency, bcp47)}
          </TableCell>
          <DateCell iso={i.sentAt ?? i.createdAt} bcp47={bcp47} />
        </TableRow>
      )}
    />
  );
}

function InquiriesList({ slug, customerId, bcp47 }: ListProps) {
  const t = useT();
  const linked = useLinkedRecords(slug, customerId, 'inquiries');
  return (
    <LinkedList
      linked={linked}
      empty={
        <SectionEmpty
          icon={<ClipboardList aria-hidden="true" />}
          message={t('customers.noInquiries')}
        />
      }
      head={
        <>
          <TableHead>{t('customers.table.inquiry')}</TableHead>
          <TableHead>{t('customers.table.status')}</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            {t('customers.table.date')}
          </TableHead>
        </>
      }
      renderRow={(i) => (
        <TableRow key={i.id} className="relative cursor-pointer">
          <TableCell className="max-w-0 sm:max-w-none">
            <Link to={`/inquiries/${slug}/${i.id}`} className={ROW_LINK}>
              <span className="block truncate font-medium text-foreground">
                {i.service || t('customers.inquiry')}
              </span>
              <span className="line-clamp-1 block text-xs text-muted-foreground">
                {i.message}
                <MobileDate iso={i.createdAt} bcp47={bcp47} />
              </span>
            </Link>
          </TableCell>
          <TableCell>
            <StatusBadge
              label={labelOr(t, `inquiries.status.${i.status}`, i.status)}
              tone={INQUIRY_STATUS_TONE[i.status] ?? 'neutral'}
            />
          </TableCell>
          <DateCell iso={i.createdAt} bcp47={bcp47} />
        </TableRow>
      )}
    />
  );
}

function ContactsList({ slug, customerId, bcp47 }: ListProps) {
  const t = useT();
  const linked = useLinkedRecords(slug, customerId, 'contacts');
  return (
    <LinkedList
      linked={linked}
      empty={
        <SectionEmpty icon={<Mail aria-hidden="true" />} message={t('customers.noContacts')} />
      }
      head={
        <>
          <TableHead>{t('customers.table.message')}</TableHead>
          <TableHead>{t('customers.table.status')}</TableHead>
          <TableHead className="hidden text-right sm:table-cell">
            {t('customers.table.date')}
          </TableHead>
        </>
      }
      renderRow={(c) => (
        <TableRow key={c.id} className="relative cursor-pointer">
          <TableCell className="max-w-0 sm:max-w-none">
            <Link to={`/contacts/${slug}/${c.id}`} className={ROW_LINK}>
              <span className="block truncate font-medium text-foreground">
                {c.subject || t('customers.contactMessage')}
              </span>
              <span className="line-clamp-1 block text-xs text-muted-foreground">
                {c.message}
                <MobileDate iso={c.createdAt} bcp47={bcp47} />
              </span>
            </Link>
          </TableCell>
          <TableCell>
            <StatusBadge
              label={mappedLabel(t, CONTACT_STATUS_LABEL, c.status)}
              tone={CONTACT_STATUS_TONE[c.status] ?? 'neutral'}
            />
          </TableCell>
          <DateCell iso={c.createdAt} bcp47={bcp47} />
        </TableRow>
      )}
    />
  );
}

function NewsletterPanel({
  status,
  subscribedAt,
  bcp47,
}: {
  status: NewsletterProfileStatus;
  subscribedAt: string | null;
  bcp47: string;
}) {
  const t = useT();
  if (status === 'none') {
    return (
      <SectionEmpty icon={<Mail aria-hidden="true" />} message={t('customers.noNewsletter')} />
    );
  }
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{t('customers.tab.newsletter')}</p>
        {subscribedAt ? (
          <p className="text-xs text-muted-foreground">
            {t('customers.subscribedOn', {
              date: formatDateTime(subscribedAt, bcp47, { dateStyle: 'medium' }),
            })}
          </p>
        ) : null}
      </div>
      <StatusBadge
        label={labelOr(t, `customers.newsletterState.${status}`, status)}
        tone={NEWSLETTER_TONE[status] ?? 'neutral'}
      />
    </div>
  );
}
