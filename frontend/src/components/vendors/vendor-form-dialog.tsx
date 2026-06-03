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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateVendorMutation, useUpdateVendorMutation } from '@/hooks/use-vendor-mutations';
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
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<ApiError | null>(null);

  // Reset form whenever the dialog opens or switches between create/edit.
  useEffect(() => {
    if (open) {
      setName(vendor?.name ?? '');
      setDefaultPaymentMethod(vendor?.defaultPaymentMethod ?? '');
      setSubmitted(false);
      setServerError(null);
    }
  }, [open, vendor]);

  const trimmedName = name.trim();
  const nameError = submitted && trimmedName.length === 0 ? 'Name is required.' : undefined;
  const methodError =
    submitted && defaultPaymentMethod === ''
      ? 'Select a default payment method.'
      : undefined;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const submit = async (): Promise<void> => {
    setSubmitted(true);
    setServerError(null);
    if (trimmedName.length === 0 || defaultPaymentMethod === '') return;

    const method = defaultPaymentMethod;

    try {
      if (isEdit && vendor) {
        await updateMutation.mutateAsync({
          vendorId: vendor.id,
          input: { name: trimmedName, defaultPaymentMethod: method },
        });
      } else {
        await createMutation.mutateAsync({
          name: trimmedName,
          defaultPaymentMethod: method,
        });
      }
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError) setServerError(error);
    }
  };

  const validationMessages = serverError ? extractValidationMessages(serverError) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit vendor' : 'New vendor'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the vendor name and default payment method.'
              : 'Add a vendor so bills can reference it.'}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
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
