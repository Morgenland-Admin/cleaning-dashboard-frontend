import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, LogOut, Mail, Pencil, Power, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { BrandMark } from '@/components/brand-mark';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { EmptyState, LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { KeyValue, KeyValueList } from '@/components/key-value';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { PasswordInput } from '@/components/password-input';
import { RecordNav } from '@/components/record-pager';
import { SectionCard } from '@/components/section';
import { StatusBadge } from '@/components/status-badge';
import { Alert, ErrorState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useProject } from '@/contexts/project-context';
import { toast } from '@/hooks/use-toast';
import { useLocale, useT } from '@/i18n';
import { useAccessLevel } from '@/lib/access';
import { ApiError, errMessage, staffApi, type StaffDetail, type StaffSession } from '@/lib/api';
import { readListNav } from '@/lib/list-nav';
import { usePageTitle } from '@/lib/use-page-title';
import { formatDateTime } from '@/lib/utils';
import { LevelBadge } from '@/pages/users';
import { PASSWORD_MIN, accessHint, generatePassword } from '@/pages/users-shared';

import type { ReactNode } from 'react';

type Action = 'deactivate' | 'reactivate' | 'signOut' | 'resetEmail';

export function UserDetailPage() {
  const { id } = useParams();
  return <UserDetail key={id} id={id ?? ''} />;
}

function UserDetail({ id }: { id: string }) {
  const t = useT();
  const location = useLocation();
  const queryClient = useQueryClient();
  const callerIsSuper = useAccessLevel() === 'super_admin';
  const { from } = readListNav(location.state);
  const backTo = from?.startsWith('/users') ? from : '/users';

  const detail = useQuery({
    queryKey: ['staff-user', id],
    queryFn: ({ signal }) => staffApi.get(id, signal),
  });
  const data = detail.data;
  usePageTitle(data?.user.name ?? t('users.detailTitle'));

  const [confirm, setConfirm] = useState<Action | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const action = useMutation({
    mutationFn: (a: Action): Promise<unknown> => {
      if (a === 'deactivate') return staffApi.update(id, { isActive: false });
      if (a === 'reactivate') return staffApi.update(id, { isActive: true });
      if (a === 'signOut') return staffApi.signOutEverywhere(id);
      return staffApi.sendResetEmail(id);
    },
    onSuccess: (_res, a) => {
      setConfirm(null);
      setActionError(null);
      toast.success(t(`users.toast.${a}` as never));
      void queryClient.invalidateQueries({ queryKey: ['staff-user', id] });
      void queryClient.invalidateQueries({ queryKey: ['staff'] });
    },
    onError: (err) => {
      setConfirm(null);
      setActionError(errMessage(err));
    },
  });

  const backRow = (
    <RecordNav>
      <BackLink to={backTo}>{t('users.title')}</BackLink>
    </RecordNav>
  );

  if (detail.isLoading) {
    return (
      <PageContainer>
        {backRow}
        <LoadingState />
      </PageContainer>
    );
  }

  if (!data) {
    const notFound = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <PageContainer>
        {backRow}
        <PageHeading title={t('users.detailTitle')} />
        {detail.error && !notFound ? (
          <ErrorState
            error={detail.error}
            onRetry={() => void detail.refetch()}
            retrying={detail.isFetching}
          />
        ) : (
          <EmptyState variant="dashed" message={t('users.notFound')} />
        )}
      </PageContainer>
    );
  }

  const { user, isSelf } = data;
  const canManage = callerIsSuper || user.accessLevel !== 'super_admin';
  const busy = action.isPending;
  const pending = busy ? action.variables : null;

  return (
    <PageContainer>
      {backRow}
      <PageHeading
        title={user.name}
        subtitle={user.email}
        meta={
          <>
            <LevelBadge level={user.accessLevel} />
            <StatusBadge
              label={user.isActive ? t('users.active') : t('users.inactive')}
              tone={user.isActive ? 'success' : 'neutral'}
            />
            {isSelf ? <Badge variant="secondary">{t('users.you')}</Badge> : null}
          </>
        }
        actions={
          canManage ? (
            <>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/users/${user.id}/edit`}>
                  <Pencil aria-hidden="true" />
                  {t('common.edit')}
                </Link>
              </Button>
              {!isSelf && user.isActive ? (
                <Button
                  variant="outline-destructive"
                  size="sm"
                  disabled={busy}
                  loading={pending === 'deactivate'}
                  onClick={() => setConfirm('deactivate')}
                >
                  <Power aria-hidden="true" />
                  {t('users.deactivate')}
                </Button>
              ) : null}
              {!isSelf && !user.isActive ? (
                <Button
                  size="sm"
                  disabled={busy}
                  loading={pending === 'reactivate'}
                  onClick={() => setConfirm('reactivate')}
                >
                  <Power aria-hidden="true" />
                  {t('users.reactivate')}
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      {!canManage ? (
        <Alert tone="info" className="mb-5">
          {t('users.superAdminOnly')}
        </Alert>
      ) : null}
      {!user.isActive ? (
        <Alert tone="warning" className="mb-5">
          {t('users.inactiveNotice')}
        </Alert>
      ) : null}
      {actionError ? (
        <Alert tone="destructive" className="mb-5" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <SectionCard title={t('users.section.person')}>
            <KeyValueList layout="grid">
              <KeyValue label={t('users.form.firstName')} value={user.firstName} empty="—" />
              <KeyValue label={t('users.form.lastName')} value={user.lastName} empty="—" />
              <KeyValue
                label={t('users.form.email')}
                value={
                  <a
                    href={`mailto:${user.email}`}
                    className="break-all rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {user.email}
                  </a>
                }
              />
              <KeyValue label={t('users.form.phone')} value={user.phone} empty="—" />
            </KeyValueList>
          </SectionCard>

          <SectionCard
            title={t('users.section.access')}
            description={accessHint(t, user.accessLevel)}
          >
            <BrandAccess memberships={data.memberships} />
          </SectionCard>

          <SectionCard
            title={t('users.section.sessions')}
            description={t('users.sessionsHint')}
            actions={
              canManage && !isSelf && data.sessions.length > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  loading={pending === 'signOut'}
                  onClick={() => setConfirm('signOut')}
                >
                  <LogOut aria-hidden="true" />
                  {t('users.signOutAll')}
                </Button>
              ) : undefined
            }
          >
            <Sessions sessions={data.sessions} />
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <RecordFacts
            data={data}
            actions={
              canManage && !isSelf && user.isActive ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setPasswordOpen(true)}
                  >
                    <KeyRound aria-hidden="true" />
                    {t('users.setPassword')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    loading={pending === 'resetEmail'}
                    onClick={() => setConfirm('resetEmail')}
                  >
                    <Mail aria-hidden="true" />
                    {t('users.sendReset')}
                  </Button>
                </>
              ) : null
            }
          />
          <SectionCard title={t('users.form.notes')}>
            {user.internalNotes ? (
              <p className="whitespace-pre-wrap break-words text-2sm">{user.internalNotes}</p>
            ) : (
              <p className="text-2sm text-muted-foreground">{t('users.noNotes')}</p>
            )}
          </SectionCard>
        </div>
      </div>

      {confirm ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => {
            if (!open && !action.isPending) setConfirm(null);
          }}
          title={t(`users.confirm.${confirm}.title` as never)}
          description={t(`users.confirm.${confirm}.description` as never, { name: user.name })}
          confirmLabel={t(`users.confirm.${confirm}.confirm` as never)}
          cancelLabel={t('common.cancel')}
          isDangerous={confirm === 'deactivate' || confirm === 'signOut'}
          isPending={action.isPending}
          onConfirm={() => action.mutate(confirm)}
        />
      ) : null}

      {passwordOpen ? (
        <SetPasswordDialog
          userId={user.id}
          name={user.name}
          onClose={() => setPasswordOpen(false)}
        />
      ) : null}
    </PageContainer>
  );
}

function BrandAccess({ memberships }: { memberships: StaffDetail['memberships'] }) {
  const t = useT();
  const { projects } = useProject();
  if (memberships.length === 0) {
    return <p className="text-2sm text-muted-foreground">{t('users.noBrands')}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {memberships.map((m) => {
        const brand = projects.find((p) => p.companySlug === m.companySlug);
        return (
          <li key={m.companySlug} className="flex items-center gap-2.5 py-2 first:pt-0 last:pb-0">
            {brand ? <BrandMark brand={brand} size="sm" /> : null}
            <span className="min-w-0 flex-1 truncate text-2sm font-medium">{m.companyName}</span>
            <span className="text-xs text-muted-foreground">
              {t(`profile.role.${m.role}` as never)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Sessions({ sessions }: { sessions: StaffSession[] }) {
  const t = useT();
  const { bcp47 } = useLocale();
  if (sessions.length === 0) {
    return <p className="text-2sm text-muted-foreground">{t('users.noSessions')}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {sessions.map((s) => (
        <li key={s.id} className="flex flex-col gap-0.5 py-2 text-2sm first:pt-0 last:pb-0">
          <span className="font-medium">
            {deviceLabel(s.userAgent) ?? t('users.unknownDevice')}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('users.sessionLine', {
              active: formatDateTime(s.updatedAt, bcp47),
              since: formatDateTime(s.createdAt, bcp47, { dateStyle: 'medium' }),
            })}
            {s.ipAddress ? ` · ${s.ipAddress}` : ''}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RecordFacts({ data, actions }: { data: StaffDetail; actions: ReactNode }) {
  const t = useT();
  const { bcp47 } = useLocale();
  const { user } = data;
  const date = (iso: string): ReactNode => (
    <span className="tabular-nums">{formatDateTime(iso, bcp47)}</span>
  );
  return (
    <SectionCard title={t('users.section.record')}>
      <KeyValueList layout="stacked">
        <KeyValue
          label={t('users.password')}
          value={user.hasPassword ? t('users.passwordSet') : t('users.passwordMissing')}
        />
        <KeyValue
          label={t('users.createdBy')}
          value={
            user.invitedBy ? (
              <Link
                to={`/users/${user.invitedBy.id}`}
                className="rounded-sm text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {user.invitedBy.name}
              </Link>
            ) : null
          }
          empty="—"
        />
        <KeyValue label={t('users.created')} value={date(user.createdAt)} />
        <KeyValue label={t('users.updated')} value={date(user.updatedAt)} />
      </KeyValueList>
      {actions ? <div className="mt-4 flex flex-wrap gap-2">{actions}</div> : null}
    </SectionCard>
  );
}

function SetPasswordDialog({
  userId,
  name,
  onClose,
}: {
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const t = useT();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tooShort = password.length < PASSWORD_MIN;

  const save = useMutation({
    mutationFn: () => staffApi.setPassword(userId, password),
    onSuccess: () => {
      toast.success(t('users.toast.passwordSet'));
      void queryClient.invalidateQueries({ queryKey: ['staff-user', userId] });
      onClose();
    },
    onError: (err) => setError(errMessage(err)),
  });

  return (
    <Dialog open onOpenChange={(open) => (!open && !save.isPending ? onClose() : undefined)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('users.setPassword')}</DialogTitle>
          <DialogDescription>{t('users.setPasswordHint', { name })}</DialogDescription>
        </DialogHeader>
        <form
          id="set-password"
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (!tooShort) save.mutate();
          }}
        >
          <FormField
            label={t('users.form.password')}
            error={
              password && tooShort ? t('users.form.passwordTooShort', { n: PASSWORD_MIN }) : null
            }
          >
            <PasswordInput
              value={password}
              visible={visible}
              onVisibleChange={setVisible}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </FormField>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => {
              setPassword(generatePassword());
              setVisible(true);
            }}
          >
            <Wand2 aria-hidden="true" />
            {t('users.form.generate')}
          </Button>
          {error ? <Alert tone="destructive">{error}</Alert> : null}
        </form>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" form="set-password" disabled={tooShort} loading={save.isPending}>
            {t('users.setPassword')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function deviceLabel(ua: string | null): string | null {
  if (!ua) return null;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : null;
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return [browser, os].filter(Boolean).join(' · ') || null;
}
