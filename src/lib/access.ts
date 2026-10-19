import { useSession } from '@/lib/auth-client';

import type { UserAccessLevel } from '@/lib/api';

// Navigation only: the backend enforces the same scope (`seoMayAccess`); keep both lists in step.
const SEO_PATHS = ['/blog', '/bewertungen', '/companies', '/profile', '/settings'];

export const SEO_HOME = '/blog';

export function useAccessLevel(): UserAccessLevel | undefined {
  const { data } = useSession();
  return (data?.user as { accessLevel?: UserAccessLevel } | undefined)?.accessLevel;
}

export function useIsSeoOnly(): boolean {
  return useAccessLevel() === 'seo';
}

export function seoMayOpen(pathname: string): boolean {
  return SEO_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
