import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import {
  ApiError,
  companiesAdminApi,
  type CompanyListRow,
  type CreateCompanyInput,
} from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';
import { cn } from '@/lib/utils';

type T = ReturnType<typeof useT>;

const MEMBERSHIP_ROLES = ['owner', 'admin', 'manager', 'viewer', 'partner'] as const;

function roleLabel(role: string, t: T): string {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(role)
    ? t(`profile.role.${role as (typeof MEMBERSHIP_ROLES)[number]}`)
    : role;
}

export function CompaniesPage() {
  const t = useT();
  usePageTitle(t('companies.title'));
  const { data: session } = useSession();
  const userMeta = session?.user as { accessLevel?: string } | undefined;
  const isSuperAdmin = userMeta?.accessLevel === 'super_admin';

  const list = useQuery({
    queryKey: ['companies-admin'],
    queryFn: ({ signal }) => companiesAdminApi.list(signal),
  });

  return (
    <PageContainer width="full">
      <PageHeading
        title={t('companies.title')}
        subtitle={t('companies.subtitle')}
        actions={
          isSuperAdmin ? (
            <Button asChild>
              <Link to="/companies/new">
                <Plus aria-hidden="true" />
                {t('companies.newCompany')}
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-col gap-4">
        {list.isLoading ? (
          <LoadingState label={t('companies.loading')} />
        ) : list.error ? (
          <ErrorState
            error={list.error}
            onRetry={() => void list.refetch()}
            retrying={list.isFetching}
          />
        ) : !list.data || list.data.companies.length === 0 ? (
          <EmptyState
            variant="dashed"
            icon={<Building2 aria-hidden="true" />}
            message={t('companies.noAccess')}
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border bg-card">
            {list.data.companies.map((c) => (
              <li key={c.slug}>
                <CompanyRow company={c} t={t} />
              </li>
            ))}
          </ul>
        )}

        {!isSuperAdmin ? (
          <Alert tone="neutral" icon={<ShieldCheck aria-hidden="true" />}>
            {t('companies.superAdminsOnly')}
          </Alert>
        ) : null}
      </div>
    </PageContainer>
  );
}

function CompanyRow({ company, t }: { company: CompanyListRow; t: T }) {
  return (
    <Link
      to={`/companies/${company.slug}`}
      className="group flex items-center justify-between gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <div className="flex min-w-0 items-center gap-3">
        <CompanyLogoOrMark company={company} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">{company.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {company.slug} · {t('companies.schemaLabel')} „{company.schemaName}“
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!company.isActive ? <Badge variant="warning">{t('companies.inactiveLabel')}</Badge> : null}
        <Badge variant="secondary">{roleLabel(company.role, t)}</Badge>
        <ChevronRight
          className="size-4 text-muted-foreground transition-transform duration-fast group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </div>
    </Link>
  );
}

export function CompanyLogoOrMark({
  company,
  size = 'sm',
}: {
  company: Pick<CompanyListRow, 'name' | 'logoUrl' | 'primaryColor'>;
  size?: 'sm' | 'md' | 'lg';
}) {
  const dim = size === 'lg' ? 'size-12' : size === 'md' ? 'size-10' : 'size-8';
  if (company.logoUrl) {
    return (
      <span
        className={cn(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white',
          dim,
        )}
      >
        <img src={company.logoUrl} alt="" className="size-full object-contain" loading="lazy" />
      </span>
    );
  }
  const initials = company.name
    .replace(/[^A-Za-zÀ-ÿ]/g, '')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md text-xs font-bold text-white',
        dim,
      )}
      style={{
        backgroundColor: company.primaryColor ?? 'hsl(var(--muted-foreground))',
      }}
    >
      {initials || <Building2 className="size-5 opacity-80" aria-hidden="true" />}
    </span>
  );
}

function CheckboxField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        className="mt-0.5"
        checked={checked}
        aria-describedby={descriptionId}
        onChange={(e) => onChange(e.target.checked)}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-2sm font-medium text-foreground">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// slug, schemaName, keyPrefix are immutable (tenant isolation + S3 layout) and not editable.
