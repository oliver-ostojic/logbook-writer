import { StoreShell } from '../components/StoreShell';

export default function SettingsPage({ params }: { params: { storeId: string } }) {
  return <StoreShell storeId={params.storeId} initialTab="settings" />;
}
