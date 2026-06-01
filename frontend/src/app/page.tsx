import { Suspense } from 'react';
import { BillsPage } from './bills-page';
import { Loading } from '@/components/states/loading';

export default function HomePage(): React.JSX.Element {
  // `BillsPage` reads `useSearchParams`, which Next requires to live under
  // a Suspense boundary for streaming the static shell.
  return (
    <Suspense fallback={<Loading rows={8} />}>
      <BillsPage />
    </Suspense>
  );
}
