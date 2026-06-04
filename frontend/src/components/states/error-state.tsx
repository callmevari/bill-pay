import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  error: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
  children?: ReactNode;
}

export function ErrorState({
  error,
  title = 'Something went wrong',
  onRetry,
  className,
  children,
}: ErrorStateProps): React.JSX.Element {
  const message = formatErrorMessage(error);
  const code = error instanceof ApiError ? error.code : undefined;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4',
        className,
      )}
    >
      <div className="flex items-start gap-2 text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-foreground/80">{message}</p>
          {code ? <p className="mt-1 text-xs text-muted-foreground">Code: {code}</p> : null}
        </div>
      </div>
      {children}
      {onRetry ? (
        <Button size="sm" variant="outline" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unexpected error';
}
