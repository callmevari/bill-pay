'use client';

import { ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SELECTABLE_USERS, useRoleStore } from '@/stores/role-store';
import type { Role } from '@/lib/roles';

const ROLE_BADGE: Record<Role, { label: string; className: string }> = {
  ADMIN: { label: 'Admin', className: 'bg-foreground text-background' },
  APPROVER: { label: 'Approver', className: 'bg-warning/30 text-foreground' },
  VIEWER: { label: 'Viewer', className: 'bg-muted text-foreground' },
};

export function RoleSwitcher(): React.JSX.Element {
  const activeUser = useRoleStore((state) => state.activeUser);
  const setActiveUserId = useRoleStore((state) => state.setActiveUserId);
  const badge = ROLE_BADGE[activeUser.role];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="text-xs text-muted-foreground">Acting as</span>
          <span className="text-sm font-medium">{activeUser.name}</span>
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Switch user</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SELECTABLE_USERS.map((user) => (
          <DropdownMenuItem
            key={user.id}
            onSelect={() => setActiveUserId(user.id)}
            className="flex items-center justify-between gap-3"
          >
            <span>{user.name}</span>
            <Badge variant="outline" className={ROLE_BADGE[user.role].className}>
              {ROLE_BADGE[user.role].label}
            </Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
