import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { BackLink } from '@/components/back-link';
import { BrandBlock } from '@/components/brand-logo';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useT } from '@/i18n';
import { authClient } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';

export function ResetPasswordPage() {
  const t = useT();
  usePageTitle(t('resetPassword.title'));
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthFrame>
        <AuthHeading title={t('resetPassword.title')} />
        <Alert tone="destructive">{t('resetPassword.tokenMissing')}</Alert>
        <BackLink to="/login" className="mt-6 self-start">
          {t('login.forgotPasswordBack')}
        </BackLink>
      </AuthFrame>
    );
  }

  if (done) {
    return (
      <AuthFrame>
        <AuthSuccess title={t('resetPassword.successTitle')} body={t('resetPassword.successBody')}>
          <Button asChild>
            <Link to="/login">
              {t('resetPassword.successGoToLogin')}
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </AuthSuccess>
      </AuthFrame>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError(t('resetPassword.tooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('resetPassword.mismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await authClient.resetPassword({
        token,
        newPassword,
      });
      if (result.error) {
        const msg = (result.error.message ?? '').toLowerCase();
        const code = (result.error.code ?? '').toUpperCase();
        const invalidToken =
          msg.includes('invalid') || msg.includes('expired') || code.includes('TOKEN');
        setError(
          invalidToken
            ? t('resetPassword.errors.invalidToken')
            : (result.error.message ?? t('resetPassword.errors.generic')),
        );
        return;
      }
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('resetPassword.errors.generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthFrame>
      <AuthHeading title={t('resetPassword.title')} subtitle={t('resetPassword.subtitle')} />

      <form onSubmit={onSubmit} className="grid gap-4">
        <FormField
          label={t('resetPassword.newPassword')}
          hint={t('resetPassword.tooShort')}
          required
        >
          <PasswordInput
            autoComplete="new-password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            visible={showPassword}
            onVisibleChange={setShowPassword}
            disabled={submitting}
            placeholder="••••••••"
          />
        </FormField>

        <FormField label={t('resetPassword.confirmPassword')} required>
          <PasswordInput
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            visible={showPassword}
            onVisibleChange={setShowPassword}
            disabled={submitting}
            placeholder="••••••••"
          />
        </FormField>

        {error ? <Alert tone="destructive">{error}</Alert> : null}

        <Button type="submit" loading={submitting} className="w-full">
          {submitting ? t('resetPassword.submitting') : t('resetPassword.submit')}
        </Button>

        <BackLink to="/login" className="justify-self-center">
          {t('login.forgotPasswordBack')}
        </BackLink>
      </form>
    </AuthFrame>
  );
}

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center bg-background px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-10 sm:pt-[max(4rem,env(safe-area-inset-top))] lg:justify-center">
      <div className="flex w-full max-w-sm flex-col">
        <div className="mb-8 flex">
          <BrandBlock size={36} />
        </div>
        {children}
      </div>
    </main>
  );
}

export function AuthHeading({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="mb-6 space-y-1.5">
      <h1 className="text-title font-semibold text-foreground">{title}</h1>
      {subtitle ? <p className="text-2sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

export function AuthSuccess({
  title,
  body,
  children,
}: {
  title: ReactNode;
  body: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div role="status" className="flex flex-col items-start gap-4">
      <span
        aria-hidden="true"
        className="flex size-10 items-center justify-center rounded-full bg-success-soft text-success"
      >
        <CheckCircle2 className="size-5" />
      </span>
      <div className="space-y-1.5">
        <h1 className="text-title font-semibold text-foreground">{title}</h1>
        <p className="text-2sm text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>
  );
}
