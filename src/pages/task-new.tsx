import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { BrandChip } from '@/components/brand-mark';
import { EmptyState } from '@/components/empty-state';
import { FormActionBar } from '@/components/form-action-bar';
import { FormField } from '@/components/form-field';
import { LeaveGuardDialog } from '@/components/leave-guard-dialog';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { SectionCard } from '@/components/section';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DateTimePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useT } from '@/i18n';
import { useCanWrite } from '@/lib/access';
import { errMessage, tasksAdminApi, type TaskPriority } from '@/lib/api';
import { readListNav } from '@/lib/list-nav';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { usePageTitle } from '@/lib/use-page-title';
import { AssigneeSelect, DropdownField, PrioritySelect } from '@/pages/task-detail';

export function TaskNewPage() {
  const t = useT();
  usePageTitle(t('tasks.newTitle'));
  const uid = useId();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { activeProject, isAllBrands } = useProject();
  const canWrite = useCanWrite();
  const backTo = readListNav(location.state).from ?? '/tasks';
  const slug = activeProject.companySlug;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('normal');
  const [dueLocal, setDueLocal] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState<string | null>(null);
  const dirty =
    !!title.trim() || !!body.trim() || priority !== 'normal' || !!dueLocal || !!assigneeUserId;
  const { blocker, allowLeave } = useLeaveGuard(dirty);

  const members = useQuery({
    queryKey: ['task-members', slug],
    queryFn: ({ signal }) => tasksAdminApi.members(slug, signal),
    enabled: !isAllBrands,
  });

  const create = useMutation({
    mutationFn: () =>
      tasksAdminApi.create({
        companySlug: slug,
        title: title.trim(),
        body: body.trim() || undefined,
        priority,
        dueAt: dueLocal ? new Date(dueLocal).toISOString() : undefined,
        assigneeUserId: assigneeUserId ?? undefined,
      }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks-counts'] });
      toast.success(t('tasks.created'));
      allowLeave();
      navigate(`/tasks/${res.task.id}`, { replace: true, state: { from: backTo } });
    },
  });

  const heading = (
    <PageHeading
      breadcrumb={[{ label: t('tasks.title'), to: backTo }, { label: t('tasks.newTitle') }]}
      title={t('tasks.newTitle')}
      subtitle={t('tasks.newSubtitle')}
      meta={isAllBrands ? null : <BrandChip brand={activeProject} />}
    />
  );

  if (isAllBrands || !canWrite) {
    return (
      <PageContainer width="narrow">
        {heading}
        <EmptyState
          variant="dashed"
          icon={<ClipboardList />}
          message={canWrite ? t('tasks.newPickBrand') : t('tasks.readOnly')}
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to={backTo}>{t('common.back')}</Link>
            </Button>
          }
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer width="narrow">
      {heading}
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (title.trim()) create.mutate();
        }}
      >
        <SectionCard
          as="fieldset"
          title={t('tasks.details')}
          bodyClassName="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <FormField label={t('tasks.field.title')} required className="sm:col-span-2">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('tasks.titlePlaceholder')}
              maxLength={500}
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </FormField>
          <FormField
            label={`${t('tasks.field.body')} ${t('common.optional')}`}
            className="sm:col-span-2"
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={5}
              placeholder={t('tasks.bodyPlaceholder')}
              maxLength={8000}
            />
          </FormField>
          <DropdownField id={`${uid}-priority`} label={t('tasks.field.priority')}>
            {(ids) => <PrioritySelect {...ids} value={priority} onChange={setPriority} />}
          </DropdownField>
          <FormField label={`${t('tasks.field.dueAt')} ${t('common.optional')}`}>
            <DateTimePicker value={dueLocal} onValueChange={setDueLocal} />
          </FormField>
          <DropdownField
            id={`${uid}-assignee`}
            label={t('tasks.field.assignee')}
            className="sm:col-span-2"
          >
            {(ids) => (
              <AssigneeSelect
                {...ids}
                value={assigneeUserId}
                onChange={setAssigneeUserId}
                members={members.data?.members ?? []}
                loading={members.isLoading}
              />
            )}
          </DropdownField>
        </SectionCard>

        {create.error ? <Alert tone="destructive">{errMessage(create.error)}</Alert> : null}

        <FormActionBar>
          <Button type="button" variant="ghost" asChild>
            <Link to={backTo}>{t('common.cancel')}</Link>
          </Button>
          <Button
            type="submit"
            className="flex-1 sm:flex-none"
            disabled={!title.trim()}
            loading={create.isPending}
          >
            <Plus aria-hidden="true" />
            {t('tasks.newCta')}
          </Button>
        </FormActionBar>
      </form>

      <LeaveGuardDialog blocker={blocker} />
    </PageContainer>
  );
}
