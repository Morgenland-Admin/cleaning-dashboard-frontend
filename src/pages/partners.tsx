import * as DialogPrimitive from '@radix-ui/react-dialog';
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Ban,
  Building2,
  Check,
  CheckCheck,
  Globe,
  Inbox,
  Loader2,
  Mail,
  MapPin,
  PauseOctagon,
  Phone,
  Plus,
  RefreshCcw,
  Send,
  Wallet,
  X,
} from 'lucide-react';
import { cloneElement, isValidElement, useId, useMemo, useState } from 'react';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { BrandMark } from '@/components/brand-mark';
import { EmptyState as SharedEmptyState } from '@/components/empty-state';
import { PageHeading } from '@/components/page-heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type CompanySlug, type Project } from '@/contexts/project-context';
import { useLocale, useT } from '@/i18n';
import {
  invitesAdminApi,
  partnersAdminApi,
  type Partner,
  type PartnerCreateInput,
  type PartnerStatus,
  ApiError,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn, formatDateTime, safeHttpUrl } from '@/lib/utils';

const STATUS_VARIANT: Record<
  PartnerStatus,
  'default' | 'info' | 'success' | 'secondary' | 'warning' | 'destructive'
> = {
  pending: 'warning',
  active: 'success',
  suspended: 'secondary',
  rejected: 'destructive',
};

const STATUS_KEY: Record<PartnerStatus, string> = {
  pending: 'partners.status.pending',
  active: 'partners.status.active',
  suspended: 'partners.status.suspended',
  rejected: 'partners.status.rejected',
};

type PartnerRow = Partner & { _brand: Project };

