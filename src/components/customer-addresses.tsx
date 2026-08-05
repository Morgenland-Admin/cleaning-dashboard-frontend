import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FormField } from '@/components/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type CompanySlug } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import {
  customersAdminApi,
  errMessage,
  type CustomerAddress,
  type CustomerAddressInput,
  type CustomerAddressKind,
} from '@/lib/api';

const KINDS: CustomerAddressKind[] = ['billing', 'service', 'shipping'];

interface AddressForm {
  kind: CustomerAddressKind;
  label: string;
  name: string;
  company: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  city: string;
  country: string;
  phone: string;
  notes: string;
}

const EMPTY: AddressForm = {
  kind: 'billing',
  label: '',
  name: '',
  company: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  country: 'DE',
  phone: '',
  notes: '',
};

function toForm(address: CustomerAddress): AddressForm {
  return {
    kind: address.kind,
    label: address.label ?? '',
    name: address.name ?? '',
    company: address.company ?? '',
    addressLine1: address.addressLine1 ?? '',
    addressLine2: address.addressLine2 ?? '',
    postalCode: address.postalCode ?? '',
    city: address.city ?? '',
    country: address.country ?? 'DE',
    phone: address.phone ?? '',
    notes: address.notes ?? '',
  };
}

function toPayload(form: AddressForm): CustomerAddressInput {
  const country = form.country.trim().toUpperCase();
  return {
    kind: form.kind,
    label: form.label,
    name: form.name,
    company: form.company,
    addressLine1: form.addressLine1,
    addressLine2: form.addressLine2,
    postalCode: form.postalCode,
    city: form.city,
    country: country.length === 2 ? country : null,
    phone: form.phone,
    notes: form.notes,
  };
}

/**
 * Addresses of one customer — billing, service and shipping. The default address
 * is mirrored onto the customer record and is what invoices and exports use, so
 * promoting another address is an explicit action.
 */
