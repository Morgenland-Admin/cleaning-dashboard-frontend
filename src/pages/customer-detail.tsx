import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  ClipboardList,
  FileText,
  Building2,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  RefreshCcw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { CustomerAddresses } from '@/components/customer-addresses';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  customersAdminApi,
  errMessage,
  type ContactMessage,
  type InvoiceRow,
  type InvoiceStatus,
  type LoyaltyTier,
  type NewsletterProfileStatus,
  type OrderRow,
  type ServiceInquiry,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import {
  cn,
  formatCurrency,
  formatDateTime,
  formatNumber,
  isNonContactableEmail,
} from '@/lib/utils';
import { type InvoicePrefill } from '@/pages/invoice-form';

const TIER_TONE: Record<LoyaltyTier, 'neutral' | 'info' | 'success'> = {
  neukunde: 'neutral',
  stammkunde: 'info',
  premium: 'success',
};

/** Same tones as the invoices list / detail page, so a status reads identically. */
const INVOICE_STATUS_TONE: Record<
  InvoiceStatus,
  'info' | 'warning' | 'success' | 'danger' | 'neutral'
> = {
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

  if (isAllBrands) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <BackLink t={t} />
        <EmptyState message={t('customers.selectBrandFirst')} />
      </div>
    );
  }

  if (query.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <BackLink t={t} />
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
        </div>
      </div>
    );
  }

  if (query.error || !query.data) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <BackLink t={t} />
        <div className="flex flex-col items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{query.error ? errMessage(query.error) : t('customers.notFound')}</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            <RefreshCcw className="size-3.5" aria-hidden="true" />
            {t('common.refresh')}
          </Button>
        </div>
      </div>
    );
  }

  const { customer, addresses, orders, invoices, inquiries, contacts, newsletter, stats } =
    query.data;
  const noEmail = isNonContactableEmail(customer.email);
  // Handed to the invoice form page through router state so the operator
  // doesn't retype a recipient we already know.
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
  const fullAddress = [
    customer.addressLine1,
    customer.addressLine2,
    [customer.postalCode, customer.city].filter(Boolean).join(' '),
    customer.country,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
      <BackLink t={t} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-rust/10 text-rust">
            <span className="text-base font-semibold uppercase">
              {(customer.name ?? customer.email).slice(0, 2)}
            </span>
          </span>
          <div className="min-w-0">
            <h1 className="font-serif text-2xl font-semibold tracking-tight">
              {customer.name ?? customer.email}
            </h1>
            {customer.companyName && customer.companyName !== customer.name ? (
              <p className="flex items-center gap-1.5 text-sm text-foreground">
                <Building2 className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {customer.companyName}
              </p>
            ) : null}
            {noEmail ? (
              <span className="text-sm text-muted-foreground">{t('customers.noEmail')}</span>
            ) : (
              <a
                href={`mailto:${customer.email}`}
                className="text-sm text-muted-foreground hover:text-primary hover:underline"
              >
                {customer.email}
              </a>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-medium tabular-nums">
                {t('customers.customerId')} #{customer.id}
              </Badge>
              <StatusBadge
                label={t(`customers.type.${customer.customerType}` as never)}
                tone={customer.customerType === 'business' ? 'info' : 'neutral'}
              />
              <StatusBadge
                label={t(`customers.tier.${customer.loyaltyTier}` as never)}
                tone={TIER_TONE[customer.loyaltyTier]}
              />
              {customer.customerNumber ? (
                <Badge variant="secondary" className="tabular-nums">
                  {customer.customerNumber}
                </Badge>
              ) : null}
              {noEmail ? (
                <StatusBadge label={t('customers.nonContactable')} tone="warning" />
              ) : null}
              {customer.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="h-11 sm:h-9"
            onClick={() => navigate('/rechnungen/neu', { state: { prefill: invoicePrefill } })}
          >
            <FileText className="size-3.5" aria-hidden="true" />
            {t('invoices.newInvoice')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-9"
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
          >
            {recompute.isPending ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-3.5" aria-hidden="true" />
            )}
            {t('customers.recomputeTier')}
          </Button>
          <Button variant="outline" size="sm" className="h-11 sm:h-9" asChild>
            <Link to={`/customers/${customer.id}/edit`}>
              <Pencil className="size-3.5" aria-hidden="true" />
              {t('customers.edit')}
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {t('customers.delete')}
          </Button>
        </div>
      </div>

      {actionError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label={t('customers.stat.orders')} value={formatNumber(stats.orders, bcp47)} />
        <StatCard
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
        <StatCard
          label={t('customers.stat.lifetimeSpend')}
          value={formatCurrency(stats.lifetimeSpentCents / 100, 'EUR', bcp47)}
          hint={t('customers.stat.lifetimeSpendHint')}
        />
        <StatCard
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
          tone={stats.overdueInvoices > 0 ? 'danger' : undefined}
        />
        <StatCard
          label={t('customers.stat.openInquiries')}
          value={formatNumber(stats.openInquiries, bcp47)}
        />
        <StatCard
          label={t('customers.stat.memberSince')}
          value={formatDateTime(customer.createdAt, bcp47, { dateStyle: 'medium' })}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[20rem_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">{t('customers.profile')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <ProfileRow
              icon={<Mail className="size-4" />}
              value={noEmail ? t('customers.noEmail') : customer.email}
            />
            <ProfileRow icon={<Phone className="size-4" />} value={customer.phone} />
            <ProfileRow icon={<MapPin className="size-4" />} value={fullAddress || null} />

            <dl className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
              <DataRow label={t('customers.customerId')}>
                <span className="tabular-nums">#{customer.id}</span>
              </DataRow>
              <DataRow label={t('customers.form.customerType')}>
                {t(`customers.type.${customer.customerType}` as never)}
              </DataRow>
              <DataRow label={t('customers.form.companyName')}>{customer.companyName}</DataRow>
              <DataRow label={t('customers.form.jobPosition')}>{customer.jobPosition}</DataRow>
              <DataRow label={t('customers.form.department')}>{customer.department}</DataRow>
              <DataRow label={t('customers.form.vatId')}>{customer.vatId}</DataRow>
              <DataRow label={t('customers.form.taxNumber')}>{customer.taxNumber}</DataRow>
              <DataRow label={t('customers.form.customerNumber')}>
                {customer.customerNumber}
              </DataRow>
              <DataRow label={t('customers.form.externalNumber')}>
                {customer.externalNumber}
              </DataRow>
              <DataRow label={t('customers.form.website')}>{customer.website}</DataRow>
              <DataRow label={t('customers.form.salutation')}>
                {customer.salutation
                  ? t(`customers.salutationOpt.${customer.salutation}` as never)
                  : null}
              </DataRow>
              <DataRow label={t('customers.form.dateOfBirth')}>
                {customer.dateOfBirth
                  ? formatDateTime(customer.dateOfBirth, bcp47, { dateStyle: 'medium' })
                  : null}
              </DataRow>
              <DataRow label={t('customers.form.language')}>
                {customer.language ? t(`customers.lang.${customer.language}` as never) : null}
              </DataRow>
              <DataRow label={t('customers.form.preferredChannel')}>
                {customer.preferredChannel
                  ? t(`customers.channel.${customer.preferredChannel}` as never)
                  : null}
              </DataRow>
              <DataRow label={t('customers.form.defaultPaymentTerms')}>
                {customer.defaultPaymentTermsDays != null
                  ? String(customer.defaultPaymentTermsDays)
                  : null}
              </DataRow>
            </dl>

            <div className="flex items-center justify-between border-t border-border pt-3 text-xs">
              <span className="text-muted-foreground">{t('customers.form.marketingOptIn')}</span>
              <Badge variant={customer.marketingOptIn ? 'success' : 'secondary'}>
                {customer.marketingOptIn ? t('common.yes') : t('common.no')}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('customers.newsletterStatus')}</span>
              <StatusBadge
                label={t(`customers.newsletterState.${stats.newsletterStatus}` as never)}
                tone={NEWSLETTER_TONE[stats.newsletterStatus]}
              />
            </div>
            {customer.internalNotes ? (
              <div className="border-t border-border pt-3">
                <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('customers.form.internalNotes')}
                </p>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {customer.internalNotes}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Tabs defaultValue="addresses" className="min-w-0">
          <TabsList className="flex-wrap">
            <TabsTrigger value="addresses" className="gap-1.5">
              {t('customers.tab.addresses')}
              <CountChip n={addresses.length} />
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5">
              {t('customers.tab.orders')}
              <CountChip n={stats.orders} />
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-1.5">
              {t('customers.tab.invoices')}
              <CountChip n={stats.invoices} />
            </TabsTrigger>
            <TabsTrigger value="inquiries" className="gap-1.5">
              {t('customers.tab.inquiries')}
              <CountChip n={stats.inquiries} />
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-1.5">
              {t('customers.tab.contacts')}
              <CountChip n={stats.contacts} />
            </TabsTrigger>
            <TabsTrigger value="newsletter" className="gap-1.5">
              {t('customers.tab.newsletter')}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="addresses" className="mt-4">
            <CustomerAddresses slug={slug} customerId={customer.id} addresses={addresses} />
          </TabsContent>
          <TabsContent value="orders" className="mt-4">
            <OrdersList orders={orders} bcp47={bcp47} t={t} />
          </TabsContent>
          <TabsContent value="invoices" className="mt-4">
            <InvoicesList invoices={invoices} bcp47={bcp47} t={t} />
          </TabsContent>
          <TabsContent value="inquiries" className="mt-4">
            <InquiriesList inquiries={inquiries} bcp47={bcp47} t={t} />
          </TabsContent>
          <TabsContent value="contacts" className="mt-4">
            <ContactsList contacts={contacts} bcp47={bcp47} t={t} />
          </TabsContent>
          <TabsContent value="newsletter" className="mt-4">
            <NewsletterPanel
              status={stats.newsletterStatus}
              subscribedAt={newsletter?.createdAt ?? null}
              bcp47={bcp47}
              t={t}
            />
          </TabsContent>
        </Tabs>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setConfirmingDelete(false);
        }}
        title={t('customers.confirmDeleteTitle')}
        description={t('customers.confirmDeleteBody', { email: customer.email })}
        confirmLabel={t('customers.delete')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}

function BackLink({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <Link
      to="/customers"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      {t('customers.backToList')}
    </Link>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'danger';
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={cn(
          'mt-1 font-serif text-xl font-semibold tabular-nums',
          tone === 'danger' ? 'text-destructive' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function ProfileRow({ icon, value }: { icon: React.ReactNode; value: string | null }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="text-muted-foreground" aria-hidden="true">
        {icon}
      </span>
      <span className={cn('min-w-0 break-words', !value && 'text-muted-foreground')}>
        {value || '—'}
      </span>
    </div>
  );
}

/** Label/value pair of the profile card — hidden entirely when there's no value. */
function DataRow({ label, children }: { label: string; children: React.ReactNode }) {
  if (children == null || children === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-right text-foreground">{children}</dd>
    </div>
  );
}

function CountChip({ n }: { n: number }) {
  return (
    <span className="rounded-md bg-muted-foreground/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
      {n}
    </span>
  );
}

function SectionEmpty({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
      <span className="opacity-50">{icon}</span>
      {message}
    </div>
  );
}

function OrdersList({
  orders,
  bcp47,
  t,
}: {
  orders: OrderRow[];
  bcp47: string;
  t: ReturnType<typeof useT>;
}) {
  if (orders.length === 0) {
    return (
      <SectionEmpty icon={<Briefcase className="size-6" />} message={t('customers.noOrders')} />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableBody>
          {orders.map((o) => (
            <TableRow key={o.id}>
              <TableCell>
                <p className="font-medium text-foreground">{o.orderNumber || `#${o.id}`}</p>
                <p className="text-xs text-muted-foreground">{o.kind}</p>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{o.status}</Badge>
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(o.totalCents / 100, o.currency, bcp47)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                {formatDateTime(o.createdAt, bcp47, { dateStyle: 'short' })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Invoices billed to this customer — row click opens the invoice detail page. */
function InvoicesList({
  invoices,
  bcp47,
  t,
}: {
  invoices: InvoiceRow[];
  bcp47: string;
  t: ReturnType<typeof useT>;
}) {
  if (invoices.length === 0) {
    return (
      <SectionEmpty icon={<FileText className="size-6" />} message={t('customers.noInvoices')} />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableBody>
          {invoices.map((i) => (
            <TableRow key={i.id} className="cursor-pointer">
              <TableCell>
                <Link to={`/rechnungen/${i.id}`} className="block hover:underline">
                  <p className="font-medium tabular-nums text-foreground">
                    {i.number ?? t('invoices.status.draft')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {i.subject || i.recipientName}
                    {i.orderId ? ` · #${i.orderId}` : ''}
                  </p>
                </Link>
              </TableCell>
              <TableCell>
                <StatusBadge
                  label={t(`invoices.status.${i.status}` as never)}
                  tone={INVOICE_STATUS_TONE[i.status]}
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {formatCurrency(i.totalCents / 100, i.currency, bcp47)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                {formatDateTime(i.sentAt ?? i.createdAt, bcp47, { dateStyle: 'short' })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function InquiriesList({
  inquiries,
  bcp47,
  t,
}: {
  inquiries: ServiceInquiry[];
  bcp47: string;
  t: ReturnType<typeof useT>;
}) {
  if (inquiries.length === 0) {
    return (
      <SectionEmpty
        icon={<ClipboardList className="size-6" />}
        message={t('customers.noInquiries')}
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableBody>
          {inquiries.map((i) => (
            <TableRow key={i.id}>
              <TableCell>
                <p className="font-medium text-foreground">{i.service || t('customers.inquiry')}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{i.message}</p>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{i.status}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                {formatDateTime(i.createdAt, bcp47, { dateStyle: 'short' })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ContactsList({
  contacts,
  bcp47,
  t,
}: {
  contacts: ContactMessage[];
  bcp47: string;
  t: ReturnType<typeof useT>;
}) {
  if (contacts.length === 0) {
    return <SectionEmpty icon={<Mail className="size-6" />} message={t('customers.noContacts')} />;
  }
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableBody>
          {contacts.map((c) => (
            <TableRow key={c.id}>
              <TableCell>
                <p className="font-medium text-foreground">
                  {c.subject || t('customers.contactMessage')}
                </p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{c.message}</p>
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{c.status}</Badge>
              </TableCell>
              <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground">
                {formatDateTime(c.createdAt, bcp47, { dateStyle: 'short' })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function NewsletterPanel({
  status,
  subscribedAt,
  bcp47,
  t,
}: {
  status: NewsletterProfileStatus;
  subscribedAt: string | null;
  bcp47: string;
  t: ReturnType<typeof useT>;
}) {
  if (status === 'none') {
    return (
      <SectionEmpty icon={<Mail className="size-6" />} message={t('customers.noNewsletter')} />
    );
  }
  return (
    <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
      <div>
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
