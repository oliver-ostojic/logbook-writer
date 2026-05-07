import { StoreShell } from '../components/StoreShell';

export default function HomePage({ params }: { params: { storeId: string } }) {
  return <StoreShell storeId={params.storeId} initialTab="home" />;
}
