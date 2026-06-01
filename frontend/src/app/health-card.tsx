'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle2 } from 'lucide-react';
import { ApiError, apiFetch } from '@/lib/api';
import { Loading } from '@/components/states/loading';
import { ErrorState } from '@/components/states/error-state';
import { useRoleHydrated, useRoleStore } from '@/stores/role-store';

interface HealthResponse {
  ok: boolean;
  uptimeMs?: number;
  timestamp?: string;
}

interface VendorsListResponse {
  data: unknown[];
  meta: { total: number };
}

export function HealthCard(): React.JSX.Element {
  const activeUser = useRoleStore((state) => state.activeUser);
  const hydrated = useRoleHydrated();

  // Wiring proof: hits `GET /health`, which the backend lets through
  // without an `x-user-id`. Proves the base URL + fetch + JSON envelope.
  const health = useQuery<HealthResponse, ApiError>({
    queryKey: ['health'],
    queryFn: () => apiFetch<HealthResponse>('/health', { skipAuth: true }),
    enabled: hydrated,
  });

  // Auth probe: hits `GET /vendors?pageSize=1`, which requires a valid
  // `x-user-id`. Keyed on the active user so swapping roles forces a
  // refetch — that is what lets us *see* the header change. A known-bad
  // cuid surfaces as a 401 envelope through the same code path.
  const authProbe = useQuery<VendorsListResponse, ApiError>({
    queryKey: ['auth-probe', activeUser.id],
    queryFn: () => apiFetch<VendorsListResponse>('/vendors?pageSize=1'),
    enabled: hydrated,
  });

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5">
      <header className="flex flex-col gap-1">
        <h2 className="text-sm font-semibold text-foreground">Backend connectivity</h2>
        <p className="text-xs text-muted-foreground">
          Two checks: GET /health (no auth) and GET /vendors (requires x-user-id from the active role).
        </p>
      </header>

      {!hydrated ? (
        <Loading rows={2} />
      ) : (
        <div className="flex flex-col gap-3">
          <ProbeRow
            label="GET /health"
            isLoading={health.isPending}
            error={health.error}
            onRetry={() => void health.refetch()}
            success={
              health.data
                ? `ok=${String(health.data.ok)}${
                    typeof health.data.uptimeMs === 'number'
                      ? ` · uptime ${Math.round(health.data.uptimeMs / 1000)}s`
                      : ''
                  }`
                : undefined
            }
          />
          <ProbeRow
            label={`GET /vendors as ${activeUser.name}`}
            isLoading={authProbe.isPending}
            error={authProbe.error}
            onRetry={() => void authProbe.refetch()}
            success={
              authProbe.data ? `meta.total = ${authProbe.data.meta.total} vendor(s)` : undefined
            }
          />
        </div>
      )}
    </section>
  );
}

interface ProbeRowProps {
  label: string;
  isLoading: boolean;
  error: ApiError | null;
  success: string | undefined;
  onRetry: () => void;
}

function ProbeRow({ label, isLoading, error, success, onRetry }: ProbeRowProps): React.JSX.Element {
  if (isLoading) {
    return <Loading rows={1} />;
  }
  if (error) {
    return <ErrorState title={label} error={error} onRetry={onRetry} />;
  }
  return (
    <div className="flex items-center gap-3 rounded-md border border-success/40 bg-success/10 p-3">
      <CheckCircle2 className="size-5 text-foreground" />
      <div className="flex flex-col">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{success}</p>
      </div>
    </div>
  );
}
