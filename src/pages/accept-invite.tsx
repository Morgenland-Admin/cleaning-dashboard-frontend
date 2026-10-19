import { useMutation, useQuery } from '@tanstack/react-query';
import { Fragment, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useT } from '@/i18n';
import { ApiError, invitesPublicApi } from '@/lib/api';
import { usePageTitle } from '@/lib/use-page-title';
import { AuthFrame, AuthHeading, AuthSuccess } from '@/pages/reset-password';

type T = ReturnType<typeof useT>;

const MEMBERSHIP_ROLES = ['owner', 'admin', 'manager', 'viewer', 'partner'] as const;

function roleLabel(role: string, t: T): string {
  return (MEMBERSHIP_ROLES as readonly string[]).includes(role)
    ? t(`profile.role.${role as (typeof MEMBERSHIP_ROLES)[number]}`)
    : role;
}

// Fills `{{name}}` placeholders with nodes: bold parts without splitting the sentence (word order differs per language).
function withNodes(template: string, nodes: Record<string, ReactNode>): ReactNode {
  return template.split(/\{\{(\w+)\}\}/g).map((part, i) =>
    // Odd indexes are the captured placeholder names.
    i % 2 === 1 ? <Fragment key={i}>{nodes[part] ?? part}</Fragment> : part,
  );
}

export function AcceptInvitePage() {
  const t = useT();
  usePageTitle(t('auth.invite.title'));
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();

  const lookup = useQuery({
    queryKey: ['invite-lookup', token],
    queryFn: ({ signal }) => invitesPublicApi.lookup(token, signal),
    enabled: token.length > 0,
    retry: false,
  });

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const accept = useMutation({
    mutationFn: () =>
      invitesPublicApi.accept({
        token,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
      }),
    onSuccess: () => {
      setDone(true);
      // signUp via auth.api returns no session, so send the user to /login.
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  const backToLogin = (
    <BackLink to="/login" className="mt-6 self-start">
      {t('login.forgotPasswordBack')}
    </BackLink>
  );

  if (!token) {
    return (
      <AuthFrame>
        <AuthHeading title={t('auth.invite.title')} />
        <Alert tone="destructive">{t('auth.invite.tokenMissing')}</Alert>
        {backToLogin}
      </AuthFrame>
    );
  }

  if (lookup.isLoading) {
    return (
      <AuthFrame>
        <LoadingState label={t('auth.invite.checking')} />
      </AuthFrame>
    );
  }

  if (lookup.error || !lookup.data) {
    const msg =
      lookup.error instanceof ApiError
        ? lookup.error.message
        : lookup.error
          ? (lookup.error as Error).message
          : t('auth.invite.notFound');
    return (
      <AuthFrame>
        <AuthHeading title={t('auth.invite.title')} />
        <Alert tone="destructive">{msg}</Alert>
        {backToLogin}
      </AuthFrame>
    );
  }

  if (done) {
    return (
      <AuthFrame>
        <AuthSuccess title={t('auth.invite.successTitle')} body={t('auth.invite.successBody')} />
      </AuthFrame>
    );
  }

  const invite = lookup.data.invite;
  const strong = (text: string) => (
    <strong className="font-semibold text-foreground">{text}</strong>
  );

  return (
    <AuthFrame>
      <AuthHeading
        title={t('auth.invite.title')}
        subtitle={withNodes(
          invite.companyName ? t('auth.invite.invitedByForCompany') : t('auth.invite.invitedBy'),
          {
            name: strong(invite.invitedByName),
            company: invite.companyName ? strong(invite.companyName) : null,
            role: strong(roleLabel(invite.role, t)),
          },
        )}
      />

      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (password.length < 8) {
            setError(t('auth.invite.passwordTooShort'));
            return;
          }
          if (!firstName.trim()) {
            setError(t('auth.invite.firstNameRequired'));
            return;
          }
          accept.mutate();
        }}
      >
        <FormField label={t('auth.invite.email')}>
          <Input value={invite.email} readOnly disabled />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={t('auth.invite.firstName')} required>
            <Input
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </FormField>
          <FormField label={t('auth.invite.lastName')}>
            <Input
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </FormField>
        </div>

        <FormField label={t('auth.invite.password')} hint={t('auth.invite.passwordHint')} required>
          <PasswordInput
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </FormField>

        {error ? <Alert tone="destructive">{error}</Alert> : null}

        <Button type="submit" loading={accept.isPending} className="w-full">
          {accept.isPending ? t('auth.invite.submitting') : t('auth.invite.submit')}
        </Button>
      </form>
    </AuthFrame>
  );
}
