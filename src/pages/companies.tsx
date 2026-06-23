import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cloneElement, isValidElement, useId, useState } from 'react';
import { Link } from 'react-router-dom';

import { PageHeading } from '@/components/page-heading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import {
  ApiError,
  companiesAdminApi,
  type CompanyListRow,
  type CreateCompanyInput,
} from '@/lib/api';
import { useSession } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';

export function CompaniesPage() {
  const t = useT();
  usePageTitle(t('companies.title'));
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userMeta = session?.user as { accessLevel?: string } | undefined;
  const isSuperAdmin = userMeta?.accessLevel === 'super_admin';

  const list = useQuery({
    queryKey: ['companies-admin'],
    queryFn: ({ signal }) => companiesAdminApi.list(signal),
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ['companies-admin'] });
    void queryClient.invalidateQueries({ queryKey: ['projects-companies'] });
  }

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-4xl flex-col p-4 sm:p-6 lg:p-8">
      <PageHeading
        title={t('companies.title')}
        subtitle={t('companies.subtitle')}
        actions={
          isSuperAdmin ? (
            <Button asChild>
              <Link to="/companies/new">
                <Plus className="mr-1.5 size-4" aria-hidden="true" /> {t('companies.newCompany')}
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="space-y-2">
        {list.isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> {t('companies.loading')}
          </div>
        ) : list.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{(list.error as Error).message}</span>
          </div>
        ) : list.data?.companies.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {t('companies.noAccess')}
          </div>
        ) : (
          list.data?.companies.map((c) => (
            <CompanyRow key={c.slug} company={c} t={t} onChanged={invalidate} />
          ))
        )}
      </div>

      {!isSuperAdmin ? (
        <div className="mt-6 flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{t('companies.superAdminsOnly')}</span>
        </div>
      ) : null}
    </div>
  );
}

