// Hardcoded seed user identifiers. The same cuids live in
// `backend/prisma/seed-ids.ts` — they are deterministic across machines so
// the role switcher can drive any backend that ran the canonical seed
// without needing a `/users` endpoint.
import type { Role } from './roles';

export interface SeedUser {
  id: string;
  name: string;
  role: Role;
}

export const SEED_USERS: readonly SeedUser[] = [
  { id: 'qn4ajdh15g2nvdgrv2srksqe', name: 'Admin', role: 'ADMIN' },
  { id: 'xd9w66ont1pi540oyf7jjf3l', name: 'Approver', role: 'APPROVER' },
  { id: 'j9paxpeas5j6xfgt384ouuf8', name: 'Viewer', role: 'VIEWER' },
] as const;

export const DEFAULT_SEED_USER: SeedUser = SEED_USERS[0]!;

export function findSeedUserById(id: string): SeedUser | undefined {
  return SEED_USERS.find((u) => u.id === id);
}
