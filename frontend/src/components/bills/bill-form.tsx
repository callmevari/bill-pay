'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
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
import { Loading } from '@/components/states/loading';
import { ErrorState } from '@/components/states/error-state';
import { VendorCombobox } from './vendor-combobox';
import { useAllVendorsQuery } from '@/hooks/use-vendors-query';
import { useCreateBillMutation } from '@/hooks/use-create-bill-mutation';
import { useUpdateBillMutation } from '@/hooks/use-update-bill-mutation';
import { ApiError } from '@/lib/api';
import { extractValidationMessages, isoToInputDate, toWireAmount, toWireDate } from '@/lib/wire';
import { formatMoney } from '@/lib/format';
import type { Bill } from '@/lib/api-types';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'ARS'] as const;
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

interface LineItemDraft {
  // `key` is a stable React identifier so adding/removing rows above this
  // one does not reshuffle inputs. `id` is the server identifier — present
  // when editing an existing line item, undefined for newly-added rows.
  key: string;
  id: string | undefined;
  description: string;
  quantity: string;
  unitPrice: string;
}

interface FormState {
  vendorId: string;
  invoiceNumber: string;
  description: string;
  amount: string;
  currency: SupportedCurrency;
  invoiceDate: string;
  dueDate: string;
  lineItems: LineItemDraft[];
}

interface BillFormProps {
  mode: 'create' | 'edit';
  bill?: Bill;
}

function blankLineItem(): LineItemDraft {
  return {
    key: crypto.randomUUID(),
    id: undefined,
    description: '',
    quantity: '1',
    unitPrice: '0.00',
  };
}

function initialState(bill: Bill | undefined): FormState {
  if (!bill) {
    return {
      vendorId: '',
      invoiceNumber: '',
      description: '',
      amount: '',
      currency: 'USD',
      invoiceDate: '',
      dueDate: '',
      lineItems: [],
    };
  }
  return {
    vendorId: bill.vendorId,
    invoiceNumber: bill.invoiceNumber,
    description: bill.description ?? '',
    currency: (SUPPORTED_CURRENCIES.includes(bill.currency as SupportedCurrency)
      ? bill.currency
      : 'USD') as SupportedCurrency,
    amount: bill.amount,
    invoiceDate: isoToInputDate(bill.invoiceDate),
    dueDate: isoToInputDate(bill.dueDate),
    lineItems: bill.lineItems.map((item) => ({
      key: item.id,
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })),
  };
}

function computeLineItemTotal(quantity: string, unitPrice: string): number {
  const q = Number(quantity);
  const p = Number(unitPrice);
  if (!Number.isFinite(q) || !Number.isFinite(p)) return 0;
  return q * p;
}

interface FieldErrors {
  vendorId?: string;
  invoiceNumber?: string;
  amount?: string;
  invoiceDate?: string;
  dueDate?: string;
}

function validate(state: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!state.vendorId) errors.vendorId = 'Select a vendor.';
  if (!state.invoiceNumber.trim()) errors.invoiceNumber = 'Invoice number is required.';
  if (!state.amount.trim()) {
    errors.amount = 'Amount is required.';
  } else {
    const num = Number(state.amount);
    if (!Number.isFinite(num) || num < 0) errors.amount = 'Amount must be a non-negative number.';
  }
  if (!state.invoiceDate) errors.invoiceDate = 'Invoice date is required.';
  if (!state.dueDate) errors.dueDate = 'Due date is required.';
  if (state.invoiceDate && state.dueDate && state.dueDate < state.invoiceDate) {
    errors.dueDate = 'Due date must be on or after invoice date.';
  }
  return errors;
}

