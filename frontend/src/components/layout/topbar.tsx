'use client';

import { ConnectionDot } from './connection-dot';
import { RoleSwitcher } from './role-switcher';
import { ThemeToggle } from './theme-toggle';

export function Topbar(): React.JSX.Element {
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 md:px-6">
      <div className="flex items-center gap-3" />
      <div className="flex items-center gap-2">
        <ConnectionDot />
        <RoleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
