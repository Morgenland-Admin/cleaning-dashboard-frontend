import { ArrowRight, Download, Settings2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

import { EmptyState } from '@/components/empty-state';
import { MaterialThumb } from '@/components/material-frame';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionLabel } from '@/components/section';
import { Badge } from '@/components/ui/badge';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import {
  MATERIAL_BRANDS,
  MATERIAL_SETS,
  brandForProject,
  isMaterialSet,
  logoSrc,
  materialBrand,
  materialHref,
  materialsFor,
  materialsSettingsHref,
  templatePath,
  type BrandMeta,
  type MaterialBrand,
  type MaterialSet,
} from '@/lib/brand-materials';
import { useMaterialDrafts } from '@/lib/use-material-draft';
import { usePageTitle } from '@/lib/use-page-title';

export function MaterialsPage() {
  const t = useT();
  usePageTitle(t('materials.title'));
  const { activeProject, isAllBrands } = useProject();
  const [params] = useSearchParams();
  // The company picked in the header decides; only the all-brands view offers a brand switch.
  const brand = isAllBrands
    ? (materialBrand(params.get('marke') ?? '') ?? MATERIAL_BRANDS[0]!)
    : brandForProject(activeProject);

  if (!brand) {
    return (
      <PageContainer>
        <PageHeading title={t('materials.title')} subtitle={t('materials.subtitle')} />
        <EmptyState
          variant="dashed"
          title={t('materials.noBrandTitle', { company: activeProject.name })}
          message={t('materials.noBrandBody')}
        />
      </PageContainer>
    );
  }
  return <BrandMaterials key={brand.id} brand={brand} switchable={isAllBrands} />;
}

function BrandMaterials({ brand, switchable }: { brand: BrandMeta; switchable: boolean }) {
  const t = useT();
  const [params, setParams] = useSearchParams();
  const set: MaterialSet = isMaterialSet(params.get('set'))
    ? (params.get('set') as MaterialSet)
    : 'kunden';
  const items = materialsFor(brand.id, set);
  const { drafts } = useMaterialDrafts(brand.companySlug);
  const edited = new Set(
    drafts.filter((d) => Object.keys(d.data).length > 0).map((d) => d.templatePath),
  );

  const update = (next: { marke?: MaterialBrand; set?: MaterialSet }) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (switchable) p.set('marke', next.marke ?? brand.id);
        p.set('set', next.set ?? set);
        return p;
      },
      { replace: true },
    );

  return (
    <PageContainer>
      <PageHeading title={t('materials.title')} subtitle={t('materials.subtitle')} />

      {switchable ? (
        <SegmentedControl
          label={t('materials.brandAria')}
          value={brand.id}
          onValueChange={(marke) => update({ marke })}
          options={MATERIAL_BRANDS.map((b) => ({ value: b.id, label: b.name }))}
          overflow="scroll"
          className="mb-4 self-start"
        />
      ) : null}

      <BrandBanner brand={brand} />

      <SegmentedControl
        label={t('materials.setAria')}
        value={set}
        onValueChange={(s) => update({ set: s })}
        options={MATERIAL_SETS.map((s) => ({
          value: s,
          label: t(`materials.set.${s}`),
          count: materialsFor(brand.id, s).length,
        }))}
        overflow="scroll"
        className="mb-4 mt-6 self-start"
      />

      <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
        {items.map((item) => (
          <li key={item.slug} className="min-w-0">
            <Link
              to={materialHref(item)}
              className="group block overflow-hidden rounded-lg border bg-card transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MaterialThumb doc={item} title={item.title} />
              <div className="flex items-start gap-2.5 border-t px-3 py-2.5">
                <span
                  className="mt-px text-xs font-semibold tabular-nums"
                  style={{ color: brand.palette[0]!.hex }}
                >
                  {item.no}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-2sm font-medium text-foreground">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.format}</p>
                </div>
                {edited.has(templatePath(item)) ? (
                  <Badge variant="accent" className="shrink-0">
                    {t('materials.edited')}
                  </Badge>
                ) : null}
                <ArrowRight
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}

function BrandBanner({ brand }: { brand: BrandMeta }) {
  const t = useT();
  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      toast({ title: t('materials.copied', { hex }) });
    } catch {
      // Clipboard can be blocked (permissions, insecure origin); the hex stays visible.
    }
  };

  return (
    <section aria-label={brand.name} className="overflow-hidden rounded-lg border bg-card">
      <div
        className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
        style={{ backgroundColor: brand.banner.bg, color: brand.banner.fg }}
      >
        <div className="min-w-0">
          {brand.bannerLogo ? (
            <img src={logoSrc(brand.bannerLogo)} alt={brand.name} className="h-8 w-auto" />
          ) : (
            <p className="text-lg font-semibold">
              teppichreinigen-lassen<span style={{ color: '#9DBBA0' }}>.de</span>
            </p>
          )}
          <p className="mt-1 text-xs" style={{ color: brand.banner.sub }}>
            {brand.tagline} · {brand.fonts.join(' + ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link
            to={materialsSettingsHref(brand.id)}
            className="inline-flex h-9 items-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ borderColor: brand.banner.sub, color: brand.banner.fg }}
          >
            <Settings2 className="size-4" aria-hidden="true" />
            {t('materials.settingsLink')}
          </Link>
          <Link
            to={`/materialien/${brand.id}/designsystem`}
            className="inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            style={{ backgroundColor: brand.banner.accent, color: brand.banner.accentFg }}
          >
            {t('materials.designSystem')}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>

      <div className="grid gap-5 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <div>
            <SectionLabel>{t('materials.colors')}</SectionLabel>
            <ul className="mt-2 flex flex-wrap gap-2">
              {brand.palette.map((c) => (
                <li key={c.hex}>
                  <button
                    type="button"
                    onClick={() => copy(c.hex)}
                    aria-label={t('materials.copyHex', { name: c.name, hex: c.hex })}
                    className="flex items-center gap-2 rounded-md border bg-background py-1 pl-1 pr-2.5 text-left transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      aria-hidden="true"
                      className="size-7 shrink-0 rounded border border-black/10"
                      style={{ backgroundColor: c.hex }}
                    />
                    <span className="leading-tight">
                      <span className="block text-xs font-medium text-foreground">{c.name}</span>
                      <span className="block font-mono text-2xs text-muted-foreground">
                        {c.hex}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SectionLabel>{t('materials.fonts')}</SectionLabel>
            <p className="mt-1.5 text-2sm text-foreground">{brand.fonts.join(' · ')}</p>
          </div>
        </div>

        <div className="min-w-0">
          <SectionLabel>{t('materials.logos')}</SectionLabel>
          {brand.logos.length === 0 ? (
            <p className="mt-1.5 text-2sm text-muted-foreground">{t('materials.noLogo')}</p>
          ) : (
            <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-2">
              {brand.logos.map((logo) => (
                <li key={logo.file}>
                  <a
                    href={logoSrc(logo.file)}
                    download={logo.file}
                    aria-label={t('materials.downloadLogo', { label: logo.label })}
                    className="group block overflow-hidden rounded-md border transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className="flex h-16 items-center justify-center px-3"
                      style={{ backgroundColor: logo.dark ? brand.banner.bg : '#FFFFFF' }}
                    >
                      <img src={logoSrc(logo.file)} alt="" className="max-h-10 w-auto max-w-full" />
                    </span>
                    <span className="flex items-center justify-between gap-2 border-t bg-background px-2 py-1.5 text-xs text-muted-foreground group-hover:text-foreground">
                      {logo.label}
                      <Download className="size-3.5" aria-hidden="true" />
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