export function CustomerAddresses({
  slug,
  customerId,
  addresses,
}: {
  slug: CompanySlug;
  customerId: number;
  addresses: CustomerAddress[];
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<CustomerAddress | 'new' | null>(null);
  const [confirming, setConfirming] = useState<CustomerAddress | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['customer-overview', slug, customerId] });
    void queryClient.invalidateQueries({ queryKey: ['customers', slug] });
  }

  const setDefault = useMutation({
    mutationFn: (address: CustomerAddress) =>
      customersAdminApi.setDefaultAddress(slug, customerId, address.id),
    onSuccess: refresh,
    onError: (err) => toast.error(errMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (address: CustomerAddress) =>
      customersAdminApi.deleteAddress(slug, customerId, address.id),
    onSuccess: () => {
      setConfirming(null);
      refresh();
    },
    onError: (err) => {
      setConfirming(null);
      toast.error(errMessage(err));
    },
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{t('customers.addresses.defaultHint')}</p>
        <Button size="sm" className="h-11 sm:h-9" onClick={() => setEditing('new')}>
          <Plus className="size-3.5" aria-hidden="true" />
          {t('customers.addresses.add')}
        </Button>
      </div>

      {addresses.length === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
          <MapPin className="size-6 opacity-50" aria-hidden="true" />
          {t('customers.addresses.none')}
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {addresses.map((address) => (
            <li
              key={address.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">
                    {t(`customers.addresses.kind.${address.kind}` as never)}
                  </Badge>
                  {address.isDefault ? (
                    <Badge variant="success">{t('customers.addresses.default')}</Badge>
                  ) : null}
                  {address.label ? (
                    <span className="text-xs text-muted-foreground">{address.label}</span>
                  ) : null}
                </div>
                <div className="text-sm text-foreground">
                  {address.company ? <p className="font-medium">{address.company}</p> : null}
                  {address.name ? <p>{address.name}</p> : null}
                  {address.addressLine1 ? <p>{address.addressLine1}</p> : null}
                  {address.addressLine2 ? <p>{address.addressLine2}</p> : null}
                  <p>{[address.postalCode, address.city].filter(Boolean).join(' ')}</p>
                  {address.country ? <p>{address.country}</p> : null}
                  {address.phone ? <p className="text-muted-foreground">{address.phone}</p> : null}
                </div>
                {address.notes ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
                    {address.notes}
                  </p>
                ) : null}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {address.isDefault ? null : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9"
                    onClick={() => setDefault.mutate(address)}
                    disabled={setDefault.isPending}
                  >
                    {setDefault.isPending && setDefault.variables?.id === address.id ? (
                      <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Star className="size-3.5" aria-hidden="true" />
                    )}
                    {t('customers.addresses.makeDefault')}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditing(address)}
                  aria-label={t('customers.addresses.edit')}
                  title={t('customers.addresses.edit')}
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setConfirming(address)}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t('customers.addresses.confirmDeleteTitle')}
                  title={t('customers.addresses.confirmDeleteTitle')}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <AddressDialog
          slug={slug}
          customerId={customerId}
          address={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refresh();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={!!confirming}
        onOpenChange={(open) => {
          if (!open && !remove.isPending) setConfirming(null);
        }}
        title={t('customers.addresses.confirmDeleteTitle')}
        description={t('customers.addresses.confirmDeleteBody')}
        confirmLabel={t('customers.delete')}
        cancelLabel={t('common.cancel')}
        isDangerous
        isPending={remove.isPending}
        onConfirm={() => {
          if (confirming) remove.mutate(confirming);
        }}
      />
    </div>
  );
}

function AddressDialog({
  slug,
  customerId,
  address,
  onClose,
  onSaved,
}: {
  slug: CompanySlug;
  customerId: number;
  address: CustomerAddress | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [form, setForm] = useState<AddressForm>(address ? toForm(address) : EMPTY);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof AddressForm>(key: K, value: AddressForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const save = useMutation({
    mutationFn: () => {
      const payload = toPayload(form);
      if (address) return customersAdminApi.updateAddress(slug, customerId, address.id, payload);
      return customersAdminApi.createAddress(slug, customerId, payload);
    },
    onSuccess: onSaved,
    onError: (err) => setError(errMessage(err)),
  });

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>
          {address ? t('customers.addresses.edit') : t('customers.addresses.add')}
        </DialogTitle>
        <DialogDescription>{t('customers.addresses.subtitle')}</DialogDescription>

        <form
          className="mt-3 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('customers.addresses.fieldKind')}>
              <Select
                value={form.kind}
                onChange={(e) => set('kind', e.target.value as CustomerAddressKind)}
                className="h-11 sm:h-9"
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {t(`customers.addresses.kind.${kind}` as never)}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField
              label={t('customers.addresses.fieldLabel')}
              hint={t('customers.addresses.fieldLabelHint')}
            >
              <Input
                value={form.label}
                onChange={(e) => set('label', e.target.value)}
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.addresses.fieldCompany')}>
              <Input
                value={form.company}
                onChange={(e) => set('company', e.target.value)}
                autoComplete="organization"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.addresses.fieldName')}>
              <Input
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                autoComplete="name"
                className="h-11 sm:h-9"
              />
            </FormField>
          </div>

          <FormField label={t('customers.form.addressLine1')}>
            <AddressAutocomplete
              value={form.addressLine1}
              onChange={(value) => set('addressLine1', value)}
              onPick={(a) => {
                setForm((prev) => ({
                  ...prev,
                  postalCode: a.postcode ?? prev.postalCode,
                  city: a.city ?? prev.city,
                }));
              }}
              className="h-11 sm:h-9"
            />
          </FormField>
          <FormField label={t('customers.form.addressLine2')}>
            <Input
              value={form.addressLine2}
              onChange={(e) => set('addressLine2', e.target.value)}
              autoComplete="address-line2"
              className="h-11 sm:h-9"
            />
          </FormField>
          <div className="grid grid-cols-[1fr_2fr_auto] gap-3">
            <FormField label={t('customers.form.postalCode')}>
              <Input
                value={form.postalCode}
                onChange={(e) => set('postalCode', e.target.value)}
                autoComplete="postal-code"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.city')}>
              <Input
                value={form.city}
                onChange={(e) => set('city', e.target.value)}
                autoComplete="address-level2"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.country')}>
              <Input
                value={form.country}
                onChange={(e) => set('country', e.target.value)}
                maxLength={2}
                className="h-11 w-16 uppercase sm:h-9"
              />
            </FormField>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('customers.form.phone')}>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                autoComplete="tel"
                className="h-11 sm:h-9"
              />
            </FormField>
          </div>
          <FormField label={t('customers.addresses.fieldNotes')}>
            <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
          </FormField>

          {error ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" className="h-11 sm:h-9">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" className="h-11 sm:h-9" disabled={save.isPending}>
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t('customers.form.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
