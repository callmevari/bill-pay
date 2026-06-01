'use client';

// Active user selection store, persisted to localStorage so the "Acting as"
// pick survives reloads. Initial value is the Admin seed user; the
// `<RoleStoreProvider>` hydrates from storage on mount to avoid an SSR /
// client mismatch.

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_SEED_USER, SEED_USERS, type SeedUser, findSeedUserById } from '@/lib/seed-users';

const STORAGE_KEY = 'bill-pay.active-user';

interface RoleStoreState {
  activeUser: SeedUser;
  hydrated: boolean;
  setActiveUserId: (id: string) => void;
}

export const useRoleStore = create<RoleStoreState>()(
  persist(
    (set) => ({
      activeUser: DEFAULT_SEED_USER,
      hydrated: false,
      setActiveUserId: (id: string): void => {
        const next = findSeedUserById(id) ?? DEFAULT_SEED_USER;
        set({ activeUser: next });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeUser: state.activeUser }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.hydrated = true;
        }
      },
    },
  ),
);

export const SELECTABLE_USERS = SEED_USERS;
