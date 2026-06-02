'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { humanizeEnum } from '@/lib/format';
import type { PaymentMethod, Vendor } from '@/lib/api-types';

export interface BillFiltersValue {
  q: string;
  vendorId: string;
  minAmount: string;
  maxAmount: string;
  dueDateFrom: string;
  dueDateTo: string;
  paymentMethod: string;
}

export const EMPTY_FILTERS: BillFiltersValue = {
  q: '',
  vendorId: '',
  minAmount: '',
  maxAmount: '',
  dueDateFrom: '',
  dueDateTo: '',
  paymentMethod: '',
};

const PAYMENT_METHODS: PaymentMethod[] = ['ACH', 'WIRE', 'CHECK', 'CARD', 'OFF_PLATFORM'];
const ANY_VALUE = '__any__';

interface FilterBarProps {
  value: BillFiltersValue;
  onChange: (next: BillFiltersValue) => void;
  vendors: Vendor[];
  vendorsLoading: boolean;
}

export function FilterBar({
  value,
  onChange,
  vendors,
  vendorsLoading,
}: FilterBarProps): React.JSX.Element {
  // Free-text + numeric inputs debounce locally so each keystroke doesn't
  // push the URL — the parent only sees the settled value 300ms after
  // typing stops. Selects/date pickers don't need debouncing.
  const [localQ, setLocalQ] = useState(value.q);
  const [localMin, setLocalMin] = useState(value.minAmount);
  const [localMax, setLocalMax] = useState(value.maxAmount);

  // Sync down when the URL changes externally (back/forward, clear-all).
  useEffect(() => setLocalQ(value.q), [value.q]);
  useEffect(() => setLocalMin(value.minAmount), [value.minAmount]);
  useEffect(() => setLocalMax(value.maxAmount), [value.maxAmount]);

  const debouncedQ = useDebouncedValue(localQ, 300);
  const debouncedMin = useDebouncedValue(localMin, 300);
  const debouncedMax = useDebouncedValue(localMax, 300);

  // Stash the latest value + onChange in refs so the debounced effects
  // read the freshest snapshot when they fire. Without this, a user who
  // changes another filter (vendor, due date) within the 300ms debounce
  // window would see that change clobbered by the stale `value` captured
  // when the debounce-only effect was created.
  const latest = useRef({ value, onChange });
  useEffect(() => {
    latest.current = { value, onChange };
  });

  useEffect(() => {
    const { value: snapshot, onChange: notify } = latest.current;
    if (debouncedQ !== snapshot.q) notify({ ...snapshot, q: debouncedQ });
  }, [debouncedQ]);
  useEffect(() => {
    const { value: snapshot, onChange: notify } = latest.current;
    if (debouncedMin !== snapshot.minAmount) notify({ ...snapshot, minAmount: debouncedMin });
  }, [debouncedMin]);
  useEffect(() => {
    const { value: snapshot, onChange: notify } = latest.current;
    if (debouncedMax !== snapshot.maxAmount) notify({ ...snapshot, maxAmount: debouncedMax });
  }, [debouncedMax]);

  const hasAnyFilter =
    Boolean(value.q) ||
    Boolean(value.vendorId) ||
    Boolean(value.minAmount) ||
    Boolean(value.maxAmount) ||
    Boolean(value.dueDateFrom) ||
    Boolean(value.dueDateTo) ||
    Boolean(value.paymentMethod);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[220px] flex-1 flex-col gap-1">
          <label htmlFor="bills-search" className="text-xs font-medium text-muted-foreground">
            Search
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="bills-search"
              placeholder="Invoice number, description, vendor"
              value={localQ}
              onChange={(event) => setLocalQ(event.target.value)}
              className="pl-8"
            />
          </div>
        </div>

        <div className="flex min-w-[180px] flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="bills-vendor">
            Vendor
          </label>
          <Select
            value={value.vendorId === '' ? ANY_VALUE : value.vendorId}
            onValueChange={(next) =>
              onChange({ ...value, vendorId: next === ANY_VALUE ? '' : next })
            }
            disabled={vendorsLoading}
          >
            <SelectTrigger id="bills-vendor" aria-label="Vendor">
              <SelectValue placeholder={vendorsLoading ? 'Loading vendors…' : 'Any vendor'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any vendor</SelectItem>
              {vendors.map((vendor) => (
                <SelectItem key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-[150px] flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="bills-method">
            Payment method
          </label>
          <Select
            value={value.paymentMethod === '' ? ANY_VALUE : value.paymentMethod}
            onValueChange={(next) =>
              onChange({ ...value, paymentMethod: next === ANY_VALUE ? '' : next })
            }
          >
            <SelectTrigger id="bills-method" aria-label="Payment method">
              <SelectValue placeholder="Any method" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any method</SelectItem>
              {PAYMENT_METHODS.map((method) => (
                <SelectItem key={method} value={method}>
                  {humanizeEnum(method)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="bills-min">
            Min amount
          </label>
          <Input
            id="bills-min"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={localMin}
            onChange={(event) => setLocalMin(event.target.value)}
            className="w-28"
            min={0}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="bills-max">
            Max amount
          </label>
          <Input
            id="bills-max"
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={localMax}
            onChange={(event) => setLocalMax(event.target.value)}
            className="w-28"
            min={0}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="bills-from">
            Due from
          </label>
          <Input
            id="bills-from"
            type="date"
            value={value.dueDateFrom}
            onChange={(event) => onChange({ ...value, dueDateFrom: event.target.value })}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor="bills-to">
            Due to
          </label>
          <Input
            id="bills-to"
            type="date"
            value={value.dueDateTo}
            onChange={(event) => onChange({ ...value, dueDateTo: event.target.value })}
            className="w-40"
          />
        </div>

        {hasAnyFilter ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChange(EMPTY_FILTERS)}
            className="self-end"
          >
            <X className="size-4" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}
