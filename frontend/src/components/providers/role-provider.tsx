'use client';

import type { ReactNode } from 'react';
import { setActiveUserIdGetter } from '@/lib/api';
import { useRoleStore } from '@/stores/role-store';

// Install the getter at module-evaluation time on the client. Doing it
// during render (rather than in `useEffect`) guarantees that the first
// query fired by any descendant already sees the right `x-user-id` — the
// effect-based version raced the `enabled: hydrated` gate on the queries
// and could send the first request without the header.
if (typeof window !== 'undefined') {
  setActiveUserIdGetter(() => useRoleStore.getState().activeUser.id);
}

export function RoleProvider({ children }: { children: ReactNode }): React.JSX.Element {
  return <>{children}</>;
}
