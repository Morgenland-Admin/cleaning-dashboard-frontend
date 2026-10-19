import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { useProject } from '@/contexts/project-context';
import { useIsSeoOnly } from '@/lib/access';
import { notificationsAdminApi, type InquiryChannelCounts } from '@/lib/api';

/** Untouched inquiries and contact messages across the caller's brands (shared by bell, sidebar, bottom nav). */
export function useInboxCounts() {
  const seoOnly = useIsSeoOnly();
  return useQuery({
    queryKey: ['notifications-unread'],
    queryFn: ({ signal }) => notificationsAdminApi.unreadCount(signal),
    enabled: !seoOnly,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
}

export interface BrandInboxCounts {
  inquiry: number;
  contact: number;
  channels: InquiryChannelCounts;
}

/** The same counts narrowed to the brand view (one brand, or the sum over all). */
export function useBrandInboxCounts(): BrandInboxCounts {
  const { data } = useInboxCounts();
  const { activeProject, isAllBrands } = useProject();
  const slug = activeProject.companySlug;
  return useMemo(() => {
    const out: BrandInboxCounts = {
      inquiry: 0,
      contact: 0,
      channels: { phone: 0, email: 0, web: 0 },
    };
    for (const b of data?.byBrand ?? []) {
      if (!isAllBrands && b.slug !== slug) continue;
      out.inquiry += b.inquiry ?? 0;
      out.contact += b.contact ?? 0;
      out.channels.phone += b.channels?.phone ?? 0;
      out.channels.email += b.channels?.email ?? 0;
      out.channels.web += b.channels?.web ?? 0;
    }
    return out;
  }, [data, isAllBrands, slug]);
}

/** Badge text: exact up to 99. */
export function badgeCount(n: number): string {
  return n > 99 ? '99+' : String(n);
}

/** Any successful write (status change, reply, …) may clear inbox items: refresh the counts right away. */
export function useRefreshInboxOnWrites() {
  const queryClient = useQueryClient();
  useEffect(() => {
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'success') return;
      void queryClient.invalidateQueries({ queryKey: ['notifications-unread'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
    });
  }, [queryClient]);
}
