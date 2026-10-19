import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Lock,
  Mail,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { BrandBlock } from '@/components/brand-logo';
import { FormField } from '@/components/form-field';
import { PasswordInput } from '@/components/password-input';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PROJECTS } from '@/contexts/project-context';
import { useT, type DictKey } from '@/i18n';
import { authClient, useSession } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';
import { cn } from '@/lib/utils';

interface LocationState {
  from?: { pathname: string };
}

// Brand mark and gradient are owned by PROJECTS; do not restate them here.
const BRAND_CARD_COPY: Record<string, { nameKey: DictKey; metaKey: DictKey }> = {
  cleanilo: { nameKey: 'brandFilter.cleanilo.name', metaKey: 'brandFilter.cleanilo.meta' },
  hamburg_teppichreinigung: {
    nameKey: 'brandFilter.hamburg.name',
    metaKey: 'brandFilter.hamburg.meta',
  },
  teppichreinigen_lassen: {
    nameKey: 'brandFilter.teppich.name',
    metaKey: 'brandFilter.teppich.meta',
  },
};

const BRAND_CARDS = PROJECTS.flatMap((project) => {
  const copy = BRAND_CARD_COPY[project.companySlug];
  return copy ? [{ mark: project.mark, gradient: project.gradient, ...copy }] : [];
});

type Notice = { kind: 'error' | 'info'; text: string } | null;

interface AuthErrorShape {
  message?: string | null;
  status?: number;
  statusText?: string | null;
  code?: string;
}

function translateAuthError(
  err: AuthErrorShape | null | undefined,
  t: ReturnType<typeof useT>,
): string {
  if (!err) return t('login.errors.generic');
  const code = (err.code ?? '').toUpperCase();
  const msg = (err.message ?? '').toLowerCase();
  const status = err.status;

  if (code === 'INVALID_EMAIL_OR_PASSWORD' || code === 'INVALID_CREDENTIALS') {
    return t('login.errors.invalidCredentials');
  }
  if (code === 'USER_NOT_FOUND') {
    return t('login.errors.userNotFound');
  }
  if (status === 429 || msg.includes('rate') || msg.includes('too many')) {
    return t('login.errors.rateLimited');
  }
  if (msg.includes('not found') && msg.includes('user')) {
    return t('login.errors.userNotFound');
  }
  if (msg.includes('invalid') || msg.includes('incorrect') || status === 401 || status === 403) {
    return t('login.errors.invalidCredentials');
  }
  if (msg.includes('disabled') || msg.includes('inactive') || msg.includes('not active')) {
    return t('login.errors.inactive');
  }
  if (status && status >= 500) {
    return t('login.errors.server');
  }
  return t('login.errors.generic');
}

type LoginMode = 'signin' | 'forgot';

