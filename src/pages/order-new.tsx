import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { EmptyState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Combobox, Select, type SelectOptionGroup } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT, type DictKey } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  catalogApi,
  customersAdminApi,
  errMessage,
  ordersAdminApi,
  type OrderCreateInput,
  type OrderKind,
} from '@/lib/api';
import { useDebounced } from '@/lib/use-debounced';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatCurrency, isNonContactableEmail } from '@/lib/utils';
import { KIND_LABEL, readOrderNavState } from '@/pages/orders-shared';

type PickupMode = NonNullable<OrderCreateInput['pickupMode']>;

const PICKUP_LABEL: Record<PickupMode, DictKey> = {
  drop_off: 'orders.create.pickupModes.dropOff',
  pickup: 'orders.create.pickupModes.pickup',
  onsite: 'orders.create.pickupModes.onsite',
};

// Written into the quantity label (order + customer documents): German data, not UI copy.
const UNIT_SUFFIX: Record<string, string> = {
  qm: 'm²',
  lfdm: 'lfdm',
  stueck: 'Stück',
  bracket: 'Pauschale',
};

const ITEM_GRID = 'sm:grid-cols-[minmax(0,1fr)_6.5rem_5rem_6.5rem_6rem_2rem]';

interface ItemRow {
  label: string;
  quantityLabel: string;
  quantity: string;
  unitPrice: string; // euros, as typed
}

interface CatalogOption {
  group: string;
  /** Tier (and bracket) within the group, shown in the picker. */
  name: string;
  label: string;
  unitPriceCents: number;
  quantityLabel: string;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  kind: OrderKind;
  items: ItemRow[];
  pickupMode: PickupMode;
  line1: string;
  postalCode: string;
  city: string;
  preferredDate: string;
  customerNotes: string;
  internalNotes: string;
}

const emptyRow: ItemRow = { label: '', quantityLabel: '1', quantity: '1', unitPrice: '' };

const INITIAL: FormState = {
  name: '',
  email: '',
  phone: '',
  kind: 'teppichreinigung',
  items: [emptyRow],
  pickupMode: 'drop_off',
  line1: '',
  postalCode: '',
  city: '',
  preferredDate: '',
  customerNotes: '',
  internalNotes: '',
};
const INITIAL_JSON = JSON.stringify(INITIAL);

