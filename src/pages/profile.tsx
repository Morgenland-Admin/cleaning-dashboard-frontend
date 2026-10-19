import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MapPin, Pencil, Plus, ShieldCheck, Star, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
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
    // Keyed on the user's id, not the object, so a refetch cannot overwrite live typing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const heading = <PageHeading title={t('profile.title')} subtitle={t('profile.subtitle')} />;

  if (meQuery.isLoading) {
    return (
      <PageContainer width="narrow">
        {heading}
        <LoadingState />
      </PageContainer>
    );
  }

  if (!user) {
    return (
      <PageContainer width="narrow">
        {heading}
        <ErrorState
          title={t('profile.loadFailed')}
          error={meQuery.error}
          onRetry={() => void meQuery.refetch()}
          retrying={meQuery.isFetching}
        />
      </PageContainer>
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
    <PageContainer width="narrow">
      {heading}

      <div className="flex flex-col gap-4">
        <Card className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar className="size-10">
              {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
              <AvatarFallback className="bg-primary-soft text-2sm font-semibold text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{user.name}</p>
              <p className="truncate text-2sm text-muted-foreground">{user.email}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge variant="accent">
                  <ShieldCheck aria-hidden="true" />
                  {t(`profile.access.${user.accessLevel}` as never)}
                </Badge>
                <Badge variant="secondary">
                  {user.audience === 'admin' ? t('profile.pillAdminAccount') : user.audience}
                </Badge>
                {user.isActive ? (
                  <Badge variant="success">{t('profile.pillActive')}</Badge>
                ) : (
                  <Badge variant="secondary">{t('profile.pillInactive')}</Badge>
                )}
                {user.emailVerified ? (
                  <Badge variant="success">{t('profile.pillEmailVerified')}</Badge>
                ) : null}
              </div>
            </div>
          </div>
        </Card>

        <form onSubmit={onSubmit}>
          <SectionCard
            as="fieldset"
            title={t('profile.personalTitle')}
            description={t('profile.personalSubtitle')}
            footer={
              <>
                {saved ? (
                  <span
                    role="status"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-success"
                  >
                    <CheckCircle2 className="size-3.5" aria-hidden="true" />
                    {t('common.saved')}
                  </span>
                ) : null}
                <Button type="submit" loading={mutation.isPending}>
                  {t('profile.saveChanges')}
                </Button>
              </>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t('profile.firstName')}>
                <Input
                  autoComplete="given-name"
                  value={form.firstName ?? ''}
                  onChange={(e) => update('firstName', e.target.value)}
                />
              </FormField>
              <FormField label={t('profile.lastName')}>
                <Input
                  autoComplete="family-name"
                  value={form.lastName ?? ''}
                  onChange={(e) => update('lastName', e.target.value)}
                />
              </FormField>
              <FormField label={t('profile.email')} hint={t('profile.emailHint')}>
                <Input value={user.email} disabled />
              </FormField>
              <FormField label={t('profile.phone')}>
                <Input
                  type="tel"
                  autoComplete="tel"
                  value={form.phone ?? ''}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder={t('profile.phonePlaceholder')}
                />
              </FormField>
              <FormField label={t('profile.dateOfBirth')}>
                <DatePicker
                  value={form.dateOfBirth ?? ''}
                  onValueChange={(v) => update('dateOfBirth', v)}
                />
              </FormField>
              <FormField label={t('profile.gender')}>
                <Select<UserGender | ''>
                  value={form.gender ?? ''}
                  onValueChange={(v) => update('gender', v || null)}
                  options={[
                    { value: '', label: t('profile.genderUnspecified') },
                    ...GENDERS.map((g) => ({ value: g, label: t(GENDER_KEYS[g]) })),
                  ]}
                />
              </FormField>
              <FormField label={t('profile.avatarUrl')} hint={t('profile.avatarHint')}>
                <Input
                  type="url"
                  value={form.image ?? ''}
                  onChange={(e) => update('image', e.target.value)}
                  placeholder="https://…"
                />
              </FormField>
              <FormField label={t('profile.timezone')}>
                <Input
                  value={form.timezone ?? ''}
                  onChange={(e) => update('timezone', e.target.value)}
                  placeholder={t('profile.timezonePlaceholder')}
                />
              </FormField>
            </div>
            {mutationError ? (
              <Alert tone="destructive" className="mt-4">
                {mutationError}
              </Alert>
            ) : null}
          </SectionCard>
        </form>

        <AddressesSection />

        <SectionCard
          title={t('profile.membershipsTitle')}
          description={t('profile.membershipsSubtitle')}
        >
          {membershipsQuery.isLoading ? (
            <LoadingState inline label={t('profile.membershipsLoading')} />
          ) : membershipsQuery.error ? (
            <ErrorState
              error={membershipsQuery.error}
              onRetry={() => void membershipsQuery.refetch()}
              retrying={membershipsQuery.isFetching}
            />
          ) : membershipsQuery.data?.memberships.length ? (
            <ul className="divide-y divide-border">
              {membershipsQuery.data.memberships.map((m) => (
                <MembershipRowItem key={m.companySlug} row={m} t={t} />
              ))}
            </ul>
          ) : (
            <EmptyState size="sm" message={t('profile.membershipsEmpty')} />
          )}
        </SectionCard>
      </div>
    </PageContainer>
  );
}

function AddressesSection() {
  const t = useT();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['me', 'addresses'],
    queryFn: ({ signal }) => usersApi.addresses(signal),
  });

  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Address | null>(null);

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
    onSettled: () => setConfirmDelete(null),
  });

  const addresses = query.data?.addresses ?? [];
  const failed = [createMutation.error, updateMutation.error, deleteMutation.error].find(Boolean);
  const mutationError = failed
    ? failed instanceof Error && failed.message
      ? failed.message
      : t('profile.saveError')
    : null;

  return (
    <SectionCard
      title={t('profile.addressesTitle')}
      description={t('profile.addressesSubtitle')}
      actions={
        editing === 'new' ? null : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditing('new')}
            disabled={createMutation.isPending}
          >
            <Plus aria-hidden="true" />
            {t('profile.addAddress')}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-3">
        {mutationError ? <Alert tone="destructive">{mutationError}</Alert> : null}

        {editing === 'new' ? (
          <div className="rounded-lg border border-border-strong bg-muted/40 p-4">
            <AddressForm
              initial={null}
              onCancel={() => setEditing(null)}
              onSubmit={(input) => createMutation.mutate(input)}
              submitting={createMutation.isPending}
            />
          </div>
        ) : null}

        {query.isLoading ? (
          <LoadingState inline />
        ) : query.error ? (
          <ErrorState
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
          />
        ) : addresses.length === 0 && editing !== 'new' ? (
          <EmptyState
            variant="dashed"
            size="sm"
            icon={<MapPin aria-hidden="true" />}
            message={t('profile.addressesEmpty')}
          />
        ) : addresses.length > 0 ? (
          <ul className="divide-y divide-border rounded-lg border">
            {addresses.map((a) => (
              <li key={a.id}>
                {editing === a.id ? (
                  <div className="bg-muted/40 p-4">
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
                    onDelete={() => setConfirmDelete(a)}
                    isDeleting={deleteMutation.isPending && deleteMutation.variables === a.id}
                  />
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title={t('profile.deleteAddressTitle')}
        description={t('profile.deleteAddressBody', {
          label: confirmDelete
            ? (confirmDelete.label ?? `${confirmDelete.line1}, ${confirmDelete.city}`)
            : '',
        })}
        confirmLabel={t('profile.deleteAddress')}
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete.id);
        }}
        isDangerous
        isPending={deleteMutation.isPending}
      />
    </SectionCard>
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
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground">
            {a.label ?? t(ADDRESS_TYPE_KEYS[a.type])}
          </span>
          <Badge variant="secondary">{t(ADDRESS_TYPE_KEYS[a.type])}</Badge>
          {a.isDefault ? (
            <Badge variant="accent">
              <Star aria-hidden="true" />
              {t('profile.addressDefaultBadge')}
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-2sm text-muted-foreground">
          {a.line1}
          {a.line2 ? <>, {a.line2}</> : null}
          <br />
          {a.postalCode} {a.city}
          {a.region ? <>, {a.region}</> : null}
          {a.country ? <> · {a.country}</> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label={t('common.edit')}>
          <Pencil aria-hidden="true" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onDelete}
          loading={isDeleting}
          aria-label={t('profile.deleteAddress')}
          className="text-destructive hover:bg-destructive-soft hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
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
  const defaultId = useId();
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
        <FormField label={t('profile.addressLabel')}>
          <Input
            value={state.label}
            onChange={(e) => set('label', e.target.value)}
            placeholder={t('profile.addressLabelPlaceholder')}
          />
        </FormField>
        <FormField label={t('profile.addressType')}>
          <Select<AddressType>
            value={state.type}
            onValueChange={(v) => set('type', v)}
            options={ADDRESS_TYPES.map((tp) => ({ value: tp, label: t(ADDRESS_TYPE_KEYS[tp]) }))}
          />
        </FormField>
      </div>

      <FormField label={t('profile.addressLine1')}>
        <AddressAutocomplete
          value={state.line1}
          onChange={(v) => set('line1', v)}
          onPick={(a) => {
            if (a.postcode) set('postalCode', a.postcode);
            if (a.city) set('city', a.city);
          }}
        />
      </FormField>

      <FormField label={t('profile.addressLine2')}>
        <Input value={state.line2} onChange={(e) => set('line2', e.target.value)} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <FormField label={t('profile.addressPostalCode')} required>
          <Input
            value={state.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
            autoComplete="postal-code"
            className="tabular-nums"
            required
          />
        </FormField>
        <FormField label={t('profile.addressCity')} required>
          <Input
            value={state.city}
            onChange={(e) => set('city', e.target.value)}
            autoComplete="address-level2"
            required
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label={t('profile.addressRegion')}>
          <Input value={state.region} onChange={(e) => set('region', e.target.value)} />
        </FormField>
        <FormField label={t('profile.addressCountry')}>
          <Input
            value={state.country}
            onChange={(e) => set('country', e.target.value.toUpperCase().slice(0, 2))}
            placeholder="DE"
            maxLength={2}
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3">
        <Checkbox
          id={defaultId}
          checked={state.isDefault}
          onChange={(e) => set('isDefault', e.target.checked)}
        />
        <label htmlFor={defaultId} className="cursor-pointer select-none text-2sm text-foreground">
          {t('profile.addressIsDefault')}
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" loading={submitting}>
          {t('profile.saveAddress')}
        </Button>
      </div>
    </form>
  );
}

function MembershipRowItem({ row, t }: { row: MembershipRow; t: ReturnType<typeof useT> }) {
  const hasName = !!row.companyName && row.companyName !== row.companySlug;
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="truncate text-2sm font-medium text-foreground">
          {row.companyName ?? row.companySlug}
        </div>
        {hasName ? (
          <div className="truncate text-xs text-muted-foreground">{row.companySlug}</div>
        ) : null}
      </div>
      <Badge variant="secondary">{t(`profile.role.${row.role}` as never)}</Badge>
    </li>
  );
}

function nullify(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
