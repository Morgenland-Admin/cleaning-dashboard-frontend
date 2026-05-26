import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  MessageSquare,
  Monitor,
  Moon,
  Send,
  Share2,
  Smartphone,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTheme, type Theme } from '@/contexts/theme-context';
import { useLocale, useT, type Locale } from '@/i18n';
import {
  usersApi,
  type SettingsPatch,
  type UserSettings,
  type UserTheme,
  ApiError,
} from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';
import { usePush, isIos, isStandalonePwa } from '@/lib/use-push';
import { cn } from '@/lib/utils';

const LOCALES: { value: Locale; label: string; flag: string }[] = [
  { value: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { value: 'en', label: 'English', flag: '🇬🇧' },
];

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { setTheme: applyTheme } = useTheme();
  const { locale, setLocale } = useLocale();
  const t = useT();
  usePageTitle(t('settings.title'));

  const query = useQuery({
    queryKey: ['me', 'settings'],
    queryFn: ({ signal }) => usersApi.settings(signal),
  });

  useEffect(() => {
    const s = query.data?.settings;
    if (!s) return;
    if (s.theme) applyTheme(s.theme as Theme);
    if (s.locale === 'de' || s.locale === 'en') setLocale(s.locale);
    // Only react to loaded settings, not local providers, to avoid feedback loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data?.settings.theme, query.data?.settings.locale]);

  const mutation = useMutation({
    mutationFn: (patch: SettingsPatch) => usersApi.updateSettings(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({ queryKey: ['me', 'settings'] });
      const previous = queryClient.getQueryData<{ settings: UserSettings }>(['me', 'settings']);
      if (previous) {
        queryClient.setQueryData(['me', 'settings'], {
          settings: { ...previous.settings, ...patch },
        });
      }
      if (patch.theme) applyTheme(patch.theme as Theme);
      if (patch.locale === 'de' || patch.locale === 'en') setLocale(patch.locale);
      return { previous };
    },
    onError: (_err, _patch, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['me', 'settings'], ctx.previous);
    },
    onSuccess: ({ settings }) => {
      queryClient.setQueryData(['me', 'settings'], { settings });
    },
  });

  const settings = query.data?.settings;
  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? t('settings.saveError')
        : null;

  if (query.isLoading || !settings) {
    return (
      <div className="mx-auto flex w-full max-w-[1000px] items-center justify-center py-24">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  const themeOptions: {
    value: UserTheme;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }[] = [
    {
      value: 'system',
      label: t('settings.themeSystem'),
      icon: Monitor,
      description: t('settings.themeSystemDesc'),
    },
    {
      value: 'light',
      label: t('settings.themeLight'),
      icon: Sun,
      description: t('settings.themeLightDesc'),
    },
    {
      value: 'dark',
      label: t('settings.themeDark'),
      icon: Moon,
      description: t('settings.themeDarkDesc'),
    },
  ];

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-semibold tracking-tight sm:text-3xl">
            {t('settings.title')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t('settings.subtitle')}</p>
        </div>
        {mutation.isPending ? (
          <span
            role="status"
            aria-live="polite"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
          >
            <Loader2 className="size-3.5 animate-spin" />
            {t('common.saving')}
          </span>
        ) : null}
      </header>

      {errorMessage ? <ErrorBanner message={errorMessage} /> : null}

      <SectionCard title={t('settings.languageTitle')} subtitle={t('settings.languageSubtitle')}>
        <div className="grid gap-2 sm:grid-cols-2">
          {LOCALES.map((loc) => {
            const active = locale === loc.value;
            return (
              <button
                key={loc.value}
                type="button"
                onClick={() => mutation.mutate({ locale: loc.value })}
                aria-pressed={active}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30',
                  active
                    ? 'border-foreground/20 bg-rust/[0.08] ring-1 ring-rust/30'
                    : 'border-border hover:bg-muted/40',
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl leading-none">{loc.flag}</span>
                  <div>
                    <div className="text-sm font-semibold">{loc.label}</div>
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {loc.value}
                    </div>
                  </div>
                </div>
                {active ? <Check className="size-4 text-rust" /> : null}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title={t('settings.appearanceTitle')}
        subtitle={t('settings.appearanceSubtitle')}
      >
        <div className="grid gap-2 sm:grid-cols-3">
          {themeOptions.map((opt) => {
            const active = settings.theme === opt.value;
            const Icon = opt.icon;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => mutation.mutate({ theme: opt.value })}
                aria-pressed={active}
                className={cn(
                  'flex flex-col items-start gap-2 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rust/30',
                  active
                    ? 'border-foreground/20 bg-rust/[0.08] ring-1 ring-rust/30'
                    : 'border-border hover:bg-muted/40',
                )}
              >
                <div
                  className={cn(
                    'flex size-8 items-center justify-center rounded-md',
                    active ? 'bg-rust text-primary-foreground' : 'bg-muted text-foreground/70',
                  )}
                >
                  <Icon className="size-4" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{opt.label}</div>
                  <div className="text-[11px] text-muted-foreground">{opt.description}</div>
                </div>
                {active ? (
                  <span className="mt-1 inline-flex items-center gap-1 text-[11px] text-rust">
                    <Check className="size-3" /> {t('settings.themeActive')}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard title={t('settings.notifTitle')} subtitle={t('settings.notifSubtitle')}>
        <div className="flex flex-col gap-1">
          <ToggleRow
            icon={Mail}
            label={t('settings.notifEmail')}
            description={t('settings.notifEmailDesc')}
            checked={settings.notificationsEmail}
            onChange={(v) => mutation.mutate({ notificationsEmail: v })}
          />
          <ToggleRow
            icon={MessageSquare}
            label={t('settings.notifSms')}
            description={t('settings.notifSmsDesc')}
            checked={settings.notificationsSms}
            onChange={(v) => mutation.mutate({ notificationsSms: v })}
          />
          <ToggleRow
            icon={Sparkles}
            label={t('settings.notifMarketing')}
            description={t('settings.notifMarketingDesc')}
            checked={settings.marketingOptIn}
            onChange={(v) => mutation.mutate({ marketingOptIn: v })}
          />
        </div>
      </SectionCard>

      <PushNotificationsSection />

      <ChangePasswordSection />
    </div>
  );
}

function ChangePasswordSection() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function reset() {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setNotice(null);
  }

  function close() {
    setOpen(false);
    reset();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);

    if (newPassword.length < 8) {
      setNotice({ kind: 'error', text: t('changePassword.tooShort') });
      return;
    }
    if (newPassword !== confirmPassword) {
      setNotice({ kind: 'error', text: t('changePassword.mismatch') });
      return;
    }

    setSubmitting(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      });
      if (result.error) {
        const code = (result.error.code ?? '').toUpperCase();
        const msg = (result.error.message ?? '').toLowerCase();
        const isWrongCurrent =
          code.includes('PASSWORD') ||
          msg.includes('invalid password') ||
          msg.includes('incorrect');
        setNotice({
          kind: 'error',
          text: isWrongCurrent
            ? t('changePassword.errors.wrongCurrent')
            : (result.error.message ?? t('changePassword.errors.generic')),
        });
        return;
      }
      setNotice({ kind: 'success', text: t('changePassword.success') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.setTimeout(() => {
        setOpen(false);
        setNotice(null);
      }, 1600);
    } catch (err) {
      setNotice({
        kind: 'error',
        text: err instanceof Error ? err.message : t('changePassword.errors.generic'),
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <section className="rounded-2xl border border-border bg-card">
        <header className="border-b border-border/60 px-4 py-4 sm:px-6">
          <h2 className="font-serif text-lg font-semibold tracking-tight">
            {t('changePassword.title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('changePassword.subtitle')}</p>
        </header>
        <div className="flex items-center gap-3 p-4 sm:p-6">
          <div className="flex size-9 items-center justify-center rounded-md bg-rust/10 text-rust">
            <Lock className="size-4" />
          </div>
          <div className="flex-1 text-sm text-muted-foreground">{t('changePassword.subtitle')}</div>
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t('changePassword.open')}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-rust/30 bg-rust/[0.04]">
      <header className="flex flex-row items-start justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-6">
        <div>
          <h2 className="font-serif text-lg font-semibold tracking-tight">
            {t('changePassword.title')}
          </h2>
          <p className="text-xs text-muted-foreground">{t('changePassword.subtitle')}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={close} aria-label={t('changePassword.cancel')}>
          <X className="size-4" />
        </Button>
      </header>
      <form onSubmit={onSubmit} className="grid gap-4 p-4 sm:p-6">
        <div className="grid gap-1.5">
          <Label htmlFor="pwd-current">{t('changePassword.currentPassword')}</Label>
          <PasswordInput
            id="pwd-current"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
            visible={showCurrent}
            onToggleVisible={() => setShowCurrent((v) => !v)}
            disabled={submitting}
            t={t}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="pwd-new">{t('changePassword.newPassword')}</Label>
            <PasswordInput
              id="pwd-new"
              value={newPassword}
              onChange={setNewPassword}
              autoComplete="new-password"
              visible={showNew}
              onToggleVisible={() => setShowNew((v) => !v)}
              disabled={submitting}
              t={t}
              minLength={8}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pwd-confirm">{t('changePassword.confirmPassword')}</Label>
            <PasswordInput
              id="pwd-confirm"
              value={confirmPassword}
              onChange={setConfirmPassword}
              autoComplete="new-password"
              visible={showNew}
              disabled={submitting}
              t={t}
              minLength={8}
            />
          </div>
        </div>

        {notice ? (
          <div
            role={notice.kind === 'error' ? 'alert' : 'status'}
            aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
            className={
              notice.kind === 'error'
                ? 'flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'
                : 'flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800'
            }
          >
            {notice.kind === 'error' ? (
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{notice.text}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4">
          <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
            {t('changePassword.cancel')}
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {t('changePassword.submitting')}
              </>
            ) : (
              t('changePassword.submit')
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  visible,
  onToggleVisible,
  disabled,
  t,
  minLength,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  autoComplete: string;
  visible: boolean;
  onToggleVisible?: () => void;
  disabled?: boolean;
  t: ReturnType<typeof useT>;
  minLength?: number;
}) {
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        minLength={minLength}
        required
        className="pl-10 pr-10"
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

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="border-b border-border/60 px-4 py-4 sm:px-6">
        <h2 className="font-serif text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </header>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  );
}

function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-muted/40">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground/70">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </div>
      <Checkbox checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-1" />
    </label>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

function PushNotificationsSection() {
  const t = useT();
  const push = usePush();
  const ios = isIos();
  const standalone = isStandalonePwa();

  const serverDown = push.isConfigured === false;

  return (
    <SectionCard title={t('settings.pushTitle')} subtitle={t('settings.pushSubtitle')}>
      <div className="flex flex-col gap-3">
        <StatusBanner state={push.state} t={t} serverDown={serverDown} />

        {push.state === 'needs-install' && ios && !standalone ? <IosInstallHint t={t} /> : null}

        {push.error ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{push.error}</span>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {push.state === 'subscribed' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void push.disable()}
                disabled={push.isBusy}
              >
                {push.isBusy ? (
                  <Loader2 className="mr-1.5 size-4 animate-spin" />
                ) : (
                  <BellOff className="mr-1.5 size-4" />
                )}
                {t('settings.pushDisable')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void push.sendTest()}
                disabled={push.isBusy}
              >
                <Send className="mr-1.5 size-4" />
                {t('settings.pushTest')}
              </Button>
            </>
          ) : null}

          {push.state === 'ready' || push.state === 'default' || push.state === 'denied' ? (
            <Button
              size="sm"
              onClick={() => void push.enable()}
              disabled={push.isBusy || push.state === 'denied' || serverDown}
            >
              {push.isBusy ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Bell className="mr-1.5 size-4" />
              )}
              {t('settings.pushEnable')}
            </Button>
          ) : null}
        </div>
      </div>
    </SectionCard>
  );
}

function StatusBanner({
  state,
  t,
  serverDown,
}: {
  state: ReturnType<typeof usePush>['state'];
  t: ReturnType<typeof useT>;
  serverDown: boolean;
}) {
  type Tone = 'neutral' | 'good' | 'warn' | 'bad';
  type Info = { tone: Tone; icon: React.ElementType; title: string; body: string };
  const map: Record<typeof state, Info> = {
    unsupported: {
      tone: 'warn',
      icon: AlertCircle,
      title: t('settings.pushState.unsupportedTitle'),
      body: t('settings.pushState.unsupportedBody'),
    },
    'needs-install': {
      tone: 'warn',
      icon: Smartphone,
      title: t('settings.pushState.needsInstallTitle'),
      body: t('settings.pushState.needsInstallBody'),
    },
    denied: {
      tone: 'bad',
      icon: BellOff,
      title: t('settings.pushState.deniedTitle'),
      body: t('settings.pushState.deniedBody'),
    },
    default: {
      tone: 'neutral',
      icon: Bell,
      title: t('settings.pushState.defaultTitle'),
      body: t('settings.pushState.defaultBody'),
    },
    ready: {
      tone: 'neutral',
      icon: Bell,
      title: t('settings.pushState.readyTitle'),
      body: t('settings.pushState.readyBody'),
    },
    subscribed: {
      tone: 'good',
      icon: CheckCircle2,
      title: t('settings.pushState.subscribedTitle'),
      body: t('settings.pushState.subscribedBody'),
    },
  };
  const info = serverDown
    ? {
        tone: 'warn' as Tone,
        icon: AlertCircle,
        title: t('settings.pushState.serverDownTitle'),
        body: t('settings.pushState.serverDownBody'),
      }
    : map[state];

  const toneCls: Record<Tone, string> = {
    neutral: 'border-border bg-muted/40 text-foreground/80',
    good: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
    warn: 'border-rust/30 bg-rust-soft/40 text-foreground',
    bad: 'border-destructive/30 bg-destructive/5 text-destructive',
  };

  const Icon = info.icon;
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-3 py-2.5', toneCls[info.tone])}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{info.title}</p>
        <p className="mt-0.5 text-xs opacity-90">{info.body}</p>
      </div>
    </div>
  );
}

function IosInstallHint({ t }: { t: ReturnType<typeof useT> }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 text-sm">
      <p className="mb-2 flex items-center gap-2 font-medium text-foreground">
        <Smartphone className="size-4 text-rust" aria-hidden="true" />
        {t('settings.iosInstallTitle')}
      </p>
      <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
        <li>
          <span className="inline-flex items-center gap-1">
            {t('settings.iosInstallStep1')}
            <Share2 className="inline size-3.5 text-rust" aria-hidden="true" />
          </span>
        </li>
        <li>{t('settings.iosInstallStep2')}</li>
        <li>{t('settings.iosInstallStep3')}</li>
      </ol>
    </div>
  );
}
