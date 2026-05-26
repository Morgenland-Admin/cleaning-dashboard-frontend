import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { PageHeading } from '@/components/page-heading';
import { useT } from '@/i18n';
import { useSession } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';
import { CreateCompanyForm } from '@/pages/companies';

export function BrandNewPage() {
  const t = useT();
  usePageTitle(t('companies.newCompany'));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: session, isPending } = useSession();
  const userMeta = session?.user as { accessLevel?: string } | undefined;
  const isSuperAdmin = userMeta?.accessLevel === 'super_admin';

  // Soft-gate: backend would 403 anyway, but better UX to redirect early.
  useEffect(() => {
    if (!isPending && session && !isSuperAdmin) {
      navigate('/companies', { replace: true });
    }
  }, [isPending, session, isSuperAdmin, navigate]);

  function onCreated() {
    void queryClient.invalidateQueries({ queryKey: ['companies-admin'] });
    void queryClient.invalidateQueries({ queryKey: ['projects-companies'] });
    navigate('/companies');
  }

  if (!isSuperAdmin) return null;

  return (
    <div className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-3xl flex-col p-4 sm:p-6 lg:p-8">
      <PageHeading
        title={t('companies.newPage.title')}
        subtitle={t('companies.newPage.subtitle')}
        breadcrumb={
          <Link to="/companies" className="hover:underline">
            {t('companies.title')}
          </Link>
        }
      />
      <section
        aria-labelledby="brand-new-heading"
        className="rounded-xl border border-border bg-card p-4 sm:p-6"
      >
        <h2 id="brand-new-heading" className="sr-only">
          {t('companies.newPage.title')}
        </h2>
        <CreateCompanyForm onCreated={onCreated} />
      </section>
    </div>
  );
}
