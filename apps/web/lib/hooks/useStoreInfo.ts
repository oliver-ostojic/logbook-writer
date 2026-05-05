import { useQuery } from '@tanstack/react-query';
import { authFetch } from '../api/authFetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface Store {
  id: number;
  name: string;
}

async function fetchStores(): Promise<Store[]> {
  const res = await authFetch(`${API_URL}/stores`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function useStoreInfo(storeId: string | undefined) {
  const numericId = storeId ? parseInt(storeId, 10) : undefined;

  return useQuery({
    queryKey: ['store', numericId],
    queryFn: async () => {
      const stores = await fetchStores();
      return stores.find(s => s.id === numericId) ?? null;
    },
    enabled: !!API_URL && numericId !== undefined && !Number.isNaN(numericId),
  });
}