export function BillForm({ mode, bill }: BillFormProps): React.JSX.Element {
  const router = useRouter();
  const vendorsQuery = useAllVendorsQuery();
  const createMutation = useCreateBillMutation();
  const updateMutation = useUpdateBillMutation();

  const [state, setState] = useState<FormState>(() => initialState(bill));
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<ApiError | null>(null);

  // Keep the form in sync if the underlying bill ref changes (rare in
  // practice — the edit route loads once — but cheap insurance against a
  // refresh-from-query path landing later).
  useEffect(() => {
    if (mode === 'edit' && bill) setState(initialState(bill));
  }, [mode, bill]);

  const errors = useMemo(() => validate(state), [state]);
  const hasErrors = Object.keys(errors).length > 0;
  const isPending = createMutation.isPending || updateMutation.isPending;

  const lineItemSum = useMemo(
    () => state.lineItems.reduce((sum, item) => sum + computeLineItemTotal(item.quantity, item.unitPrice), 0),
    [state.lineItems],
  );

  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const updateLineItem = (key: string, patch: Partial<LineItemDraft>): void => {
    setState((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    }));
  };

  const addLineItem = (): void => {
    setState((prev) => ({ ...prev, lineItems: [...prev.lineItems, blankLineItem()] }));
  };

  const removeLineItem = (key: string): void => {
    setState((prev) => ({
      ...prev,
      lineItems: prev.lineItems.filter((item) => item.key !== key),
    }));
  };

  const submit = async (): Promise<void> => {
    setSubmitted(true);
    setServerError(null);
    if (hasErrors) return;

    if (mode === 'create') {
      try {
        const created = await createMutation.mutateAsync({
          invoiceNumber: state.invoiceNumber.trim(),
          vendorId: state.vendorId,
          description: state.description.trim() === '' ? null : state.description.trim(),
          amount: toWireAmount(state.amount),
          currency: state.currency,
          invoiceDate: toWireDate(state.invoiceDate),
          dueDate: toWireDate(state.dueDate),
          lineItems: state.lineItems
            .filter((item) => item.description.trim() !== '')
            .map((item) => ({
              description: item.description.trim(),
              quantity: toWireAmount(item.quantity),
              unitPrice: toWireAmount(item.unitPrice),
            })),
        });
        router.push(`/bills/${created.id}`);
      } catch (error) {
        if (error instanceof ApiError) setServerError(error);
      }
      return;
    }

    if (!bill) return;

    try {
      const updated = await updateMutation.mutateAsync({
        billId: bill.id,
        input: {
          description: state.description.trim() === '' ? null : state.description.trim(),
          amount: toWireAmount(state.amount),
          currency: state.currency,
          invoiceDate: toWireDate(state.invoiceDate),
          dueDate: toWireDate(state.dueDate),
        },
      });
      router.push(`/bills/${updated.id}`);
    } catch (error) {
      if (error instanceof ApiError) setServerError(error);
    }
  };

  if (vendorsQuery.isPending) {
    return <Loading rows={6} />;
  }

  if (vendorsQuery.error) {
    return (
      <ErrorState
        error={vendorsQuery.error}
        title="Could not load vendors"
        onRetry={() => void vendorsQuery.refetch()}
      />
    );
  }

  const vendors = vendorsQuery.data?.data ?? [];
  const validationMessages = serverError ? extractValidationMessages(serverError) : [];

  return (
    <form
      className="flex flex-col gap-6"
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

      <section className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-2">
        <Field
          id="bill-vendor"
          label="Vendor"
          error={submitted ? errors.vendorId : undefined}
          required
        >
          <VendorCombobox
            value={state.vendorId}
            onChange={(next) => updateField('vendorId', next)}
            vendors={vendors}
          />
        </Field>

        <Field
          id="bill-invoice-number"
          label="Invoice number"
          error={submitted ? errors.invoiceNumber : undefined}
          required
          hint={mode === 'edit' ? 'Locked after creation.' : undefined}
        >
          <Input
            id="bill-invoice-number"
            value={state.invoiceNumber}
            onChange={(event) => updateField('invoiceNumber', event.target.value)}
            disabled={mode === 'edit'}
            placeholder="INV-2026-0001"
            autoComplete="off"
          />
        </Field>

        <Field id="bill-description" label="Description" className="md:col-span-2">
          <Textarea
            id="bill-description"
            value={state.description}
            onChange={(event) => updateField('description', event.target.value)}
            placeholder="Optional memo for this bill"
          />
        </Field>

        <Field
          id="bill-amount"
          label="Amount"
          error={submitted ? errors.amount : undefined}
          required
        >
          <Input
            id="bill-amount"
            type="number"
            inputMode="decimal"
            step="0.01"
            min={0}
            value={state.amount}
            onChange={(event) => updateField('amount', event.target.value)}
            placeholder="0.00"
          />
        </Field>

        <Field id="bill-currency" label="Currency" required>
          <Select
            value={state.currency}
            onValueChange={(next) => updateField('currency', next as SupportedCurrency)}
          >
            <SelectTrigger id="bill-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((code) => (
                <SelectItem key={code} value={code}>
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          id="bill-invoice-date"
          label="Invoice date"
          error={submitted ? errors.invoiceDate : undefined}
          required
        >
          <Input
            id="bill-invoice-date"
            type="date"
            value={state.invoiceDate}
            onChange={(event) => updateField('invoiceDate', event.target.value)}
          />
        </Field>

        <Field
          id="bill-due-date"
          label="Due date"
          error={submitted ? errors.dueDate : undefined}
          required
        >
          <Input
            id="bill-due-date"
            type="date"
            value={state.dueDate}
            onChange={(event) => updateField('dueDate', event.target.value)}
            min={state.invoiceDate || undefined}
          />
        </Field>
      </section>

      {mode === 'create' ? (
        <section
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5"
          aria-labelledby="line-items-section"
        >
          <header className="flex items-center justify-between gap-3">
            <div>
              <h2 id="line-items-section" className="text-sm font-semibold">
                Line items
              </h2>
              <p className="text-xs text-muted-foreground">
                Itemise the invoice. Totals are recomputed server-side.
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={addLineItem}>
              <Plus className="size-4" />
              Add line item
            </Button>
          </header>

          {state.lineItems.length === 0 ? (
            <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              No line items. Use the amount field above for the bill total.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {state.lineItems.map((item) => {
                const total = computeLineItemTotal(item.quantity, item.unitPrice);
                return (
                  <div
                    key={item.key}
                    className="grid grid-cols-1 gap-3 rounded-md border border-border p-3 md:grid-cols-[1fr_120px_120px_120px_auto]"
                  >
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`line-${item.key}-description`}>Description</Label>
                      <Input
                        id={`line-${item.key}-description`}
                        value={item.description}
                        onChange={(event) =>
                          updateLineItem(item.key, { description: event.target.value })
                        }
                        placeholder="What this line covers"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`line-${item.key}-quantity`}>Quantity</Label>
                      <Input
                        id={`line-${item.key}-quantity`}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={item.quantity}
                        onChange={(event) =>
                          updateLineItem(item.key, { quantity: event.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label htmlFor={`line-${item.key}-unit-price`}>Unit price</Label>
                      <Input
                        id={`line-${item.key}-unit-price`}
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min={0}
                        value={item.unitPrice}
                        onChange={(event) =>
                          updateLineItem(item.key, { unitPrice: event.target.value })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label>Total</Label>
                      <p className="flex h-9 items-center px-1 font-mono text-sm tabular-nums text-muted-foreground">
                        {formatMoney(total.toFixed(2), state.currency)}
                      </p>
                    </div>
                    <div className="flex items-end justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove line item"
                        onClick={() => removeLineItem(item.key)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              <p className="text-right text-xs text-muted-foreground">
                Line item subtotal:{' '}
                <span className="font-mono tabular-nums">
                  {formatMoney(lineItemSum.toFixed(2), state.currency)}
                </span>{' '}
                (informational — bill amount is the field above).
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          Line items are edited on the bill detail page; this form covers the bill-level fields.
        </section>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button type="button" variant="outline" size="sm" onClick={() => router.back()} disabled={isPending}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isPending}>
          {mode === 'create' ? 'Create bill' : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

function Field({ id, label, hint, error, required, className, children }: FieldProps): React.JSX.Element {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="ml-0.5 text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

