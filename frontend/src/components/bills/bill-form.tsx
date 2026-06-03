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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Loading } from '@/components/states/loading';
import { ErrorState } from '@/components/states/error-state';
import { VendorCombobox } from './vendor-combobox';
import { useAllVendorsQuery } from '@/hooks/use-vendors-query';
import { useCreateBillMutation } from '@/hooks/use-create-bill-mutation';
import { useUpdateBillMutation } from '@/hooks/use-update-bill-mutation';
import { ApiError } from '@/lib/api';
import { extractValidationMessages, isoToInputDate, toWireAmount, toWireDate } from '@/lib/wire';
import { formatMoney } from '@/lib/format';
import type { Bill, PaymentMethod } from '@/lib/api-types';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'ARS'] as const;
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  'ACH',
  'WIRE',
  'CHECK',
  'CARD',
  'OFF_PLATFORM',
] as const;

// Sentinel value for "Use vendor default" — Radix's Select cannot use the
// empty string as an item value, so we round-trip through this constant
// at the boundary and translate it to `null` on the wire.
const VENDOR_DEFAULT_METHOD = '__vendor_default__';
type PaymentMethodSelectValue = PaymentMethod | typeof VENDOR_DEFAULT_METHOD;

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
  paymentMethod: PaymentMethodSelectValue;
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
      paymentMethod: VENDOR_DEFAULT_METHOD,
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
    paymentMethod: bill.paymentMethod ?? VENDOR_DEFAULT_METHOD,
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

