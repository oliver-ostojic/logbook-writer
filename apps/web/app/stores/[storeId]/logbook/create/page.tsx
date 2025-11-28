import { redirect } from 'next/navigation';

export default function CreateIndexPage({ params }: { params: { storeId: string } }) {
  // Redirect base create path to the first step (shifts)
  redirect(`/stores/${params.storeId}/logbook/create/shifts`);
}
