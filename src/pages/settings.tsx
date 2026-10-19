import {
  AlertCircle,
  Bell,
  BellOff,
  Check,
  CheckCircle2,
  Loader2,
  Monitor,
  Moon,
  Send,
  Smartphone,
  Sun,
  X,
} from 'lucide-react';
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

import { LoadingState } from '@/components/empty-state';
import { FormField } from '@/components/form-field';
import { PageContainer, PageHeading } from '@/components/page-heading';
import { PasswordInput } from '@/components/password-input';
import { IosInstallSteps } from '@/components/pwa-prompts';
import { SectionCard } from '@/components/section';
import { Alert, ErrorState, type AlertProps } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useLocale, useT, type Locale } from '@/i18n';
import { useIsSeoOnly } from '@/lib/access';
import { type UserTheme, ApiError } from '@/lib/api';
import { authClient } from '@/lib/auth-client';
import { usePageTitle } from '@/lib/use-page-title';
import { usePush, isIos, isStandalonePwa } from '@/lib/use-push';
import { useUserPreferences } from '@/lib/use-user-preferences';
import { cn } from '@/lib/utils';

type T = ReturnType<typeof useT>;

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
];

export function SettingsPage() {
  const seoOnly = useIsSeoOnly();
  const { locale } = useLocale();
  const t = useT();
  usePageTitle(t('settings.title'));

  // The app shell applies saved theme/locale once per session (`useApplySavedPreferences`); this page only reads and writes them.
  const { query, settings, update, mutation } = useUserPreferences();

  const errorMessage =
    mutation.error instanceof ApiError
      ? mutation.error.message
      : mutation.error
        ? t('settings.saveError')
        : null;

  const heading = (
    <PageHeading
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
      actions={
        // Always mounted, so the live region announces "saving" when it appears.
        <span
          role="status"
          aria-live="polite"
          className="inline-flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground"
        >
          {mutation.isPending ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              {t('common.saving')}
            </>
          ) : null}
        </span>
      }
    />
  );

  if (query.isLoading) {
    return (
      <PageContainer width="narrow">
        {heading}
        <LoadingState />
      </PageContainer>
    );
  }

  if (!settings) {
    return (
      <PageContainer width="narrow">
        {heading}
        <ErrorState
          error={query.error}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      </PageContainer>
    );
  }

  const themeOptions: RadioCardOption<UserTheme>[] = [
    {
      value: 'system',
      label: t('settings.themeSystem'),
      icon: <Monitor />,
      description: t('settings.themeSystemDesc'),
    },
    {
      value: 'light',
      label: t('settings.themeLight'),
      icon: <Sun />,
      description: t('settings.themeLightDesc'),
    },
    {
      value: 'dark',
      label: t('settings.themeDark'),
      icon: <Moon />,
      description: t('settings.themeDarkDesc'),
    },
  ];

  const localeOptions: RadioCardOption<Locale>[] = LOCALES.map((loc) => ({
    value: loc.value,
    label: <span lang={loc.value}>{loc.label}</span>,
    description: loc.value.toUpperCase(),
  }));

  return (
    <PageContainer width="narrow">
      {heading}

      <div className="flex flex-col gap-4">
        {errorMessage ? <Alert tone="destructive">{errorMessage}</Alert> : null}

        <SectionCard
          title={t('settings.languageTitle')}
          description={t('settings.languageSubtitle')}
        >
          <RadioCardGroup
            label={t('settings.languageTitle')}
            value={locale}
            options={localeOptions}
            onValueChange={(value) => update({ locale: value })}
            columns={2}
          />
        </SectionCard>

        <SectionCard
          title={t('settings.appearanceTitle')}
          description={t('settings.appearanceSubtitle')}
        >
          <RadioCardGroup
            label={t('settings.appearanceTitle')}
            value={settings.theme}
            options={themeOptions}
            onValueChange={(value) => update({ theme: value })}
            columns={3}
          />
        </SectionCard>

        <SectionCard
          title={t('settings.notifTitle')}
          description={t('settings.notifSubtitle')}
          bodyClassName="p-0 sm:p-0"
        >
          <div className="flex flex-col divide-y divide-border">
            <ToggleRow
              label={t('settings.notifEmail')}
              description={t('settings.notifEmailDesc')}
              checked={settings.notificationsEmail}
              onChange={(v) => update({ notificationsEmail: v })}
            />
            <ToggleRow
              label={t('settings.notifSms')}
              description={t('settings.notifSmsDesc')}
              checked={settings.notificationsSms}
              onChange={(v) => update({ notificationsSms: v })}
            />
            <ToggleRow
              label={t('settings.notifMarketing')}
              description={t('settings.notifMarketingDesc')}
              checked={settings.marketingOptIn}
              onChange={(v) => update({ marketingOptIn: v })}
            />
          </div>
        </SectionCard>

        {seoOnly ? null : <PushNotificationsSection />}

        <ChangePasswordSection />
      </div>
    </PageContainer>
  );
}

