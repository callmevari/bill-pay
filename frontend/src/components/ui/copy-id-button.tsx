'use client';

import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface CopyIdButtonProps {
  value: string;
  label?: string;
  className?: string;
}

// Small "copy" affordance for cuids and other opaque identifiers that
// the UI hides behind a human-readable label (e.g. the approver name).
// Surfaces the id on demand without polluting the table cell.
export function CopyIdButton({ value, label, className }: CopyIdButtonProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(label ? `Copied ${label}` : 'Copied to clipboard');
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Copy failed. Your browser blocked clipboard access.');
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label ? `Copy ${label}` : 'Copy id'}
          onClick={() => void handleCopy()}
          className={cn(
            'inline-flex size-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <span className="font-mono text-[10px]">{value}</span>
      </TooltipContent>
    </Tooltip>
  );
}
