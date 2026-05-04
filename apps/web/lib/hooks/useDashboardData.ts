import { useQuery } from '@tanstack/react-query';
import { buildDashboardSnapshot } from '../../src/dashboard/buildDashboardSnapshot';
import type { DashboardSnapshot } from '../../src/dashboard/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface DashboardApiResponse {
  preferenceSatisfaction?: any;
  [key: string]: any;
}

interface DashboardData {
  snapshot: DashboardSnapshot;
  roleRules: any[];
  legacy: DashboardApiResponse | null;
}

interface RawRoleRule {
  crewId?: string;
  crewIds?: string[];
  roleId: string | number;
  type: string;
}

interface FlatRoleRule {
  crewId: string;
  roleId: string;
  type: string;
}

function flattenRoleRules(rules: RawRoleRule[] | undefined): FlatRoleRule[] {
  return (rules ?? []).flatMap(rule => {
    if (Array.isArray(rule.crewIds)) {
      return rule.crewIds.map(crewId => ({
        crewId,
        roleId: String(rule.roleId),
        type: rule.type,
      }));
    }
    return [
      {
        crewId: rule.crewId ?? '',
        roleId: String(rule.roleId),
        type: rule.type,
      },
    ];
  });
}

async function fetchDashboardData(
  storeId: string,
  dates: string[]
): Promise<DashboardData> {
  const datesParam = dates.join(',');
  const res = await fetch(
    `${API_URL}/api/stores/${storeId}/dashboard/logbooks?dates=${datesParam}`
  );
  if (!res.ok) throw new Error(await res.text());

  const { logbooks, roleRules } = await res.json();

  const snapshot = buildDashboardSnapshot({
    storeId,
    timezone: 'America/New_York',
    selectionId: 'dashboard-view',
    selectionLabel: 'Fairness Dashboard',
    selectedDates: dates,
    logbooks,
    roleRules: flattenRoleRules(roleRules),
  });

  let legacy: DashboardApiResponse | null = null;
  if (dates.length > 0) {
    const sortedDates = [...dates].sort();
    const legacyParams = new URLSearchParams({
      startDate: sortedDates[0],
      endDate: sortedDates[sortedDates.length - 1],
      title: 'Fairness Dashboard',
    });
    const legacyRes = await fetch(
      `${API_URL}/api/stores/${storeId}/dashboard?${legacyParams}`
    );
    if (legacyRes.ok) {
      legacy = (await legacyRes.json()) as DashboardApiResponse;
    }
  }

  return { snapshot, roleRules: roleRules ?? [], legacy };
}

export function useDashboardData(
  storeId: string | undefined,
  dates: string[]
) {
  const enabled = !!API_URL && !!storeId && dates.length > 0;

  return useQuery({
    queryKey: ['dashboard', 'data', storeId, dates],
    queryFn: () => fetchDashboardData(storeId as string, dates),
    enabled,
  });
}
