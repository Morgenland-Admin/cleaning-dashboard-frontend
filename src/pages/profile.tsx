import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  ShieldCheck,
  Star,
  Trash2,
  Users as UsersIcon,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import {
  usersApi,
  type Address,
  type AddressInput,
  type AddressType,
  type MembershipRow,
  type ProfilePatch,
  type UserGender,
  ApiError,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { cn } from '@/lib/utils';

const GENDER_KEYS = {
  male: 'profile.genderMale',
  female: 'profile.genderFemale',
  diverse: 'profile.genderDiverse',
  prefer_not_to_say: 'profile.genderPreferNotToSay',
} as const;

const ADDRESS_TYPE_KEYS = {
  primary: 'profile.addressTypePrimary',
  billing: 'profile.addressTypeBilling',
  service: 'profile.addressTypeService',
  shipping: 'profile.addressTypeShipping',
  other: 'profile.addressTypeOther',
} as const;

const ADDRESS_TYPES: AddressType[] = ['primary', 'billing', 'service', 'shipping', 'other'];

const GENDERS: UserGender[] = ['male', 'female', 'diverse', 'prefer_not_to_say'];

export function ProfilePage() {
  const queryClient = useQueryClient();
  const t = useT();
  usePageTitle(t('profile.title'));

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: ({ signal }) => usersApi.me(signal),
  });

  const membershipsQuery = useQuery({
    queryKey: ['me', 'memberships'],
    queryFn: ({ signal }) => usersApi.memberships(signal),
  });

  const user = meQuery.data?.user;

  const [form, setForm] = useState<ProfilePatch>({});
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!user) return;
    setForm({
      firstName: user.firstName ?? '',
      lastName: user.lastName ?? '',
      phone: user.phone ?? '',
      image: user.image ?? '',
      timezone: user.timezone,
      dateOfBirth: user.dateOfBirth ?? '',
      gender: (user.gender as UserGender | null) ?? null,
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (savedTimerRef.current !== null) {
        window.clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  const mutation = useMutation({
    mutationFn: (patch: ProfilePatch) => usersApi.updateMe(patch),
    onSuccess: ({ user: next }) => {
      queryClient.setQueryData(['me'], { user: next });
      setSaved(true);
      if (savedTimerRef.current !== null) window.clearTimeout(savedTimerRef.current);
      savedTimerRef.current = window.setTimeout(() => setSaved(false), 2400);
    },
  });

  function update<K extends keyof ProfilePatch>(key: K, value: ProfilePatch[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const patch: ProfilePatch = {
      firstName: nullify(form.firstName ?? ''),
      lastName: nullify(form.lastName ?? ''),
      phone: nullify(form.phone ?? ''),
      image: nullify(form.image ?? ''),
      timezone: nullify(form.timezone ?? '') ?? undefined,
      dateOfBirth: nullify(form.dateOfBirth ?? ''),
      gender: form.gender ?? null,
    };
    mutation.mutate(patch);
  }

  if (meQuery.isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1000px] items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-[1000px]">
        <ErrorBanner message={t('profile.loadFailed')} />
      </div>
    );
  }

  const initials = (
    (user.firstName?.[0] ?? '') + (user.lastName?.[0] ?? '') || user.name.slice(0, 2)
  ).toUpperCase();

  const mutationError =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? t('profile.saveError')
        : null;

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
      <header>
        <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
          {t('profile.title')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('profile.subtitle')}</p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar className="size-14 ring-2 ring-background sm:size-16">
            {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
            <AvatarFallback className="bg-rust/15 text-base font-semibold text-rust">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-serif text-xl font-semibold leading-tight tracking-tight sm:text-2xl">
              {user.name}
            </div>
            <div className="truncate text-sm text-muted-foreground">{user.email}</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Pill
                icon={ShieldCheck}
                label={t(`profile.access.${user.accessLevel}` as never)}
                tone="rust"
              />
              <Pill
                label={user.audience === 'admin' ? t('profile.pillAdminAccount') : user.audience}
              />
              {user.isActive ? (
                <Pill label={t('profile.pillActive')} tone="positive" />
              ) : (
                <Pill label={t('profile.pillInactive')} tone="muted" />
              )}
              {user.emailVerified ? (
                <Pill label={t('profile.pillEmailVerified')} tone="positive" />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border/60 px-4 py-4 sm:px-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight">
            {t('profile.personalTitle')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('profile.personalSubtitle')}</p>
        </header>
        <form onSubmit={onSubmit} className="grid gap-4 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.firstName')} htmlFor="firstName">
              <Input
                id="firstName"
                value={form.firstName ?? ''}
                onChange={(e) => update('firstName', e.target.value)}
              />
            </Field>
            <Field label={t('profile.lastName')} htmlFor="lastName">
              <Input
                id="lastName"
                value={form.lastName ?? ''}
                onChange={(e) => update('lastName', e.target.value)}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.email')} htmlFor="email" hint={t('profile.emailHint')}>
              <Input id="email" value={user.email} disabled />
            </Field>
            <Field label={t('profile.phone')} htmlFor="phone">
              <Input
                id="phone"
                type="tel"
                value={form.phone ?? ''}
                onChange={(e) => update('phone', e.target.value)}
                placeholder={t('profile.phonePlaceholder')}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.dateOfBirth')} htmlFor="dob">
              <Input
                id="dob"
                type="date"
                value={form.dateOfBirth ?? ''}
                onChange={(e) => update('dateOfBirth', e.target.value)}
              />
            </Field>
            <Field label={t('profile.gender')} htmlFor="gender">
              <NativeSelect
                id="gender"
                value={form.gender ?? ''}
                onChange={(v) => update('gender', (v as UserGender) || null)}
              >
                <option value="">{t('profile.genderUnspecified')}</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {t(GENDER_KEYS[g])}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('profile.avatarUrl')} htmlFor="image" hint={t('profile.avatarHint')}>
              <Input
                id="image"
                type="url"
                value={form.image ?? ''}
                onChange={(e) => update('image', e.target.value)}
                placeholder="https://…"
              />
            </Field>
            <Field label={t('profile.timezone')} htmlFor="timezone">
              <Input
                id="timezone"
                value={form.timezone ?? ''}
                onChange={(e) => update('timezone', e.target.value)}
                placeholder={t('profile.timezonePlaceholder')}
              />
            </Field>
          </div>

          {mutationError ? <ErrorBanner message={mutationError} /> : null}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border/60 pt-4">
            {saved ? (
              <span
                role="status"
                className="inline-flex items-center gap-1.5 text-xs text-emerald-700"
              >
                <CheckCircle2 className="size-3.5" /> {t('common.saved')}
              </span>
            ) : null}
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('profile.saveChanges')
              )}
            </Button>
          </div>
        </form>
      </section>

      <AddressesSection />

      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border/60 px-4 py-4 sm:px-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight">
            {t('profile.membershipsTitle')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('profile.membershipsSubtitle')}</p>
        </header>
        <div className="p-4 sm:p-6">
          {membershipsQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t('profile.membershipsLoading')}
            </div>
          ) : membershipsQuery.data?.memberships.length ? (
            <ul className="divide-y divide-border/60">
              {membershipsQuery.data.memberships.map((m) => (
                <MembershipRowItem key={m.companySlug} row={m} t={t} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t('profile.membershipsEmpty')}</p>
          )}
        </div>
      </section>
    </div>
  );
}

