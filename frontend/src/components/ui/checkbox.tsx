'use client';

import { forwardRef, useEffect, useRef, type InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange' | 'checked'> {
  // Boolean | 'indeterminate' so the bills table can render the "select all
  // on this page" header state when some-but-not-all rows are selected. The
  // indeterminate flag is a runtime-only DOM property, not an HTML
  // attribute, so it is applied via the ref on every render.
  checked?: boolean | 'indeterminate';
  onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, disabled, ...props }, forwardedRef) => {
    const localRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (!localRef.current) return;
      localRef.current.indeterminate = checked === 'indeterminate';
    }, [checked]);

    const isChecked = checked === true;

    return (
      <input
        type="checkbox"
        ref={(node) => {
          localRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        checked={isChecked}
        disabled={disabled}
        onChange={(event) => onCheckedChange?.(event.target.checked)}
        className={cn(
          'size-4 cursor-pointer rounded-sm border border-input bg-background text-primary accent-primary transition-colors disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
          className,
        )}
        {...props}
      />
    );
  },
);
Checkbox.displayName = 'Checkbox';