function toNum(s: string): number {
  const n = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function rowCents(r: ItemRow): number {
  return Math.round(toNum(r.quantity) * Math.round(toNum(r.unitPrice) * 100));
}

function isBlankRow(r: ItemRow): boolean {
  return r.label.trim() === '' && r.unitPrice.trim() === '';
}

export function OrderNewPage() {
  const t = useT();
  const { bcp47 } = useLocale();
  const { activeProject, isAllBrands } = useProject();
  const canWrite = useCanWrite();
  const companySlug = activeProject.companySlug;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const from = readOrderNavState(location.state).from ?? '';
  usePageTitle(t('orders.newOrder'));

  const [form, setForm] = useState<FormState>(INITIAL);
  const [customerSearch, setCustomerSearch] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== INITIAL_JSON;
  const { blocker, allowLeave } = useLeaveGuard(dirty);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const eur = (cents: number) => formatCurrency(cents / 100, 'EUR', bcp47);

  const search = useDebounced(customerSearch.trim(), 300);
  const customersQuery = useQuery({
    queryKey: ['customers-pick', companySlug, search],
    queryFn: ({ signal }) => customersAdminApi.list(companySlug, { q: search, limit: 6 }, signal),
    enabled: !isAllBrands && search !== '',
  });
  const catalogQuery = useQuery({
    queryKey: ['catalog', companySlug],
    queryFn: ({ signal }) => catalogApi.forBrand(companySlug, signal),
    enabled: !isAllBrands,
  });

  const catalogOptions = useMemo<CatalogOption[]>(() => {
    const out: CatalogOption[] = [];
    for (const s of catalogQuery.data?.services ?? []) {
      const suffix = UNIT_SUFFIX[s.unit] ?? '';
      if (s.unit === 'bracket' && s.brackets) {
        for (const tier of s.tiers) {
          for (const b of s.brackets) {
            const price = b.pricesCents[tier.code];
            if (price == null) continue;
            out.push({
              group: s.label,
              name: `${tier.label} · ${b.label}`,
              label: `${s.label} · ${tier.label} · ${b.label}`,
              unitPriceCents: price,
              quantityLabel: 'Pauschale',
            });
          }
        }
      } else {
        for (const tier of s.tiers) {
          out.push({
            group: s.label,
            name: tier.label,
            label: `${s.label} · ${tier.label}`,
            unitPriceCents: tier.unitPriceCents,
            quantityLabel: `1 ${suffix}`.trim(),
          });
        }
      }
    }
    return out;
  }, [catalogQuery.data]);

  const catalogGroups = useMemo<SelectOptionGroup[]>(() => {
    const groups = new Map<string, SelectOptionGroup>();
    catalogOptions.forEach((o, i) => {
      const group = groups.get(o.group) ?? { label: o.group, options: [] };
      group.options.push({
        value: String(i),
        label: o.name,
        meta: formatCurrency(o.unitPriceCents / 100, 'EUR', bcp47),
      });
      groups.set(o.group, group);
    });
    return [...groups.values()];
  }, [catalogOptions, bcp47]);

  const customerMatches = search ? (customersQuery.data?.customers ?? []) : [];
  const noCustomerMatch = search !== '' && customersQuery.isSuccess && customerMatches.length === 0;

  const totalCents = form.items.reduce((sum, r) => sum + rowCents(r), 0);
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());
  const showEmailError = form.email.trim() !== '' && !emailValid;
  const hasValidItem = form.items.some((r) => r.label.trim() !== '' && toNum(r.quantity) > 0);
  // The address is optional, but a partial one would be dropped silently on submit.
  const addressStarted = [form.line1, form.postalCode, form.city].some((v) => v.trim() !== '');
  const postalValid = /^\d{5}$/.test(form.postalCode.trim());
  const addressError = addressStarted
    ? !postalValid
      ? t('orders.create.postalCodeInvalid')
      : !form.line1.trim() || !form.city.trim()
        ? t('orders.create.addressIncomplete')
        : null
    : null;
  const canSubmit = form.name.trim() !== '' && emailValid && hasValidItem && !addressError;

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setForm((f) => ({
      ...f,
      items: f.items.map((r, idx) => (idx === i ? { ...r, ...patch } : r)),
    }));
  }

  function addCatalogOption(idx: number) {
    const opt = catalogOptions[idx];
    if (!opt) return;
    const row: ItemRow = {
      label: opt.label,
      quantityLabel: opt.quantityLabel,
      quantity: '1',
      unitPrice: (opt.unitPriceCents / 100).toFixed(2),
    };
    // The untouched starter row is replaced instead of left empty above the pick.
    setForm((f) => ({
      ...f,
      items: f.items.length === 1 && isBlankRow(f.items[0]!) ? [row] : [...f.items, row],
    }));
  }

  const create = useMutation({
    mutationFn: () => {
      const payload: OrderCreateInput = {
        kind: form.kind,
        customer: { name: form.name.trim(), email: form.email.trim() },
        items: form.items
          .filter((r) => r.label.trim() !== '' && toNum(r.quantity) > 0)
          .map((r) => ({
            label: r.label.trim(),
            quantityLabel: r.quantityLabel.trim() || '1',
            quantity: toNum(r.quantity),
            unitPriceCents: Math.round(toNum(r.unitPrice) * 100),
          })),
        pickupMode: form.pickupMode,
      };
      if (form.phone.trim()) payload.customer.phone = form.phone.trim();
      if (addressStarted) {
        payload.address = {
          line1: form.line1.trim(),
          city: form.city.trim(),
          postalCode: form.postalCode.trim(),
          country: 'DE',
        };
      }
      if (form.preferredDate) payload.preferredDate = form.preferredDate;
      if (form.customerNotes.trim()) payload.customerNotes = form.customerNotes.trim();
      if (form.internalNotes.trim()) payload.internalNotes = form.internalNotes.trim();
      return ordersAdminApi.create(companySlug, payload);
    },
    onSuccess: ({ order }) => {
      toast.success(
        order.orderNumber
          ? t('orders.create.created', { number: order.orderNumber })
          : t('orders.create.createdNoNumber'),
      );
      void queryClient.invalidateQueries({ queryKey: ['orders-infinite'], exact: false });
      allowLeave();
      navigate(`/auftraege/${order.id}`, { replace: true, state: { from } });
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  const breadcrumb = [
    { label: activeProject.name },
    { label: t('orders.title'), to: `/auftraege${from}` },
    { label: t('orders.newOrder') },
  ];

  if (isAllBrands || !canWrite) {
    return (
      <PageContainer width="narrow">
        <PageHeading title={t('orders.newOrder')} breadcrumb={breadcrumb} />
        <EmptyState
          variant="dashed"
          icon={<Inbox aria-hidden="true" />}
          message={isAllBrands ? t('orders.pickBrandFirst') : t('orders.create.noPermission')}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeading
        title={t('orders.newOrder')}
        subtitle={t('orders.create.description')}
        breadcrumb={breadcrumb}
      />

      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          if (!canSubmit) return;
          create.mutate();
        }}
      >
        <SectionCard as="fieldset" title={t('orders.section.customer')} bodyClassName="space-y-4">
          <FormField label={t('orders.create.searchCustomer')} hint={t('orders.create.searchHint')}>
            <Input
              type="search"
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder={t('orders.create.searchPlaceholder')}
              autoComplete="off"
            />
          </FormField>
          {customerMatches.length > 0 ? (
            <ul
              className="flex flex-col gap-0.5 rounded-md border border-border bg-muted/40 p-1"
              aria-label={t('orders.create.matches')}
            >
              {customerMatches.map((c) => {
                // Imported customers can carry a placeholder address that never receives mail.
                const email = isNonContactableEmail(c.email) ? '' : c.email;
                const title = c.name || c.phone || email || t('orders.unknownCustomer');
                const detail = [email, c.phone && c.phone !== title ? c.phone : null]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-label={t('orders.create.pickCustomer', { name: title, email: detail })}
                      className="flex min-h-11 w-full flex-col justify-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        setForm((f) => ({
                          ...f,
                          name: c.name ?? '',
                          email,
                          phone: c.phone ?? '',
                          line1: c.addressLine1 || f.line1,
                          postalCode: c.postalCode || f.postalCode,
                          city: c.city || f.city,
                        }));
                        setCustomerSearch('');
                      }}
                    >
                      <span className="font-medium">{title}</span>
                      {detail ? (
                        <span className="text-xs text-muted-foreground">{detail}</span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {noCustomerMatch ? (
            <p className="text-xs text-muted-foreground">{t('orders.create.noMatch')}</p>
          ) : null}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t('orders.create.name')} required>
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                autoComplete="name"
              />
            </FormField>
            <FormField
              label={t('orders.create.email')}
              required
              error={showEmailError ? t('orders.create.emailInvalid') : undefined}
            >
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                autoComplete="email"
              />
            </FormField>
            <FormField label={t('orders.create.phone')}>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                autoComplete="tel"
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard as="fieldset" title={t('orders.create.service')} bodyClassName="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t('orders.create.kind')}>
              <Select<OrderKind>
                value={form.kind}
                onValueChange={(v) => set('kind', v)}
                options={(Object.keys(KIND_LABEL) as OrderKind[]).map((k) => ({
                  value: k,
                  label: t(KIND_LABEL[k]),
                }))}
              />
            </FormField>
            <FormField
              label={t('orders.create.fromCatalog')}
              hint={t('orders.create.fromCatalogHint')}
            >
              <Combobox
                value=""
                disabled={catalogOptions.length === 0}
                onValueChange={(v) => addCatalogOption(Number(v))}
                options={catalogGroups}
                triggerIcon={<Plus aria-hidden="true" />}
                placeholder={
                  catalogQuery.isLoading ? t('common.loading') : t('orders.create.catalogPick')
                }
                searchPlaceholder={t('orders.create.catalogSearch')}
              />
            </FormField>
          </div>

          <div className="flex flex-col gap-3 sm:gap-2">
            <div
              aria-hidden="true"
              className={cn(
                'hidden gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid',
                ITEM_GRID,
              )}
            >
              <span>{t('orders.create.itemLabel')}</span>
              <span>{t('orders.create.itemQuantityLabel')}</span>
              <span>{t('orders.create.itemQuantity')}</span>
              <span>{t('orders.create.itemPrice')}</span>
              <span className="text-right">{t('orders.create.itemTotal')}</span>
              <span />
            </div>
            {form.items.map((r, i) => (
              <div
                key={i}
                className={cn(
                  'grid grid-cols-3 items-end gap-2 rounded-lg border border-border p-3 sm:items-center sm:rounded-none sm:border-0 sm:p-0',
                  ITEM_GRID,
                )}
              >
                <MobileLabel className="col-span-3">{t('orders.create.itemLabel')}</MobileLabel>
                <Input
                  value={r.label}
                  onChange={(e) => updateItem(i, { label: e.target.value })}
                  placeholder={t('orders.create.itemLabelPlaceholder')}
                  aria-label={t('orders.create.itemLabelAria', { n: i + 1 })}
                  className="col-span-3 -mt-1 sm:col-span-1 sm:mt-0"
                />
                <label className="flex flex-col gap-1 sm:contents">
                  <MobileLabel>{t('orders.create.itemQuantityLabel')}</MobileLabel>
                  <Input
                    value={r.quantityLabel}
                    onChange={(e) => updateItem(i, { quantityLabel: e.target.value })}
                    placeholder="5 m²"
                    aria-label={t('orders.create.itemQuantityLabelAria', { n: i + 1 })}
                  />
                </label>
                <label className="flex flex-col gap-1 sm:contents">
                  <MobileLabel>{t('orders.create.itemQuantity')}</MobileLabel>
                  <Input
                    inputMode="decimal"
                    value={r.quantity}
                    onChange={(e) => updateItem(i, { quantity: e.target.value })}
                    aria-label={t('orders.create.itemQuantityAria', { n: i + 1 })}
                    className="tabular-nums"
                  />
                </label>
                <label className="flex flex-col gap-1 sm:contents">
                  <MobileLabel>{t('orders.create.itemPrice')}</MobileLabel>
                  <Input
                    inputMode="decimal"
                    value={r.unitPrice}
                    onChange={(e) => updateItem(i, { unitPrice: e.target.value })}
                    placeholder="0,00"
                    aria-label={t('orders.create.itemPriceAria', { n: i + 1 })}
                    className="tabular-nums"
                  />
                </label>
                <span className="col-span-2 text-sm font-medium tabular-nums sm:col-span-1 sm:text-right">
                  <span className="text-muted-foreground sm:sr-only">
                    {t('orders.create.itemTotal')}:{' '}
                  </span>
                  {eur(rowCents(r))}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="justify-self-end"
                  aria-label={t('orders.create.removeItem', { n: i + 1 })}
                  disabled={form.items.length === 1}
                  onClick={() =>
                    setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))
                  }
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm((f) => ({ ...f, items: [...f.items, { ...emptyRow }] }))}
              >
                <Plus aria-hidden="true" />
                {t('orders.create.addItem')}
              </Button>
              <p className="text-sm" aria-live="polite">
                {t('orders.total')}:{' '}
                <span className="font-semibold tabular-nums">{eur(totalCents)}</span>
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard as="fieldset" title={t('orders.create.logistics')} bodyClassName="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={t('orders.create.pickupMode')}>
              <Select<PickupMode>
                value={form.pickupMode}
                onValueChange={(v) => set('pickupMode', v)}
                options={(Object.keys(PICKUP_LABEL) as PickupMode[]).map((m) => ({
                  value: m,
                  label: t(PICKUP_LABEL[m]),
                }))}
              />
            </FormField>
            <FormField label={t('orders.create.preferredDate')}>
              <DatePicker
                value={form.preferredDate}
                onValueChange={(v) => set('preferredDate', v)}
              />
            </FormField>
          </div>
          <FormField label={t('orders.create.address')} hint={t('orders.create.addressHint')}>
            <AddressAutocomplete
              value={form.line1}
              onChange={(v) => set('line1', v)}
              onPick={(a) =>
                setForm((f) => ({
                  ...f,
                  postalCode: a.postcode || f.postalCode,
                  city: a.city || f.city,
                }))
              }
              placeholder={t('orders.create.addressPlaceholder')}
            />
          </FormField>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4">
            <FormField
              label={t('orders.create.postalCode')}
              error={addressStarted && !postalValid ? addressError : undefined}
            >
              <Input
                value={form.postalCode}
                onChange={(e) => set('postalCode', e.target.value)}
                inputMode="numeric"
                autoComplete="postal-code"
              />
            </FormField>
            <FormField
              label={t('orders.create.city')}
              error={addressError && postalValid ? addressError : undefined}
            >
              <Input
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                autoComplete="address-level2"
              />
            </FormField>
          </div>
        </SectionCard>

        <SectionCard as="fieldset" title={t('orders.create.notes')} bodyClassName="space-y-4">
          <FormField label={t('orders.create.customerNotes')}>
            <Textarea
              value={form.customerNotes}
              onChange={(e) => set('customerNotes', e.target.value)}
              rows={3}
            />
          </FormField>
          <FormField label={t('orders.create.internalNotes')}>
            <Textarea
              value={form.internalNotes}
              onChange={(e) => set('internalNotes', e.target.value)}
              rows={3}
            />
          </FormField>
        </SectionCard>

        {formError ? <Alert tone="destructive">{formError}</Alert> : null}

        <FormActionBar>
          <p className="mr-auto text-sm">
            {canSubmit ? (
              <>
                {t('orders.total')}:{' '}
                <span className="font-semibold tabular-nums">{eur(totalCents)}</span>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {addressError ?? t('orders.create.requirements')}
              </span>
            )}
          </p>
          <Button type="button" variant="ghost" asChild>
            <Link to={`/auftraege${from}`}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" disabled={!canSubmit} loading={create.isPending}>
            <Plus aria-hidden="true" />
            {t('orders.create.submit')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}

/** Visible field caption below sm, where the column header row is hidden; inputs keep their aria-label. */
function MobileLabel({ children, className }: { children: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('text-xs font-medium text-muted-foreground sm:hidden', className)}
    >
      {children}
    </span>
  );
}
