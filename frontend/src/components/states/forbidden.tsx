import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';

// Copy is fixed by `CLAUDE.md → Frontend rules`. Do not edit without
// updating that section.
const FORBIDDEN_COPY = 'Your role cannot perform this action.';

export function Forbidden({ className }: { className?: string }): React.JSX.Element {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-4 text-sm text-foreground',
        className,
      )}
    >
      <Lock className="size-4 shrink-0 text-muted-foreground" />
      <span>{FORBIDDEN_COPY}</span>
    </div>
  );
}

export { FORBIDDEN_COPY };
