import { useMutation } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { type CompanySlug } from '@/contexts/project-context';
import { useT } from '@/i18n';
import {
  customersAdminApi,
  errMessage,
  type Customer,
  type CustomerCreateInput,
  type CustomerUpdateInput,
  type LoyaltyTier,
} from '@/lib/api';

const TIERS: LoyaltyTier[] = ['neukunde', 'stammkunde', 'premium'];

/** Create / edit form for a customer, shared by the list and detail pages. */
export function CustomerSheet({
  slug,
  editing,
  onClose,
  onSaved,
}: {
  slug: CompanySlug;
  editing: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}) {
  const t = useT();
  const isEdit = editing != null;

  const [email, setEmail] = useState(editing?.email ?? '');
  const [name, setName] = useState(editing?.name ?? '');
  const [phone, setPhone] = useState(editing?.phone ?? '');
  const [addressLine1, setAddressLine1] = useState(editing?.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(editing?.addressLine2 ?? '');
  const [postalCode, setPostalCode] = useState(editing?.postalCode ?? '');
  const [city, setCity] = useState(editing?.city ?? '');
  const [country, setCountry] = useState(editing?.country ?? 'DE');
  const [loyaltyTier, setLoyaltyTier] = useState<LoyaltyTier>(editing?.loyaltyTier ?? 'neukunde');
  const [tags, setTags] = useState((editing?.tags ?? []).join(', '));
  const [internalNotes, setInternalNotes] = useState(editing?.internalNotes ?? '');
  const [marketingOptIn, setMarketingOptIn] = useState(editing?.marketingOptIn ?? false);
  const [defaultPaymentTermsDays, setDefaultPaymentTermsDays] = useState(
    editing?.defaultPaymentTermsDays != null ? String(editing.defaultPaymentTermsDays) : '',
  );
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const tagsArr = tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const cc = country.trim().toUpperCase();
      const termRaw = defaultPaymentTermsDays.trim();
      const termParsed = termRaw === '' ? null : Number(termRaw);
      const defaultTerm =
        termParsed != null && Number.isFinite(termParsed) ? Math.round(termParsed) : null;

      if (editing) {
        const patch: CustomerUpdateInput = {
          email: email.trim(),
          name: name.trim() === '' ? null : name.trim(),
          phone: phone.trim() === '' ? null : phone.trim(),
          addressLine1: addressLine1.trim() === '' ? null : addressLine1.trim(),
          addressLine2: addressLine2.trim() === '' ? null : addressLine2.trim(),
          postalCode: postalCode.trim() === '' ? null : postalCode.trim(),
          city: city.trim() === '' ? null : city.trim(),
          country: cc.length === 2 ? cc : null,
          loyaltyTier,
          tags: tagsArr,
          internalNotes: internalNotes.trim() === '' ? null : internalNotes.trim(),
          marketingOptIn,
          defaultPaymentTermsDays: defaultTerm,
        };
        return customersAdminApi.update(slug, editing.id, patch);
      }

      const payload: CustomerCreateInput = {
        email: email.trim(),
        loyaltyTier,
        tags: tagsArr,
        marketingOptIn,
      };
      if (name.trim()) payload.name = name.trim();
      if (phone.trim()) payload.phone = phone.trim();
      if (addressLine1.trim()) payload.addressLine1 = addressLine1.trim();
      if (addressLine2.trim()) payload.addressLine2 = addressLine2.trim();
      if (postalCode.trim()) payload.postalCode = postalCode.trim();
      if (city.trim()) payload.city = city.trim();
      if (cc.length === 2) payload.country = cc;
      if (internalNotes.trim()) payload.internalNotes = internalNotes.trim();
      if (defaultTerm != null) payload.defaultPaymentTermsDays = defaultTerm;
      return customersAdminApi.create(slug, payload);
    },
    onSuccess: (res) => onSaved(res.customer),
    onError: (err) => setFormError(errMessage(err)),
  });

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-5 overflow-y-auto bg-card text-foreground sm:max-w-md"
      >
        <div>
          <SheetTitle className="not-sr-only font-serif text-xl tracking-tight">
            {isEdit ? t('customers.edit') : t('customers.newCustomer')}
          </SheetTitle>
          <SheetDescription>{t('customers.formSubtitle')}</SheetDescription>
        </div>

        <form
          className="flex flex-1 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            if (!email.trim()) return;
            mutation.mutate();
          }}
        >
          <FormField label={t('customers.form.email')} required>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="h-11 sm:h-9"
            />
          </FormField>
          <FormField label={t('customers.form.name')}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              className="h-11 sm:h-9"
            />
          </FormField>
          <FormField label={t('customers.form.phone')}>
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="tel"
              className="h-11 sm:h-9"
            />
          </FormField>

          <FormField label={t('customers.form.addressLine1')}>
            <AddressAutocomplete
              value={addressLine1}
              onChange={setAddressLine1}
              onPick={(a) => {
                if (a.postcode) setPostalCode(a.postcode);
                if (a.city) setCity(a.city);
                if (!country.trim()) setCountry('DE');
              }}
              className="h-11 sm:h-9"
            />
          </FormField>
          <FormField label={t('customers.form.addressLine2')}>
            <Input
              value={addressLine2}
              onChange={(e) => setAddressLine2(e.target.value)}
              autoComplete="address-line2"
              className="h-11 sm:h-9"
            />
          </FormField>
          <div className="grid grid-cols-[1fr_2fr_auto] gap-3">
            <FormField label={t('customers.form.postalCode')}>
              <Input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                autoComplete="postal-code"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.city')}>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                autoComplete="address-level2"
                className="h-11 sm:h-9"
              />
            </FormField>
            <FormField label={t('customers.form.country')}>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                maxLength={2}
                className="h-11 w-16 uppercase sm:h-9"
              />
            </FormField>
          </div>

          <FormField label={t('customers.form.tier')}>
            <Select
              value={loyaltyTier}
              onChange={(e) => setLoyaltyTier(e.target.value as LoyaltyTier)}
            >
              {TIERS.map((tierOption) => (
                <option key={tierOption} value={tierOption}>
                  {t(`customers.tier.${tierOption}` as never)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label={t('customers.form.defaultPaymentTerms')}
            hint={t('customers.form.defaultPaymentTermsHint')}
          >
            <Input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={defaultPaymentTermsDays}
              onChange={(e) => setDefaultPaymentTermsDays(e.target.value)}
              placeholder="7"
              className="h-11 w-28 sm:h-9"
            />
          </FormField>
          <FormField label={t('customers.form.tags')} hint={t('customers.form.tagsHint')}>
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="VIP, B2B"
              className="h-11 sm:h-9"
            />
          </FormField>
          <FormField label={t('customers.form.internalNotes')}>
            <Textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
            />
          </FormField>

          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
            />
            {t('customers.form.marketingOptIn')}
          </label>

          {formError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="mt-auto flex gap-2 pt-2">
            <SheetClose asChild>
              <Button type="button" variant="ghost" className="h-11 flex-1 sm:h-9">
                {t('common.cancel')}
              </Button>
            </SheetClose>
            <Button type="submit" className="h-11 flex-1 sm:h-9" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : isEdit ? null : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              {isEdit ? t('customers.form.save') : t('customers.form.create')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