function CompanyRow({
  company,
  t,
}: {
  company: CompanyListRow;
  t: ReturnType<typeof useT>;
  onChanged?: () => void;
}) {
  return (
    <Link
      to={`/companies/${company.slug}`}
      className="group block rounded-lg border border-border bg-card p-4 transition-colors hover:border-border/80 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <CompanyLogoOrMark company={company} size="md" />
          <div className="min-w-0">
            <div className="truncate font-medium">{company.name}</div>
            <div className="truncate text-xs text-muted-foreground">
              {company.slug} · {t('companies.schemaLabel')} „{company.schemaName}"
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!company.isActive ? (
            <span className="rounded-full border border-warning/30 bg-warning-soft px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-warning">
              {t('companies.inactiveLabel')}
            </span>
          ) : null}
          <span className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {company.role}
          </span>
          <ChevronRight
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </div>
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
        className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-white ${dim}`}
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
      className={`inline-flex shrink-0 items-center justify-center rounded-md text-xs font-bold text-white ${dim}`}
      style={{
        backgroundColor: company.primaryColor ?? 'hsl(var(--muted-foreground))',
      }}
    >
      {initials || <Building2 className="size-5 opacity-80" />}
    </span>
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
  const [logoUrl, setLogoUrl] = useState(company.logoUrl ?? '');
  const [primaryColor, setPrimaryColor] = useState(company.primaryColor ?? '');
  const [senderEmail, setSenderEmail] = useState(company.senderEmail ?? '');
  const [senderName, setSenderName] = useState(company.senderName ?? '');
  const [storefrontOrigin, setStorefrontOrigin] = useState(company.storefrontOrigin ?? '');

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
        logoUrl: nl(logoUrl),
        primaryColor: nl(primaryColor),
        senderEmail: nl(senderEmail),
        senderName: nl(senderName),
        storefrontOrigin: nl(storefrontOrigin),
      }),
    onSuccess: onSaved,
    onError: (err) => setError(err instanceof ApiError ? err.message : (err as Error).message),
  });

  return (
    <form
      className="mt-4 space-y-5 border-t border-border pt-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        mutation.mutate();
      }}
    >
      <Section title={t('companies.edit.sections.basics')}>
        <Field label={t('companies.edit.fields.displayName')} required>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label={t('companies.edit.fields.legalName')}>
          <Input
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            placeholder={t('companies.edit.fields.legalNamePlaceholder')}
          />
        </Field>
        <label className="flex cursor-pointer items-center gap-2 self-start text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="size-4 rounded border-border accent-primary"
          />
          <span>{t('companies.edit.fields.active')}</span>
        </label>
      </Section>

      <Section title={t('companies.edit.sections.contact')}>
        <Field label={t('companies.edit.fields.email')}>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder={t('companies.edit.fields.emailPlaceholder')}
          />
        </Field>
        <Field label={t('companies.edit.fields.phone')}>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            placeholder={t('companies.edit.fields.phonePlaceholder')}
          />
        </Field>
        <Field label={t('companies.edit.fields.websiteUrl')}>
          <Input
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            type="url"
            placeholder={t('companies.edit.fields.websiteUrlPlaceholder')}
          />
        </Field>
      </Section>

      <Section title={t('companies.edit.sections.address')}>
        <Field label={t('companies.edit.fields.addressLine1')}>
          <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} />
        </Field>
        <Field label={t('companies.edit.fields.addressLine2')}>
          <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr_120px]">
          <Field label={t('companies.edit.fields.postalCode')}>
            <Input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              maxLength={20}
            />
          </Field>
          <Field label={t('companies.edit.fields.city')}>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </Field>
          <Field label={t('companies.edit.fields.country')}>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
              maxLength={2}
              placeholder={t('companies.edit.fields.countryPlaceholder')}
            />
          </Field>
        </div>
        <Field label={t('companies.edit.fields.region')}>
          <Input value={region} onChange={(e) => setRegion(e.target.value)} />
        </Field>
      </Section>

      <Section title={t('companies.edit.sections.legal')}>
        <Field label={t('companies.edit.fields.vatId')}>
          <Input
            value={vatId}
            onChange={(e) => setVatId(e.target.value)}
            placeholder={t('companies.edit.fields.vatIdPlaceholder')}
          />
        </Field>
        <Field label={t('companies.edit.fields.registrationNumber')}>
          <Input
            value={registrationNumber}
            onChange={(e) => setRegistrationNumber(e.target.value)}
            placeholder={t('companies.edit.fields.registrationNumberPlaceholder')}
          />
        </Field>
      </Section>

      <Section title={t('companies.edit.sections.branding')}>
        <Field label={t('companies.edit.fields.logoUrl')}>
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder={t('companies.edit.fields.logoUrlPlaceholder')}
            type="url"
          />
        </Field>
        <Field label={t('companies.edit.fields.primaryColor')}>
          <Input
            value={primaryColor}
            onChange={(e) => setPrimaryColor(e.target.value)}
            placeholder={t('companies.edit.fields.primaryColorPlaceholder')}
            pattern="^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
          />
        </Field>
      </Section>

      <Section title={t('companies.edit.sections.senderStorefront')}>
        <Field label={t('companies.edit.fields.senderEmail')}>
          <Input
            value={senderEmail}
            onChange={(e) => setSenderEmail(e.target.value)}
            type="email"
            placeholder={t('companies.edit.fields.senderEmailPlaceholder')}
          />
        </Field>
        <Field label={t('companies.edit.fields.senderName')}>
          <Input
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder={t('companies.edit.fields.senderNamePlaceholder')}
          />
        </Field>
        <Field label={t('companies.edit.fields.storefrontOrigin')}>
          <Input
            value={storefrontOrigin}
            onChange={(e) => setStorefrontOrigin(e.target.value)}
            type="url"
            placeholder={t('companies.edit.fields.storefrontOriginPlaceholder')}
          />
        </Field>
      </Section>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="mr-1.5 size-4" />
          {t('companies.edit.cancelButton')}
        </button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> {t('companies.edit.savingButton')}
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 size-4" /> {t('companies.edit.saveButton')}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </legend>
      {children}
    </fieldset>
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
      <Field label={t('companies.create.slug')} hint={t('companies.create.slugHint')} required>
        <Input
          value={form.slug}
          onChange={update('slug')}
          placeholder={t('companies.create.slugPlaceholder')}
          required
          pattern="^[a-z][a-z0-9_]{1,62}$"
        />
      </Field>
      <Field label={t('companies.create.displayName')} required>
        <Input
          value={form.name}
          onChange={update('name')}
          placeholder={t('companies.create.displayNamePlaceholder')}
          required
        />
      </Field>
      <Field label={t('companies.create.logoUrl')} hint={t('companies.create.logoUrlHint')}>
        <Input
          value={form.logoUrl}
          onChange={update('logoUrl')}
          placeholder="https://… /logo.svg"
          type="url"
        />
      </Field>
      <Field
        label={t('companies.create.primaryColor')}
        hint={t('companies.create.primaryColorHint')}
      >
        <Input
          value={form.primaryColor}
          onChange={update('primaryColor')}
          placeholder="#bd5b3e"
          pattern="^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$"
        />
      </Field>
      <Field
        label={t('companies.create.storefrontOrigin')}
        hint={t('companies.create.storefrontOriginHint')}
      >
        <Input
          value={form.storefrontOrigin}
          onChange={update('storefrontOrigin')}
          placeholder="https://koeln-premium.de"
          type="url"
        />
      </Field>
      <Field label={t('companies.create.senderEmail')}>
        <Input
          value={form.senderEmail}
          onChange={update('senderEmail')}
          placeholder="kontakt@koeln-premium.de"
          type="email"
        />
      </Field>
      <Field label={t('companies.create.contactEmail')}>
        <Input
          value={form.email}
          onChange={update('email')}
          placeholder="admin@koeln-premium.de"
          type="email"
        />
      </Field>
      <Field label={t('companies.create.websiteUrl')}>
        <Input
          value={form.websiteUrl}
          onChange={update('websiteUrl')}
          placeholder="https://koeln-premium.de"
          type="url"
        />
      </Field>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive sm:col-span-2">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />{' '}
              {t('companies.create.submittingButton')}
            </>
          ) : (
            t('companies.create.submitButton')
          )}
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
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
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
