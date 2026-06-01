'use client';

import { ChevronDown } from 'lucide-react';
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

export function RoleSwitcher(): React.JSX.Element {
  const activeUser = useRoleStore((state) => state.activeUser);
  const setActiveUserId = useRoleStore((state) => state.setActiveUserId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="text-xs text-muted-foreground">Acting as</span>
          <span className="text-sm font-medium">{activeUser.name}</span>
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Switch user</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SELECTABLE_USERS.map((user) => (
          <DropdownMenuItem
            key={user.id}
            onSelect={() => setActiveUserId(user.id)}
          >
            <span>{user.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