interface RadioCardOption<V extends string> {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
}

// Radiogroup with roving focus: Tab lands on the selected card, arrows move and select.
function RadioCardGroup<V extends string>({
  label,
  value,
  options,
  onValueChange,
  columns,
}: {
  label: string;
  value: V;
  options: RadioCardOption<V>[];
  onValueChange: (value: V) => void;
  columns: 2 | 3;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  function onKeyDown(event: KeyboardEvent, index: number) {
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowDown: 1,
      ArrowLeft: -1,
      ArrowUp: -1,
    };
    let next: number;
    if (event.key in step) next = (index + step[event.key] + options.length) % options.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = options.length - 1;
    else return;
    event.preventDefault();
    onValueChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid gap-2', columns === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}
    >
      {options.map((opt, i) => {
        const selected = i === selectedIndex;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (selectedIndex === -1 && i === 0) ? 0 : -1}
            onClick={() => onValueChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex items-start gap-3 rounded-lg border px-3 py-3 text-left transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              selected ? 'border-primary bg-primary-soft' : 'border-border hover:bg-accent/60',
            )}
          >
            {opt.icon ? (
              <span
                aria-hidden="true"
                className={cn(
                  'mt-0.5 shrink-0 [&_svg]:size-4',
                  selected ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {opt.icon}
              </span>
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">{opt.label}</span>
              {opt.description ? (
                <span className="block text-xs text-muted-foreground">{opt.description}</span>
              ) : null}
            </span>
            <Check
              aria-hidden="true"
              className={cn('mt-0.5 size-4 shrink-0 text-primary', !selected && 'invisible')}
            />
          </button>
        );
      })}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  // The label is stretched over the row; the description is only aria-describedby so the accessible name stays the short label.
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <div className="relative flex items-start gap-4 px-4 py-3 transition-colors duration-fast hover:bg-accent/60 sm:px-5">
      <div className="min-w-0 flex-1">
        <label
          htmlFor={id}
          className="cursor-pointer text-sm font-medium text-foreground after:absolute after:inset-0 after:content-['']"
        >
          {label}
        </label>
        <p id={descriptionId} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      <Checkbox
        id={id}
        aria-describedby={descriptionId}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
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
      <SectionCard
        title={t('changePassword.title')}
        description={t('changePassword.subtitle')}
        actions={
          <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
            {t('changePassword.open')}
          </Button>
        }
      />
    );
  }

  return (
    <form onSubmit={onSubmit}>
      <SectionCard
        as="fieldset"
        title={t('changePassword.title')}
        description={t('changePassword.subtitle')}
        actions={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={close}
            aria-label={t('changePassword.cancel')}
          >
            <X aria-hidden="true" />
          </Button>
        }
        footer={
          <>
            <Button type="button" variant="ghost" onClick={close} disabled={submitting}>
              {t('changePassword.cancel')}
            </Button>
            <Button type="submit" loading={submitting}>
              {t('changePassword.submit')}
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <FormField label={t('changePassword.currentPassword')} required>
            <PasswordInput
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              visible={showCurrent}
              onVisibleChange={setShowCurrent}
              disabled={submitting}
              required
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label={t('changePassword.newPassword')}
              hint={t('changePassword.tooShort')}
              required
            >
              <PasswordInput
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                visible={showNew}
                onVisibleChange={setShowNew}
                disabled={submitting}
                minLength={8}
                required
              />
            </FormField>
            <FormField label={t('changePassword.confirmPassword')} required>
              <PasswordInput
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                visible={showNew}
                onVisibleChange={setShowNew}
                disabled={submitting}
                minLength={8}
                required
              />
            </FormField>
          </div>

          {notice ? (
            <Alert tone={notice.kind === 'error' ? 'destructive' : 'success'}>{notice.text}</Alert>
          ) : null}
        </div>
      </SectionCard>
    </form>
  );
}

function PushNotificationsSection() {
  const t = useT();
  const push = usePush();
  const ios = isIos();
  const standalone = isStandalonePwa();

  const serverDown = push.isConfigured === false;

  return (
    <SectionCard title={t('settings.pushTitle')} description={t('settings.pushSubtitle')}>
      <div className="flex flex-col gap-3">
        <StatusBanner state={push.state} t={t} serverDown={serverDown} />

        {push.state === 'needs-install' && ios && !standalone ? (
          <div className="rounded-lg border p-3">
            <p className="mb-3 flex items-center gap-2 text-2sm font-medium text-foreground">
              <Smartphone className="size-4 text-muted-foreground" aria-hidden="true" />
              {t('settings.iosInstallTitle')}
            </p>
            <IosInstallSteps
              steps={[
                t('settings.iosInstallStep1'),
                t('settings.iosInstallStep2'),
                t('settings.iosInstallStep3'),
              ]}
            />
          </div>
        ) : null}

        {push.error ? <Alert tone="destructive">{push.error}</Alert> : null}

        <div className="flex flex-wrap items-center gap-2">
          {push.state === 'subscribed' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void push.disable()}
                loading={push.isBusy}
              >
                <BellOff aria-hidden="true" />
                {t('settings.pushDisable')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void push.sendTest()}
                disabled={push.isBusy}
              >
                <Send aria-hidden="true" />
                {t('settings.pushTest')}
              </Button>
            </>
          ) : null}

          {push.state === 'ready' || push.state === 'default' || push.state === 'denied' ? (
            <Button
              size="sm"
              onClick={() => void push.enable()}
              loading={push.isBusy}
              disabled={push.state === 'denied' || serverDown}
            >
              <Bell aria-hidden="true" />
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
  t: T;
  serverDown: boolean;
}) {
  type Info = {
    tone: NonNullable<AlertProps['tone']>;
    icon: React.ElementType;
    title: string;
    body: string;
  };
  const map: Record<typeof state, Info> = {
    unsupported: {
      tone: 'warning',
      icon: AlertCircle,
      title: t('settings.pushState.unsupportedTitle'),
      body: t('settings.pushState.unsupportedBody'),
    },
    'needs-install': {
      tone: 'warning',
      icon: Smartphone,
      title: t('settings.pushState.needsInstallTitle'),
      body: t('settings.pushState.needsInstallBody'),
    },
    denied: {
      tone: 'destructive',
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
      tone: 'success',
      icon: CheckCircle2,
      title: t('settings.pushState.subscribedTitle'),
      body: t('settings.pushState.subscribedBody'),
    },
  };
  const info: Info = serverDown
    ? {
        tone: 'warning',
        icon: AlertCircle,
        title: t('settings.pushState.serverDownTitle'),
        body: t('settings.pushState.serverDownBody'),
      }
    : map[state];

  const Icon = info.icon;
  return (
    <Alert tone={info.tone} title={info.title} icon={<Icon aria-hidden="true" />}>
      {info.body}
    </Alert>
  );
}
