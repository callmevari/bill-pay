import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EditBillView } from './edit-bill-view';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditBillRoute({ params }: PageProps): Promise<React.JSX.Element> {
  const { id } = await params;
  return (
    <div className="flex flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href={`/bills/${id}`} aria-label="Back to bill">
          <ChevronLeft className="size-4" />
          Back to bill
        </Link>
      </Button>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Edit bill</h1>
        <p className="text-sm text-muted-foreground">
          Bill-level fields only. Use the detail page to manage line items.
        </p>
      </header>
      <EditBillView billId={id} />
    </div>
  );
}
