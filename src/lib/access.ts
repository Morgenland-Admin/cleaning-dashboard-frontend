import { useSession } from '@/lib/auth-client';

import type { UserAccessLevel } from '@/lib/api';

/**
 * Pages an `seo` user (blog/SEO writer) may open. Everything else redirects to
 * the blog. Navigation only — the backend enforces the same scope with its own
 * allowlist (`seoMayAccess` in the backend's lib/access.ts), so keep the two in step.
 */
const SEO_PATHS = ['/blog', '/bewertungen', '/companies', '/profile', '/settings'];

export const SEO_HOME = '/blog';

export function useAccessLevel(): UserAccessLevel | undefined {
  const { data } = useSession();
  return (data?.user as { accessLevel?: UserAccessLevel } | undefined)?.accessLevel;
}

/** True for the `seo` level: blog/SEO pages, reviews and brands only. */
export function useIsSeoOnly(): boolean {
  return useAccessLevel() === 'seo';
}

export function seoMayOpen(pathname: string): boolean {
  return SEO_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
