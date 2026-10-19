import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, Send, Users } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { BrandChip } from '@/components/brand-mark';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProject, type Project } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import {
  ApiError,
  customersAdminApi,
  type Customer,
  type CustomerEmailInput,
  type CustomerEmailPreview,
} from '@/lib/api';
import { contactEmail, customerTitle } from '@/lib/customer-display';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';
import { cn } from '@/lib/utils';

type Step = 'edit' | 'preview';

/** Compose → server-rendered preview → confirm → send; lands on the customer's Emails tab. */
export function CustomerEmailPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const { activeProject, isAllBrands } = useProject();
  const canWrite = useCanWrite();
  const slug = activeProject.companySlug;
  const customerId = Number(params.id);
  const customerHref = `/customers/${customerId}`;
  usePageTitle(t('customers.compose.title'));

  // Same key as the customer page, so coming from there needs no extra request.
  const query = useQuery({
    queryKey: ['customer-overview', slug, customerId] as const,
    enabled: !isAllBrands && Number.isFinite(customerId),
    queryFn: ({ signal }) => customersAdminApi.overview(slug, customerId, signal),
  });
  const customer = query.data?.customer;
  const name = customer ? customerTitle(customer, t) : null;

  const backLink = (
    <BackLink
      to={Number.isFinite(customerId) ? customerHref : '/customers'}
      className="mb-3 self-start"
    >
      {name ?? t('customers.backToList')}
    </BackLink>
  );
  const heading = <PageHeading title={t('customers.compose.title')} />;

  if (isAllBrands) {
    return (
      <PageContainer width="narrow">
        {backLink}
        {heading}
        <EmptyState
          variant="dashed"
          icon={<Users aria-hidden="true" />}
          message={t('customers.selectBrandFirst')}
        />
      </PageContainer>
    );
  }
  if (query.isLoading) {
    return (
      <PageContainer width="narrow">
        {backLink}
        <LoadingState className="min-h-64" />
      </PageContainer>
    );
  }
  if (query.error || !customer) {
    return (
      <PageContainer width="narrow">
        {backLink}
        {heading}
        <ErrorState
          error={query.error ?? new Error(t('customers.notFound'))}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }
  const email = contactEmail(customer.email);
  if (!canWrite || !email) {
    return (
      <PageContainer width="narrow">
        {backLink}
        {heading}
        <Alert tone={canWrite ? 'warning' : 'neutral'}>
          {canWrite ? t('customers.compose.notContactable') : t('customers.readOnly')}
        </Alert>
      </PageContainer>
    );
  }

  return (
    <ComposeView
      // Brand + id: customer ids repeat across brands, a switch must drop the old preview.
      key={`${slug}:${customer.id}`}
      brand={activeProject}
      customer={customer}
      name={name ?? ''}
      email={email}
      backLink={backLink}
    />
  );
}

