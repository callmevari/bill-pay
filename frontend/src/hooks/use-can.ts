'use client';

import { useRoleStore } from '@/stores/role-store';
import { canRolePerform, type PermissionAction } from '@/lib/roles';

// `useCan(action)` returns whether the active role is allowed to perform
// `action`. The UI uses it to hide or disable affordances the active role
// cannot trigger. The backend remains authoritative — never assume the
// call will succeed; always handle the 403 envelope.
export function useCan(action: PermissionAction): boolean {
  const role = useRoleStore((state) => state.activeUser.role);
  return canRolePerform(role, action);
}
