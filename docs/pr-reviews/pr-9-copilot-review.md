Re: [callmevari/bill-pay] feat(frontend): bootstrap next app shell, api client, and role context (PR #9)

@Copilot commented on this pull request.

Pull request overview
This PR scaffolds the new frontend/ Next.js App Router workspace and wires foundational client infrastructure (typed API client, role switching context, and shared UI primitives) so subsequent phases can build Bills/Vendors surfaces against a real app shell.

Changes:

Adds a Next.js 15 + React 19 + TS strict frontend workspace with Tailwind v4 + shadcn/ui primitives and global providers (theme, query, tooltips, toaster).
Introduces a typed apiFetch wrapper with an ApiError envelope and a module-level active-user header getter, plus a seeded-user role store persisted to localStorage.
Implements the initial shell (Sidebar/Topbar, role switcher, theme toggle, backend connection dot) and state primitives (Loading/Empty/ErrorState/Forbidden), with a home page proving /health and /vendors wiring.
Reviewed changes
Copilot reviewed 53 out of 55 changed files in this pull request and generated 4 comments.

Show a summary per file
File	Description
README.md	Adds backend/frontend quickstart and frontend runtime notes.
pnpm-workspace.yaml	Allows sharp builds for Next.js image/tooling needs.
frontend/tsconfig.json	Strict TS config for the frontend workspace.
frontend/src/stores/role-store.ts	Zustand store for active seeded user + persistence/hydration flag.
frontend/src/lib/utils.ts	Adds cn() helper (clsx + tailwind-merge).
frontend/src/lib/seed-users.ts	Defines deterministic seeded users that mirror backend seed IDs.
frontend/src/lib/roles.ts	Defines role/action vocabulary + permission matrix and canRolePerform.
frontend/src/lib/api.ts	Adds typed apiFetch + ApiError + exported error codes.
frontend/src/hooks/use-can.ts	Adds useCan(action) hook based on active role.
frontend/src/components/ui/tooltip.tsx	shadcn/Radix tooltip primitive.
frontend/src/components/ui/tabs.tsx	shadcn/Radix tabs primitive.
frontend/src/components/ui/table.tsx	Table primitives for future data grids.
frontend/src/components/ui/sonner.tsx	Theme-aware toaster wrapper.
frontend/src/components/ui/skeleton.tsx	Skeleton primitive used by loading states.
frontend/src/components/ui/sheet.tsx	shadcn/Radix sheet primitive.
frontend/src/components/ui/separator.tsx	Separator primitive.
frontend/src/components/ui/select.tsx	shadcn/Radix select primitive.
frontend/src/components/ui/label.tsx	Label primitive.
frontend/src/components/ui/input.tsx	Input primitive.
frontend/src/components/ui/dropdown-menu.tsx	shadcn/Radix dropdown menu primitive.
frontend/src/components/ui/dialog.tsx	shadcn/Radix dialog primitive.
frontend/src/components/ui/command.tsx	cmdk-based command palette primitive.
frontend/src/components/ui/button.tsx	Button primitive (variants/sizes).
frontend/src/components/ui/badge.tsx	Badge primitive (+ success/warning variants).
frontend/src/components/states/loading.tsx	Loading skeleton state component.
frontend/src/components/states/index.ts	Barrel export for state primitives.
frontend/src/components/states/forbidden.tsx	403 Forbidden state with fixed copy.
frontend/src/components/states/error-state.tsx	Error state that formats ApiError and supports retry.
frontend/src/components/states/empty.tsx	Empty state card with optional icon/action.
frontend/src/components/providers/theme-provider.tsx	next-themes provider wrapper.
frontend/src/components/providers/role-provider.tsx	Installs active-user-id getter for the API client on the client.
frontend/src/components/providers/query-provider.tsx	TanStack Query client + retry policy + devtools.
frontend/src/components/providers/app-providers.tsx	Provider composition (theme/query/role/tooltip/toaster).
frontend/src/components/layout/topbar.tsx	Topbar with connection dot, role switcher, theme toggle.
frontend/src/components/layout/theme-toggle.tsx	Light/dark toggle with hydration guard.
frontend/src/components/layout/sidebar.tsx	Sidebar nav shell with disabled “coming soon” items.
frontend/src/components/layout/role-switcher.tsx	Dropdown role/user switcher driven by the role store.
frontend/src/components/layout/connection-dot.tsx	Polling health indicator with tooltip and last-checked time.
frontend/src/components/layout/app-shell.tsx	AppShell layout (sidebar + topbar + main).
frontend/src/app/page.tsx	Home page rendering the bootstrap “Bills” header + health card.
frontend/src/app/layout.tsx	Root layout wiring providers and global styles/fonts.
frontend/src/app/health-card.tsx	Wiring proof card: /health (no auth) + /vendors (auth).
frontend/src/app/globals.css	Tailwind v4 setup + theme tokens for light/dark.
frontend/README.md	Frontend setup/config/scripts documentation.
frontend/postcss.config.mjs	Tailwind v4 PostCSS plugin config.
frontend/package.json	Frontend dependencies and scripts (dev/build/lint/typecheck).
frontend/next.config.ts	Next config enabling standalone output.
frontend/next-env.d.ts	Next TypeScript references.
frontend/eslint.config.mjs	Flat ESLint config extending Next presets + stricter TS rules.
frontend/Dockerfile	Multi-stage build producing a standalone Next runtime image.
frontend/.gitignore	Frontend-specific ignores (Next outputs, env locals, etc.).
frontend/.env.example	Documents NEXT_PUBLIC_API_BASE_URL.
frontend/.dockerignore	Keeps Docker context small for the frontend build.
.claude/agents/frontend-engineer.md	Adds a frontend-engineer playbook for future work.
💡 Add Copilot custom instructions for smarter, more guided reviews. Learn how to get started.

In frontend/src/stores/role-store.ts:

> +interface RoleStoreState {
+  activeUser: SeedUser;
+  hydrated: boolean;
+  setActiveUserId: (id: string) => void;
+}
+
+export const useRoleStore = create<RoleStoreState>()(
+  persist(
+    (set) => ({
+      activeUser: DEFAULT_SEED_USER,
+      hydrated: false,
+      setActiveUserId: (id: string): void => {
+        const next = findSeedUserById(id) ?? DEFAULT_SEED_USER;
+        set({ activeUser: next });
+      },
+    }),
+    {
+      name: STORAGE_KEY,
+      storage: createJSONStorage(() => localStorage),
+      partialize: (state) => ({ activeUser: state.activeUser }),
+      onRehydrateStorage: () => (state) => {
+        if (state) {
+          state.hydrated = true;
+        }
+      },
hydrated is set by mutating the rehydrated state object directly (state.hydrated = true). This won’t reliably notify Zustand subscribers, so useRoleStore((s) => s.hydrated) may stay false and gate all queries indefinitely.

In frontend/src/stores/role-store.ts:

> +// Active user selection store, persisted to localStorage so the "Acting as"
+// pick survives reloads. Initial value is the Admin seed user; the
+// `<RoleStoreProvider>` hydrates from storage on mount to avoid an SSR /
+// client mismatch.
The header comment refers to a <RoleStoreProvider>, but there is no such provider in the frontend code. This makes the hydration model harder to understand/maintain.

In frontend/src/components/layout/sidebar.tsx:

> +        <TooltipTrigger asChild>
+          <span className={disabled} aria-disabled="true">
+            <Icon className="size-4" />
+            <span>{item.label}</span>
+          </span>
+        </TooltipTrigger>
Disabled nav items are rendered as a non-focusable <span>, so keyboard users can’t focus the item to trigger the tooltip (Radix tooltips open on hover/focus). Make the trigger element focusable.

In frontend/src/components/layout/connection-dot.tsx:

> +        <span
+          aria-label={label}
+          className="flex h-7 items-center justify-center px-1"
+        >
The connection status dot trigger is a non-focusable <span>, so keyboard users can’t reach the tooltip content. Consider making the trigger focusable.

After Copilot's Review:

In frontend/tsconfig.json

tsconfig.json includes .next/types/**/*.ts but also excludes the entire .next directory. Because exclude is applied after include, this can prevent Next’s generated type files from being type-checked (and can make typed routes/components fail to compile on a clean checkout). Remove .next from exclude (the include patterns are already narrow).

In frontend/src/lib/api.ts:

apiFetch spreads options.headers by casting to Record<string,string>. If a caller passes a Headers instance or string[][] (both valid HeadersInit), the spread won’t behave correctly and headers can be dropped. Normalize with the Headers constructor and then set() your defaults.

In frontend/src/components/providers/query-provider.tsx:

ReactQueryDevtools is rendered unconditionally. This adds extra client JS in production builds (and can expose internal query state to end users). Gate it behind process.env.NODE_ENV === 'development'.

In frontend/Dockerfile:

Top-of-file comment claims a deps → build → prod-deps → runner shape, but this Dockerfile only has deps → build → runner. This is misleading for maintainers/debugging; update the comment to match the actual stages.