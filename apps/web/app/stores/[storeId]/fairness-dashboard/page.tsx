import { StoreShell } from '../components/StoreShell';

export default function FairnessDashboardPage({ params }: { params: { storeId: string } }) {
  return <StoreShell storeId={params.storeId} initialTab="dashboard" />;
}