// --- Addresses section ----------------------------------------------------

function AddressesSection() {
  const t = useT();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['me', 'addresses'],
    queryFn: ({ signal }) => usersApi.addresses(signal),
  });

  /** "new" → empty form at the top, number → editing that row, null → list only. */
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  const createMutation = useMutation({
    mutationFn: (input: AddressInput) => usersApi.createAddress(input),
    onSuccess: ({ address }) => {
      queryClient.setQueryData<{ addresses: Address[] }>(['me', 'addresses'], (prev) =>
        prev ? { addresses: [...prev.addresses, address] } : { addresses: [address] },
      );
      setEditing(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: AddressInput }) =>
      usersApi.updateAddress(id, patch),
    onSuccess: ({ address }) => {
      queryClient.setQueryData<{ addresses: Address[] }>(['me', 'addresses'], (prev) =>
        prev
          ? {
              addresses: prev.addresses.map((a) => (a.id === address.id ? address : a)),
            }
          : prev,
      );
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.deleteAddress(id),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<{ addresses: Address[] }>(['me', 'addresses'], (prev) =>
        prev ? { addresses: prev.addresses.filter((a) => a.id !== id) } : prev,
      );
    },
  });

  const addresses = query.data?.addresses ?? [];
  const mutationError = [createMutation.error, updateMutation.error, deleteMutation.error].find(
    (e) => e instanceof ApiError,
  ) as ApiError | undefined;

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-6">
        <div>
          <h2 className="font-serif text-lg font-semibold tracking-tight">
            {t('profile.addressesTitle')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('profile.addressesSubtitle')}</p>
        </div>
        {editing === 'new' ? null : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing('new')}
            disabled={createMutation.isPending}
          >
            <Plus className="size-3.5" />
            {t('profile.addAddress')}
          </Button>
        )}
      </header>

      <div className="flex flex-col p-4 sm:p-6">
        {mutationError ? (
          <div className="mb-4">
            <ErrorBanner message={mutationError.message} />
          </div>
        ) : null}

        {editing === 'new' ? (
          <div className="mb-4 rounded-xl border border-rust/30 bg-rust/[0.04] p-4">
            <AddressForm
              initial={null}
              onCancel={() => setEditing(null)}
              onSubmit={(input) => createMutation.mutate(input)}
              submitting={createMutation.isPending}
            />
          </div>
        ) : null}

        {query.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('common.loading')}
          </div>
        ) : addresses.length === 0 && editing !== 'new' ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/60 py-10 text-center text-sm text-muted-foreground">
            <MapPin className="size-5 opacity-50" />
            {t('profile.addressesEmpty')}
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {addresses.map((a) => (
              <li key={a.id}>
                {editing === a.id ? (
                  <div className="rounded-xl border border-rust/30 bg-rust/[0.04] p-4">
                    <AddressForm
                      initial={a}
                      onCancel={() => setEditing(null)}
                      onSubmit={(input) => updateMutation.mutate({ id: a.id, patch: input })}
                      submitting={updateMutation.isPending}
                    />
                  </div>
                ) : (
                  <AddressRow
                    address={a}
                    onEdit={() => setEditing(a.id)}
                    onDelete={() => deleteMutation.mutate(a.id)}
                    isDeleting={deleteMutation.isPending && deleteMutation.variables === a.id}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AddressRow({
  address: a,
  onEdit,
  onDelete,
  isDeleting,
}: {
  address: Address;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const t = useT();
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border bg-background/60 p-4">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-rust/10 text-rust">
        <MapPin className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold">{a.label ?? t(ADDRESS_TYPE_KEYS[a.type])}</span>
          <Pill label={t(ADDRESS_TYPE_KEYS[a.type])} tone="muted" />
          {a.isDefault ? (
            <Pill label={t('profile.addressDefaultBadge')} tone="rust" icon={Star} />
          ) : null}
        </div>
        <div className="mt-1 text-sm leading-relaxed text-muted-foreground">
          {a.line1}
          {a.line2 ? <>, {a.line2}</> : null}
          <br />
          {a.postalCode} {a.city}
          {a.region ? <>, {a.region}</> : null}
          {a.country ? <> · {a.country}</> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onEdit} aria-label={t('common.save')}>
          <Pencil className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          disabled={isDeleting}
          aria-label={t('profile.deleteAddress')}
          className="text-destructive hover:text-destructive"
        >
          {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
        </Button>
      </div>
    </div>
  );
}

interface AddressFormState {
  label: string;
  type: AddressType;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

function AddressForm({
  initial,
  onCancel,
  onSubmit,
  submitting,
}: {
  initial: Address | null;
  onCancel: () => void;
  onSubmit: (input: AddressInput) => void;
  submitting: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<AddressFormState>(() => ({
    label: initial?.label ?? '',
    type: initial?.type ?? 'primary',
    line1: initial?.line1 ?? '',
    line2: initial?.line2 ?? '',
    city: initial?.city ?? '',
    region: initial?.region ?? '',
    postalCode: initial?.postalCode ?? '',
    country: initial?.country ?? 'DE',
    isDefault: initial?.isDefault ?? false,
  }));

  function set<K extends keyof AddressFormState>(key: K, value: AddressFormState[K]) {
    setState((s) => ({ ...s, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      label: nullify(state.label),
      type: state.type,
      line1: state.line1.trim(),
      line2: nullify(state.line2),
      city: state.city.trim(),
      region: nullify(state.region),
      postalCode: state.postalCode.trim(),
      country: state.country || 'DE',
      isDefault: state.isDefault,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('profile.addressLabel')} htmlFor="addr-label">
          <Input
            id="addr-label"
            value={state.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder={t('profile.addressLabelPlaceholder')}
          />
        </Field>
        <Field label={t('profile.addressType')} htmlFor="addr-type">
          <NativeSelect
            id="addr-type"
            value={state.type}
            onChange={(v) => set('type', v as AddressType)}
          >
            {ADDRESS_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {t(ADDRESS_TYPE_KEYS[tp])}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <Field label={t('profile.addressLine1')} htmlFor="addr-line1">
        <Input
          id="addr-line1"
          value={state.line1}
          onChange={(e) => set('line1', e.target.value)}
          required
        />
      </Field>

      <Field label={t('profile.addressLine2')} htmlFor="addr-line2">
        <Input id="addr-line2" value={state.line2} onChange={(e) => set('line2', e.target.value)} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <Field label={t('profile.addressPostalCode')} htmlFor="addr-zip">
          <Input
            id="addr-zip"
            value={state.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
            required
          />
        </Field>
        <Field label={t('profile.addressCity')} htmlFor="addr-city">
          <Input
            id="addr-city"
            value={state.city}
            onChange={(e) => set('city', e.target.value)}
            required
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t('profile.addressRegion')} htmlFor="addr-region">
          <Input
            id="addr-region"
            value={state.region}
            onChange={(e) => set('region', e.target.value)}
          />
        </Field>
        <Field label={t('profile.addressCountry')} htmlFor="addr-country">
          <Input
            id="addr-country"
            value={state.country}
            onChange={(e) => set('country', e.target.value.toUpperCase().slice(0, 2))}
            placeholder="DE"
            maxLength={2}
          />
        </Field>
      </div>

      <label className="flex cursor-pointer select-none items-center gap-2.5 text-[13px] text-muted-foreground">
        <Checkbox checked={state.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />
        <span>{t('profile.addressIsDefault')}</span>
      </label>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          <X className="size-4" />
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('common.saving')}
            </>
          ) : (
            t('profile.saveAddress')
          )}
        </Button>
      </div>
    </form>
  );
}

// --- Helpers --------------------------------------------------------------

function MembershipRowItem({ row, t }: { row: MembershipRow; t: ReturnType<typeof useT> }) {
  const hasName = !!row.companyName && row.companyName !== row.companySlug;
  return (
    <li className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-md bg-rust/10 text-rust">
          <UsersIcon className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{row.companyName ?? row.companySlug}</div>
          {hasName ? (
            <div className="truncate text-xs text-muted-foreground">{row.companySlug}</div>
          ) : null}
        </div>
      </div>
      <Pill label={t(`profile.role.${row.role}` as never)} tone="muted" />
    </li>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <span className="text-[11px] text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

function Pill({
  icon: Icon,
  label,
  tone = 'muted',
}: {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  tone?: 'muted' | 'rust' | 'positive';
}) {
  const cls =
    tone === 'rust'
      ? 'bg-rust/12 text-rust ring-rust/25'
      : tone === 'positive'
        ? 'bg-emerald-100 text-emerald-800 ring-emerald-200'
        : 'bg-muted text-muted-foreground ring-border';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        cls,
      )}
    >
      {Icon ? <Icon className="size-3" /> : null}
      {label}
    </span>
  );
}

function NativeSelect({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-3 top-1/2 size-3 -translate-y-1/2 text-muted-foreground"
      >
        <path
          d="M4 6 L8 10 L12 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function nullify(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
