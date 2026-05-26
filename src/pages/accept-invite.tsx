import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { BrandBlock } from '@/components/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError, invitesPublicApi } from '@/lib/api';

export function AcceptInvitePage() {
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
  const [showPassword, setShowPassword] = useState(false);
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
      // Better Auth signUp via auth.api doesn't return a session — redirect to /login.
      setTimeout(() => navigate('/login', { replace: true }), 1500);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : (err as Error).message);
    },
  });

  if (!token) {
    return (
      <CenteredFrame>
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>Einladungs-Token fehlt im Link.</span>
        </div>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center justify-center text-[13px] font-medium text-foreground hover:underline"
        >
          ← Zurück zum Login
        </Link>
      </CenteredFrame>
    );
  }

  if (lookup.isLoading) {
    return (
      <CenteredFrame>
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Einladung wird geprüft …
        </div>
      </CenteredFrame>
    );
  }

  if (lookup.error || !lookup.data) {
    const msg =
      lookup.error instanceof ApiError
        ? lookup.error.message
        : lookup.error
          ? (lookup.error as Error).message
          : 'Einladung nicht gefunden.';
    return (
      <CenteredFrame>
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{msg}</span>
        </div>
        <Link
          to="/login"
          className="mt-6 inline-flex items-center justify-center text-[13px] font-medium text-foreground hover:underline"
        >
          ← Zurück zum Login
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
            <h2 className="font-serif text-xl font-semibold tracking-tight">Konto erstellt</h2>
            <p className="text-sm text-muted-foreground">
              Du wirst gleich zum Login weitergeleitet …
            </p>
          </div>
        </div>
      </CenteredFrame>
    );
  }

  const invite = lookup.data.invite;

  return (
    <CenteredFrame>
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-xl font-semibold tracking-tight">Einladung annehmen</h1>
        <p className="text-sm text-muted-foreground">
          <strong>{invite.invitedByName}</strong> hat dich
          {invite.companyName ? (
            <>
              {' '}
              für <strong>{invite.companyName}</strong>
            </>
          ) : null}{' '}
          als <em>{invite.role}</em> eingeladen.
        </p>
        <p className="text-xs text-muted-foreground">
          E-Mail: <code>{invite.email}</code>
        </p>
      </div>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          if (password.length < 8) {
            setError('Passwort muss mindestens 8 Zeichen lang sein.');
            return;
          }
          if (!firstName.trim()) {
            setError('Bitte Vorname angeben.');
            return;
          }
          accept.mutate();
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="first-name">Vorname</Label>
            <Input
              id="first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="last-name">Nachname</Label>
            <Input id="last-name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Passwort</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="pl-9 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Passwort verbergen' : 'Passwort anzeigen'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">Mindestens 8 Zeichen.</p>
        </div>

        {error ? (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        <Button type="submit" disabled={accept.isPending} className="w-full">
          {accept.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Konto wird erstellt …
            </>
          ) : (
            'Einladung annehmen'
          )}
        </Button>
      </form>
    </CenteredFrame>
  );
}

function CenteredFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex justify-center">
          <BrandBlock />
        </div>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
