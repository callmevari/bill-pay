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
  useAddLineItemMutation,
  useUpdateLineItemMutation,
} from '@/hooks/use-line-item-mutations';
import { ApiError } from '@/lib/api';
import { extractValidationMessages } from '@/lib/wire';
import { formatMoney } from '@/lib/format';
import type { BillLineItem } from '@/lib/api-types';

interface LineItemFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  billId: string;
  currency: string;
  // Undefined = create new; passing a line item switches the dialog into edit.
  lineItem?: BillLineItem;
}

interface DraftFields {
  description: string;
  quantity: string;
  unitPrice: string;
}

const EMPTY_DRAFT: DraftFields = { description: '', quantity: '1', unitPrice: '' };

function toDraft(lineItem: BillLineItem | undefined): DraftFields {
  if (!lineItem) return EMPTY_DRAFT;
  return {
    description: lineItem.description,
    quantity: lineItem.quantity,
    unitPrice: lineItem.unitPrice,
  };
}

function isPositiveDecimal(value: string): boolean {
  if (value.trim() === '') return false;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0;
}

export function LineItemFormDialog({
  open,
  onOpenChange,
  billId,
  currency,
  lineItem,
}: LineItemFormDialogProps): React.JSX.Element {
  const isEdit = Boolean(lineItem);
  const addMutation = useAddLineItemMutation();
  const updateMutation = useUpdateLineItemMutation();

  const [fields, setFields] = useState<DraftFields>(() => toDraft(lineItem));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<ApiError | null>(null);

  useEffect(() => {
    if (open) {
      setFields(toDraft(lineItem));
      setSubmitted(false);
      setServerError(null);
    }
  }, [open, lineItem]);

  const descriptionError =
    submitted && fields.description.trim().length === 0 ? 'Description is required.' : undefined;
  const quantityError =
    submitted && !isPositiveDecimal(fields.quantity)
      ? 'Quantity must be a non-negative number.'
      : undefined;
  const unitPriceError =
    submitted && !isPositiveDecimal(fields.unitPrice)
      ? 'Unit price must be a non-negative number.'
      : undefined;

  const isPending = addMutation.isPending || updateMutation.isPending;

  const previewTotal =
    isPositiveDecimal(fields.quantity) && isPositiveDecimal(fields.unitPrice)
      ? (Number(fields.quantity) * Number(fields.unitPrice)).toFixed(2)
      : null;

  const submit = async (): Promise<void> => {
    setSubmitted(true);
    setServerError(null);
    if (descriptionError || quantityError || unitPriceError) return;

    const normalized = {
      description: fields.description.trim(),
      quantity: Number(fields.quantity).toFixed(2),
      unitPrice: Number(fields.unitPrice).toFixed(2),
    };

    try {
      if (isEdit && lineItem) {
        await updateMutation.mutateAsync({
          billId,
          lineItemId: lineItem.id,
          input: normalized,
        });
      } else {
        await addMutation.mutateAsync({ billId, input: normalized });
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
          <DialogTitle>{isEdit ? 'Edit line item' : 'New line item'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the description, quantity, or unit price.'
              : 'Add a line to this bill. The total is computed automatically.'}
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
            <Label htmlFor="line-item-description">
              Description<span className="ml-0.5 text-destructive">*</span>
            </Label>
            <Input
              id="line-item-description"
              value={fields.description}
              onChange={(event) =>
                setFields((prev) => ({ ...prev, description: event.target.value }))
              }
              autoFocus
              autoComplete="off"
            />
            {descriptionError ? (
              <p className="text-xs text-destructive" role="alert">
                {descriptionError}
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-item-quantity">
                Quantity<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                id="line-item-quantity"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={fields.quantity}
                onChange={(event) =>
                  setFields((prev) => ({ ...prev, quantity: event.target.value }))
                }
              />
              {quantityError ? (
                <p className="text-xs text-destructive" role="alert">
                  {quantityError}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="line-item-unit-price">
                Unit price<span className="ml-0.5 text-destructive">*</span>
              </Label>
              <Input
                id="line-item-unit-price"
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={fields.unitPrice}
                onChange={(event) =>
                  setFields((prev) => ({ ...prev, unitPrice: event.target.value }))
                }
              />
              {unitPriceError ? (
                <p className="text-xs text-destructive" role="alert">
                  {unitPriceError}
                </p>
              ) : null}
            </div>
          </div>

          {previewTotal !== null ? (
            <p className="text-xs text-muted-foreground">
              Line total: <span className="font-mono">{formatMoney(previewTotal, currency)}</span>
            </p>
          ) : null}

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
              {isEdit ? 'Save changes' : 'Add line item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
