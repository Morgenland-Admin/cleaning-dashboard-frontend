import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type CompanySlug } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import {
  catalogApi,
  customersAdminApi,
  errMessage,
  ordersAdminApi,
  type OrderCreateInput,
  type OrderKind,
} from '@/lib/api';

const KIND_LABEL: Record<OrderKind, string> = {
  teppichreinigung: 'Teppichreinigung',
  teppichreparatur: 'Teppichreparatur',
  polsterreinigung: 'Polsterreinigung',
  teppichbodenreinigung: 'Teppichbodenreinigung',
};

const PICKUP_LABEL: Record<NonNullable<OrderCreateInput['pickupMode']>, string> = {
  drop_off: 'Abgabe in der Werkstatt',
  pickup: 'Abholung',
  onsite: 'Vor-Ort-Service',
};

const UNIT_SUFFIX: Record<string, string> = {
  qm: 'm²',
  lfdm: 'lfdm',
  stueck: 'Stück',
  bracket: 'Pauschale',
};

interface ItemRow {
  label: string;
  quantityLabel: string;
  quantity: string;
  unitPrice: string; // euros, as typed
}

interface CatalogOption {
  label: string;
  unitPriceCents: number;
  quantityLabel: string;
}

const emptyRow: ItemRow = { label: '', quantityLabel: '1', quantity: '1', unitPrice: '' };

