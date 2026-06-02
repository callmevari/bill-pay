import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NewBillView } from './new-bill-view';

export default function NewBillRoute(): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5">
      <Button asChild variant="ghost" size="sm" className="-ml-2 self-start">
        <Link href="/" aria-label="Back to bills">
          <ChevronLeft className="size-4" />
          Bills
        </Link>
      </Button>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">New bill</h1>
        <p className="text-sm text-muted-foreground">
          Bills start as drafts. You can submit them for approval once the details are in.
        </p>
      </header>
      <NewBillView />
    </div>
  );
}
