import { useQueries } from '@tanstack/react-query';
import {
  AlertCircle,
  Hammer,
  Info,
  Loader2,
  Package,
  RefreshCcw,
  Sofa,
  Sparkles,
  SprayCan,
  Tag,
} from 'lucide-react';
import { useMemo } from 'react';

import { BrandMark } from '@/components/brand-mark';
import { PageHeading } from '@/components/page-heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProject, type Project } from '@/contexts/project-context';
import { useT } from '@/i18n';
import {
  type ApiError,
  type CatalogBracket,
  catalogApi,
  type CatalogResponse,
  type CatalogService,
  type CatalogTier,
} from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';

const SERVICE_ICONS: Record<CatalogService['kind'], React.ComponentType<{ className?: string }>> = {
  teppichreinigung: SprayCan,
  teppichreparatur: Hammer,
  polsterreinigung: Sofa,
  teppichbodenreinigung: Package,
};

function formatEurCents(cents: number, locale: string, currency: string): string {
  return (cents / 100).toLocaleString(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  });
}

function unitSuffix(unit: CatalogService['unit']): string {
  switch (unit) {
    case 'qm':
      return '/m²';
    case 'lfdm':
      return '/lfdm';
    case 'stueck':
      return '';
    case 'bracket':
      // Festpreis pro Auftrag — keine Einheit hinten.
      return '';
  }
}

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
  const firstError = catalogs.find((q) => q.error)?.error as ApiError | Error | undefined;

  function refetchAll() {
    catalogs.forEach((q) => q.refetch());
  }

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-6xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeading
        title={t('pricing.title')}
        subtitle={isAllBrands ? t('pricing.subtitleAllBrands') : t('pricing.subtitleSingle')}
        actions={
          <Button variant="outline" size="sm" onClick={refetchAll} disabled={isFetching}>
            {isFetching ? (
              <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCcw className="mr-1.5 size-4" aria-hidden="true" />
            )}
            {t('common.refresh')}
          </Button>
        }
      />

      <ReadOnlyNotice text={t('pricing.readOnlyNotice')} />

      {isLoading ? (
        <LoadingState label={t('common.loading')} />
      ) : firstError ? (
        <ErrorState title={t('common.error')} message={firstError.message} />
      ) : (
        <div className="flex flex-col gap-12">
          {brands.map((brand, i) => {
            const data = catalogs[i]?.data;
            if (!data) return null;
            return <BrandSection key={brand.companySlug} brand={brand} catalog={data} />;
          })}
        </div>
      )}
    </div>
  );
}

function ReadOnlyNotice({ text }: { text: string }) {
  return (
    <div
      role="note"
      className="flex items-start gap-3 rounded-lg border border-rust/20 bg-rust-soft/40 px-4 py-3"
    >
      <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-rust/15 text-rust">
        <Info className="size-3" aria-hidden="true" />
      </span>
      <p className="text-xs leading-relaxed text-foreground/80">{text}</p>
    </div>
  );
}

function BrandSection({ brand, catalog }: { brand: Project; catalog: CatalogResponse }) {
  const t = useT();
  const totalTiers = catalog.services.reduce((n, s) => n + s.tiers.length, 0);

  return (
    <section
      aria-label={t('pricing.brandSection', { brand: brand.name })}
      className="flex flex-col gap-5"
    >
      <header className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="flex min-w-0 items-center gap-4">
            <BrandMark brand={brand} size="lg" />
            <div className="min-w-0">
              <h2 className="font-serif text-2xl leading-tight text-foreground">{brand.name}</h2>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{brand.domain}</p>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-x-6 gap-y-1 rounded-lg border border-border/60 bg-background/60 px-4 py-2.5">
            <Stat icon={Tag} label={t('pricing.statServices')} value={catalog.services.length} />
            <Stat icon={Package} label={t('pricing.statTiers')} value={totalTiers} />
            <Stat icon={Sparkles} label={t('pricing.statAddons')} value={catalog.addons.length} />
          </dl>
        </div>
      </header>

      {catalog.services.length === 0 ? (
        <EmptyServices label={t('pricing.noServices')} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {catalog.services.map((svc) => (
            <ServiceCard
              key={svc.kind}
              service={svc}
              locale={brand.locale}
              currency={catalog.currency}
            />
          ))}
        </div>
      )}

      {catalog.addons.length > 0 && (
        <AddonsStrip
          addons={catalog.addons}
          locale={brand.locale}
          currency={catalog.currency}
          title={t('pricing.addons.title')}
          subtitle={t('pricing.addons.subtitle')}
        />
      )}
    </section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 text-center">
      <div className="flex items-baseline gap-1.5">
        <Icon className="size-3 text-muted-foreground" aria-hidden="true" />
        <span className="font-mono text-lg font-medium tabular-nums text-foreground">{value}</span>
      </div>
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
    </div>
  );
}

