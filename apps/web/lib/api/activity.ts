import { useAuthStore } from '@/lib/authStore';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export type ActivityFilter = 'recent' | 'today' | 'last2days' | 'oneweek' | 'onemonth';

export interface ActivityLogItem {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  date: string | null;
  createdAt: string;
  metadata: { comment?: string; [key: string]: unknown } | null;
  User: {
    id: string;
    name: string;
    role: string;
  };
}

export interface ActivityLogsResponse {
  logs: ActivityLogItem[];
  total: number;
}

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().token;
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function fetchActivityLogs(
  storeId: number,
  filter: ActivityFilter = 'oneweek',
  limit = 50,
  offset = 0
): Promise<ActivityLogsResponse> {
  const res = await fetch(
    `${API_URL}/api/stores/${storeId}/activity?filter=${filter}&limit=${limit}&offset=${offset}`,
    { headers: authHeaders(), credentials: 'include' }
  );
  if (!res.ok) {
    throw new Error('Failed to fetch activity logs');
  }
  return res.json();
}

export async function postComment(
  storeId: number,
  comment: string
): Promise<ActivityLogItem> {
  const res = await fetch(`${API_URL}/api/stores/${storeId}/activity/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    credentials: 'include',
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) {
    throw new Error('Failed to post comment');
  }
  const data = await res.json();
  return data.log;
}

export async function deleteComment(
  storeId: number,
  logId: string
): Promise<ActivityLogItem> {
  const res = await fetch(`${API_URL}/api/stores/${storeId}/activity/${logId}`, {
    method: 'DELETE',
    headers: authHeaders(),
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error('Failed to delete comment');
  }
  const data = await res.json();
  return data.log;
}

export async function fetchActivityLogsByDate(
  storeId: number,
  date: string, // YYYY-MM-DD format
  limit = 50,
  offset = 0
): Promise<ActivityLogsResponse> {
  const res = await fetch(
    `${API_URL}/api/stores/${storeId}/activity?date=${date}&limit=${limit}&offset=${offset}`,
    { headers: authHeaders(), credentials: 'include' }
  );
  if (!res.ok) {
    throw new Error('Failed to fetch activity logs');
  }
  return res.json();
}
