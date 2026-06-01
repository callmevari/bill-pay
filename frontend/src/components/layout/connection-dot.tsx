'use client';

import { useQuery } from '@tanstack/react-query';
import { ApiError, apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface HealthResponse {
  ok: boolean;
  uptimeMs?: number;
}

// Small status dot in the topbar. Polls `GET /health` every 15s so a
// backend that goes down between requests surfaces visually instead of
// only showing up the next time the user navigates.
export function ConnectionDot(): React.JSX.Element {
  const { data, error, isPending, dataUpdatedAt } = useQuery<HealthResponse, ApiError>({
    queryKey: ['health-dot'],
    queryFn: () => apiFetch<HealthResponse>('/health', { skipAuth: true }),
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const status: 'loading' | 'ok' | 'down' = isPending
    ? 'loading'
    : error || !data?.ok
      ? 'down'
      : 'ok';

  const label =
    status === 'ok'
      ? 'Backend healthy'
      : status === 'down'
        ? error?.message ?? 'Backend unreachable'
        : 'Checking…';

  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="flex h-7 items-center justify-center rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            className={cn(
              'relative inline-flex size-2 rounded-full',
              status === 'ok' && 'bg-success',
              status === 'down' && 'bg-destructive',
              status === 'loading' && 'bg-muted-foreground/60',
            )}
          >
            {status === 'ok' ? (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
            ) : null}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-0.5">
          <span>{label}</span>
          {lastChecked ? (
            <span className="text-[10px] text-muted-foreground">
              checked {lastChecked}
            </span>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
