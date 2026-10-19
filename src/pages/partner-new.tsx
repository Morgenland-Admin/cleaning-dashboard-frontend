import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Inbox, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { AddressAutocomplete } from '@/components/address-autocomplete';
import { EmptyState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { errMessage, partnersAdminApi, type PartnerCreateInput } from '@/lib/api';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';

type Field =
  | 'email'
  | 'companyName'
  | 'legalName'
  | 'contactPhone'
  | 'websiteUrl'
  | 'addressLine1'
  | 'postalCode'
  | 'city'
  | 'iban'
  | 'taxId';

type FormState = Record<Field, string>;

const EMPTY: FormState = {
  email: '',
  companyName: '',
  legalName: '',
  contactPhone: '',
  websiteUrl: '',
  addressLine1: '',
  postalCode: '',
  city: '',
  iban: '',
  taxId: '',
};
const EMPTY_JSON = JSON.stringify(EMPTY);

export function PartnerNewPage() {
  const t = useT();
  const { activeProject, isAllBrands } = useProject();
  const companySlug = activeProject.companySlug;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  usePageTitle(t('partners.create.title'));

  const [form, setForm] = useState<FormState>(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { blocker, allowLeave } = useLeaveGuard(JSON.stringify(form) !== EMPTY_JSON);

  const set = (key: Field) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const emailMissing = form.email.trim() === '';
  const nameMissing = form.companyName.trim() === '';

  const create = useMutation({
    mutationFn: () => {
      const payload: PartnerCreateInput = {
        email: form.email.trim(),
        companyName: form.companyName.trim(),
      };
      const optional: Exclude<Field, 'email' | 'companyName'>[] = [
        'legalName',
        'contactPhone',
        'websiteUrl',
        'addressLine1',
        'city',
        'postalCode',
        'iban',
        'taxId',
      ];
      for (const key of optional) {
        const value = form[key].trim();
        if (value) payload[key] = value;
      }
      return partnersAdminApi.create(companySlug, payload);
    },
    onSuccess: ({ partner }) => {
      toast.success(t('partners.create.created'));
      void queryClient.invalidateQueries({ queryKey: ['partners', companySlug] });
      allowLeave();
      navigate(`/partner/${partner.id}?brand=${encodeURIComponent(companySlug)}`, {
        replace: true,
      });
    },
    onError: (err) => setFormError(errMessage(err)),
  });

  const breadcrumb = [
    { label: activeProject.name },
    { label: t('partners.title'), to: '/partner' },
    { label: t('partners.create.title') },
  ];

  if (isAllBrands) {
    return (
      <PageContainer width="narrow">
        <PageHeading title={t('partners.create.title')} breadcrumb={breadcrumb} />
        <EmptyState
          variant="dashed"
          icon={<Inbox aria-hidden="true" />}
          message={t('partners.selectBrandFirst')}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      <PageHeading
        title={t('partners.create.title')}
        subtitle={t('partners.create.description')}
        breadcrumb={breadcrumb}
      />

      <form
        className="flex flex-col gap-5"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          setFormError(null);
          setSubmitted(true);
          if (emailMissing || nameMissing) return;
          create.mutate();
        }}
      >
        <SectionCard
          as="fieldset"
          title={t('partners.form.sectionCompany')}
          bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <FormField
            label={t('partners.form.companyName')}
            required
            error={submitted && nameMissing ? t('partners.form.companyRequired') : undefined}
          >
            <Input value={form.companyName} onChange={set('companyName')} />
          </FormField>
          <FormField label={t('partners.form.legalName')}>
            <Input value={form.legalName} onChange={set('legalName')} />
          </FormField>
          <FormField
            label={t('partners.form.email')}
            required
            error={submitted && emailMissing ? t('partners.form.emailRequired') : undefined}
          >
            <Input type="email" autoComplete="off" value={form.email} onChange={set('email')} />
          </FormField>
          <FormField label={t('partners.form.phone')}>
            <Input type="tel" value={form.contactPhone} onChange={set('contactPhone')} />
          </FormField>
          <FormField label={t('partners.form.website')} className="sm:col-span-2">
            <Input
              type="url"
              value={form.websiteUrl}
              onChange={set('websiteUrl')}
              placeholder={t('partners.form.websitePlaceholder')}
            />
          </FormField>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('partners.form.sectionAddress')}
          bodyClassName="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-4"
        >
          <FormField label={t('partners.form.address')} className="col-span-2">
            <AddressAutocomplete
              value={form.addressLine1}
              onChange={(v) => setForm((f) => ({ ...f, addressLine1: v }))}
              onPick={(a) =>
                setForm((f) => ({
                  ...f,
                  postalCode: a.postcode || f.postalCode,
                  city: a.city || f.city,
                }))
              }
            />
          </FormField>
          <FormField label={t('partners.form.postalCode')}>
            <Input inputMode="numeric" value={form.postalCode} onChange={set('postalCode')} />
          </FormField>
          <FormField label={t('partners.form.city')}>
            <Input value={form.city} onChange={set('city')} />
          </FormField>
        </SectionCard>

        <SectionCard
          as="fieldset"
          title={t('partners.form.sectionPayout')}
          bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <FormField label={t('partners.form.iban')}>
            <Input value={form.iban} onChange={set('iban')} className="font-mono" />
          </FormField>
          <FormField label={t('partners.form.vatId')}>
            <Input value={form.taxId} onChange={set('taxId')} />
          </FormField>
        </SectionCard>

        {formError ? <Alert tone="destructive">{formError}</Alert> : null}

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to="/partner">{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" className="flex-1 sm:flex-none" loading={create.isPending}>
            <Plus aria-hidden="true" />
            {t('partners.create.submit')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}
