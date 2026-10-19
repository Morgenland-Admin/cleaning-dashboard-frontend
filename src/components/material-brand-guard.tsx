import { Navigate } from 'react-router-dom';

import { useProject } from '@/contexts/project-context';
import {
  brandForProject,
  counterpartHref,
  type BrandMeta,
  type MaterialItem,
} from '@/lib/brand-materials';

import type { ReactNode } from 'react';

/** Material pages follow the company picked in the header; another brand's page redirects. */
export function MaterialBrandGuard({
  brand,
  page,
  children,
}: {
  brand: BrandMeta;
  page: { item?: MaterialItem; view: 'template' | 'settings' | 'system' };
  children: ReactNode;
}) {
  const { activeProject, isAllBrands } = useProject();
  const current = brandForProject(activeProject);
  if (isAllBrands || current?.id === brand.id) return <>{children}</>;
  return <Navigate replace to={current ? counterpartHref(current.id, page) : '/materialien'} />;
}
