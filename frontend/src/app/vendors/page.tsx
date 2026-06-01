import { Suspense } from 'react';
import { VendorsPage } from './vendors-page';
import { Loading } from '@/components/states/loading';

export default function VendorsRoute(): React.JSX.Element {
  return (
    <Suspense fallback={<Loading rows={8} />}>
      <VendorsPage />
    </Suspense>
  );
}
