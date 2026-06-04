'use client';

import { useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ApiError, ErrorCode } from '@/lib/api';

export function QueryProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Never retry on auth / permission / validation / not-found.
              if (error instanceof ApiError) {
                const noRetry: string[] = [
                  ErrorCode.UNAUTHENTICATED,
                  ErrorCode.INSUFFICIENT_PERMISSIONS,
                  ErrorCode.VALIDATION_ERROR,
                  ErrorCode.NOT_FOUND,
                ];
                if (noRetry.includes(error.code)) return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === 'development' ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      ) : null}
    </QueryClientProvider>
  );
}
