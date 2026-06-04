import { BillDetailPage } from './bill-detail-page';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function BillDetailRoute({ params }: PageProps): Promise<React.JSX.Element> {
  // Next 15 marks dynamic route params as a Promise — awaiting here keeps
  // the type-checker happy and lets us hand the id straight to the client
  // component below.
  const { id } = await params;
  return <BillDetailPage billId={id} />;
}
