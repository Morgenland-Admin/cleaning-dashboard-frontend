import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { LoadingState } from '@/components/empty-state';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { Card } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
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

  // Soft gate only: the backend 403s anyway.
  useEffect(() => {
    if (!isPending && session && !isSuperAdmin) {
      navigate('/companies', { replace: true });
    }
  }, [isPending, session, isSuperAdmin, navigate]);

  function onCreated() {
    void queryClient.invalidateQueries({ queryKey: ['companies-admin'] });
    void queryClient.invalidateQueries({ queryKey: ['projects-companies'] });
    toast.success(t('companies.create.created'));
    navigate('/companies');
  }

  if (isPending) {
    return (
      <PageContainer width="narrow">
        <LoadingState />
      </PageContainer>
    );
  }

  if (!isSuperAdmin) return null;

  return (
    <PageContainer width="narrow">
      <PageHeading
        title={t('companies.newPage.title')}
        subtitle={t('companies.newPage.subtitle')}
        breadcrumb={[
          { label: t('companies.title'), to: '/companies' },
          { label: t('companies.newCompany') },
        ]}
      />
      <Card className="p-4 sm:p-5">
        <CreateCompanyForm onCreated={onCreated} />
      </Card>
    </PageContainer>
  );
}
