import { useQuery } from '@tanstack/react-query';
import * as React from 'react';

import { companiesAdminApi } from '@/lib/api';
import { useSession } from '@/lib/auth-client';

export type ProjectId = string;
export type LegacyProjectId = 'cleanilo' | 'hamburg-teppichreinigung' | 'teppichreinigen-lassen';
export type BrandFilterId = ProjectId | 'all';
export type CompanySlug = string;

export interface Project {
  id: ProjectId;
  companySlug: CompanySlug;
  name: string;
  shortName: string;
  domain: string;
  mark: string;
  gradient: string;
  locale: string;
  currency: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
}

const LEGACY_DEFAULTS: Record<
  string,
  Pick<Project, 'id' | 'shortName' | 'domain' | 'mark' | 'gradient'>
> = {
  cleanilo: {
    id: 'cleanilo',
    shortName: 'Cleanilo',
    domain: 'cleanilo.de',
    mark: 'CL',
    gradient: 'from-sky-400 to-indigo-500',
  },
  hamburg_teppichreinigung: {
    id: 'hamburg-teppichreinigung',
    shortName: 'Hamburg',
    domain: 'hamburg-teppichreinigung.de',
    mark: 'HT',
    gradient: 'from-emerald-400 to-teal-500',
  },
  teppichreinigen_lassen: {
    id: 'teppichreinigen-lassen',
    shortName: 'Lassen',
    domain: 'teppichreinigen-lassen.de',
    mark: 'TL',
    gradient: 'from-fuchsia-400 to-rose-500',
  },
};

const AUTO_GRADIENTS = [
  'from-amber-400 to-orange-500',
  'from-purple-400 to-violet-500',
  'from-lime-400 to-green-500',
  'from-cyan-400 to-blue-500',
  'from-pink-400 to-fuchsia-500',
  'from-yellow-400 to-amber-500',
  'from-slate-400 to-zinc-500',
];

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function autoGradient(slug: string): string {
  return AUTO_GRADIENTS[hashCode(slug) % AUTO_GRADIENTS.length]!;
}

function autoMark(name: string): string {
  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, '');
  return (letters.slice(0, 2) || '??').toUpperCase();
}

function autoDomain(storefrontOrigin: string | null): string {
  if (!storefrontOrigin) return '';
  try {
    return new URL(storefrontOrigin).host;
  } catch {
    return storefrontOrigin;
  }
}

interface ApiCompanyRow {
  slug: string;
  name: string;
  schemaName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  storefrontOrigin?: string | null;
  role: string;
}

function projectFromCompany(row: ApiCompanyRow): Project {
  const legacy = LEGACY_DEFAULTS[row.slug];
  return {
    id: legacy?.id ?? row.slug,
    companySlug: row.slug,
    name: row.name,
    shortName: legacy?.shortName ?? row.name,
    domain: legacy?.domain ?? autoDomain(row.storefrontOrigin ?? null),
    mark: legacy?.mark ?? autoMark(row.name),
    gradient: legacy?.gradient ?? autoGradient(row.slug),
    locale: 'de-DE',
    currency: 'EUR',
    logoUrl: row.logoUrl ?? null,
    primaryColor: row.primaryColor ?? null,
  };
}

// Fallback list while companies query loads or user is unauthenticated.
export const PROJECTS: Project[] = [
  projectFromCompany({
    slug: 'cleanilo',
    name: 'Cleanilo',
    schemaName: 'cleanilo',
    role: 'owner',
  }),
  projectFromCompany({
    slug: 'hamburg_teppichreinigung',
    name: 'Hamburg Teppichreinigung',
    schemaName: 'hamburg_teppichreinigung',
    role: 'owner',
  }),
  projectFromCompany({
    slug: 'teppichreinigen_lassen',
    name: 'Teppichreinigen Lassen',
    schemaName: 'teppichreinigen_lassen',
    role: 'owner',
  }),
];

const STORAGE_KEY = 'active-brand-filter';

interface ProjectContextValue {
  projects: Project[];
  activeProject: Project;
  brandView: BrandFilterId;
  isAllBrands: boolean;
  setBrandView: (next: BrandFilterId) => void;
  setActiveProjectId: (id: ProjectId) => void;
}

const ProjectContext = React.createContext<ProjectContextValue | undefined>(undefined);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [brandView, setBrandViewState] = React.useState<BrandFilterId>(() => {
    if (typeof window === 'undefined') return PROJECTS[0]!.id;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
    const legacy = window.localStorage.getItem('active-project-id');
    if (legacy) {
      window.localStorage.setItem(STORAGE_KEY, legacy);
      return legacy;
    }
    return PROJECTS[0]!.id;
  });

  const setBrandView = React.useCallback((next: BrandFilterId) => {
    setBrandViewState(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }, []);

  const setActiveProjectId = React.useCallback((id: ProjectId) => setBrandView(id), [setBrandView]);

  const { data: session } = useSession();
  const isAuthed = !!session?.user;
  const companiesQuery = useQuery({
    queryKey: ['projects-companies'],
    queryFn: ({ signal }) => companiesAdminApi.list(signal),
    enabled: isAuthed,
    staleTime: 60_000,
  });

  const projects = React.useMemo<Project[]>(() => {
    const rows = companiesQuery.data?.companies;
    if (!rows || rows.length === 0) return PROJECTS;
    return rows.map(projectFromCompany).sort((a, b) => a.name.localeCompare(b.name));
  }, [companiesQuery.data]);

  const activeProject =
    brandView === 'all'
      ? projects[0]!
      : (projects.find((p) => p.id === brandView || p.companySlug === brandView) ?? projects[0]!);

  const value = React.useMemo(
    () => ({
      projects,
      activeProject,
      brandView,
      isAllBrands: brandView === 'all',
      setBrandView,
      setActiveProjectId,
    }),
    [projects, activeProject, brandView, setBrandView, setActiveProjectId],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  const ctx = React.useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
