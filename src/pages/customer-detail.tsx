import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  Briefcase,
  ClipboardList,
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
import { CustomerSheet } from '@/components/customer-sheet';
import { EmptyState } from '@/components/empty-state';
import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProject } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  customersAdminApi,
  errMessage,
  type ContactMessage,
  type LoyaltyTier,
  type NewsletterProfileStatus,
  type OrderRow,
  type ServiceInquiry,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, formatDateTime, formatNumber } from '@/lib/utils';

const TIER_TONE: Record<LoyaltyTier, 'neutral' | 'info' | 'success'> = {
  neukunde: 'neutral',
  stammkunde: 'info',
  premium: 'success',
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

  const [editing, setEditing] = useState(false);
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

  const { customer, orders, inquiries, contacts, newsletter, stats } = query.data;
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
            <a
              href={`mailto:${customer.email}`}
              className="text-sm text-muted-foreground hover:text-primary hover:underline"
            >
              {customer.email}
            </a>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusBadge
                label={t(`customers.tier.${customer.loyaltyTier}` as never)}
                tone={TIER_TONE[customer.loyaltyTier]}
              />
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
          <Button
            variant="outline"
            size="sm"
            className="h-11 sm:h-9"
            onClick={() => setEditing(true)}
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            {t('customers.edit')}
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

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('customers.stat.orders')} value={formatNumber(stats.orders, bcp47)} />
        <StatCard
          label={t('customers.stat.lifetimeSpend')}
          value={formatCurrency(stats.lifetimeSpentCents / 100, 'EUR', bcp47)}
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
            <ProfileRow icon={<Mail className="size-4" />} value={customer.email} />
            <ProfileRow icon={<Phone className="size-4" />} value={customer.phone} />
            <ProfileRow icon={<MapPin className="size-4" />} value={fullAddress || null} />
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

        <Tabs defaultValue="orders" className="min-w-0">
          <TabsList className="flex-wrap">
            <TabsTrigger value="orders" className="gap-1.5">
              {t('customers.tab.orders')}
              <CountChip n={stats.orders} />
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

          <TabsContent value="orders" className="mt-4">
            <OrdersList orders={orders} bcp47={bcp47} t={t} />
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

      {editing ? (
        <CustomerSheet
          slug={slug}
          editing={customer}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void queryClient.invalidateQueries({ queryKey: ['customer-overview', slug, id] });
            void queryClient.invalidateQueries({ queryKey: ['customers', slug] });
          }}
        />
      ) : null}

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

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-xl font-semibold tabular-nums text-foreground">{value}</p>
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
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {orders.map((o) => (
            <tr key={o.id} className="hover:bg-muted/40">
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{o.orderNumber || `#${o.id}`}</p>
                <p className="text-xs text-muted-foreground">{o.kind}</p>
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary">{o.status}</Badge>
              </td>
              <td className="px-4 py-3 text-right tabular-nums">
                {formatCurrency(o.totalCents / 100, o.currency, bcp47)}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">
                {formatDateTime(o.createdAt, bcp47, { dateStyle: 'short' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {inquiries.map((i) => (
            <tr key={i.id} className="hover:bg-muted/40">
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">{i.service || t('customers.inquiry')}</p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{i.message}</p>
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary">{i.status}</Badge>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">
                {formatDateTime(i.createdAt, bcp47, { dateStyle: 'short' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
      <table className="w-full text-sm">
        <tbody className="divide-y divide-border">
          {contacts.map((c) => (
            <tr key={c.id} className="hover:bg-muted/40">
              <td className="px-4 py-3">
                <p className="font-medium text-foreground">
                  {c.subject || t('customers.contactMessage')}
                </p>
                <p className="line-clamp-1 text-xs text-muted-foreground">{c.message}</p>
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary">{c.status}</Badge>
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-muted-foreground">
                {formatDateTime(c.createdAt, bcp47, { dateStyle: 'short' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
