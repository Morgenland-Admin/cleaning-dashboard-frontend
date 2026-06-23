import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { RouterProvider } from 'react-router-dom';

import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ProjectProvider } from '@/contexts/project-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { LocaleProvider } from '@/i18n';
import { ApiError } from '@/lib/api';
import { router } from '@/router';

function isOnLoginRoute() {
  return typeof window !== 'undefined' && window.location.pathname.startsWith('/login');
}

function handleAuthError(err: unknown) {
  if (err instanceof ApiError && err.status === 401 && !isOnLoginRoute()) {
    window.location.replace('/login');
  }
}

export function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: handleAuthError }),
        mutationCache: new MutationCache({ onError: handleAuthError }),
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              if (error instanceof ApiError) {
                if (error.status === 401 || error.status === 403) return false;
              }
              return failureCount < 1;
            },
          },
        },
      }),
  );

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <LocaleProvider>
          <QueryClientProvider client={queryClient}>
            <ProjectProvider>
              <TooltipProvider delayDuration={150}>
                <RouterProvider router={router} />
                <Toaster />
              </TooltipProvider>
            </ProjectProvider>
          </QueryClientProvider>
        </LocaleProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
