import { AlertCircle, ArrowRight, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { BrandBlock } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import { authClient } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

export function ResetPasswordPage() {
  const t = useT();
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
      <CenteredFrame>
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{t('resetPassword.tokenMissing')}</span>
        </div>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center justify-center text-[13px] font-medium text-foreground hover:underline"
        >
          ← {t('login.forgotPasswordBack')}
        </Link>
      </CenteredFrame>
    );
  }

  if (done) {
    return (
      <CenteredFrame>
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="size-6" />
          </div>
          <div className="space-y-1">
            <h2 className="font-serif text-xl font-semibold tracking-tight">
              {t('resetPassword.successTitle')}
            </h2>
            <p className="text-sm text-muted-foreground">{t('resetPassword.successBody')}</p>
          </div>
          <Button asChild>
            <Link to="/login">
              {t('resetPassword.successGoToLogin')}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </CenteredFrame>
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
    <CenteredFrame>
      <div className="mb-7">
        <h1 className="font-serif text-[30px] font-semibold leading-[1.1] tracking-tight sm:text-[34px]">
          {t('resetPassword.title')}
        </h1>
        <p className="mt-2 text-[13px] text-muted-foreground sm:text-sm">
          {t('resetPassword.subtitle')}
        </p>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="new-password">{t('resetPassword.newPassword')}</Label>
          <PasswordField
            id="new-password"
            value={newPassword}
            onChange={setNewPassword}
            visible={showPassword}
            onToggleVisible={() => setShowPassword((v) => !v)}
            disabled={submitting}
            t={t}
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="confirm-password">{t('resetPassword.confirmPassword')}</Label>
          <PasswordField
            id="confirm-password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showPassword}
            disabled={submitting}
            t={t}
          />
        </div>

        {error ? (
          <div
            role="alert"
            aria-live="assertive"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button
          type="submit"
          disabled={submitting}
          className="h-11 rounded-lg text-[14px] font-semibold shadow-sm"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t('resetPassword.submitting')}
            </>
          ) : (
            t('resetPassword.submit')
          )}
        </Button>

        <Link
          to="/login"
          className="text-center text-[12px] font-medium text-muted-foreground hover:text-foreground"
        >
          ← {t('login.forgotPasswordBack')}
        </Link>
      </form>
    </CenteredFrame>
  );
}

function CenteredFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col items-center bg-background px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-10 sm:pt-[max(4rem,env(safe-area-inset-top))] lg:justify-center">
      <div className="w-full max-w-md">
        <div className="mb-7 flex">
          <BrandBlock size={40} />
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordField({
  id,
  value,
  onChange,
  visible,
  onToggleVisible,
  disabled,
  t,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  visible: boolean;
  onToggleVisible?: () => void;
  disabled?: boolean;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete="new-password"
        required
        minLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="••••••••"
        className={cn(
          'h-11 w-full rounded-lg border border-input bg-card px-3 pl-10 pr-10 text-[14px] shadow-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30',
        )}
      />
      {onToggleVisible ? (
        <button
          type="button"
          onClick={onToggleVisible}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30"
          aria-label={visible ? t('login.hidePassword') : t('login.showPassword')}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      ) : null}
    </div>
  );
}
