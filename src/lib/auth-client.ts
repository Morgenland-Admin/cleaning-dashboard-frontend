import { createAuthClient } from 'better-auth/react';

const RAW_AUTH_URL = import.meta.env.VITE_AUTH_URL;
if (import.meta.env.PROD && !RAW_AUTH_URL) {
  throw new Error(
    'VITE_AUTH_URL is required in production builds. Pass it as a Docker --build-arg.',
  );
}

export const authClient = createAuthClient({
  baseURL: RAW_AUTH_URL ?? 'http://localhost:8000',
  // Backend mounts Better Auth at /auth (not the library default /api/auth)
  // to avoid the api.reinigungs-portal.com/api/auth double-prefix.
  basePath: '/auth',
});

export const {
  useSession,
  signIn,
  signOut,
  signUp,
  requestPasswordReset,
  resetPassword,
  changePassword,
} = authClient;
