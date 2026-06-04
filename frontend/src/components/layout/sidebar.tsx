'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Receipt, Store, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIMARY_NAV: NavItem[] = [
  { label: 'Bills', href: '/', icon: Receipt },
  { label: 'Vendors', href: '/vendors', icon: Store },
];

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <Link
        href="/"
        className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4 transition-colors hover:bg-sidebar-accent/60 focus-visible:bg-sidebar-accent/60 focus-visible:outline-none"
        aria-label="Go to Bills overview"
      >
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#00a6d5] text-white">
          <Wallet className="size-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Bill Pay</span>
          <span className="text-xs text-muted-foreground">Workspace</span>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-6 px-2 py-4">
        <NavGroup label="Workspace" items={PRIMARY_NAV} />
      </nav>
    </aside>
  );
}

function NavGroup({ label, items }: { label: string; items: NavItem[] }): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1">
      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      {items.map((item) => (
        <NavLink key={item.href} item={item} />
      ))}
    </div>
  );
}

function NavLink({ item }: { item: NavItem }): React.JSX.Element {
  const pathname = usePathname();
  const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
  const Icon = item.icon;

  const className = cn(
    'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors',
    isActive ? 'bg-sidebar-accent font-medium' : 'hover:bg-sidebar-accent/60',
  );

  return (
    <Link href={item.href} className={className}>
      <Icon className="size-4" />
      <span>{item.label}</span>
    </Link>
  );
}
