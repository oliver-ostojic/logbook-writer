import { useQuery } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

async function fetchAvailableDates(storeId: string): Promise<string[]> {
  const res = await fetch(`${API_URL}/api/stores/${storeId}/dashboard/dates`);
  if (!res.ok) throw new Error(await res.text());
  const { dates } = await res.json();
  return dates ?? [];
}

export function useAvailableDates(storeId: string | undefined) {
  return useQuery({
    queryKey: ['dashboard', 'availableDates', storeId],
    queryFn: () => fetchAvailableDates(storeId as string),
    enabled: !!API_URL && !!storeId,
    initialData: [] as string[],
  });
}
