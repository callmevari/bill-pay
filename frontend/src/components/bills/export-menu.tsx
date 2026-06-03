'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { apiFetch } from '@/lib/api';
import { describeMutationError } from '@/lib/mutation-errors';

interface ExportMenuProps {
  // Pre-built querystring matching the active filters / sort on the bills
  // table — the page owns it because it lives in the URL. Already
  // includes the leading `?` (or is empty).
  searchString: string;
}

// Triggers a CSV download against `/exports/bills.csv`. The endpoint
// already respects the same query shape as `GET /bills`, so the table and
// the export cannot drift on what a filter means. We pass `raw: true`
// through the API client to get the raw `Response`, then build a Blob and
// click a temporary anchor to save the file — same path Sonner / shadcn
// use for downloads.
export function ExportMenu({ searchString }: ExportMenuProps): React.JSX.Element {
  const [pending, setPending] = useState(false);

  const handleExportBills = async (): Promise<void> => {
    if (pending) return;
    setPending(true);
    const toastId = toast.loading('Preparing CSV…');
    try {
      const response = await apiFetch<Response>(`/exports/bills.csv${searchString}`, {
        raw: true,
      });
      const blob = await response.blob();
      const filename = filenameFromContentDisposition(
        response.headers.get('Content-Disposition'),
      ) ?? defaultFilename();
      downloadBlob(blob, filename);
      toast.success(`Downloaded ${filename}`, { id: toastId });
    } catch (error) {
      toast.error(describeMutationError(error, 'Could not export bills.'), { id: toastId });
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Export" disabled={pending}>
          <Download className="size-4" />
          <span>Export</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Export</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(event) => {
            event.preventDefault();
            void handleExportBills();
          }}
        >
          <FileSpreadsheet className="size-4" />
          <span>Export bills as CSV (current filters)</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Parses an RFC 6266 `Content-Disposition` header. We tolerate the two
// shapes the backend can emit: plain `attachment; filename="…"` and the
// optional `filename*=UTF-8''…` extension. Returning `null` lets the
// caller fall back to a date-stamped default.
function filenameFromContentDisposition(header: string | null): string | null {
  if (!header) return null;
  // Prefer `filename*=` when present — it carries the RFC 5987 escaped
  // value, which is what proxies/CDNs use for non-ASCII names.
  const extended = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(header);
  if (extended?.[1]) {
    try {
      return decodeURIComponent(extended[1].trim());
    } catch {
      // Malformed — fall through to the plain `filename=` branch.
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(header);
  return plain?.[1]?.trim() ?? null;
}

function defaultFilename(): string {
  // UTC date so the local-timezone offset never shifts the suffix vs.
  // the backend's server-stamped name.
  const today = new Date().toISOString().slice(0, 10);
  return `bills-${today}.csv`;
}

// Standard browser download dance — a temporary anchor with a Blob URL,
// clicked, then revoked so the URL doesn't leak into the document.
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