function ComposeView({
  brand,
  customer,
  name,
  email,
  backLink,
}: {
  brand: Project;
  customer: Customer;
  name: string;
  email: string;
  backLink: React.ReactNode;
}) {
  const t = useT();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const slug = brand.companySlug;
  const customerHref = `/customers/${customer.id}`;

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<{ subject?: string; body?: string }>({});
  const [step, setStep] = useState<Step>('edit');
  const [preview, setPreview] = useState<{
    data: CustomerEmailPreview;
    input: CustomerEmailInput;
  } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const { blocker, allowLeave } = useLeaveGuard(subject.trim() !== '' || body.trim() !== '');

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  const loadPreview = useMutation({
    mutationFn: (input: CustomerEmailInput) =>
      customersAdminApi.previewEmail(slug, customer.id, input).then((data) => ({ data, input })),
    onSuccess: (res) => {
      setPreview(res);
      setStep('preview');
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('customers.compose.previewFailed')),
  });

  const send = useMutation({
    // Sends exactly what was previewed, not whatever the editor holds now.
    mutationFn: (input: CustomerEmailInput) =>
      customersAdminApi.sendEmail(slug, customer.id, input),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['customer-overview', slug, customer.id] });
      void queryClient.invalidateQueries({ queryKey: ['emails'] });
      if (res.skipped) toast({ title: t('customers.compose.sentSkipped') });
      else toast.success(t('customers.compose.sent', { email }));
      allowLeave();
      navigate(`${customerHref}?tab=emails`);
    },
    onError: (err) =>
      toast.error(err instanceof ApiError ? err.message : t('customers.compose.sendFailed')),
  });

  function goPreview(event: React.FormEvent) {
    event.preventDefault();
    const next = {
      subject: subject.trim() ? undefined : t('customers.compose.subjectRequired'),
      body: body.trim() ? undefined : t('customers.compose.messageRequired'),
    };
    setErrors(next);
    if (next.subject) {
      subjectRef.current?.focus();
      return;
    }
    if (next.body) {
      bodyRef.current?.focus();
      return;
    }
    loadPreview.mutate({ subject: subject.trim(), body: body.trim() });
  }

  const header = (
    <>
      {backLink}
      <PageHeading
        title={t('customers.compose.title')}
        subtitle={t('customers.compose.subtitle', { brand: brand.name })}
        meta={<BrandChip brand={brand} />}
        breadcrumb={[
          { label: brand.name },
          { label: t('customers.title'), to: '/customers' },
          { label: name, to: customerHref },
          { label: t('customers.compose.title') },
        ]}
        className="mb-3"
      />
      <ol
        className="mb-5 flex items-center gap-2 text-2sm"
        aria-label={t('customers.compose.steps')}
      >
        {(['edit', 'preview'] as const).map((s, i) => (
          <li
            key={s}
            aria-current={step === s ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1',
              step === s ? 'bg-primary-soft font-medium text-primary' : 'text-muted-foreground',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'grid size-5 place-items-center rounded-full text-2xs font-semibold tabular-nums',
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              {i + 1}
            </span>
            {s === 'edit' ? t('customers.compose.stepEdit') : t('customers.compose.stepPreview')}
          </li>
        ))}
      </ol>
    </>
  );

  if (step === 'preview' && preview) {
    return (
      <PageContainer width="narrow">
        {header}
        <div className="flex flex-col gap-4 pb-5">
          <KeyValueList layout="grid" className="rounded-lg border border-border bg-card p-4">
            <KeyValue
              label={t('customers.compose.to')}
              value={<span className="break-all font-medium">{preview.data.to}</span>}
            />
            <KeyValue
              label={t('customers.compose.from')}
              value={<span className="break-all">{preview.data.from}</span>}
            />
            <KeyValue
              label={t('customers.compose.replyTo')}
              value={
                preview.data.replyTo ? (
                  <span className="break-all">{preview.data.replyTo}</span>
                ) : null
              }
            />
            <KeyValue
              label={t('customers.compose.subject')}
              value={<span className="font-medium">{preview.data.subject}</span>}
            />
          </KeyValueList>
          {/* sandbox="": no scripts or same-origin; white like the inbox the mail was designed for. */}
          <iframe
            title={t('customers.compose.previewTitle')}
            srcDoc={preview.data.html}
            sandbox=""
            className="block h-[70svh] min-h-96 w-full rounded-lg border border-border bg-white"
          />
        </div>
        <FormActionBar>
          <Button variant="ghost" className="mr-auto" onClick={() => setStep('edit')}>
            <ArrowLeft aria-hidden="true" />
            {t('customers.compose.back')}
          </Button>
          <Button onClick={() => setConfirmOpen(true)} loading={send.isPending}>
            <Send aria-hidden="true" />
            {t('customers.compose.send')}
          </Button>
        </FormActionBar>
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={t('customers.compose.confirmTitle')}
          description={t('customers.compose.confirmBody', { email: preview.data.to })}
          confirmLabel={t('customers.compose.send')}
          cancelLabel={t('common.cancel')}
          isPending={send.isPending}
          onConfirm={() => {
            setConfirmOpen(false);
            send.mutate(preview.input);
          }}
        />
        <LeaveGuardDialog
          blocker={blocker}
          title={t('customers.compose.discardTitle')}
          description={t('customers.compose.discardBody')}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      {header}
      <form className="flex flex-col gap-5" onSubmit={goPreview} noValidate>
        <SectionCard title={t('customers.compose.stepEdit')}>
          <div className="flex flex-col gap-4">
            <KeyValueList layout="grid">
              <KeyValue
                label={t('customers.compose.to')}
                value={
                  <span className="break-all">
                    <span className="font-medium">{name}</span>
                    {name !== email ? (
                      <span className="text-muted-foreground"> · {email}</span>
                    ) : null}
                  </span>
                }
              />
            </KeyValueList>
            <FormField label={t('customers.compose.subject')} required error={errors.subject}>
              <Input
                ref={subjectRef}
                value={subject}
                maxLength={200}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (errors.subject) setErrors((p) => ({ ...p, subject: undefined }));
                }}
              />
            </FormField>
            <FormField
              label={t('customers.compose.message')}
              hint={t('customers.compose.messageHint')}
              required
              error={errors.body}
            >
              <Textarea
                ref={bodyRef}
                value={body}
                rows={12}
                maxLength={8000}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (errors.body) setErrors((p) => ({ ...p, body: undefined }));
                }}
              />
            </FormField>
          </div>
        </SectionCard>

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to={customerHref}>{t('common.cancel')}</Link>
          </Button>
          <Button type="submit" className="flex-1 sm:flex-none" loading={loadPreview.isPending}>
            <Eye aria-hidden="true" />
            {t('customers.compose.preview')}
          </Button>
        </FormActionBar>
      </form>
      <LeaveGuardDialog
        blocker={blocker}
        title={t('customers.compose.discardTitle')}
        description={t('customers.compose.discardBody')}
      />
    </PageContainer>
  );
}