export function PartnersPage() {
  const { activeProject, projects, isAllBrands } = useProject();
  const queryClient = useQueryClient();
  const t = useT();
  const { bcp47 } = useLocale();
  usePageTitle(t('partners.title'));
  const [tab, setTab] = useState<PartnerStatus | 'all'>('all');
  const [selectionKey, setSelectionKey] = useState<string | null>(null);
  const [modal, setModal] = useState<'invite' | 'create' | null>(null);

  const brandList = isAllBrands ? projects : [activeProject];
  const queries = useQueries({
    queries: brandList.map((b) => ({
      queryKey: ['partners', b.companySlug] as const,
      queryFn: ({ signal }: { signal?: AbortSignal }) =>
        partnersAdminApi.list(b.companySlug, signal),
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const firstError = queries.find((q) => q.error)?.error as Error | undefined;

  function refetch() {
    queries.forEach((q) => q.refetch());
  }

  const partners = useMemo<PartnerRow[]>(() => {
    const out: PartnerRow[] = [];
    queries.forEach((q, i) => {
      const brand = brandList[i];
      if (!brand) return;
      (q.data?.partners ?? []).forEach((p) => out.push({ ...p, _brand: brand }));
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queries.map((q) => q.dataUpdatedAt).join('|'), brandList]);

  function keyOf(p: PartnerRow): string {
    return `${p._brand.companySlug}:${p.id}`;
  }

  const filtered = useMemo(() => {
    if (tab === 'all') return partners;
    return partners.filter((p) => p.status === tab);
  }, [partners, tab]);

  const selected = useMemo(
    () => partners.find((p) => keyOf(p) === selectionKey) ?? null,
    [partners, selectionKey],
  );

  const counts = useMemo(() => {
    const c: Record<PartnerStatus | 'all', number> = {
      all: partners.length,
      pending: 0,
      active: 0,
      suspended: 0,
      rejected: 0,
    };
    for (const p of partners) c[p.status]++;
    return c;
  }, [partners]);

  const updateMutation = useMutation({
    mutationFn: (vars: {
      companySlug: CompanySlug;
      id: number;
      status?: PartnerStatus;
      internalNotes?: string | null;
    }) =>
      partnersAdminApi.update(vars.companySlug, vars.id, {
        status: vars.status,
        internalNotes: vars.internalNotes,
      }),
    onSuccess: ({ partner }, vars) => {
      const cacheKey = ['partners', vars.companySlug] as const;
      queryClient.setQueryData<{ partners: Partner[] } | undefined>(cacheKey, (prev) =>
        prev
          ? {
              partners: prev.partners.map((p) => (p.id === partner.id ? partner : p)),
            }
          : prev,
      );
    },
  });
  const error = firstError ?? null;

  const errorMessage =
    error instanceof ApiError
      ? error.status === 401
        ? t('partners.errUnauthorized')
        : error.status === 403
          ? t('partners.errForbidden')
          : error.message
      : error
        ? t('partners.errGeneric')
        : null;

  const tabs: { value: PartnerStatus | 'all'; label: string }[] = [
    { value: 'all', label: t('partners.tabAll') },
    { value: 'pending', label: t('partners.tabPending') },
    { value: 'active', label: t('partners.tabActive') },
    { value: 'suspended', label: t('partners.tabSuspended') },
    { value: 'rejected', label: t('partners.tabRejected') },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      <PageHeading
        title={t('partners.title')}
        subtitle={t('partners.subtitleFor', { brand: activeProject.name })}
        breadcrumb={
          <>
            <span>{activeProject.name}</span>
            <span aria-hidden="true"> / </span>
            <span className="text-foreground">{t('partners.title')}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              aria-busy={isFetching || undefined}
            >
              <RefreshCcw
                className={cn('size-3.5', isFetching && 'animate-spin')}
                aria-hidden="true"
              />
              {t('partners.refresh')}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setModal('invite')}>
              <Send className="size-3.5" aria-hidden="true" />
              Partner einladen
            </Button>
            <Button size="sm" onClick={() => setModal('create')}>
              <Plus className="size-3.5" aria-hidden="true" />
              Partner anlegen
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as PartnerStatus | 'all')}>
        <TabsList className="flex-wrap">
          {tabs.map((tabItem) => {
            const active = tab === tabItem.value;
            return (
              <TabsTrigger key={tabItem.value} value={tabItem.value} className="gap-1.5">
                {tabItem.label}
                <span
                  className={cn(
                    'rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums',
                    active
                      ? 'bg-rust/15 text-rust'
                      : 'bg-muted-foreground/15 text-muted-foreground',
                  )}
                >
                  {counts[tabItem.value]}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {errorMessage ? (
        <div
          role="alert"
          aria-live="assertive"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between space-y-0">
            <div>
              <CardTitle>{t('partners.inboxTitle')}</CardTitle>
              <CardDescription>
                {filtered.length === 1
                  ? t('partners.countSingular', { count: filtered.length })
                  : t('partners.countPlural', { count: filtered.length })}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="flex h-48 items-center justify-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>{t('partners.inboxLoading')}</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6">
                <SharedEmptyState
                  icon={<Inbox className="size-6" aria-hidden="true" />}
                  message={t('partners.inboxEmpty')}
                />
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((p) => {
                  const key = keyOf(p);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setSelectionKey(key)}
                      className={cn(
                        'flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-muted/40 sm:px-6',
                        key === selectionKey && 'bg-muted/60',
                      )}
                    >
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-rust/10 text-rust">
                        <Building2 className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">
                            {p.companyName ?? t('partners.detail.noCompany')}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {isAllBrands ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5">
                                <BrandMark brand={p._brand} size="xs" />
                                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                                  {p._brand.shortName}
                                </span>
                              </span>
                            ) : null}
                            <Badge variant={STATUS_VARIANT[p.status]}>
                              {t(STATUS_KEY[p.status] as never)}
                            </Badge>
                          </div>
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                          {p.city ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="size-3" />
                              {p.city}
                            </span>
                          ) : null}
                          {p.contactEmail ? (
                            <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                              <Mail className="size-3 shrink-0" />
                              <span className="truncate">{p.contactEmail}</span>
                            </span>
                          ) : null}
                          {p.contactPhone ? (
                            <span className="inline-flex items-center gap-1">
                              <Phone className="size-3" />
                              {p.contactPhone}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          {selected ? (
            <PartnerDetail
              key={keyOf(selected)}
              partner={selected}
              bcp47={bcp47}
              onClose={() => setSelectionKey(null)}
              onStatusChange={(status) =>
                updateMutation.mutate({
                  companySlug: selected._brand.companySlug,
                  id: selected.id,
                  status,
                })
              }
              onSaveNotes={(notes) =>
                updateMutation.mutate({
                  companySlug: selected._brand.companySlug,
                  id: selected.id,
                  internalNotes: notes,
                })
              }
              isUpdating={updateMutation.isPending}
            />
          ) : (
            <Card>
              <CardContent className="py-8">
                <SharedEmptyState
                  icon={<Inbox className="size-6" aria-hidden="true" />}
                  message={t('partners.pickOne')}
                />
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {modal === 'invite' ? (
        <InvitePartnerModal
          companySlug={activeProject.companySlug}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            void queryClient.invalidateQueries({
              queryKey: ['partners', activeProject.companySlug],
            });
          }}
        />
      ) : null}
      {modal === 'create' ? (
        <CreatePartnerModal
          companySlug={activeProject.companySlug}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            void queryClient.invalidateQueries({
              queryKey: ['partners', activeProject.companySlug],
            });
          }}
        />
      ) : null}
    </div>
  );
}

function InvitePartnerModal({
  companySlug,
  onClose,
  onDone,
}: {
  companySlug: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [city, setCity] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      invitesAdminApi.create({
        email: email.trim(),
        companySlug,
        audience: 'partner',
        role: 'partner',
        accessLevel: 'none',
        partner: {
          companyName: companyName.trim(),
          contactPhone: contactPhone.trim() || undefined,
          city: city.trim() || undefined,
        },
      }),
    onSuccess: onDone,
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  return (
    <ModalShell title="Partner einladen" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Der Partner erhält eine E-Mail mit einem Link, um sein Konto einzurichten. Anschließend
        erscheint sein Profil hier als <em>pending</em>.
      </p>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!email.trim() || !companyName.trim()) {
            setError('E-Mail und Firmenname sind erforderlich.');
            return;
          }
          mutation.mutate();
        }}
      >
        <ModalField label="E-Mail" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </ModalField>
        <ModalField label="Firmenname" required>
          <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
        </ModalField>
        <div className="grid grid-cols-2 gap-3">
          <ModalField label="Telefon">
            <Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          </ModalField>
          <ModalField label="Stadt">
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </ModalField>
        </div>
        {error ? <ModalError msg={error} /> : null}
        <ModalActions
          onCancel={onClose}
          submitLabel="Einladung senden"
          submitIcon={<Send className="mr-2 size-4" />}
          isPending={mutation.isPending}
        />
      </form>
    </ModalShell>
  );
}

function CreatePartnerModal({
  companySlug,
  onClose,
  onDone,
}: {
  companySlug: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<PartnerCreateInput>({
    email: '',
    companyName: '',
  });
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof PartnerCreateInput>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  const mutation = useMutation({
    mutationFn: () => {
      const payload: PartnerCreateInput = {
        email: form.email.trim(),
        companyName: form.companyName.trim(),
      };
      if (form.legalName?.trim()) payload.legalName = form.legalName.trim();
      if (form.contactPhone?.trim()) payload.contactPhone = form.contactPhone.trim();
      if (form.websiteUrl?.trim()) payload.websiteUrl = form.websiteUrl.trim();
      if (form.addressLine1?.trim()) payload.addressLine1 = form.addressLine1.trim();
      if (form.city?.trim()) payload.city = form.city.trim();
      if (form.postalCode?.trim()) payload.postalCode = form.postalCode.trim();
      if (form.iban?.trim()) payload.iban = form.iban.trim();
      if (form.taxId?.trim()) payload.taxId = form.taxId.trim();
      return partnersAdminApi.create(companySlug as never, payload);
    },
    onSuccess: onDone,
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  return (
    <ModalShell title="Partner anlegen" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Erstellt einen Partner-Eintrag ohne Einladung. Falls noch kein Konto existiert, wird ein
        deaktivierter Platzhalter angelegt — du kannst dem Partner später eine Einladung senden,
        damit er den Zugang übernimmt.
      </p>
      <form
        className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (!form.email.trim() || !form.companyName.trim()) {
            setError('E-Mail und Firmenname sind erforderlich.');
            return;
          }
          mutation.mutate();
        }}
      >
        <ModalField label="E-Mail" required>
          <Input type="email" value={form.email} onChange={update('email')} required />
        </ModalField>
        <ModalField label="Firmenname" required>
          <Input value={form.companyName} onChange={update('companyName')} required />
        </ModalField>
        <ModalField label="Rechtlicher Name">
          <Input value={form.legalName ?? ''} onChange={update('legalName')} />
        </ModalField>
        <ModalField label="Telefon">
          <Input value={form.contactPhone ?? ''} onChange={update('contactPhone')} />
        </ModalField>
        <ModalField label="Website">
          <Input
            type="url"
            value={form.websiteUrl ?? ''}
            onChange={update('websiteUrl')}
            placeholder="https://…"
          />
        </ModalField>
        <ModalField label="Adresse">
          <AddressAutocomplete
            value={form.addressLine1 ?? ''}
            onChange={(v) => setForm((f) => ({ ...f, addressLine1: v }))}
            onPick={(a) =>
              setForm((f) => ({
                ...f,
                postalCode: a.postcode || f.postalCode,
                city: a.city || f.city,
              }))
            }
          />
        </ModalField>
        <ModalField label="PLZ">
          <Input value={form.postalCode ?? ''} onChange={update('postalCode')} />
        </ModalField>
        <ModalField label="Stadt">
          <Input value={form.city ?? ''} onChange={update('city')} />
        </ModalField>
        <ModalField label="IBAN">
          <Input value={form.iban ?? ''} onChange={update('iban')} />
        </ModalField>
        <ModalField label="USt-IdNr.">
          <Input value={form.taxId ?? ''} onChange={update('taxId')} />
        </ModalField>
        {error ? (
          <div className="sm:col-span-2">
            <ModalError msg={error} />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <ModalActions
            onCancel={onClose}
            submitLabel="Partner anlegen"
            submitIcon={<Plus className="mr-2 size-4" />}
            isPending={mutation.isPending}
          />
        </div>
      </form>
    </ModalShell>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 grid max-h-[85svh] w-[92vw] max-w-xl -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6 shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="mb-2 flex items-center justify-between">
            <DialogPrimitive.Title className="font-serif text-xl font-semibold tracking-tight">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rust"
              aria-label="Schließen"
            >
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ModalField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const id = useId();
  const labelled = isValidElement<{ id?: string }>(children)
    ? cloneElement(children, { id })
    : children;
  return (
    <div className="space-y-1.5">
      <Label
        htmlFor={id}
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        {label} {required ? <span className="text-rust">*</span> : null}
      </Label>
      {labelled}
    </div>
  );
}

function ModalError({ msg }: { msg: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{msg}</span>
    </div>
  );
}

function ModalActions({
  onCancel,
  submitLabel,
  submitIcon,
  isPending,
}: {
  onCancel: () => void;
  submitLabel: string;
  submitIcon?: React.ReactNode;
  isPending: boolean;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
        Abbrechen
      </Button>
      <Button type="submit" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="mr-2 size-4 animate-spin" /> Speichern …
          </>
        ) : (
          <>
            {submitIcon}
            {submitLabel}
          </>
        )}
      </Button>
    </div>
  );
}

function PartnerDetail({
  partner,
  bcp47,
  onClose,
  onStatusChange,
  onSaveNotes,
  isUpdating,
}: {
  partner: Partner;
  bcp47: string;
  onClose: () => void;
  onStatusChange: (status: PartnerStatus) => void;
  onSaveNotes: (notes: string | null) => void;
  isUpdating: boolean;
}) {
  const t = useT();
  const [notes, setNotes] = useState(partner.internalNotes ?? '');
  const notesDirty = notes !== (partner.internalNotes ?? '');

  return (
    <Card className="sticky top-20">
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate">
            {partner.companyName ?? t('partners.detail.noCompany')}
          </CardTitle>
          <CardDescription className="truncate">
            <Badge variant={STATUS_VARIANT[partner.status]}>
              {t(STATUS_KEY[partner.status] as never)}
            </Badge>
          </CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label={t('common.close')}>
          <X className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-2">
          <ActionButton
            current={partner.status}
            target="active"
            icon={Check}
            label={t('partners.actions.approve')}
            onClick={onStatusChange}
            disabled={isUpdating}
          />
          <ActionButton
            current={partner.status}
            target="suspended"
            icon={PauseOctagon}
            label={t('partners.actions.suspend')}
            onClick={onStatusChange}
            disabled={isUpdating}
          />
          <ActionButton
            current={partner.status}
            target="rejected"
            icon={Ban}
            label={t('partners.actions.reject')}
            onClick={onStatusChange}
            disabled={isUpdating}
            variant="ghost"
          />
          {partner.status !== 'pending' ? (
            <ActionButton
              current={partner.status}
              target="pending"
              icon={CheckCheck}
              label={t('partners.actions.reopen')}
              onClick={onStatusChange}
              disabled={isUpdating}
              variant="ghost"
            />
          ) : null}
        </div>

        <DetailGroup title={t('partners.detail.contact')}>
          <DetailRow icon={Mail} label={t('partners.fields.contactEmail')}>
            {partner.contactEmail ? (
              <a href={`mailto:${partner.contactEmail}`} className="text-primary hover:underline">
                {partner.contactEmail}
              </a>
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow icon={Phone} label={t('partners.fields.contactPhone')}>
            {partner.contactPhone ? (
              <a href={`tel:${partner.contactPhone}`} className="text-primary hover:underline">
                {partner.contactPhone}
              </a>
            ) : (
              '—'
            )}
          </DetailRow>
          <DetailRow icon={Globe} label={t('partners.fields.websiteUrl')}>
            {(() => {
              const safeUrl = safeHttpUrl(partner.websiteUrl);
              if (!partner.websiteUrl) return '—';
              if (!safeUrl) {
                // Refuse unsafe schemes (e.g. javascript:); show raw text only. (XSS guard)
                return (
                  <span className="break-all text-muted-foreground">{partner.websiteUrl}</span>
                );
              }
              return (
                <a
                  href={safeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {partner.websiteUrl}
                </a>
              );
            })()}
          </DetailRow>
        </DetailGroup>

        <DetailGroup title={t('partners.detail.legal')}>
          <DetailRow label={t('partners.fields.legalName')}>{partner.legalName ?? '—'}</DetailRow>
          <DetailRow label={t('partners.fields.taxId')}>{partner.taxId ?? '—'}</DetailRow>
          <DetailRow label={t('partners.fields.vatId')}>{partner.vatId ?? '—'}</DetailRow>
          <DetailRow label={t('partners.fields.registrationNumber')}>
            {partner.registrationNumber ?? '—'}
          </DetailRow>
        </DetailGroup>

        {partner.addressLine1 ? (
          <DetailGroup title={t('partners.detail.address')}>
            <div className="text-sm leading-relaxed text-muted-foreground">
              {partner.addressLine1}
              {partner.addressLine2 ? <>, {partner.addressLine2}</> : null}
              <br />
              {partner.postalCode ? `${partner.postalCode} ` : ''}
              {partner.city ?? ''}
              {partner.region ? <>, {partner.region}</> : null}
              {partner.country ? <> · {partner.country}</> : null}
            </div>
          </DetailGroup>
        ) : null}

        <DetailGroup title={t('partners.detail.banking')} icon={Wallet}>
          <DetailRow label={t('partners.fields.iban')}>
            <span className="font-mono text-[12px]">{partner.iban ?? '—'}</span>
          </DetailRow>
          <DetailRow label={t('partners.fields.bic')}>
            <span className="font-mono text-[12px]">{partner.bic ?? '—'}</span>
          </DetailRow>
          <DetailRow label={t('partners.fields.commissionRate')}>
            {partner.commissionRate ? `${partner.commissionRate} %` : '—'}
          </DetailRow>
        </DetailGroup>

        <DetailGroup title={t('partners.detail.services')}>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Services
            </div>
            {partner.services.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {partner.services.map((s) => (
                  <Badge key={s} variant="secondary">
                    {s}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">{t('partners.detail.noServices')}</div>
            )}
          </div>
          <div className="mt-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Servicegebiete
            </div>
            {partner.serviceAreas.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {partner.serviceAreas.map((a) => (
                  <Badge key={a} variant="outline">
                    {a}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">{t('partners.detail.noAreas')}</div>
            )}
          </div>
        </DetailGroup>

        <DetailGroup title={t('partners.detail.meta')}>
          <DetailRow label={t('partners.detail.createdAt')}>
            {formatDateTime(partner.createdAt, bcp47)}
          </DetailRow>
          {partner.approvedAt ? (
            <DetailRow label={t('partners.detail.approvedAt')}>
              {formatDateTime(partner.approvedAt, bcp47)}
            </DetailRow>
          ) : null}
          {partner.suspendedAt ? (
            <DetailRow label={t('partners.detail.suspendedAt')}>
              {formatDateTime(partner.suspendedAt, bcp47)}
            </DetailRow>
          ) : null}
        </DetailGroup>

        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('partners.detail.notes')}
          </div>
          <Textarea
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t('partners.detail.notesPlaceholder')}
          />
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              variant="outline"
              disabled={!notesDirty || isUpdating}
              onClick={() => onSaveNotes(notes.trim() === '' ? null : notes)}
            >
              {isUpdating ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('partners.detail.saveNotes')
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActionButton({
  current,
  target,
  icon: Icon,
  label,
  onClick,
  disabled,
  variant = 'outline',
}: {
  current: PartnerStatus;
  target: PartnerStatus;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: (status: PartnerStatus) => void;
  disabled: boolean;
  variant?: 'outline' | 'ghost' | 'default';
}) {
  const active = current === target;
  return (
    <Button
      variant={active ? 'default' : variant}
      size="sm"
      onClick={() => onClick(target)}
      disabled={disabled || active}
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
}

function DetailGroup({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}
        {title}
      </div>
      <div className="grid gap-1.5 rounded-md border bg-muted/30 p-3 text-sm">{children}</div>
    </section>
  );
}

function DetailRow({
  icon: Icon,
  label,
  children,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {Icon ? <Icon className="size-3" /> : null}
        {label}
      </span>
      <span className="min-w-0 truncate text-right text-sm">{children}</span>
    </div>
  );
}
