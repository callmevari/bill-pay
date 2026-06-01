// Display formatters for money and dates. Wire conventions
// (`CLAUDE.md → Wire conventions`) say money arrives as a stringified
// decimal (`"1234.56"`) and dates as ISO-8601 UTC. We parse them into the
// browser-native `Intl.*` formatters here — single point of truth so the
// table, the bill detail, and the CSV-adjacent surfaces all render the
// same way.

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function formatMoney(amount: string | null | undefined, currency?: string): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return amount;
  if (!currency || currency === 'USD') return moneyFormatter.format(value);
  // Fallback for non-USD: build the formatter on demand so we still use
  // currency-aware separators without keeping a cache around.
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateFormatter.format(date);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  // The default `Intl` separator is a regular comma; the design uses the
  // middle-dot convention from Ramp's UI so the date + time read as one
  // value rather than two parallel columns.
  const formatted = dateTimeFormatter.format(date);
  return formatted.replace(', ', ' · ');
}

export function humanizeEnum(value: string): string {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
