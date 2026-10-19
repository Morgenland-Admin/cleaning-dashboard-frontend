import { useQuery } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { MaterialBrandGuard } from '@/components/material-brand-guard';
import { SaveState } from '@/components/material-save-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useLocale, useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import { companiesAdminApi } from '@/lib/api';
import { materialBrand, materialsListHref, type BrandMeta } from '@/lib/brand-materials';
import { BRAND_PATH, QR_PURPOSES, companyValues, type QrPurpose } from '@/lib/material-data';
import { useMaterialDraft } from '@/lib/use-material-draft';
import { usePageTitle } from '@/lib/use-page-title';
import { NotFoundPage } from '@/pages/not-found';

/** `/materialien/:brand/einstellungen`: QR targets and placeholder values for every template. */
export function MaterialSettingsPage() {
  const { brand: brandId } = useParams();
  const brand = materialBrand(brandId);
  if (!brand) return <NotFoundPage />;
  return (
    <MaterialBrandGuard brand={brand} page={{ view: 'settings' }}>
      <Settings key={brand.id} brand={brand} />
    </MaterialBrandGuard>
  );
}

function Settings({ brand }: { brand: BrandMeta }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const canWrite = useCanWrite();
  usePageTitle(t('materials.settingsTitle', { brand: brand.name }));
  const draft = useMaterialDraft({ companySlug: brand.companySlug, path: BRAND_PATH, canWrite });
  const links = draft.data.links ?? {};
  const values = draft.data.values ?? {};

  const companies = useQuery({
    queryKey: ['projects-companies'],
    queryFn: ({ signal }) => companiesAdminApi.list(signal),
    staleTime: 60_000,
  });
  const company = companies.data?.companies.find((c) => c.slug === brand.companySlug);
  const fromCompany = companyValues(company);

  const setLink = (purpose: QrPurpose, value: string) =>
    draft.update((prev) => {
      const next = { ...(prev.links ?? {}) };
      if (value.trim()) next[purpose] = value;
      else delete next[purpose];
      return { ...prev, links: next };
    });

  const setValue = (key: string, value: string | null) =>
    draft.update((prev) => {
      const next = { ...(prev.values ?? {}) };
      if (value === null) delete next[key];
      else next[key] = value;
      return { ...prev, values: next };
    });

  return (
    <PageContainer width="narrow">
      <div className="mb-3">
        <BackLink to={materialsListHref(brand.id, 'kunden')}>{t('materials.back')}</BackLink>
      </div>
      <PageHeading
        title={t('materials.settingsTitle', { brand: brand.name })}
        subtitle={t('materials.settingsSubtitle')}
        meta={
          <span className="text-xs text-muted-foreground">
            <SaveState
              mode={draft.mode}
              status={draft.status}
              meta={draft.meta}
              canWrite={canWrite}
              bcp47={bcp47}
            />
          </span>
        }
      />

      <div className="space-y-4">
        <SectionCard
          title={t('materials.settingsLinksTitle')}
          description={t('materials.settingsLinksHint')}
          bodyClassName="space-y-3 px-4 py-4 sm:px-5"
        >
          {QR_PURPOSES.map((purpose) => (
            <div
              key={purpose}
              className="grid gap-1 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-center sm:gap-3"
            >
              <Label htmlFor={`link-${purpose}`}>{t(`materials.purpose.${purpose}`)}</Label>
              <Input
                id={`link-${purpose}`}
                value={links[purpose] ?? ''}
                placeholder={brand.links[purpose]}
                disabled={!draft.editable}
                onChange={(e) => setLink(purpose, e.target.value)}
              />
            </div>
          ))}
          <div className="flex items-start gap-2.5 pt-2 text-2sm">
            <Checkbox
              id="materials-utm"
              aria-describedby="materials-utm-hint"
              checked={draft.data.utm ?? true}
              disabled={!draft.editable}
              onChange={(e) => draft.update((prev) => ({ ...prev, utm: e.target.checked }))}
              className="mt-0.5"
            />
            <div>
              <label htmlFor="materials-utm" className="font-medium text-foreground">
                {t('materials.utmLabel')}
              </label>
              <p id="materials-utm-hint" className="text-xs text-muted-foreground">
                {t('materials.utmHint')}
              </p>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title={t('materials.companyDataTitle')}
          description={t('materials.companyDataHint')}
          actions={
            <Button variant="outline" size="xs" asChild>
              <Link to={`/companies/${brand.companySlug}`}>{t('materials.companyEdit')}</Link>
            </Button>
          }
          bodyClassName="px-4 py-3 sm:px-5"
        >
          <KeyValueList>
            <KeyValue label="USt-IdNr." value={company?.vatId} empty={t('materials.noValue')} />
            <KeyValue
              label="IBAN"
              value={fromCompany['IBAN · [PLATZHALTER]']}
              empty={t('materials.noValue')}
            />
            <KeyValue label="BIC" value={company?.bic} empty={t('materials.noValue')} />
            <KeyValue
              label={t('materials.accountHolder')}
              value={fromCompany['[ Kontoinhaber ]']}
              empty={t('materials.noValue')}
            />
          </KeyValueList>
        </SectionCard>

        <SectionCard
          title={t('materials.settingsValuesTitle')}
          description={t('materials.settingsValuesHint')}
          bodyClassName="space-y-3 px-4 py-4 sm:px-5"
        >
          {Object.keys(values).length === 0 ? (
            <p className="text-2sm text-muted-foreground">{t('materials.settingsValuesEmpty')}</p>
          ) : (
            Object.entries(values).map(([key, value]) => (
              <div
                key={key}
                className="grid gap-1 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center sm:gap-3"
              >
                <Label htmlFor={`value-${key}`} className="truncate" title={key}>
                  {key.split(' · ')[0]}
                </Label>
                <Input
                  id={`value-${key}`}
                  value={value}
                  disabled={!draft.editable}
                  onChange={(e) => setValue(key, e.target.value)}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={!draft.editable}
                  aria-label={t('materials.removeValue', { name: key })}
                  onClick={() => setValue(key, null)}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </div>
            ))
          )}
        </SectionCard>
      </div>
    </PageContainer>
  );
}
