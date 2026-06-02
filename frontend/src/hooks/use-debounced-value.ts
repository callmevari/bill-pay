'use client';

import { useEffect, useState } from 'react';

// Re-emits the input value after `delayMs` of inactivity. Used to keep
// the URL query string and the network refetch decoupled from per-
// keystroke renders without a full debounce library.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);

  return debounced;
}
