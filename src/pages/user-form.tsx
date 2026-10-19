import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { PasswordInput } from '@/components/password-input';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { useAccessLevel } from '@/lib/access';
import {
  errMessage,
  staffApi,
  type StaffAccessLevel,
  type StaffDetail,
  type StaffUpdateInput,
} from '@/lib/api';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';
import {
  PASSWORD_MIN,
  accessHint,
  accessLabel,
  assignableLevels,
  generatePassword,
} from '@/pages/users-shared';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  password: string;
  accessLevel: StaffAccessLevel;
  companySlugs: string[];
  internalNotes: string;
}

function toForm(detail: StaffDetail | null, allBrands: string[]): FormState {
  const u = detail?.user;
  return {
    firstName: u?.firstName ?? '',
    lastName: u?.lastName ?? '',
    email: u?.email ?? '',
    phone: u?.phone ?? '',
    password: '',
    accessLevel: u?.accessLevel ?? 'manager',
    companySlugs: detail ? detail.memberships.map((m) => m.companySlug).sort() : allBrands,
    internalNotes: u?.internalNotes ?? '',
  };
}

export function UserFormPage() {
  const t = useT();
  const { id } = useParams();
  const isEdit = id !== undefined;
  const pageTitle = isEdit ? t('users.form.editTitle') : t('users.new');
  usePageTitle(pageTitle);
  const callerIsSuper = useAccessLevel() === 'super_admin';

  const detail = useQuery({
    queryKey: ['staff-user', id],
    enabled: isEdit,
    queryFn: ({ signal }) => staffApi.get(id!, signal),
  });
  const brands = useQuery({
    queryKey: ['staff-brands'],
    queryFn: ({ signal }) => staffApi.brands(signal),
  });

  const backTo = isEdit ? `/users/${id}` : '/users';
  const backLink = (
    <BackLink to={backTo} className="mb-3 self-start">
      {isEdit && detail.data ? detail.data.user.name : t('users.title')}
    </BackLink>
  );

  if ((isEdit && detail.isLoading) || brands.isLoading) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }

  const error = (isEdit ? detail.error : null) ?? brands.error;
  if (error || (isEdit && !detail.data) || !brands.data) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <ErrorState
          error={error ?? new Error(t('users.notFound'))}
          onRetry={() => {
            void detail.refetch();
            void brands.refetch();
          }}
        />
      </PageContainer>
    );
  }

  if (isEdit && detail.data!.user.accessLevel === 'super_admin' && !callerIsSuper) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <PageHeading title={pageTitle} />
        <EmptyState variant="dashed" message={t('users.superAdminOnly')} />
      </PageContainer>
    );
  }

  const data = isEdit ? detail.data! : null;
  return (
    <UserForm
      key={data ? `${data.user.id}:${data.user.updatedAt}` : 'new'}
      editing={data}
      brands={brands.data.brands}
      callerIsSuper={callerIsSuper}
      pageTitle={pageTitle}
      backTo={backTo}
    />
  );
}

