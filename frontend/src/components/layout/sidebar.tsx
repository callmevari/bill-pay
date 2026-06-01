'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  CreditCard,
  FileText,
  Receipt,
  Settings,
  Store,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  // Phase 8 ships Bills + Vendors. Other items live as disabled signposts so
  // the shell mirrors the assignment screenshot without pretending features
  // that aren't built yet.
  disabled?: boolean;
}

const PRIMARY_NAV: NavItem[] = [
  { label: 'Bills', href: '/', icon: Receipt },
  { label: 'Vendors', href: '/vendors', icon: Store },
];

const SECONDARY_NAV: NavItem[] = [
  { label: 'Insights', href: '/insights', icon: BarChart3, disabled: true },
  { label: 'Payments', href: '/payments', icon: CreditCard, disabled: true },
  { label: 'Activity', href: '/activity', icon: FileText, disabled: true },
  { label: 'Settings', href: '/settings', icon: Settings, disabled: true },
];

export function Sidebar(): React.JSX.Element {
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#00a6d5] text-white">
          <Wallet className="size-4" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold">Bill Pay</span>
          <span className="text-xs text-muted-foreground">Workspace</span>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-6 px-2 py-4">
        <NavGroup label="Workspace" items={PRIMARY_NAV} />
        <NavGroup label="Coming soon" items={SECONDARY_NAV} />
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
  const isActive = !item.disabled && (item.href === '/' ? pathname === '/' : pathname.startsWith(item.href));
  const Icon = item.icon;

  const base =
    'flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors';
  const enabled = cn(base, isActive ? 'bg-sidebar-accent font-medium' : 'hover:bg-sidebar-accent/60');
  const disabled = cn(base, 'cursor-not-allowed text-muted-foreground opacity-60');

  if (item.disabled) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-disabled="true"
            onClick={(e) => e.preventDefault()}
            className={disabled}
          >
            <Icon className="size-4" />
            <span>{item.label}</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>Coming in a later phase</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Link href={item.href} className={enabled}>
      <Icon className="size-4" />
      <span>{item.label}</span>
    </Link>
  );
}
