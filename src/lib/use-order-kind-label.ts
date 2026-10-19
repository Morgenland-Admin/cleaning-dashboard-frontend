import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useT } from '@/i18n';
import { serviceCatalogApi } from '@/lib/api';
import { KIND_LABEL } from '@/pages/orders-shared';

import type { CompanySlug } from '@/contexts/project-context';

/** "pflastersteine-verlegen" → "Pflastersteine verlegen". */
export function humanizeSlug(slug: string): string {
  const text = slug.replace(/[-_]+/g, ' ').trim();
  return text ? text[0]!.toUpperCase() + text.slice(1) : '—';
}

/**
 * Display name for an order kind: the four built-in kinds are translated, anything else
 * (imported orders use any service slug) comes from the brand's service catalog.
 */
export function useOrderKindLabel(companySlug: CompanySlug | null | undefined) {
  const t = useT();
  const catalog = useQuery({
    queryKey: ['service-catalog', companySlug] as const,
    queryFn: ({ signal }) => serviceCatalogApi.list(companySlug!, signal),
    enabled: !!companySlug,
    staleTime: 10 * 60 * 1000,
  });
  const services = catalog.data?.services;
  return useCallback(
    (kind: string | null | undefined): string => {
      if (!kind) return '—';
      const key = KIND_LABEL[kind as keyof typeof KIND_LABEL];
      if (key) return t(key);
      // Old kinds were cut to 32 characters, so a prefix of the catalog slug also counts.
      const hit =
        services?.find((s) => s.slug === kind) ??
        services?.find((s) => s.slug.startsWith(`${kind}-`));
      return hit?.name ?? humanizeSlug(kind);
    },
    [t, services],
  );
}