function UserForm({
  editing,
  brands,
  callerIsSuper,
  pageTitle,
  backTo,
}: {
  editing: StaffDetail | null;
  brands: Array<{ slug: string; name: string }>;
  callerIsSuper: boolean;
  pageTitle: string;
  backTo: string;
}) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isEdit = editing != null;
  const isSelf = editing?.isSelf ?? false;

  const [initial] = useState(() =>
    toForm(
      editing,
      brands.map((b) => b.slug),
    ),
  );
  const [form, setForm] = useState(initial);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const { blocker, allowLeave } = useLeaveGuard(dirty);

  const assignable = new Set(brands.map((b) => b.slug));
  // Brands the user has that this admin cannot manage stay visible, locked.
  const lockedBrands = (editing?.memberships ?? [])
    .filter((m) => !assignable.has(m.companySlug))
    .map((m) => ({ slug: m.companySlug, name: m.companyName }));
  const levels = assignableLevels(callerIsSuper);

  const errors = {
    firstName: !form.firstName.trim() ? t('users.form.required') : null,
    lastName: !form.lastName.trim() ? t('users.form.required') : null,
    email: isEdit
      ? null
      : !form.email.trim()
        ? t('users.form.required')
        : !EMAIL_RE.test(form.email.trim())
          ? t('users.form.emailInvalid')
          : null,
    password: isEdit
      ? null
      : form.password.length < PASSWORD_MIN
        ? t('users.form.passwordTooShort', { n: PASSWORD_MIN })
        : null,
    brands: form.companySlugs.length === 0 ? t('users.form.brandsRequired') : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const set =
    (key: 'firstName' | 'lastName' | 'email' | 'phone' | 'password' | 'internalNotes') =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  function toggleBrand(slug: string, on: boolean) {
    setForm((f) => ({
      ...f,
      companySlugs: on
        ? [...f.companySlugs, slug].sort()
        : f.companySlugs.filter((s) => s !== slug),
    }));
  }

  const save = useMutation({
    mutationFn: () => {
      const phone = form.phone.trim() || null;
      const internalNotes = form.internalNotes.trim() || null;
      if (editing) {
        const patch: StaffUpdateInput = {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone,
          internalNotes,
        };
        if (!isSelf) {
          patch.accessLevel = form.accessLevel;
          patch.companySlugs = form.companySlugs;
        }
        return staffApi.update(editing.user.id, patch);
      }
      return staffApi.create({
        email: form.email.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone,
        password: form.password,
        accessLevel: form.accessLevel,
        companySlugs: form.companySlugs,
        internalNotes,
      });
    },
    onSuccess: (res) => {
      toast.success(isEdit ? t('users.toast.saved') : t('users.toast.created'));
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
      void queryClient.invalidateQueries({ queryKey: ['staff-user', res.user.id] });
      allowLeave();
      navigate(`/users/${res.user.id}`);
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  return (
    <PageContainer width="narrow">
      <PageHeading
        title={pageTitle}
        subtitle={isEdit ? editing.user.email : t('users.form.createSubtitle')}
        breadcrumb={[
          { label: t('users.title'), to: '/users' },
          { label: editing ? editing.user.name : t('users.new') },
        ]}
      />

      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          setSubmitted(true);
          if (hasErrors) return;
          save.mutate();
        }}
      >
        <SectionCard
          as="fieldset"
          title={t('users.form.sectionPerson')}
          bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <FormField
            label={t('users.form.firstName')}
            required
            error={submitted ? errors.firstName : null}
          >
            <Input value={form.firstName} onChange={set('firstName')} autoComplete="off" />
          </FormField>
          <FormField
            label={t('users.form.lastName')}
            required
            error={submitted ? errors.lastName : null}
          >
            <Input value={form.lastName} onChange={set('lastName')} autoComplete="off" />
          </FormField>
          <FormField
            label={t('users.form.email')}
            required={!isEdit}
            hint={isEdit ? t('users.form.emailLocked') : t('users.form.emailHint')}
            error={submitted ? errors.email : null}
          >
            <Input
              type="email"
              value={form.email}
              onChange={set('email')}
              disabled={isEdit}
              autoComplete="off"
            />
          </FormField>
          <FormField label={t('users.form.phone')}>
            <Input type="tel" value={form.phone} onChange={set('phone')} autoComplete="off" />
          </FormField>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('users.form.sectionAccess')}
          description={isSelf ? t('users.form.selfLocked') : undefined}
          bodyClassName="grid grid-cols-1 gap-4"
        >
          <FormField label={t('users.form.level')} hint={accessHint(t, form.accessLevel)}>
            <Select<StaffAccessLevel>
              value={form.accessLevel}
              disabled={isSelf}
              onValueChange={(v) => setForm((f) => ({ ...f, accessLevel: v }))}
              options={levels.map((l) => ({
                value: l,
                label: accessLabel(t, l),
                description: accessHint(t, l),
              }))}
            />
          </FormField>

          <fieldset className="space-y-2" aria-describedby="user-brands-hint">
            <legend className="text-2sm font-medium">
              {t('users.form.brands')}
              <span className="text-destructive"> *</span>
            </legend>
            <p id="user-brands-hint" className="text-xs text-muted-foreground">
              {t('users.form.brandsHint')}
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {brands.map((b) => (
                <li key={b.slug}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border px-3 py-2 text-2sm has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60">
                    <Checkbox
                      checked={form.companySlugs.includes(b.slug)}
                      disabled={isSelf}
                      onChange={(e) => toggleBrand(b.slug, e.target.checked)}
                    />
                    {b.name}
                  </label>
                </li>
              ))}
              {lockedBrands.map((b) => (
                <li key={b.slug}>
                  <label className="flex cursor-not-allowed items-center gap-2.5 rounded-md border border-dashed border-border px-3 py-2 text-2sm opacity-60">
                    <Checkbox checked disabled />
                    {b.name}
                  </label>
                </li>
              ))}
            </ul>
            {submitted && errors.brands ? (
              <p className="text-xs text-destructive" role="alert">
                {errors.brands}
              </p>
            ) : null}
          </fieldset>
        </SectionCard>

        {!isEdit ? (
          <SectionCard
            as="fieldset"
            title={t('users.form.sectionPassword')}
            description={t('users.form.passwordHint')}
            bodyClassName="grid grid-cols-1 gap-4"
          >
            <FormField
              label={t('users.form.password')}
              required
              error={submitted ? errors.password : null}
            >
              <PasswordInput
                value={form.password}
                onChange={set('password')}
                autoComplete="new-password"
              />
            </FormField>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setForm((f) => ({ ...f, password: generatePassword() }))}
            >
              <Wand2 aria-hidden="true" />
              {t('users.form.generate')}
            </Button>
          </SectionCard>
        ) : null}

        <SectionCard as="fieldset" title={t('users.form.sectionNotes')}>
          <FormField label={t('users.form.notes')} hint={t('users.form.notesHint')}>
            <Textarea rows={3} value={form.internalNotes} onChange={set('internalNotes')} />
          </FormField>
        </SectionCard>

        {formError ? <Alert tone="destructive">{formError}</Alert> : null}

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to={backTo}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" className="flex-1 sm:flex-none" loading={save.isPending}>
            {isEdit ? <Save aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {isEdit ? t('users.form.save') : t('users.form.create')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}