export function LoginPage() {
  const session = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const [mode, setMode] = useState<LoginMode>('signin');
  const [forgotSent, setForgotSent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  usePageTitle(mode === 'signin' ? t('login.submit') : t('login.forgotTitle'));

  const fromState = location.state as LocationState | null;
  const redirectTo = fromState?.from?.pathname ?? '/';

  if (session.data?.user) {
    return <Navigate to={redirectTo} replace />;
  }

  function clearNotice() {
    if (notice) setNotice(null);
  }

  function switchMode(next: LoginMode) {
    setMode(next);
    setNotice(null);
    setForgotSent(false);
  }

  function handleCapsLock(e: React.KeyboardEvent<HTMLInputElement>) {
    if (typeof e.getModifierState === 'function') {
      setCapsLockOn(e.getModifierState('CapsLock'));
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setSubmitting(true);
    try {
      const result = await authClient.signIn.email({
        email: email.trim(),
        password,
        rememberMe,
      });
      if (result.error) {
        setNotice({ kind: 'error', text: translateAuthError(result.error, t) });
        return;
      }
      // Guard against a proxy returning success without a user.
      if (!result.data?.user) {
        setNotice({
          kind: 'error',
          text: translateAuthError({ message: 'unauthorized' }, t),
        });
        return;
      }
      await session.refetch();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setNotice({
        kind: 'error',
        text: translateAuthError(err as AuthErrorShape, t),
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgotSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    setSubmitting(true);
    try {
      // Same success state regardless, to avoid email enumeration.
      await authClient.requestPasswordReset({ email: email.trim() });
      setForgotSent(true);
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : t('login.errors.generic'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid min-h-svh grid-cols-1 lg:grid-cols-[1.05fr_0.95fr]">
      <BrandCanvas />

      <section className="relative flex flex-col items-center bg-background px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-10 sm:pt-[max(4rem,env(safe-area-inset-top))] lg:justify-center lg:py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex lg:hidden">
            <BrandBlock size={36} />
          </div>

          <div className="mb-6 space-y-1.5">
            <h1 className="text-title font-semibold text-foreground">
              {mode === 'signin' ? t('login.welcome') : t('login.forgotPassword')}
            </h1>
            <p className="text-2sm text-muted-foreground">
              {mode === 'signin' ? t('login.subtitle') : t('login.forgotPasswordPrompt')}
            </p>
          </div>

          <form onSubmit={mode === 'signin' ? onSubmit : onForgotSubmit} className="grid gap-4">
            <FormField label={t('login.email')} htmlFor="email">
              <EmailInput
                value={email}
                onChange={(next) => {
                  setEmail(next);
                  clearNotice();
                }}
                disabled={submitting || forgotSent}
                placeholder={t('login.emailPlaceholder')}
              />
            </FormField>

            {mode === 'signin' ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t('login.password')}</Label>
                  <PasswordInput
                    id="password"
                    name="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearNotice();
                    }}
                    onKeyUp={handleCapsLock}
                    onKeyDown={handleCapsLock}
                    disabled={submitting}
                    placeholder={t('login.passwordPlaceholder')}
                    aria-describedby={capsLockOn ? 'caps-lock-warning' : undefined}
                  />
                  {capsLockOn ? (
                    <p
                      id="caps-lock-warning"
                      role="status"
                      className="flex items-center gap-1.5 text-xs font-medium text-warning"
                    >
                      <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
                      {t('login.capsLock')}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex items-center gap-2.5">
                    <Checkbox
                      id="remember-me"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <label
                      htmlFor="remember-me"
                      className="cursor-pointer select-none text-2sm text-muted-foreground"
                    >
                      {t('login.rememberMe')}
                    </label>
                  </div>
                  <button
                    type="button"
                    className="rounded-sm text-2sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => switchMode('forgot')}
                  >
                    {t('login.forgotPassword')}
                  </button>
                </div>
              </>
            ) : null}

            {forgotSent ? (
              <Alert tone="success">{t('login.forgotPasswordSent')}</Alert>
            ) : notice ? (
              <Alert tone={notice.kind === 'error' ? 'destructive' : 'info'}>{notice.text}</Alert>
            ) : null}

            {!forgotSent ? (
              <Button type="submit" loading={submitting} className="w-full">
                {mode === 'signin'
                  ? submitting
                    ? t('login.submitting')
                    : t('login.submit')
                  : submitting
                    ? t('login.forgotPasswordSending')
                    : t('login.forgotPasswordSubmit')}
                {mode === 'signin' && !submitting ? <ArrowRight aria-hidden="true" /> : null}
              </Button>
            ) : null}

            {mode === 'forgot' ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => switchMode('signin')}
                className="justify-self-center text-muted-foreground"
              >
                <ArrowLeft aria-hidden="true" />
                {t('login.forgotPasswordBack')}
              </Button>
            ) : null}
          </form>

          <p className="mt-8 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="mt-px size-4 shrink-0" aria-hidden="true" />
            <span>{t('login.trustNote')}</span>
          </p>

          <p className="mt-6 text-center text-2xs text-muted-foreground">
            {t('login.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </section>
    </div>
  );
}

function EmailInput({
  value,
  onChange,
  disabled,
  placeholder,
  ...aria
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}) {
  return (
    <div className="relative">
      <Mail
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        {...aria}
        name="email"
        type="email"
        autoComplete="email"
        spellCheck="false"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}

function BrandCanvas() {
  const t = useT();
  return (
    <aside
      aria-label={t('brand.name')}
      className="relative hidden overflow-hidden bg-ink text-parchment lg:flex lg:flex-col"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)',
        }}
      />

      <div className="relative flex flex-1 flex-col p-12">
        <BrandBlock tone="dark" size={36} />

        <div className="mt-auto max-w-lg">
          <p className="text-xs font-medium text-parchment/70">{t('brand.canvas.pill')}</p>
          <h2 className="mt-3 text-metric font-semibold">
            {t('brand.canvas.headlinePre')} <span>{t('brand.canvas.headlineAccent')}</span>
            {t('brand.canvas.headlinePost')}
          </h2>
          <p className="mt-3 max-w-md text-sm text-parchment/70">{t('brand.canvas.body')}</p>
        </div>

        <ul className="mt-10 grid max-w-lg gap-2">
          {BRAND_CARDS.map((b) => (
            <li
              key={b.mark}
              className="flex items-center gap-3 rounded-lg border border-parchment/10 bg-parchment/[0.04] px-3.5 py-3"
            >
              <div
                className={cn(
                  'flex size-8 items-center justify-center rounded-md bg-gradient-to-br text-xs font-bold text-white',
                  b.gradient,
                )}
                aria-hidden="true"
              >
                {b.mark}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-2sm font-semibold">{t(b.nameKey)}</div>
                <div className="truncate text-xs text-parchment/70">{t(b.metaKey)}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-parchment/10 pt-5 text-xs text-parchment/70">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {t('brand.canvas.gdpr')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden="true" />
            {t('brand.canvas.tls')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Server className="size-3.5" aria-hidden="true" />
            {t('brand.canvas.location')}
          </span>
        </div>
      </div>
    </aside>
  );
}
