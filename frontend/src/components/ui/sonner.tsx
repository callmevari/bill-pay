'use client';

import { useTheme } from 'next-themes';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

export function Toaster(props: ToasterProps): React.JSX.Element {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={(resolvedTheme as ToasterProps['theme']) ?? 'system'}
      className="toaster group"
      // 420px instead of Sonner's 356px default. The bulk-result summary
      // toast carries a verb + counts + a Details action button; the
      // shorter width pushed the action button off the right edge of
      // the toaster container, which itself sits at `width: var(--width)`
      // and clips its children. Widening the toaster fixes both the
      // bulk toast and gives ordinary toasts a touch more room without
      // looking oversized.
      style={{ ['--width' as string]: '420px' }}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton:
            'group-[.toast]:!bg-transparent group-[.toast]:!text-current group-[.toast]:!border group-[.toast]:!border-current/40 group-[.toast]:!font-medium hover:group-[.toast]:!bg-current/10',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