function toNum(s: string): number {
  const n = Number.parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function eur(cents: number): string {
  return (cents / 100).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
}

/** Admin "Neue Bestellung" — offline order with customer + free-form/catalog line items. */
export function NewOrderDialog({
  open,
  onOpenChange,
  companySlug,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companySlug: CompanySlug;
  onCreated: (orderId: number) => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [kind, setKind] = useState<OrderKind>('teppichreinigung');
  const [items, setItems] = useState<ItemRow[]>([{ ...emptyRow }]);
  const [pickupMode, setPickupMode] =
    useState<NonNullable<OrderCreateInput['pickupMode']>>('drop_off');
  const [line1, setLine1] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const customersQuery = useQuery({
    queryKey: ['customers-pick', companySlug],
    queryFn: ({ signal }) => customersAdminApi.list(companySlug, { limit: 200 }, signal),
    enabled: open,
  });
  const catalogQuery = useQuery({
    queryKey: ['catalog', companySlug],
    queryFn: ({ signal }) => catalogApi.forBrand(companySlug, signal),
    enabled: open,
  });

  // Flat, pickable list derived from the brand price book (tiers, plus per-bracket
  // rows for bracket-priced services). Picking one appends an editable line.
  const catalogOptions = useMemo<CatalogOption[]>(() => {
    const services = catalogQuery.data?.services ?? [];
    const out: CatalogOption[] = [];
    for (const s of services) {
      const suffix = UNIT_SUFFIX[s.unit] ?? '';
      if (s.unit === 'bracket' && s.brackets) {
        for (const t of s.tiers) {
          for (const b of s.brackets) {
            const price = b.pricesCents[t.code];
            if (price == null) continue;
            out.push({
              label: `${s.label} · ${t.label} · ${b.label}`,
              unitPriceCents: price,
              quantityLabel: 'Pauschale',
            });
          }
        }
      } else {
        for (const t of s.tiers) {
          out.push({
            label: `${s.label} · ${t.label}`,
            unitPriceCents: t.unitPriceCents,
            quantityLabel: `1 ${suffix}`.trim(),
          });
        }
      }
    }
    return out;
  }, [catalogQuery.data]);

  const customerMatches = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return [];
    return (customersQuery.data?.customers ?? [])
      .filter((c) => c.email.toLowerCase().includes(q) || (c.name ?? '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [customerSearch, customersQuery.data]);

  const totalCents = items.reduce(
    (sum, r) => sum + Math.round(toNum(r.quantity) * Math.round(toNum(r.unitPrice) * 100)),
    0,
  );

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const showEmailError = email.trim() !== '' && !emailValid;
  const hasValidItem = items.some((r) => r.label.trim() !== '' && toNum(r.quantity) > 0);
  const canSubmit = name.trim() !== '' && emailValid && hasValidItem;
  const noCustomerMatch =
    customerSearch.trim() !== '' && customersQuery.isSuccess && customerMatches.length === 0;

  function reset() {
    setName('');
    setEmail('');
    setPhone('');
    setCustomerSearch('');
    setKind('teppichreinigung');
    setItems([{ ...emptyRow }]);
    setPickupMode('drop_off');
    setLine1('');
    setPostalCode('');
    setCity('');
    setPreferredDate('');
    setCustomerNotes('');
    setInternalNotes('');
    setFormError(null);
  }

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addCatalogOption(idx: number) {
    const opt = catalogOptions[idx];
    if (!opt) return;
    setItems((prev) => [
      ...prev,
      {
        label: opt.label,
        quantityLabel: opt.quantityLabel,
        quantity: '1',
        unitPrice: (opt.unitPriceCents / 100).toFixed(2),
      },
    ]);
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload: OrderCreateInput = {
        kind,
        customer: { name: name.trim(), email: email.trim() },
        items: items
          .filter((r) => r.label.trim() !== '' && toNum(r.quantity) > 0)
          .map((r) => ({
            label: r.label.trim(),
            quantityLabel: r.quantityLabel.trim() || '1',
            quantity: toNum(r.quantity),
            unitPriceCents: Math.round(toNum(r.unitPrice) * 100),
          })),
        pickupMode,
      };
      if (phone.trim()) payload.customer.phone = phone.trim();
      if (line1.trim() && city.trim() && /^\d{5}$/.test(postalCode.trim())) {
        payload.address = {
          line1: line1.trim(),
          city: city.trim(),
          postalCode: postalCode.trim(),
          country: 'DE',
        };
      }
      if (preferredDate) payload.preferredDate = preferredDate;
      if (customerNotes.trim()) payload.customerNotes = customerNotes.trim();
      if (internalNotes.trim()) payload.internalNotes = internalNotes.trim();
      return ordersAdminApi.create(companySlug, payload);
    },
    onSuccess: ({ order }) => {
      toast.success(`Bestellung ${order.orderNumber ?? ''} angelegt.`.trim());
      onCreated(order.id);
      onOpenChange(false);
      reset();
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-h-[88vh] w-[94vw] overflow-y-auto sm:max-w-2xl">
        <div>
          <DialogTitle className="font-serif text-xl tracking-tight">Neue Bestellung</DialogTitle>
          <DialogDescription>
            Manuell erstellter Auftrag (Zahlung offline / nach Leistung). Der Kunde wird nicht
            automatisch benachrichtigt.
          </DialogDescription>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            if (!canSubmit) return;
            mutation.mutate();
          }}
        >
          {/* Customer */}
          <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Kunde
            </legend>
            <FormField label="Bestandskunde suchen" hint="Name oder E-Mail — füllt die Felder aus.">
              <Input
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="Suchen …"
                className="h-9"
              />
            </FormField>
            {customerMatches.length > 0 ? (
              <ul
                className="-mt-1 flex flex-col gap-1 rounded-md border border-border bg-muted/30 p-1"
                aria-label="Gefundene Kunden"
              >
                {customerMatches.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      aria-label={`Kunde übernehmen: ${c.name ?? c.email}, ${c.email}`}
                      className="flex w-full flex-col rounded px-2 py-1 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        setName(c.name ?? '');
                        setEmail(c.email);
                        setPhone(c.phone ?? '');
                        if (c.addressLine1) setLine1(c.addressLine1);
                        if (c.postalCode) setPostalCode(c.postalCode);
                        if (c.city) setCity(c.city);
                        setCustomerSearch('');
                      }}
                    >
                      <span className="font-medium">{c.name ?? c.email}</span>
                      <span className="text-xs text-muted-foreground">{c.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {noCustomerMatch ? (
              <p className="-mt-1 text-[11px] text-muted-foreground">
                Kein Treffer — wird als neuer Kunde angelegt.
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Name" required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="h-9"
                />
              </FormField>
              <FormField
                label="E-Mail"
                required
                error={showEmailError ? 'Bitte eine gültige E-Mail-Adresse eingeben.' : undefined}
              >
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="h-9"
                />
              </FormField>
              <FormField label="Telefon">
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-9"
                />
              </FormField>
            </div>
          </fieldset>

          {/* Service + line items */}
          <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Leistung & Posten
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Service-Art">
                <Select value={kind} onChange={(e) => setKind(e.target.value as OrderKind)}>
                  {(Object.keys(KIND_LABEL) as OrderKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Aus Katalog hinzufügen" hint="Preis vorbefüllen, dann anpassbar.">
                <Select
                  value=""
                  disabled={catalogOptions.length === 0}
                  onChange={(e) => {
                    if (e.target.value === '') return;
                    addCatalogOption(Number(e.target.value));
                  }}
                >
                  <option value="">{catalogQuery.isLoading ? 'Lädt …' : '— wählen —'}</option>
                  {catalogOptions.map((o, i) => (
                    <option key={i} value={i}>
                      {o.label} ({eur(o.unitPriceCents)})
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>

            <div className="flex flex-col gap-2">
              <div className="hidden grid-cols-[1fr_84px_64px_92px_32px] gap-2 px-1 text-xs text-muted-foreground sm:grid">
                <span>Bezeichnung</span>
                <span>Menge (Text)</span>
                <span>Anzahl</span>
                <span>Preis €</span>
                <span />
              </div>
              {items.map((r, i) => (
                <div
                  key={i}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_84px_64px_92px_32px]"
                >
                  <Input
                    value={r.label}
                    onChange={(e) => updateItem(i, { label: e.target.value })}
                    placeholder="z. B. Teppichreinigung · Perser"
                    aria-label={`Bezeichnung, Posten ${i + 1}`}
                    className="col-span-2 h-9 sm:col-span-1"
                  />
                  <Input
                    value={r.quantityLabel}
                    onChange={(e) => updateItem(i, { quantityLabel: e.target.value })}
                    placeholder="5 m²"
                    aria-label={`Menge als Text, Posten ${i + 1}`}
                    className="h-9"
                  />
                  <Input
                    inputMode="decimal"
                    value={r.quantity}
                    onChange={(e) => updateItem(i, { quantity: e.target.value })}
                    aria-label={`Anzahl, Posten ${i + 1}`}
                    className="h-9"
                  />
                  <Input
                    inputMode="decimal"
                    value={r.unitPrice}
                    onChange={(e) => updateItem(i, { unitPrice: e.target.value })}
                    placeholder="0,00"
                    aria-label={`Einzelpreis in Euro, Posten ${i + 1}`}
                    className="h-9"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-9 w-8"
                    aria-label="Posten entfernen"
                    disabled={items.length === 1}
                    onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setItems((prev) => [...prev, { ...emptyRow }])}
                >
                  <Plus className="size-3.5" />
                  Posten
                </Button>
                <span className="text-sm" aria-live="polite">
                  Gesamt: <span className="font-medium tabular-nums">{eur(totalCents)}</span>
                </span>
              </div>
            </div>
          </fieldset>

          {/* Logistics + notes */}
          <fieldset className="flex flex-col gap-3 rounded-md border border-border p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Logistik & Notizen
            </legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField label="Ablauf">
                <Select
                  value={pickupMode}
                  onChange={(e) =>
                    setPickupMode(e.target.value as NonNullable<OrderCreateInput['pickupMode']>)
                  }
                >
                  {(Object.keys(PICKUP_LABEL) as Array<keyof typeof PICKUP_LABEL>).map((m) => (
                    <option key={m} value={m}>
                      {PICKUP_LABEL[m]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Wunschtermin">
                <Input
                  type="date"
                  value={preferredDate}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className="h-9"
                />
              </FormField>
            </div>
            <FormField label="Adresse (optional)" hint="Für Abholung/Vor-Ort — Straße, PLZ, Ort.">
              <AddressAutocomplete
                value={line1}
                onChange={setLine1}
                onPick={(a) => {
                  if (a.postcode) setPostalCode(a.postcode);
                  if (a.city) setCity(a.city);
                }}
                placeholder="Straße und Hausnummer"
                className="h-9"
              />
            </FormField>
            <div className="grid grid-cols-[1fr_2fr] gap-3">
              <FormField label="PLZ">
                <Input
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className="h-9"
                />
              </FormField>
              <FormField label="Ort">
                <Input value={city} onChange={(e) => setCity(e.target.value)} className="h-9" />
              </FormField>
            </div>
            <FormField label="Notiz an Kunde">
              <Textarea
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                rows={2}
              />
            </FormField>
            <FormField label="Interne Notiz">
              <Textarea
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                rows={2}
              />
            </FormField>
          </fieldset>

          {formError ? (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 pt-1">
            {!canSubmit ? (
              <p className="mr-auto text-[11px] text-muted-foreground">
                Name, gültige E-Mail und mindestens ein Posten erforderlich.
              </p>
            ) : null}
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={!canSubmit || mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="size-4" aria-hidden="true" />
              )}
              Bestellung anlegen
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
