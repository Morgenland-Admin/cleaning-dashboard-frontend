import { Loader2 } from 'lucide-react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useSession } from '@/lib/auth-client';

export function RequireAuth() {
  const location = useLocation();
  const { data, isPending } = useSession();

  if (isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-muted/30">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data?.user) {
    return <Navigate to="/login" replace state={{ from: { pathname: location.pathname } }} />;
  }

  return <Outlet />;
}
