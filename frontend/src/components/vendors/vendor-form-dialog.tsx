'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateVendorMutation,
  useUpdateVendorMutation,
  type VendorMutationInput,
} from '@/hooks/use-vendor-mutations';
import { ApiError } from '@/lib/api';
import { extractValidationMessages } from '@/lib/wire';
import type { PaymentMethod, Vendor } from '@/lib/api-types';

interface VendorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // `undefined` mode means "create new"; passing a vendor switches to edit.
  vendor?: Vendor;
}

const PAYMENT_METHODS: PaymentMethod[] = ['ACH', 'WIRE', 'CHECK', 'CARD', 'OFF_PLATFORM'];

// Permissive email shape check that mirrors the browser's `<input
// type="email">` rule. The backend re-validates with class-validator's
// `@IsEmail`, so the FE just needs to catch obvious typos before submit.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function VendorFormDialog({
  open,
  onOpenChange,
  vendor,
}: VendorFormDialogProps): React.JSX.Element {
  const isEdit = Boolean(vendor);
  const createMutation = useCreateVendorMutation();
  const updateMutation = useUpdateVendorMutation();

  const [name, setName] = useState(vendor?.name ?? '');
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState<PaymentMethod | ''>(
    vendor?.defaultPaymentMethod ?? '',
  );
  const [email, setEmail] = useState(vendor?.email ?? '');
  const [streetAddress, setStreetAddress] = useState(vendor?.streetAddress ?? '');
  const [city, setCity] = useState(vendor?.city ?? '');
  const [state, setState] = useState(vendor?.state ?? '');
  const [postalCode, setPostalCode] = useState(vendor?.postalCode ?? '');
  const [country, setCountry] = useState(vendor?.country ?? '');
  const [notes, setNotes] = useState(vendor?.notes ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<ApiError | null>(null);

  // Reset form whenever the dialog opens or switches between create/edit.
  useEffect(() => {
    if (open) {
      setName(vendor?.name ?? '');
      setDefaultPaymentMethod(vendor?.defaultPaymentMethod ?? '');
      setEmail(vendor?.email ?? '');
      setStreetAddress(vendor?.streetAddress ?? '');
      setCity(vendor?.city ?? '');
      setState(vendor?.state ?? '');
      setPostalCode(vendor?.postalCode ?? '');
      setCountry(vendor?.country ?? '');
      setNotes(vendor?.notes ?? '');
      setSubmitted(false);
      setServerError(null);
    }
  }, [open, vendor]);

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const nameError = submitted && trimmedName.length === 0 ? 'Name is required.' : undefined;
  const methodError =
    submitted && defaultPaymentMethod === ''
      ? 'Select a default payment method.'
      : undefined;
  const emailError =
    submitted && trimmedEmail.length > 0 && !EMAIL_PATTERN.test(trimmedEmail)
      ? 'Enter a valid email address.'
      : undefined;
  const isPending = createMutation.isPending || updateMutation.isPending;

  // Normalise optional text inputs: empty string → null so the backend
  // clears the column (on edit) or omits the value (on create). Single
  // code path for both modes — the backend's PATCH semantics handle
  // `null` as "clear" and missing keys as "leave alone"; on create the
  // service treats both the same way.
  const orNull = (value: string): string | null => {
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const submit = async (): Promise<void> => {
    setSubmitted(true);
    setServerError(null);
    if (trimmedName.length === 0 || defaultPaymentMethod === '') return;
    if (trimmedEmail.length > 0 && !EMAIL_PATTERN.test(trimmedEmail)) return;

    const input: VendorMutationInput = {
      name: trimmedName,
      defaultPaymentMethod,
      email: orNull(email),
      streetAddress: orNull(streetAddress),
      city: orNull(city),
      state: orNull(state),
      postalCode: orNull(postalCode),
      country: orNull(country),
      notes: orNull(notes),
    };

    try {
      if (isEdit && vendor) {
        await updateMutation.mutateAsync({ vendorId: vendor.id, input });
      } else {
        await createMutation.mutateAsync(input);
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) setServerError(error);
    }
  };

  const validationMessages = serverError ? extractValidationMessages(serverError) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit vendor' : 'New vendor'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the vendor record. Only the name and default payment method are required.'
              : 'Add a vendor so bills can reference it. Only the name and default payment method are required.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          noValidate
        >
          {serverError ? (
            <div
              role="alert"
              className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground"
            >
              <p className="font-medium text-destructive">{serverError.message}</p>
              {validationMessages.length > 0 ? (
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {validationMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-name">
              Name
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              id="vendor-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              autoComplete="off"
            />
            {nameError ? (
              <p className="text-xs text-destructive" role="alert">
                {nameError}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-method">
              Default payment method
              <span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Select
              value={defaultPaymentMethod}
              onValueChange={(next) => setDefaultPaymentMethod(next as PaymentMethod)}
            >
              <SelectTrigger id="vendor-method">
                <SelectValue placeholder="Pick a method" />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {methodError ? (
              <p className="text-xs text-destructive" role="alert">
                {methodError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Used when auto-creating a payment on bill approval.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-email">Billing email</Label>
            <Input
              id="vendor-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="off"
              placeholder="billing@vendor.com"
            />
            {emailError ? (
              <p className="text-xs text-destructive" role="alert">
                {emailError}
              </p>
            ) : null}
          </div>

          <fieldset className="flex flex-col gap-3 rounded-md border border-border/60 p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Address
            </legend>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-street">Street</Label>
              <Input
                id="vendor-street"
                value={streetAddress}
                onChange={(event) => setStreetAddress(event.target.value)}
                autoComplete="off"
                placeholder="510 Townsend Street"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vendor-city">City</Label>
                <Input
                  id="vendor-city"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                  autoComplete="off"
                  placeholder="San Francisco"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vendor-state">State / region</Label>
                <Input
                  id="vendor-state"
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                  autoComplete="off"
                  placeholder="CA"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vendor-postal">Postal code</Label>
                <Input
                  id="vendor-postal"
                  value={postalCode}
                  onChange={(event) => setPostalCode(event.target.value)}
                  autoComplete="off"
                  placeholder="94103"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vendor-country">Country</Label>
                <Input
                  id="vendor-country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  autoComplete="off"
                  placeholder="US"
                />
              </div>
            </div>
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="vendor-notes">Notes</Label>
            <Textarea
              id="vendor-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Internal notes for AP — net terms, preferred contact, etc."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isPending}>
              {isEdit ? 'Save changes' : 'Create vendor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
