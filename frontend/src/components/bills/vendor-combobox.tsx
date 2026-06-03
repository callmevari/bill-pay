'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { Vendor } from '@/lib/api-types';

interface VendorComboboxProps {
  value: string;
  onChange: (vendorId: string) => void;
  vendors: Vendor[];
  disabled?: boolean;
}

// Lightweight combobox: a button that opens a Command palette in a dialog.
// We piggy-back on `Dialog` for the floating layer because that's the
// vendored shadcn primitive already in the tree — keeps the patch surface
// small and the focus management correct.
export function VendorCombobox({
  value,
  onChange,
  vendors,
  disabled,
}: VendorComboboxProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const selected = vendors.find((vendor) => vendor.id === value);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        role="combobox"
        aria-expanded={open}
        className="w-full justify-between"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        <span className={cn(!selected && 'text-muted-foreground')}>
          {selected ? selected.name : 'Select a vendor'}
        </span>
        <ChevronsUpDown className="size-4 opacity-50" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="overflow-hidden p-0">
          <DialogTitle className="sr-only">Select a vendor</DialogTitle>
          <DialogDescription className="sr-only">
            Search and pick a vendor for this bill.
          </DialogDescription>
          <Command>
            <CommandInput placeholder="Search vendors..." />
            <CommandList>
              <CommandEmpty>No vendor matches that search.</CommandEmpty>
              <CommandGroup>
                {vendors.map((vendor) => (
                  <CommandItem
                    key={vendor.id}
                    value={vendor.name}
                    onSelect={() => {
                      onChange(vendor.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'size-4',
                        vendor.id === value ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <span>{vendor.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {vendor.defaultPaymentMethod}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}