export function EditBrandingForm({
  company,
  onClose,
  onSaved,
}: {
  company: CompanyListRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [name, setName] = useState(company.name);
  const [legalName, setLegalName] = useState(company.legalName ?? '');
  const [isActive, setIsActive] = useState(company.isActive);
  const [email, setEmail] = useState(company.email ?? '');
  const [phone, setPhone] = useState(company.phone ?? '');
  const [websiteUrl, setWebsiteUrl] = useState(company.websiteUrl ?? '');
  const [addressLine1, setAddressLine1] = useState(company.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(company.addressLine2 ?? '');
  const [city, setCity] = useState(company.city ?? '');
  const [region, setRegion] = useState(company.region ?? '');
  const [postalCode, setPostalCode] = useState(company.postalCode ?? '');
  const [country, setCountry] = useState(company.country ?? 'DE');
  const [vatId, setVatId] = useState(company.vatId ?? '');
  const [registrationNumber, setRegistrationNumber] = useState(company.registrationNumber ?? '');
  // Pflichtangaben printed on every invoice (sender block + legal footer).
  const [businessId, setBusinessId] = useState(company.businessId ?? '');
  const [legalForm, setLegalForm] = useState(company.legalForm ?? '');
  const [managingDirectors, setManagingDirectors] = useState(company.managingDirectors ?? '');
  const [chamber, setChamber] = useState(company.chamber ?? '');
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? '');
  const [primaryColor, setPrimaryColor] = useState(company.primaryColor ?? '');
  const [senderEmail, setSenderEmail] = useState(company.senderEmail ?? '');
  const [senderName, setSenderName] = useState(company.senderName ?? '');
  const [storefrontOrigin, setStorefrontOrigin] = useState(company.storefrontOrigin ?? '');
  const [autoIssueInvoices, setAutoIssueInvoices] = useState(company.autoIssueInvoices);

  const [error, setError] = useState<string | null>(null);

  const nl = (s: string) => (s.trim() ? s.trim() : null);

  const mutation = useMutation({
    mutationFn: () =>
      companiesAdminApi.update(company.slug, {
        name: name.trim(),
        legalName: nl(legalName),
        isActive,
        email: nl(email),
        phone: nl(phone),
        websiteUrl: nl(websiteUrl),
        addressLine1: nl(addressLine1),
        addressLine2: nl(addressLine2),
        city: nl(city),
        region: nl(region),
        postalCode: nl(postalCode),
        country: nl(country),
        vatId: nl(vatId),
        registrationNumber: nl(registrationNumber),
        businessId: nl(businessId),
        legalForm: nl(legalForm),
        managingDirectors: nl(managingDirectors),
        chamber: nl(chamber),
        logoUrl: nl(logoUrl),
        primaryColor: nl(primaryColor),
        senderEmail: nl(senderEmail),
        senderName: nl(senderName),
        storefrontOrigin: nl(storefrontOrigin),
        autoIssueInvoices,
      }),
    onSuccess: () => {
      toast.success(t('companies.edit.saved'));
      onSaved();
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        mutation.mutate();
      }}
    >
      <SectionCard as="fieldset" headingLevel={3} title={t('companies.edit.sections.basics')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('companies.edit.fields.displayName')} required>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </FormField>
          <FormField label={t('companies.edit.fields.legalName')}>
            <Input
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder={t('companies.edit.fields.legalNamePlaceholder')}
            />
          </FormField>
          <div className="sm:col-span-2">
            <CheckboxField
              label={t('companies.edit.fields.active')}
              checked={isActive}
              onChange={setIsActive}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard as="fieldset" headingLevel={3} title={t('companies.edit.sections.contact')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('companies.edit.fields.email')}>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder={t('companies.edit.fields.emailPlaceholder')}
            />
          </FormField>
          <FormField label={t('companies.edit.fields.phone')}>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              type="tel"
              placeholder={t('companies.edit.fields.phonePlaceholder')}
            />
          </FormField>
          <FormField label={t('companies.edit.fields.websiteUrl')} className="sm:col-span-2">
            <Input
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              type="url"
              placeholder={t('companies.edit.fields.websiteUrlPlaceholder')}
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard as="fieldset" headingLevel={3} title={t('companies.edit.sections.address')}>
        <div className="grid gap-4">
          <FormField label={t('companies.edit.fields.addressLine1')}>
            <AddressAutocomplete
              value={addressLine1}
              onChange={setAddressLine1}
              onPick={(a) => {
                if (a.postcode) setPostalCode(a.postcode);
                if (a.city) setCity(a.city);
              }}
            />
          </FormField>
          <FormField label={t('companies.edit.fields.addressLine2')}>
            <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
          </FormField>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr_120px]">
            <FormField label={t('companies.edit.fields.postalCode')}>
              <Input
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                maxLength={20}
                className="tabular-nums"
              />
            </FormField>
            <FormField label={t('companies.edit.fields.city')}>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </FormField>
            <FormField label={t('companies.edit.fields.country')}>
              <Input
                value={country}
                onChange={(e) => setCountry(e.target.value.toUpperCase())}
                maxLength={2}
                placeholder={t('companies.edit.fields.countryPlaceholder')}
              />
            </FormField>
          </div>
          <FormField label={t('companies.edit.fields.region')}>
            <Input value={region} onChange={(e) => setRegion(e.target.value)} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard as="fieldset" headingLevel={3} title={t('companies.edit.sections.legal')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('companies.edit.fields.vatId')}>
            <Input
              value={vatId}
              onChange={(e) => setVatId(e.target.value)}
              placeholder={t('companies.edit.fields.vatIdPlaceholder')}
            />
          </FormField>
          <FormField label={t('companies.edit.fields.registrationNumber')}>
            <Input
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              placeholder={t('companies.edit.fields.registrationNumberPlaceholder')}
            />
          </FormField>
          <FormField
            label={t('companies.edit.fields.businessId')}
            hint={t('companies.edit.fields.businessIdHint')}
          >
            <Input
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              maxLength={32}
              placeholder={t('companies.edit.fields.businessIdPlaceholder')}
            />
          </FormField>
          <FormField label={t('companies.edit.fields.legalForm')}>
            <Input
              value={legalForm}
              onChange={(e) => setLegalForm(e.target.value)}
              maxLength={64}
              placeholder={t('companies.edit.fields.legalFormPlaceholder')}
            />
          </FormField>
          <FormField
            label={t('companies.edit.fields.managingDirectors')}
            hint={t('companies.edit.fields.managingDirectorsHint')}
          >
            <Input
              value={managingDirectors}
              onChange={(e) => setManagingDirectors(e.target.value)}
              maxLength={200}
              placeholder={t('companies.edit.fields.managingDirectorsPlaceholder')}
            />
          </FormField>
          <FormField label={t('companies.edit.fields.chamber')}>
            <Input
              value={chamber}
              onChange={(e) => setChamber(e.target.value)}
              maxLength={200}
              placeholder={t('companies.edit.fields.chamberPlaceholder')}
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard as="fieldset" headingLevel={3} title={t('companies.edit.sections.invoicing')}>
        <CheckboxField
          label={t('companies.edit.fields.autoIssueInvoices')}
          description={t('companies.edit.fields.autoIssueInvoicesHint')}
          checked={autoIssueInvoices}
          onChange={setAutoIssueInvoices}
        />
      </SectionCard>

      <SectionCard as="fieldset" headingLevel={3} title={t('companies.edit.sections.branding')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('companies.edit.fields.logoUrl')}>
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder={t('companies.edit.fields.logoUrlPlaceholder')}
              type="url"
            />
          </FormField>
          <FormField label={t('companies.edit.fields.primaryColor')}>
            <Input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              placeholder={t('companies.edit.fields.primaryColorPlaceholder')}
              pattern="^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
            />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard
        as="fieldset"
        headingLevel={3}
        title={t('companies.edit.sections.senderStorefront')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('companies.edit.fields.senderEmail')}>
            <Input
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
              type="email"
              placeholder={t('companies.edit.fields.senderEmailPlaceholder')}
            />
          </FormField>
          <FormField label={t('companies.edit.fields.senderName')}>
            <Input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder={t('companies.edit.fields.senderNamePlaceholder')}
            />
          </FormField>
          <FormField label={t('companies.edit.fields.storefrontOrigin')} className="sm:col-span-2">
            <Input
              value={storefrontOrigin}
              onChange={(e) => setStorefrontOrigin(e.target.value)}
              type="url"
              placeholder={t('companies.edit.fields.storefrontOriginPlaceholder')}
            />
          </FormField>
        </div>
      </SectionCard>

      {error ? <Alert tone="destructive">{error}</Alert> : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('companies.edit.cancelButton')}
        </Button>
        <Button type="submit" loading={mutation.isPending}>
          {t('companies.edit.saveButton')}
        </Button>
      </div>
    </form>
  );
}

