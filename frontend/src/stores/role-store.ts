'use client';

// Active user selection store, persisted to localStorage so the "Acting as"
// pick survives reloads. Initial value is the Admin seed user. Components
// that need to wait for rehydration before firing user-id-bearing requests
// read `useRoleHydrated()` — backed by Zustand's reactive
// `persist.onFinishHydration` API so subscribers are properly notified.

import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { DEFAULT_SEED_USER, SEED_USERS, type SeedUser, findSeedUserById } from '@/lib/seed-users';

const STORAGE_KEY = 'bill-pay.active-user';

interface RoleStoreState {
  activeUser: SeedUser;
  setActiveUserId: (id: string) => void;
}

export const useRoleStore = create<RoleStoreState>()(
  persist(
    (set) => ({
      activeUser: DEFAULT_SEED_USER,
      setActiveUserId: (id: string): void => {
        const next = findSeedUserById(id) ?? DEFAULT_SEED_USER;
        set({ activeUser: next });
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ activeUser: state.activeUser }),
    },
  ),
);

export const SELECTABLE_USERS = SEED_USERS;

// Subscribes to the persist middleware's hydration lifecycle so consumers
// re-render once storage has been read. `hasHydrated()` is true immediately
// when persist is disabled or storage is empty, and switches to true on the
// next tick once rehydration finishes.
export function useRoleHydrated(): boolean {
  // SSR-safe: starts false on the server (no localStorage) and flips true
  // once the persist middleware finishes reading storage on the client.
  const [hydrated, setHydrated] = useState<boolean>(false);

  useEffect(() => {
    const unsubHydrate = useRoleStore.persist.onHydrate(() => setHydrated(false));
    const unsubFinish = useRoleStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useRoleStore.persist.hasHydrated());
    return () => {
      unsubHydrate();
      unsubFinish();
    };
  }, []);

  return hydrated;
}
