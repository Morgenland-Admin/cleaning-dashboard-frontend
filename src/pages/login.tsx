import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  Mail,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';

import { BrandBlock } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useT } from '@/i18n';
import { authClient, useSession } from '@/lib/auth-client';
import { cn } from '@/lib/utils';

interface LocationState {
  from?: { pathname: string };
}

const BRAND_CARDS = [
  {
    mark: 'CL',
    nameKey: 'brandFilter.cleanilo.name',
    metaKey: 'brandFilter.cleanilo.meta',
    gradient: 'from-sky-400 to-indigo-500',
  },
  {
    mark: 'HT',
    nameKey: 'brandFilter.hamburg.name',
    metaKey: 'brandFilter.hamburg.meta',
    gradient: 'from-emerald-400 to-teal-500',
  },
  {
    mark: 'TL',
    nameKey: 'brandFilter.teppich.name',
    metaKey: 'brandFilter.teppich.meta',
    gradient: 'from-fuchsia-400 to-rose-500',
  },
] as const;

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
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [submitting, setSubmitting] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);

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
      // Better Auth returns data.user on success; guard against proxy hiccups producing no user.
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
      // Same success state regardless to avoid email enumeration.
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
        <div className="w-full max-w-md">
          <div className="mb-7 flex lg:hidden">
            <BrandBlock size={40} />
          </div>

          <div className="mb-7">
            <h1 className="font-serif text-[30px] font-semibold leading-[1.1] tracking-tight sm:text-[34px]">
              {mode === 'signin' ? t('login.welcome') : t('login.forgotPassword')}
            </h1>
            <p className="mt-2 text-[13px] text-muted-foreground sm:text-sm">
              {mode === 'signin' ? t('login.subtitle') : t('login.forgotPasswordPrompt')}
            </p>
          </div>

          <form onSubmit={mode === 'signin' ? onSubmit : onForgotSubmit} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">{t('login.email')}</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  spellCheck="false"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearNotice();
                  }}
                  disabled={submitting || forgotSent}
                  placeholder={t('login.emailPlaceholder')}
                  className="h-11 w-full rounded-lg border border-input bg-card px-3 pl-10 text-[14px] shadow-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30"
                />
              </div>
            </div>

            {mode === 'signin' ? (
              <>
                <div className="grid gap-1.5">
                  <div className="flex items-end justify-between gap-2">
                    <Label htmlFor="password">{t('login.password')}</Label>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none"
                      onClick={() => switchMode('forgot')}
                    >
                      {t('login.forgotPassword')}
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
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
                      className="h-11 w-full rounded-lg border border-input bg-card px-3 pl-10 pr-10 text-[14px] shadow-sm transition-colors placeholder:text-muted-foreground/70 focus-visible:border-foreground/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30"
                      aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {capsLockOn ? (
                    <p
                      role="status"
                      className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400"
                    >
                      <AlertCircle className="size-3" />
                      {t('login.capsLock')}
                    </p>
                  ) : null}
                </div>

                <label className="flex cursor-pointer select-none items-center gap-2.5 py-1 text-[13px] text-muted-foreground">
                  <Checkbox
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>{t('login.rememberMe')}</span>
                </label>
              </>
            ) : null}

            {forgotSent ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
              >
                <Info className="mt-0.5 size-4 shrink-0" />
                <span>{t('login.forgotPasswordSent')}</span>
              </div>
            ) : notice ? (
              <div
                role={notice.kind === 'error' ? 'alert' : 'status'}
                aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                  notice.kind === 'error'
                    ? 'border-destructive/30 bg-destructive/5 text-destructive'
                    : 'border-rust/30 bg-rust/5 text-foreground/85',
                )}
              >
                {notice.kind === 'error' ? (
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <Info className="mt-0.5 size-4 shrink-0 text-rust" />
                )}
                <span>{notice.text}</span>
              </div>
            ) : null}

            {!forgotSent ? (
              <Button
                type="submit"
                disabled={submitting}
                className="h-11 rounded-lg text-[14px] font-semibold shadow-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {mode === 'signin' ? t('login.submitting') : t('login.forgotPasswordSending')}
                  </>
                ) : mode === 'signin' ? (
                  <>
                    {t('login.submit')}
                    <ArrowRight className="size-4" />
                  </>
                ) : (
                  t('login.forgotPasswordSubmit')
                )}
              </Button>
            ) : null}

            {mode === 'forgot' ? (
              <button
                type="button"
                onClick={() => switchMode('signin')}
                className="text-center text-[12px] font-medium text-muted-foreground hover:text-foreground focus-visible:underline focus-visible:outline-none"
              >
                ← {t('login.forgotPasswordBack')}
              </button>
            ) : null}
          </form>

          <div className="mt-8 flex items-center gap-2 rounded-xl border border-border bg-card/60 px-3 py-2.5 text-[12px] text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-rust" />
            <span>{t('login.trustNote')}</span>
          </div>

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            {t('login.copyright', { year: new Date().getFullYear() })}
          </p>
        </div>
      </section>
    </div>
  );
}

function BrandCanvas() {
  const t = useT();
  return (
    <aside
      aria-label={t('brand.name')}
      className="relative hidden overflow-hidden bg-[hsl(24_14%_9%)] text-[hsl(38_30%_92%)] lg:flex lg:flex-col"
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-90"
        style={{
          background:
            'radial-gradient(60% 60% at 18% 22%, hsla(14, 68%, 46%, 0.22) 0%, transparent 60%), radial-gradient(50% 60% at 85% 88%, hsla(38, 60%, 50%, 0.10) 0%, transparent 60%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)',
        }}
      />

      <div className="relative flex flex-1 flex-col p-12">
        <BrandBlock tone="cream" size={40} />

        <div className="mt-auto max-w-xl">
          <span className="border-[hsl(38_30%_92%)]/15 bg-[hsl(38_30%_92%)]/5 text-[hsl(38_30%_92%)]/70 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
            {t('brand.canvas.pill')}
          </span>
          <h2 className="mt-5 font-serif text-[44px] font-semibold leading-[1.05] tracking-tight">
            {t('brand.canvas.headlinePre')}{' '}
            <span className="italic text-rust">{t('brand.canvas.headlineAccent')}</span>
            {t('brand.canvas.headlinePost')}
          </h2>
          <p className="text-[hsl(38_30%_92%)]/65 mt-4 max-w-md text-[14px] leading-relaxed">
            {t('brand.canvas.body')}
          </p>
        </div>

        <ul className="mt-10 grid max-w-xl gap-2.5">
          {BRAND_CARDS.map((b) => (
            <li
              key={b.mark}
              className="border-[hsl(38_30%_92%)]/10 bg-[hsl(38_30%_92%)]/[0.04] flex items-center gap-3 rounded-xl border px-3.5 py-3 backdrop-blur-sm"
            >
              <div
                className={cn(
                  'flex size-9 items-center justify-center rounded-md bg-gradient-to-br text-xs font-bold text-white shadow-sm',
                  b.gradient,
                )}
                aria-hidden="true"
              >
                {b.mark}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold tracking-tight">
                  {t(b.nameKey)}
                </div>
                <div className="text-[hsl(38_30%_92%)]/55 truncate text-[11px]">{t(b.metaKey)}</div>
              </div>
            </li>
          ))}
        </ul>

        <div className="border-[hsl(38_30%_92%)]/10 text-[hsl(38_30%_92%)]/60 mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t pt-5 text-[11px]">
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