export function CreateCompanyForm({ onCreated }: { onCreated: () => void }) {
  const t = useT();
  const [form, setForm] = useState<CreateCompanyInput>({
    slug: '',
    name: '',
    storefrontOrigin: '',
    senderEmail: '',
    email: '',
    websiteUrl: '',
    primaryColor: '',
    logoUrl: '',
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: CreateCompanyInput) => companiesAdminApi.create(input),
    onSuccess: () => {
      onCreated();
      setForm({
        slug: '',
        name: '',
        storefrontOrigin: '',
        senderEmail: '',
        email: '',
        websiteUrl: '',
        primaryColor: '',
        logoUrl: '',
      });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  function update<K extends keyof CreateCompanyInput>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload: CreateCompanyInput = {
      slug: form.slug.trim(),
      name: form.name.trim(),
    };
    if (form.storefrontOrigin?.trim()) payload.storefrontOrigin = form.storefrontOrigin.trim();
    if (form.senderEmail?.trim()) payload.senderEmail = form.senderEmail.trim();
    if (form.email?.trim()) payload.email = form.email.trim();
    if (form.websiteUrl?.trim()) payload.websiteUrl = form.websiteUrl.trim();
    if (form.primaryColor?.trim()) payload.primaryColor = form.primaryColor.trim();
    if (form.logoUrl?.trim()) payload.logoUrl = form.logoUrl.trim();
    mutation.mutate(payload);
  }

  return (
    <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={onSubmit}>
      <FormField label={t('companies.create.slug')} hint={t('companies.create.slugHint')} required>
        <Input
          value={form.slug}
          onChange={update('slug')}
          placeholder={t('companies.create.slugPlaceholder')}
          required
          pattern="^[a-z][a-z0-9_]{1,62}$"
        />
      </FormField>
      <FormField label={t('companies.create.displayName')} required>
        <Input
          value={form.name}
          onChange={update('name')}
          placeholder={t('companies.create.displayNamePlaceholder')}
          required
        />
      </FormField>
      <FormField label={t('companies.create.logoUrl')} hint={t('companies.create.logoUrlHint')}>
        <Input
          value={form.logoUrl}
          onChange={update('logoUrl')}
          placeholder="https://… /logo.svg"
          type="url"
        />
      </FormField>
      <FormField
        label={t('companies.create.primaryColor')}
        hint={t('companies.create.primaryColorHint')}
      >
        <Input
          value={form.primaryColor}
          onChange={update('primaryColor')}
          placeholder="#bd5b3e"
          pattern="^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
        />
      </FormField>
      <FormField
        label={t('companies.create.storefrontOrigin')}
        hint={t('companies.create.storefrontOriginHint')}
      >
        <Input
          value={form.storefrontOrigin}
          onChange={update('storefrontOrigin')}
          placeholder="https://koeln-premium.de"
          type="url"
        />
      </FormField>
      <FormField label={t('companies.create.senderEmail')}>
        <Input
          value={form.senderEmail}
          onChange={update('senderEmail')}
          placeholder="kontakt@koeln-premium.de"
          type="email"
        />
      </FormField>
      <FormField label={t('companies.create.contactEmail')}>
        <Input
          value={form.email}
          onChange={update('email')}
          placeholder="admin@koeln-premium.de"
          type="email"
        />
      </FormField>
      <FormField label={t('companies.create.websiteUrl')}>
        <Input
          value={form.websiteUrl}
          onChange={update('websiteUrl')}
          placeholder="https://koeln-premium.de"
          type="url"
        />
      </FormField>

      {error ? (
        <Alert tone="destructive" className="sm:col-span-2">
          {error}
        </Alert>
      ) : null}

      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" loading={mutation.isPending}>
          {t('companies.create.submitButton')}
        </Button>
      </div>
    </form>
  );
}
