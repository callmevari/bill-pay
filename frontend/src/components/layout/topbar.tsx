'use client';

import { RoleSwitcher } from './role-switcher';
import { ThemeToggle } from './theme-toggle';

export function Topbar(): React.JSX.Element {
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-background px-4 md:px-6">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Bill Pay</span>
      </div>
      <div className="flex items-center gap-2">
        <RoleSwitcher />
        <ThemeToggle />
      </div>
    </header>
  );
}