function ServiceCard({
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

  const isBracket = service.unit === 'bracket';

  // "ab"-Preis: bei Bracket-Services aus der Matrix (kleinster non-null Wert),
  // sonst aus der Tier-Liste.
  const fromPrice = isBracket
    ? Math.min(
        ...(service.brackets ?? []).flatMap((b) =>
          Object.values(b.pricesCents).filter((v): v is number => typeof v === 'number'),
        ),
      )
    : Math.min(...service.tiers.map((t) => t.unitPriceCents));

  return (
    <div
      className={`group flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-shadow hover:shadow-sm ${
        isBracket ? 'md:col-span-2' : ''
      }`}
    >
      <div className="flex items-start gap-3 border-b border-border/70 p-4">
        <span
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg bg-rust-soft/60 text-rust ring-1 ring-rust/15"
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-lg leading-tight text-foreground">{service.label}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {t(`pricing.unit.${service.unit}` as never)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('pricing.fromLabel')}
          </p>
          <p className="font-serif text-base tabular-nums text-foreground">
            {Number.isFinite(fromPrice) ? formatEurCents(fromPrice, locale, currency) : '—'}
            <span className="ml-0.5 text-[10px] text-muted-foreground">
              {unitSuffix(service.unit)}
            </span>
          </p>
        </div>
      </div>

      {isBracket && service.brackets ? (
        <BracketMatrix
          tiers={service.tiers}
          brackets={service.brackets}
          locale={locale}
          currency={currency}
        />
      ) : (
        <ul className="flex-1 divide-y divide-border/60">
          {service.tiers.map((tier) => (
            <li
              key={tier.code}
              className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-rust-soft/30"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{tier.label}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  {tier.code}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <span className="font-serif text-base tabular-nums text-foreground">
                  {formatEurCents(tier.unitPriceCents, locale, currency)}
                </span>
                <span className="ml-0.5 text-[10px] text-muted-foreground">
                  {unitSuffix(service.unit)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(minOrderCents !== null ||
        minOnsiteCents !== null ||
        anfahrtCents !== null ||
        freeSqmThreshold !== null ||
        dropOffLabel) && (
        <div className="flex flex-wrap gap-1.5 border-t border-border/70 bg-muted/30 px-4 py-3">
          {minOrderCents !== null && (
            <OptionPill
              label={t('pricing.options.minOrder')}
              value={formatEurCents(minOrderCents, locale, currency)}
            />
          )}
          {minOnsiteCents !== null && (
            <OptionPill
              label={t('pricing.options.minOnsite')}
              value={formatEurCents(minOnsiteCents, locale, currency)}
            />
          )}
          {anfahrtCents !== null && (
            <OptionPill
              label={t('pricing.options.anfahrt')}
              value={formatEurCents(anfahrtCents, locale, currency)}
            />
          )}
          {freeSqmThreshold !== null && (
            <OptionPill
              label={t('pricing.options.freePickup')}
              value={`≥ ${freeSqmThreshold} m²`}
            />
          )}
          {dropOffLabel && <OptionPill label={t('pricing.options.dropOff')} value={dropOffLabel} />}
        </div>
      )}
    </div>
  );
}

/**
 * Bracket-Matrix für Festpreis-Services (z. B. Teppichbodenreinigung).
 * Zeilen = Brackets (bis 30 m², bis 50 m², …, ab 150 m²), Spalten = Tiers
 * (Basis / Standard / Premium). `null` ⇒ "auf Anfrage".
 */
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
  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/70 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="px-4 py-2 text-left font-medium">Fläche</th>
            {tiers.map((tier) => (
              <th key={tier.code} className="px-3 py-2 text-right font-medium">
                <span className="font-serif text-xs normal-case tracking-normal text-foreground">
                  {tier.label}
                </span>
                {tier.description ? (
                  <p className="mt-0.5 max-w-[12rem] text-right text-[10px] normal-case tracking-normal text-muted-foreground/80">
                    {tier.description}
                  </p>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {brackets.map((bracket) => (
            <tr key={bracket.code} className="transition-colors hover:bg-rust-soft/30">
              <th scope="row" className="px-4 py-2.5 text-left text-sm font-medium text-foreground">
                {bracket.label}
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                  {bracket.code}
                </p>
              </th>
              {tiers.map((tier) => {
                const cents = bracket.pricesCents[tier.code];
                return (
                  <td
                    key={tier.code}
                    className="px-3 py-2.5 text-right font-serif text-base tabular-nums text-foreground"
                  >
                    {cents == null ? (
                      <span className="text-[11px] italic text-muted-foreground">auf Anfrage</span>
                    ) : (
                      formatEurCents(cents, locale, currency)
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OptionPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </span>
  );
}

function AddonsStrip({
  addons,
  locale,
  currency,
  title,
  subtitle,
}: {
  addons: CatalogTier[];
  locale: string;
  currency: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3">
        <span
          className="inline-flex size-8 items-center justify-center rounded-lg bg-rust-soft/60 text-rust ring-1 ring-rust/15"
          aria-hidden="true"
        >
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0">
          <h3 className="font-serif text-base leading-tight text-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <Badge variant="outline" className="ml-auto font-mono text-[10px]">
          {addons.length}
        </Badge>
      </div>
      <ul className="grid divide-y divide-border/60 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {addons.map((a) => (
          <li
            key={a.code}
            className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-rust-soft/30"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{a.label}</p>
              <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground/80">
                {a.code}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="font-serif text-base tabular-nums text-foreground">
                {formatEurCents(a.unitPriceCents, locale, currency)}
              </span>
              <span className="ml-0.5 text-[10px] text-muted-foreground">/m²</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EmptyServices({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center">
      <Tag className="mx-auto mb-2 size-6 text-muted-foreground/50" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-2 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground"
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-xs opacity-90">{message}</p>
      </div>
    </div>
  );
}
