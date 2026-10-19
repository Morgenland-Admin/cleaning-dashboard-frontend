import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Briefcase,
  Building2,
  ClipboardList,
  FileText,
  Mail,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

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
import { useProject, type CompanySlug } from '@/contexts/project-context';
import { useLocale, useT, type DictKey } from '@/i18n';
import {
  customersAdminApi,
  errMessage,
  type ContactMessage,
  type ContactStatus,
  type InquiryStatus,
  type InvoiceRow,
  type InvoiceStatus,
  type LoyaltyTier,
  type NewsletterProfileStatus,
  type OrderRow,
  type OrderStatus,
  type ServiceInquiry,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { formatCurrency, formatDateTime, formatNumber, isNonContactableEmail } from '@/lib/utils';
import { type InvoicePrefill } from '@/pages/invoice-form';

type Tone = 'info' | 'warning' | 'success' | 'danger' | 'neutral';

const TIER_TONE: Record<LoyaltyTier, 'neutral' | 'info' | 'success'> = {
  neukunde: 'neutral',
  stammkunde: 'info',
  premium: 'success',
};

const INVOICE_STATUS_TONE: Record<InvoiceStatus, Tone> = {
  draft: 'neutral',
  sent: 'info',
  paid: 'success',
  overdue: 'danger',
  void: 'neutral',
};

const NEWSLETTER_TONE: Record<NewsletterProfileStatus, 'success' | 'warning' | 'neutral'> = {
  confirmed: 'success',
  pending: 'warning',
  unsubscribed: 'neutral',
  none: 'neutral',
};

const ORDER_STATUS_LABEL: Record<OrderStatus, DictKey> = {
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

const ORDER_STATUS_TONE: Record<OrderStatus, Tone> = {
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

const ORDER_KIND_LABEL: Record<OrderRow['kind'], DictKey> = {
  teppichreinigung: 'customers.orderKind.teppichreinigung',
  teppichreparatur: 'customers.orderKind.teppichreparatur',
  polsterreinigung: 'customers.orderKind.polsterreinigung',
  teppichbodenreinigung: 'customers.orderKind.teppichbodenreinigung',
};

const INQUIRY_STATUS_LABEL: Record<InquiryStatus, DictKey> = {
  new: 'inquiries.status.new',
  in_review: 'inquiries.status.in_review',
  quoted: 'inquiries.status.quoted',
  won: 'inquiries.status.won',
  lost: 'inquiries.status.lost',
};

const INQUIRY_STATUS_TONE: Record<InquiryStatus, Tone> = {
  new: 'info',
  in_review: 'warning',
  quoted: 'info',
  won: 'success',
  lost: 'neutral',
};

const CONTACT_STATUS_LABEL: Record<ContactStatus, DictKey> = {
  new: 'contacts.statusNew',
  read: 'contacts.statusRead',
  replied: 'contacts.statusReplied',
  archived: 'contacts.statusArchived',
};

const CONTACT_STATUS_TONE: Record<ContactStatus, Tone> = {
  new: 'info',
  read: 'warning',
  replied: 'success',
  archived: 'neutral',
};

export function CustomerDetailPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const slug = activeProject.companySlug;

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['customer-overview', slug, id] as const,
    enabled: !isAllBrands && Number.isFinite(id),
    queryFn: ({ signal }) => customersAdminApi.overview(slug, id, signal),
  });

  usePageTitle(query.data?.customer.name ?? query.data?.customer.email ?? t('customers.title'));

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

  const { customer, addresses, orders, invoices, inquiries, contacts, newsletter, stats } =
    query.data;
  const noEmail = isNonContactableEmail(customer.email);
  const displayName = customer.name ?? customer.email;
  const invoicePrefill: InvoicePrefill = {
    recipientName: customer.name ?? undefined,
    recipientCompany: customer.companyName ?? undefined,
    recipientVatId: customer.vatId ?? undefined,
    customerType: customer.customerType === 'business' ? 'b2b' : 'b2c',
    recipientEmail: noEmail ? undefined : customer.email,
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
  const showCompany = !!customer.companyName && customer.companyName !== customer.name;

  return (
    <PageContainer>
      {backRow(<RecordPager currentId={id} hrefFor={(next) => `/customers/${next}`} />)}

      <PageHeading
        title={displayName}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {showCompany ? (
              <>
                <span className="inline-flex items-center gap-1.5 text-foreground">
                  <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {customer.companyName}
                </span>
                <span aria-hidden="true">·</span>
              </>
            ) : null}
            {noEmail ? (
              <span>{t('customers.noEmail')}</span>
            ) : (
              <a
                href={`mailto:${customer.email}`}
                className="rounded-sm hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {customer.email}
              </a>
            )}
          </span>
        }
        meta={
          <>
            <StatusBadge
              label={t(`customers.type.${customer.customerType}` as never)}
              tone={customer.customerType === 'business' ? 'info' : 'neutral'}
            />
            <StatusBadge
              label={t(`customers.tier.${customer.loyaltyTier}` as never)}
              tone={TIER_TONE[customer.loyaltyTier]}
            />
            {noEmail ? <StatusBadge label={t('customers.nonContactable')} tone="warning" /> : null}
          </>
        }
        actions={
          <>
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
          <Tabs defaultValue="addresses" className="min-w-0">
            <TabsList variant="line" overflow="scroll">
              <TabsTrigger value="addresses">
                {t('customers.tab.addresses')}
                <CountPill>{addresses.length}</CountPill>
              </TabsTrigger>
              <TabsTrigger value="orders">
                {t('customers.tab.orders')}
                <CountPill>{stats.orders}</CountPill>
              </TabsTrigger>
              <TabsTrigger value="invoices">
                {t('customers.tab.invoices')}
                <CountPill>{stats.invoices}</CountPill>
              </TabsTrigger>
              <TabsTrigger value="inquiries">
                {t('customers.tab.inquiries')}
                <CountPill>{stats.inquiries}</CountPill>
              </TabsTrigger>
              <TabsTrigger value="contacts">
                {t('customers.tab.contacts')}
                <CountPill>{stats.contacts}</CountPill>
              </TabsTrigger>
              <TabsTrigger value="newsletter">{t('customers.tab.newsletter')}</TabsTrigger>
              <TabsTrigger value="emails">{t('emails.record.title')}</TabsTrigger>
            </TabsList>

            <TabsContent value="addresses" className="mt-4">
              <CustomerAddresses slug={slug} customerId={customer.id} addresses={addresses} />
            </TabsContent>
            <TabsContent value="orders" className="mt-4">
              <OrdersList orders={orders} bcp47={bcp47} />
            </TabsContent>
            <TabsContent value="invoices" className="mt-4">
              <InvoicesList invoices={invoices} bcp47={bcp47} />
            </TabsContent>
            <TabsContent value="inquiries" className="mt-4">
              <InquiriesList inquiries={inquiries} slug={slug} bcp47={bcp47} />
            </TabsContent>
            <TabsContent value="contacts" className="mt-4">
              <ContactsList contacts={contacts} slug={slug} bcp47={bcp47} />
            </TabsContent>
            <TabsContent value="newsletter" className="mt-4">
              <NewsletterPanel
                status={stats.newsletterStatus}
                subscribedAt={newsletter?.createdAt ?? null}
                bcp47={bcp47}
              />
            </TabsContent>
            <TabsContent value="emails" className="mt-4">
              <p className="mb-2 text-xs text-muted-foreground">
                {t('emails.record.byRecipient', { email: customer.email })}
              </p>
              <EmailLogList
                parentKey={['customer-overview', slug, id]}
                brand={slug}
                filter={{ recipient: customer.email }}
                empty={
                  <EmptyState
                    size="sm"
                    variant="dashed"
                    icon={<Mail aria-hidden="true" />}
                    message={t('emails.record.empty')}
                  />
                }
              />
            </TabsContent>
          </Tabs>

          <aside className="flex min-w-0 flex-col gap-5" aria-label={t('customers.profile')}>
            <SectionCard title={t('customers.profile')}>
              <KeyValueList>
                <KeyValue
                  label={t('customers.form.email')}
                  value={
                    noEmail ? (
                      <span className="text-muted-foreground">{t('customers.noEmail')}</span>
                    ) : (
                      <span className="break-all">{customer.email}</span>
                    )
                  }
                />
                <KeyValue label={t('customers.form.phone')} value={customer.phone} empty="—" />
                <KeyValue
                  label={t('customers.customerId')}
                  value={<span className="tabular-nums">#{customer.id}</span>}
                />
                <KeyValue
                  label={t('customers.form.customerType')}
                  value={t(`customers.type.${customer.customerType}` as never)}
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
                      ? t(`customers.salutationOpt.${customer.salutation}` as never)
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
                    customer.language ? t(`customers.lang.${customer.language}` as never) : null
                  }
                />
                <KeyValue
                  label={t('customers.form.preferredChannel')}
                  value={
                    customer.preferredChannel
                      ? t(`customers.channel.${customer.preferredChannel}` as never)
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
                      label={t(`customers.newsletterState.${stats.newsletterStatus}` as never)}
                      tone={NEWSLETTER_TONE[stats.newsletterStatus]}
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
        description={t('customers.confirmDeleteBody', { email: customer.email })}
        confirmLabel={t('customers.delete')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </PageContainer>
  );
}

function SectionEmpty({ icon, message }: { icon: ReactNode; message: string }) {
  return <EmptyState size="sm" variant="dashed" icon={icon} message={message} />;
}

function SubTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>{head}</TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

/** First-cell link is stretched over the row: one real link per row for keyboard and screen-reader users. */
const ROW_LINK =
  'block rounded-sm after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring';

function OrdersList({ orders, bcp47 }: { orders: OrderRow[]; bcp47: string }) {
  const t = useT();
  if (orders.length === 0) {
    return (
      <SectionEmpty icon={<Briefcase aria-hidden="true" />} message={t('customers.noOrders')} />
    );
  }
  return (
    <SubTable
      head={
        <>
          <TableHead>{t('customers.table.order')}</TableHead>
          <TableHead>{t('customers.table.status')}</TableHead>
          <TableHead className="text-right">{t('customers.table.amount')}</TableHead>
          <TableHead className="text-right">{t('customers.table.date')}</TableHead>
        </>
      }
    >
      {orders.map((o) => (
        <TableRow key={o.id} className="relative cursor-pointer">
          <TableCell>
            <Link to={`/auftraege/${o.id}`} className={ROW_LINK}>
              <span className="block font-medium tabular-nums text-foreground">
                {o.orderNumber || `#${o.id}`}
              </span>
              <span className="block text-xs text-muted-foreground">
                {t(ORDER_KIND_LABEL[o.kind])}
              </span>
            </Link>
          </TableCell>
          <TableCell>
            <StatusBadge
              label={t(ORDER_STATUS_LABEL[o.status])}
              tone={ORDER_STATUS_TONE[o.status]}
            />
          </TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums">
            {formatCurrency(o.totalCents / 100, o.currency, bcp47)}
          </TableCell>
          <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
            {formatDateTime(o.createdAt, bcp47, { dateStyle: 'short' })}
          </TableCell>
        </TableRow>
      ))}
    </SubTable>
  );
}

function InvoicesList({ invoices, bcp47 }: { invoices: InvoiceRow[]; bcp47: string }) {
  const t = useT();
  if (invoices.length === 0) {
    return (
      <SectionEmpty icon={<FileText aria-hidden="true" />} message={t('customers.noInvoices')} />
    );
  }
  return (
    <SubTable
      head={
        <>
          <TableHead>{t('customers.table.invoice')}</TableHead>
          <TableHead>{t('customers.table.status')}</TableHead>
          <TableHead className="text-right">{t('customers.table.amount')}</TableHead>
          <TableHead className="text-right">{t('customers.table.date')}</TableHead>
        </>
      }
    >
      {invoices.map((i) => (
        <TableRow key={i.id} className="relative cursor-pointer">
          <TableCell>
            <Link to={`/rechnungen/${i.id}`} className={ROW_LINK}>
              <span className="block font-medium tabular-nums text-foreground">
                {i.number ?? t('invoices.status.draft')}
              </span>
              <span className="block text-xs text-muted-foreground">
                {i.subject || i.recipientName}
                {i.orderId ? ` · #${i.orderId}` : ''}
              </span>
            </Link>
          </TableCell>
          <TableCell>
            <StatusBadge
              label={t(`invoices.status.${i.status}` as never)}
              tone={INVOICE_STATUS_TONE[i.status]}
            />
          </TableCell>
          <TableCell className="whitespace-nowrap text-right tabular-nums">
            {formatCurrency(i.totalCents / 100, i.currency, bcp47)}
          </TableCell>
          <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
            {formatDateTime(i.sentAt ?? i.createdAt, bcp47, { dateStyle: 'short' })}
          </TableCell>
        </TableRow>
      ))}
    </SubTable>
  );
}

function InquiriesList({
  inquiries,
  slug,
  bcp47,
}: {
  inquiries: ServiceInquiry[];
  slug: CompanySlug;
  bcp47: string;
}) {
  const t = useT();
  if (inquiries.length === 0) {
    return (
      <SectionEmpty
        icon={<ClipboardList aria-hidden="true" />}
        message={t('customers.noInquiries')}
      />
    );
  }
  return (
    <SubTable
      head={
        <>
          <TableHead>{t('customers.table.inquiry')}</TableHead>
          <TableHead>{t('customers.table.status')}</TableHead>
          <TableHead className="text-right">{t('customers.table.date')}</TableHead>
        </>
      }
    >
      {inquiries.map((i) => (
        <TableRow key={i.id} className="relative cursor-pointer">
          <TableCell>
            <Link to={`/inquiries/${slug}/${i.id}`} className={ROW_LINK}>
              <span className="block font-medium text-foreground">
                {i.service || t('customers.inquiry')}
              </span>
              <span className="line-clamp-1 block text-xs text-muted-foreground">{i.message}</span>
            </Link>
          </TableCell>
          <TableCell>
            <StatusBadge
              label={t(INQUIRY_STATUS_LABEL[i.status])}
              tone={INQUIRY_STATUS_TONE[i.status]}
            />
          </TableCell>
          <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
            {formatDateTime(i.createdAt, bcp47, { dateStyle: 'short' })}
          </TableCell>
        </TableRow>
      ))}
    </SubTable>
  );
}

function ContactsList({
  contacts,
  slug,
  bcp47,
}: {
  contacts: ContactMessage[];
  slug: CompanySlug;
  bcp47: string;
}) {
  const t = useT();
  if (contacts.length === 0) {
    return <SectionEmpty icon={<Mail aria-hidden="true" />} message={t('customers.noContacts')} />;
  }
  return (
    <SubTable
      head={
        <>
          <TableHead>{t('customers.table.message')}</TableHead>
          <TableHead>{t('customers.table.status')}</TableHead>
          <TableHead className="text-right">{t('customers.table.date')}</TableHead>
        </>
      }
    >
      {contacts.map((c) => (
        <TableRow key={c.id} className="relative cursor-pointer">
          <TableCell>
            <Link to={`/contacts/${slug}/${c.id}`} className={ROW_LINK}>
              <span className="block font-medium text-foreground">
                {c.subject || t('customers.contactMessage')}
              </span>
              <span className="line-clamp-1 block text-xs text-muted-foreground">{c.message}</span>
            </Link>
          </TableCell>
          <TableCell>
            <StatusBadge
              label={t(CONTACT_STATUS_LABEL[c.status])}
              tone={CONTACT_STATUS_TONE[c.status]}
            />
          </TableCell>
          <TableCell className="whitespace-nowrap text-right text-xs tabular-nums text-muted-foreground">
            {formatDateTime(c.createdAt, bcp47, { dateStyle: 'short' })}
          </TableCell>
        </TableRow>
      ))}
    </SubTable>
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
        label={t(`customers.newsletterState.${status}` as never)}
        tone={NEWSLETTER_TONE[status]}
      />
    </div>
  );
}
