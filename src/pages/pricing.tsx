import { useQueries } from '@tanstack/react-query';
import { Hammer, Package, Sofa, Sparkles, SprayCan, Tag, type LucideIcon } from 'lucide-react';
import { Fragment, useMemo } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { CountPill } from '@/components/count-pill';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { RefreshButton } from '@/components/refresh-button';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useProject, type Project } from '@/contexts/project-context';
import { useT, type DictKey } from '@/i18n';
import {
  type CatalogBracket,
  catalogApi,
  type CatalogResponse,
  type CatalogService,
  type CatalogTier,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { formatCurrency } from '@/lib/utils';

const SERVICE_ICONS: Record<CatalogService['kind'], LucideIcon> = {
  teppichreinigung: SprayCan,
  teppichreparatur: Hammer,
  polsterreinigung: Sofa,
  teppichbodenreinigung: Package,
};

/** The catalog is in cents; formatCurrency takes euros. */
function formatCents(cents: number, locale: string, currency: string): string {
  return formatCurrency(cents / 100, currency, locale);
}

const UNIT_SUFFIX: Record<CatalogService['unit'], DictKey | null> = {
  qm: 'pricing.suffix.qm',
  lfdm: 'pricing.suffix.lfdm',
  stueck: null,
  bracket: null,
};

export function PricingPage() {
  const t = useT();
  usePageTitle(t('pricing.title'));
  const { projects, activeProject, isAllBrands } = useProject();

  const brands: Project[] = useMemo(
    () => (isAllBrands ? projects : [activeProject]),
    [isAllBrands, projects, activeProject],
  );

  const catalogs = useQueries({
    queries: brands.map((p) => ({
      queryKey: ['catalog', p.companySlug],
      queryFn: ({ signal }: { signal?: AbortSignal }) => catalogApi.forBrand(p.companySlug, signal),
      staleTime: 1000 * 60 * 60,
    })),
  });

  const isLoading = catalogs.every((q) => q.isLoading);
  const isFetching = catalogs.some((q) => q.isFetching);

  function refetchAll() {
    catalogs.forEach((q) => void q.refetch());
  }

  return (
    <PageContainer>
      <PageHeading
        title={t('pricing.title')}
        subtitle={isAllBrands ? t('pricing.subtitleAllBrands') : t('pricing.subtitleSingle')}
        actions={<RefreshButton onClick={refetchAll} fetching={isFetching} />}
      />

      <div className="flex flex-col gap-6">
        <Alert tone="info">{t('pricing.readOnlyNotice')}</Alert>

        {isLoading ? (
          <LoadingState />
        ) : (
          brands.map((brand, i) => {
            const q = catalogs[i];
            if (!q) return null;
            if (q.error) {
              return (
                <ErrorState
                  key={brand.companySlug}
                  title={t('pricing.loadFailedBrand', { brand: brand.name })}
                  error={q.error}
                  onRetry={() => void q.refetch()}
                  retrying={q.isFetching}
                />
              );
            }
            if (!q.data) {
              return (
                <LoadingState
                  key={brand.companySlug}
                  inline
                  label={t('pricing.brandSection', { brand: brand.name })}
                />
              );
            }
            return <BrandSection key={brand.companySlug} brand={brand} catalog={q.data} />;
          })
        )}
      </div>
    </PageContainer>
  );
}

function BrandSection({ brand, catalog }: { brand: Project; catalog: CatalogResponse }) {
  const t = useT();
  const totalTiers = catalog.services.reduce((n, s) => n + s.tiers.length, 0);
  const listed = catalog.services.filter((s) => s.unit !== 'bracket' || !s.brackets);
  const matrices = catalog.services.filter((s) => s.unit === 'bracket' && s.brackets);
  const { locale } = brand;
  const { currency } = catalog;

  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <BrandMark brand={brand} size="sm" />
          {brand.name}
        </span>
      }
      description={[
        brand.domain,
        `${catalog.services.length} ${t('pricing.statServices')}`,
        `${totalTiers} ${t('pricing.statTiers')}`,
        `${catalog.addons.length} ${t('pricing.statAddons')}`,
      ]
        .filter(Boolean)
        .join(' · ')}
      bodyClassName="p-0 sm:p-0"
    >
      {catalog.services.length === 0 ? (
        <EmptyState size="sm" icon={<Tag aria-hidden="true" />} message={t('pricing.noServices')} />
      ) : null}

      {listed.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40%]">{t('pricing.colService')}</TableHead>
              <TableHead>{t('pricing.colTier')}</TableHead>
              <TableHead className="text-right">{t('pricing.colPrice')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {listed.map((service) => (
              <Fragment key={service.kind}>
                {service.tiers.map((tier, i) => (
                  <TableRow key={tier.code} className="hover:bg-transparent">
                    {i === 0 ? (
                      <TableCell
                        rowSpan={service.tiers.length}
                        className="border-r border-border align-top"
                      >
                        <ServiceSummary service={service} locale={locale} currency={currency} />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <span className="font-medium text-foreground">{tier.label}</span>
                      <span className="ml-2 font-mono text-2xs text-muted-foreground">
                        {tier.code}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Price
                        cents={tier.unitPriceCents}
                        unit={service.unit}
                        locale={locale}
                        currency={currency}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {matrices.map((service) => (
        <div key={service.kind} className="border-t border-border first:border-t-0">
          <div className="px-4 py-3 sm:px-5">
            <ServiceSummary service={service} locale={locale} currency={currency} />
          </div>
          <BracketMatrix
            tiers={service.tiers}
            brackets={service.brackets!}
            locale={locale}
            currency={currency}
          />
        </div>
      ))}

      {catalog.addons.length > 0 ? (
        <div className="border-t border-border first:border-t-0">
          <div className="flex items-start gap-2 px-4 py-3 sm:px-5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="text-2sm font-semibold text-foreground">
                {t('pricing.addons.title')}
              </h3>
              <p className="text-xs text-muted-foreground">{t('pricing.addons.subtitle')}</p>
            </div>
            <CountPill>{catalog.addons.length}</CountPill>
          </div>
          <AddonsTable addons={catalog.addons} locale={locale} currency={currency} />
        </div>
      ) : null}
    </SectionCard>
  );
}

function Price({
  cents,
  unit,
  locale,
  currency,
}: {
  cents: number;
  unit: CatalogService['unit'];
  locale: string;
  currency: string;
}) {
  const t = useT();
  const suffix = UNIT_SUFFIX[unit];
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold tabular-nums text-foreground">
        {formatCents(cents, locale, currency)}
      </span>
      {suffix ? <span className="ml-0.5 text-xs text-muted-foreground">{t(suffix)}</span> : null}
    </span>
  );
}

function ServiceSummary({
  service,
  locale,
  currency,
}: {
  service: CatalogService;
  locale: string;
  currency: string;
}) {
  const t = useT();
  const Icon = SERVICE_ICONS[service.kind];
  const opts = service.options ?? {};

  const minOrderCents = typeof opts.minOrderCents === 'number' ? opts.minOrderCents : null;
  const minOnsiteCents = typeof opts.minOnsiteCents === 'number' ? opts.minOnsiteCents : null;
  const anfahrtCents = typeof opts.anfahrtCents === 'number' ? opts.anfahrtCents : null;
  const freeSqmThreshold =
    typeof opts.freePickupSqmThreshold === 'number' ? opts.freePickupSqmThreshold : null;
  const dropOffLabel = typeof opts.dropOffLabel === 'string' ? opts.dropOffLabel : null;

  const fromPrice =
    service.unit === 'bracket'
      ? Math.min(
          ...(service.brackets ?? []).flatMap((b) =>
            Object.values(b.pricesCents).filter((v): v is number => typeof v === 'number'),
          ),
        )
      : Math.min(...service.tiers.map((tier) => tier.unitPriceCents));

  const hasOptions =
    minOrderCents !== null ||
    minOnsiteCents !== null ||
    anfahrtCents !== null ||
    freeSqmThreshold !== null ||
    !!dropOffLabel;

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
        aria-hidden="true"
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div>
          <h3 className="text-2sm font-semibold leading-5 text-foreground">{service.label}</h3>
          <p className="text-xs text-muted-foreground">
            {t(`pricing.unit.${service.unit}` as DictKey)}
            {Number.isFinite(fromPrice) ? (
              <>
                {' · '}
                {t('pricing.fromLabel')}{' '}
                <Price cents={fromPrice} unit={service.unit} locale={locale} currency={currency} />
              </>
            ) : null}
          </p>
        </div>
        {hasOptions ? (
          <div className="flex flex-wrap gap-1">
            {minOrderCents !== null && (
              <OptionPill
                label={t('pricing.options.minOrder')}
                value={formatCents(minOrderCents, locale, currency)}
              />
            )}
            {minOnsiteCents !== null && (
              <OptionPill
                label={t('pricing.options.minOnsite')}
                value={formatCents(minOnsiteCents, locale, currency)}
              />
            )}
            {anfahrtCents !== null && (
              <OptionPill
                label={t('pricing.options.anfahrt')}
                value={formatCents(anfahrtCents, locale, currency)}
              />
            )}
            {freeSqmThreshold !== null && (
              <OptionPill
                label={t('pricing.options.freePickup')}
                value={t('pricing.options.freePickupValue', { n: freeSqmThreshold })}
              />
            )}
            {dropOffLabel && (
              <OptionPill label={t('pricing.options.dropOff')} value={dropOffLabel} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Bracket matrix for fixed-price services; a null cell means "auf Anfrage".
function BracketMatrix({
  tiers,
  brackets,
  locale,
  currency,
}: {
  tiers: CatalogTier[];
  brackets: CatalogBracket[];
  locale: string;
  currency: string;
}) {
  const t = useT();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('pricing.area')}</TableHead>
          {tiers.map((tier) => (
            <TableHead key={tier.code} className="h-auto py-2 text-right align-top">
              <span className="text-foreground">{tier.label}</span>
              {tier.description ? (
                <span className="ml-auto mt-0.5 block max-w-[12rem] whitespace-normal font-normal">
                  {tier.description}
                </span>
              ) : null}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {brackets.map((bracket) => (
          <TableRow key={bracket.code}>
            <TableCell>
              <span className="font-medium text-foreground">{bracket.label}</span>
              <span className="ml-2 font-mono text-2xs text-muted-foreground">{bracket.code}</span>
            </TableCell>
            {tiers.map((tier) => {
              const cents = bracket.pricesCents[tier.code];
              return (
                <TableCell key={tier.code} className="text-right tabular-nums">
                  {cents == null ? (
                    <span className="text-xs text-muted-foreground">{t('pricing.onRequest')}</span>
                  ) : (
                    <span className="font-semibold text-foreground">
                      {formatCents(cents, locale, currency)}
                    </span>
                  )}
                </TableCell>
              );
            })}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AddonsTable({
  addons,
  locale,
  currency,
}: {
  addons: CatalogTier[];
  locale: string;
  currency: string;
}) {
  const t = useT();
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('pricing.colAddon')}</TableHead>
          <TableHead>{t('pricing.colCode')}</TableHead>
          <TableHead className="text-right">{t('pricing.colPrice')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {addons.map((a) => (
          <TableRow key={a.code}>
            <TableCell className="font-medium text-foreground">{a.label}</TableCell>
            <TableCell className="font-mono text-2xs text-muted-foreground">{a.code}</TableCell>
            <TableCell className="text-right">
              <Price cents={a.unitPriceCents} unit="qm" locale={locale} currency={currency} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function OptionPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-sm border border-border bg-card px-1.5 py-px text-2xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}