// Mirrors `CreateBillDto.INVOICE_NUMBER_PATTERN` so the form catches
// bad characters as the user types instead of bouncing them off the
// backend on submit.
const INVOICE_NUMBER_PATTERN = /^[\w\-._/# ()]+$/;

function validate(state: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!state.vendorId) errors.vendorId = 'Select a vendor.';
  const trimmedInvoiceNumber = state.invoiceNumber.trim();
  if (!trimmedInvoiceNumber) {
    errors.invoiceNumber = 'Invoice number is required.';
  } else if (!INVOICE_NUMBER_PATTERN.test(trimmedInvoiceNumber)) {
    errors.invoiceNumber =
      'Only letters, digits, spaces, and the characters - _ . / # ( ) are allowed.';
  }
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
  // Track which fields the user has interacted with so per-field errors
  // appear in real time without lighting up "Required" on every empty
  // field the moment the page loads. After Submit, treat everything as
  // touched so the bottom of the form does not surprise the user.
  const [touched, setTouched] = useState<Set<keyof FieldErrors>>(() => new Set());
  const markTouched = (field: keyof FieldErrors): void => {
    setTouched((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  };
  const showError = (field: keyof FieldErrors): boolean =>
    submitted || touched.has(field);

  // Post-payment field lock. Once a non-cancelled Payment row exists
  // for the bill, the operator already committed to a number and a
  // rail; editing amount / currency / paymentMethod here would silently
  // drift from the Payment row. The backend enforces the same rule
  // with `BILL_FIELD_LOCKED_POST_PAYMENT` so a direct PATCH cannot
  // bypass it either. `paymentMethod` is captured separately because
  // the field lives behind a Tooltip + Select that need their own
  // disabled flag.
  const hasActivePayment =
    mode === 'edit' &&
    bill !== undefined &&
    bill.payment !== null &&
    bill.payment !== undefined &&
    bill.payment.status !== 'CANCELED';
  const paymentMethodLocked = hasActivePayment;
  const financialFieldsLocked = hasActivePayment;
  const lockedFieldHint =
    'A Payment row already exists. This field cannot be changed.';

  // Keep the form in sync if the underlying bill ref changes (rare in
  // practice — the edit route loads once — but cheap insurance against a
  // refresh-from-query path landing later).
  useEffect(() => {
    if (mode === 'edit' && bill) setState(initialState(bill));
  }, [mode, bill]);

  const errors = useMemo(() => validate(state), [state]);
  const hasErrors = Object.keys(errors).length > 0;
  // Compare the current form state to the initial snapshot so the
  // "Save changes" button stays disabled when nothing actually
  // changed. Keeps a no-op PATCH out of the audit trail and prevents
  // a misleading success toast on an unchanged form.
  const initialFormState = useMemo(() => initialState(bill), [bill]);
  const isDirty = useMemo(
    () => JSON.stringify(state) !== JSON.stringify(initialFormState),
    [state, initialFormState],
  );
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
          // Omit the field entirely on create when "Use vendor default" is
          // picked — the backend treats undefined as "no override" and
          // falls back to the vendor at approve time.
          ...(state.paymentMethod === VENDOR_DEFAULT_METHOD
            ? {}
            : { paymentMethod: state.paymentMethod }),
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

    // Build the PATCH payload defensively. The financial fields
    // (amount / currency / paymentMethod) are locked once a non-
    // cancelled Payment exists; including them in the body — even
    // unchanged — trips the backend's BILL_FIELD_LOCKED_POST_PAYMENT
    // guard. Omit them in that case so PATCH carries only the fields
    // the user can actually edit.
    const input: Parameters<
      typeof updateMutation.mutateAsync
    >[0]['input'] = {
      description: state.description.trim() === '' ? null : state.description.trim(),
      invoiceDate: toWireDate(state.invoiceDate),
      dueDate: toWireDate(state.dueDate),
    };
    if (!financialFieldsLocked) {
      input.amount = toWireAmount(state.amount);
      input.currency = state.currency;
      // PATCH semantics: `null` clears an existing override; a method
      // value pins it. We always send one of the two so submitting
      // "Use vendor default" clears a previously-set override.
      input.paymentMethod =
        state.paymentMethod === VENDOR_DEFAULT_METHOD ? null : state.paymentMethod;
    }

    try {
      const updated = await updateMutation.mutateAsync({
        billId: bill.id,
        input,
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
          {/* Avoid restating the same line twice when the backend's
              `message` is a single class-validator failure that already
              shows up in `validationMessages`. Multi-error responses
              keep the title + bullet list shape. */}
          {validationMessages.length === 1 &&
          validationMessages[0] === serverError.message ? (
            <p className="font-medium text-destructive">{serverError.message}</p>
          ) : (
            <>
              <p className="font-medium text-destructive">{serverError.message}</p>
              {validationMessages.length > 0 ? (
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {validationMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-card p-5 md:grid-cols-2">
        <Field
          id="bill-vendor"
          label="Vendor"
          error={showError('vendorId') ? errors.vendorId : undefined}
          required
        >
          <VendorCombobox
            value={state.vendorId}
            onChange={(next) => {
              updateField('vendorId', next);
              markTouched('vendorId');
            }}
            vendors={vendors}
          />
        </Field>

        <Field
          id="bill-invoice-number"
          label="Invoice number"
          error={showError('invoiceNumber') ? errors.invoiceNumber : undefined}
          required
          hint={mode === 'edit' ? 'Locked after creation.' : undefined}
        >
          <Input
            id="bill-invoice-number"
            value={state.invoiceNumber}
            onChange={(event) => {
              updateField('invoiceNumber', event.target.value);
              markTouched('invoiceNumber');
            }}
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
          error={showError('amount') ? errors.amount : undefined}
          required
          hint={financialFieldsLocked ? lockedFieldHint : undefined}
        >
          {financialFieldsLocked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Input id="bill-amount" type="text" value={state.amount} disabled />
                </div>
              </TooltipTrigger>
              <TooltipContent>{lockedFieldHint}</TooltipContent>
            </Tooltip>
          ) : (
            <Input
              id="bill-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min={0}
              value={state.amount}
              onChange={(event) => {
                updateField('amount', event.target.value);
                markTouched('amount');
              }}
              placeholder="0.00"
            />
          )}
        </Field>

        <Field
          id="bill-currency"
          label="Currency"
          required
          hint={financialFieldsLocked ? lockedFieldHint : undefined}
        >
          {financialFieldsLocked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Select value={state.currency} disabled>
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
                </div>
              </TooltipTrigger>
              <TooltipContent>{lockedFieldHint}</TooltipContent>
            </Tooltip>
          ) : (
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
          )}
        </Field>

        <Field
          id="bill-payment-method"
          label="Payment method"
          hint={
            paymentMethodLocked
              ? 'The Payment was already created. The method cannot be changed.'
              : 'Overrides the vendor default when the Payment is created on approve.'
          }
        >
          {paymentMethodLocked ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Select value={state.paymentMethod} disabled>
                    <SelectTrigger id="bill-payment-method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={VENDOR_DEFAULT_METHOD}>
                        Use vendor default
                      </SelectItem>
                      {PAYMENT_METHODS.map((method) => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                The Payment was already created. The method cannot be
                changed.
              </TooltipContent>
            </Tooltip>
          ) : (
            <Select
              value={state.paymentMethod}
              onValueChange={(next) =>
                updateField('paymentMethod', next as PaymentMethodSelectValue)
              }
            >
              <SelectTrigger id="bill-payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={VENDOR_DEFAULT_METHOD}>Use vendor default</SelectItem>
                {PAYMENT_METHODS.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field
          id="bill-invoice-date"
          label="Invoice date"
          error={showError('invoiceDate') ? errors.invoiceDate : undefined}
          required
        >
          <Input
            id="bill-invoice-date"
            type="date"
            value={state.invoiceDate}
            onChange={(event) => {
              updateField('invoiceDate', event.target.value);
              markTouched('invoiceDate');
              // Cross-field rule: also re-surface the dueDate error if
              // the new invoiceDate makes the existing dueDate invalid.
              if (touched.has('dueDate')) markTouched('dueDate');
            }}
          />
        </Field>

        <Field
          id="bill-due-date"
          label="Due date"
          error={showError('dueDate') ? errors.dueDate : undefined}
          required
        >
          <Input
            id="bill-due-date"
            type="date"
            value={state.dueDate}
            onChange={(event) => {
              updateField('dueDate', event.target.value);
              markTouched('dueDate');
            }}
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
              <FormReconciliation
                lineItemsTotal={lineItemSum}
                billAmount={state.amount}
                currency={state.currency}
              />
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
        {mode === 'edit' && !isDirty ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span tabIndex={0}>
                <Button type="submit" size="sm" disabled>
                  Save changes
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>No changes to save.</TooltipContent>
          </Tooltip>
        ) : (
          <Button type="submit" size="sm" disabled={isPending}>
            {mode === 'create' ? 'Create bill' : 'Save changes'}
          </Button>
        )}
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


function FormReconciliation({
  lineItemsTotal,
  billAmount,
  currency,
}: {
  lineItemsTotal: number;
  billAmount: string;
  currency: string;
}): React.JSX.Element {
  // Mirrors the reconciliation row on the bill detail page. Surfacing
  // the divergence at write time (and at read time) prevents the bill
  // total / line items breakdown from drifting silently — the reviewer
  // sees that we treat both numbers as sources of truth on purpose.
  const billNum = Number(billAmount);
  const billValid = Number.isFinite(billNum) && billAmount.trim() !== '';
  const delta = billValid ? billNum - lineItemsTotal : 0;
  const matches = billValid && Math.abs(delta) < 0.005;
  return (
    <div className="flex items-end justify-end gap-6 rounded-md border border-border bg-background px-3 py-2 text-sm">
      <ReconRow
        label="Line items total"
        value={formatMoney(lineItemsTotal.toFixed(2), currency)}
      />
      <ReconRow
        label="Bill amount"
        value={billValid ? formatMoney(billAmount, currency) : '—'}
      />
      <ReconRow
        label="Difference"
        value={billValid ? formatMoney(Math.abs(delta).toFixed(2), currency) : '—'}
        tone={!billValid ? 'muted' : matches ? 'muted' : 'warning'}
        hint={
          !billValid || matches
            ? undefined
            : delta > 0
              ? 'Bill amount exceeds line items (tax, fees, etc).'
              : 'Line items exceed bill amount.'
        }
      />
    </div>
  );
}

function ReconRow({
  label,
  value,
  tone = 'muted',
  hint,
}: {
  label: string;
  value: string;
  tone?: 'muted' | 'warning';
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-end gap-0.5">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={
          tone === 'warning'
            ? 'font-mono text-sm font-semibold text-warning tabular-nums'
            : 'font-mono text-sm tabular-nums'
        }
        title={hint}
      >
        {value}
      </span>
    </div>
  );
}
