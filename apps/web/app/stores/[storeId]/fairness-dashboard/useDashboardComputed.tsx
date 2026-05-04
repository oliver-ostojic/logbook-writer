import React from 'react';
import type { DashboardSnapshot } from '../../../../src/dashboard/types';
import type { CrewCardData, RoleCardData } from './components';
import type { DashboardData, MiniCardData } from './types';
import { PLACEHOLDER_DASHBOARD_DATA } from './placeholderData';
import { calculateFairnessTrend, formatRuleTypeLabel } from './utils';

interface UseDashboardComputedArgs {
  dashboardSnapshot: DashboardSnapshot | null;
  selectedRole: RoleCardData | null;
  rolePanelCard: RoleCardData | null;
  roleRules: Array<{ roleRuleId?: number; type?: string; description?: string | null }>;
}

export function useDashboardComputed({
  dashboardSnapshot,
  selectedRole,
  rolePanelCard,
  roleRules,
}: UseDashboardComputedArgs) {
  const computedDashboardData: DashboardData = React.useMemo(() => {
    if (!dashboardSnapshot) {
      return PLACEHOLDER_DASHBOARD_DATA;
    }

    const snapshot = dashboardSnapshot;
    const firstLogbook = snapshot.selection.logbooks[0];
    const aggregates = snapshot.selection.selectionAggregates;

    const overviewMiniCards: MiniCardData[] = [
      {
        type: 'sparkline',
        title: 'Fairness index',
        value: Math.round((aggregates.roleAveragesPerStore.fairnessIndexPctAvgEnforcedOnly || 0) * 100) / 100,
        unit: '%',
        status: 'Enforced roles',
        sparklineData: snapshot.selection.logbooks.map(lb => {
          const enforcedRoles = lb.roleStats.filter(r => r.isEnforced && r.fairnessScore !== null);
          if (enforcedRoles.length === 0) return 0;
          const avgFairness = enforcedRoles.reduce((sum, r) => sum + (r.giniCoefficient != null ? (1 - r.giniCoefficient) * 100 : 0), 0) / enforcedRoles.length;
          return Math.round(avgFairness * 100) / 100;
        }),
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12 2.25a.75.75 0 0 1 .75.75v.756a49.106 49.106 0 0 1 9.152 1 .75.75 0 0 1-.152 1.485h-1.918l2.474 10.124a.75.75 0 0 1-.375.84A6.723 6.723 0 0 1 18.75 18a6.723 6.723 0 0 1-3.181-.795.75.75 0 0 1-.375-.84l2.474-10.124H12.75v13.28c1.293.076 2.534.343 3.697.776a.75.75 0 0 1-.262 1.453h-8.37a.75.75 0 0 1-.262-1.453c1.162-.433 2.404-.7 3.697-.775V6.24H6.332l2.474 10.124a.75.75 0 0 1-.375.84A6.723 6.723 0 0 1 5.25 18a6.723 6.723 0 0 1-3.181-.795.75.75 0 0 1-.375-.84L4.168 6.241H2.25a.75.75 0 0 1-.152-1.485 49.105 49.105 0 0 1 9.152-1V3a.75.75 0 0 1 .75-.75Zm4.878 13.543 1.872-7.662 1.872 7.662h-3.744Zm-9.756 0L5.25 8.131l-1.872 7.662h3.744Z" clipRule="evenodd" />
          </svg>
        ),
      },
      (() => {
        if (!firstLogbook) {
          return {
            type: 'bar' as const,
            title: 'Avg shift time',
            value: 0,
            unit: 'min',
            status: 'Roles',
            barData: [],
          };
        }

        const avgMinutes = Math.round(firstLogbook.roleStats.reduce((sum, r) => sum + r.avgMinutesPerAssignment, 0) / firstLogbook.roleStats.length);

        return {
          type: 'bar' as const,
          title: 'Avg shift time',
          value: avgMinutes,
          unit: 'min',
          status: 'Roles',
          barData: firstLogbook.roleStats.map(r => ({
            role: r.roleName,
            hours: Math.round(r.avgMinutesPerAssignment),
          })),
          barUnit: 'min',
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
            </svg>
          ),
        };
      })(),
      {
        type: 'statusBar',
        title: 'Fairness status',
        status: 'Enforced roles',
        barData: snapshot.selection.selectionRoleRollups
          .filter(r => r.isEnforced)
          .map(r => {
            const gini = r.avgGiniCoefficient;
            const status = gini == null ? 'N/A'
              : gini <= 0.1 ? 'Excellent'
              : gini <= 0.15 ? 'Good'
              : gini <= 0.2 ? 'Ok'
              : 'Bad';
            return {
              role: r.roleName,
              value: gini != null ? (1 - gini) * 100 : 0,
              status,
            };
          }),
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm-2.625 6c-.54 0-.828.419-.936.634a1.96 1.96 0 0 0-.189.866c0 .298.059.605.189.866.108.215.395.634.936.634.54 0 .828-.419.936-.634.13-.26.189-.568.189-.866 0-.298-.059-.605-.189-.866-.108-.215-.395-.634-.936-.634Zm4.314.634c.108-.215.395-.634.936-.634.54 0 .828.419.936.634.13.26.189.568.189.866 0 .298-.059.605-.189.866-.108.215-.395.634-.936.634-.54 0-.828-.419-.936-.634a1.96 1.96 0 0 1-.189-.866c0-.298.059-.605.189-.866Zm2.023 6.828a.75.75 0 1 0-1.06-1.06 3.75 3.75 0 0 1-5.304 0 .75.75 0 0 0-1.06 1.06 5.25 5.25 0 0 0 7.424 0Z" clipRule="evenodd" />
          </svg>
        ),
      },
      {
        type: 'pie',
        title: 'Avg. preferences met',
        value: Math.round((aggregates.crewAveragesPerStore.preferencesMetPctAvg || 0) * 100) / 100,
        unit: '%',
        status: 'All crew',
        pieData: {
          met: Math.round((aggregates.crewAveragesPerStore.preferencesMetPctAvg || 0) * 100) / 100,
          notMet: Math.round((100 - (aggregates.crewAveragesPerStore.preferencesMetPctAvg || 0)) * 100) / 100,
        },
        icon: (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
            <path fillRule="evenodd" d="M8.25 6.75a3.75 3.75 0 1 1 7.5 0 3.75 3.75 0 0 1-7.5 0ZM15.75 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM2.25 9.75a3 3 0 1 1 6 0 3 3 0 0 1-6 0ZM6.31 15.117A6.745 6.745 0 0 1 12 12a6.745 6.745 0 0 1 6.709 7.498.75.75 0 0 1-.372.568A12.696 12.696 0 0 1 12 21.75c-2.305 0-4.47-.612-6.337-1.684a.75.75 0 0 1-.372-.568 6.787 6.787 0 0 1 1.019-4.38Z" clipRule="evenodd" />
            <path d="M5.082 14.254a8.287 8.287 0 0 0-1.308 5.135 9.687 9.687 0 0 1-1.764-.44l-.115-.04a.563.563 0 0 1-.373-.487l-.01-.121a3.75 3.75 0 0 1 3.57-4.047ZM20.226 19.389a8.287 8.287 0 0 0-1.308-5.135 3.75 3.75 0 0 1 3.57 4.047l-.01.121a.563.563 0 0 1-.373.486l-.115.04c-.567.2-1.156.349-1.764.441Z" />
          </svg>
        ),
      },
    ];

    return {
      expandedDashboards: {
        Overview: {
          name: 'Overview',
          miniCards: overviewMiniCards,
        },
      },
    };
  }, [dashboardSnapshot]);

  const computedCrewCards: CrewCardData[] = React.useMemo(() => {
    if (!dashboardSnapshot || !dashboardSnapshot.selection.selectionCrewRollups?.length) {
      return [];
    }

    const crewRollups = dashboardSnapshot.selection.selectionCrewRollups;

    const roleNameMap: Record<string, string> = {};
    if (dashboardSnapshot.selection.logbooks[0]) {
      dashboardSnapshot.selection.logbooks[0].roleStats.forEach(role => {
        roleNameMap[role.roleId] = role.roleName;
      });
    }

    const crewWithPrefs = crewRollups.filter(c => c.preferencesTotalSelection > 0);
    const crewWithoutPrefs = crewRollups.filter(c => c.preferencesTotalSelection === 0);

    const sortedWithPrefs = [...crewWithPrefs].sort((a, b) =>
      b.avgSatisfactionPctOverSelection - a.avgSatisfactionPctOverSelection
    );

    const getRoundedSatisfaction = (crew: typeof sortedWithPrefs[0]) =>
      Math.round(crew.avgSatisfactionPctOverSelection);

    let currentRank = 1;
    let previousSatisfaction: number | null = null;
    const ranksMap = new Map<string, number>();

    sortedWithPrefs.forEach((crew, index) => {
      const roundedSat = getRoundedSatisfaction(crew);
      if (previousSatisfaction !== null && roundedSat < previousSatisfaction) {
        currentRank = index + 1;
      }
      ranksMap.set(crew.crewId, currentRank);
      previousSatisfaction = roundedSat;
    });

    const uniqueRanks = new Set(ranksMap.values());
    const totalRanks = uniqueRanks.size;

    const cardsWithPrefs = sortedWithPrefs.map((crew) => ({
      title: crew.crewName,
      id: crew.crewId,
      satisfactionScore: Math.round(crew.avgSatisfactionPctOverSelection * 100) / 100,
      satisfactionRank: ranksMap.get(crew.crewId) || 1,
      totalRankedCrew: totalRanks,
      preferencesTotal: crew.preferencesTotalSelection,
      preferencesMetCount: crew.preferencesMetSelection,
      vsCrewAvg: Math.round(crew.avgVsCrewAvgDeltaOverSelection * 100) / 100,
      satisfactionByDate: crew.satisfactionByDate || [],
      satisfactionHistory: crew.satisfactionByDate?.map(d => d.satisfactionPct) || [],
      avgMinutesPerRole: Object.entries(crew.avgMinutesPerAssignmentByRoleSelection || {}).map(([roleId, avgMinutes]) => ({
        roleId,
        roleName: roleNameMap[roleId] || roleId,
        avgMinutes: Math.round(avgMinutes),
      })),
      preferenceBreakdownByRuleType: crew.preferenceBreakdownByRuleType || [],
    }));

    const cardsWithoutPrefs = crewWithoutPrefs.map((crew) => ({
      title: crew.crewName,
      id: crew.crewId,
      satisfactionScore: undefined,
      satisfactionRank: undefined,
      totalRankedCrew: undefined,
      preferencesTotal: 0,
      preferencesMetCount: 0,
      vsCrewAvg: undefined,
      satisfactionByDate: crew.satisfactionByDate || [],
      satisfactionHistory: crew.satisfactionByDate?.map(d => d.satisfactionPct) || [],
      avgMinutesPerRole: Object.entries(crew.avgMinutesPerAssignmentByRoleSelection || {}).map(([roleId, avgMinutes]) => ({
        roleId,
        roleName: roleNameMap[roleId] || roleId,
        avgMinutes: Math.round(avgMinutes),
      })),
      preferenceBreakdownByRuleType: [],
    }));

    return [
      ...cardsWithPrefs,
      ...cardsWithoutPrefs.sort((a, b) => a.title.localeCompare(b.title)),
    ];
  }, [dashboardSnapshot]);

  const computedRoleCards: RoleCardData[] = React.useMemo(() => {
    if (!dashboardSnapshot || !dashboardSnapshot.selection.selectionRoleRollups) {
      return [];
    }

    const roleRollups = dashboardSnapshot.selection.selectionRoleRollups;
    const logbooks = dashboardSnapshot.selection.logbooks;

    const fairnessValues = roleRollups
      .map(r => r.avgFairnessIndexPct)
      .filter((f): f is number => f !== null);
    const avgFairnessAcrossRoles = fairnessValues.length > 0
      ? fairnessValues.reduce((sum, f) => sum + f, 0) / fairnessValues.length
      : 0;

    return roleRollups.map(role => {
      const roleEmojis: Record<string, string> = {
        REGISTER: '🛒',
        PRODUCT: '📦',
        DEMO: '🎤',
        BREAK: '☕',
        OFFICE: '💼',
        'PARKING HELMS': '🅿️',
        'SECTION LEADER': '👔',
        ART: '🎨',
        'WINE DEMO': '🍷',
        'FOOD DEMO': '🍴',
      };
      const emoji = roleEmojis[role.roleName.toUpperCase()] || '⭐';

      let avgMinutesPerDay = 0;
      if (logbooks[0]) {
        const roleStats = logbooks[0].roleStats.find((r: any) => r.roleId === role.roleId);
        if (roleStats) {
          avgMinutesPerDay = roleStats.avgMinutesPerAssignment || 0;
        }
      }

      const eligibleCrewCounts = logbooks
        .map(lb => lb.roleStats.find((r: any) => r.roleId === role.roleId)?.eligibleCrew || 0)
        .filter(count => count > 0);
      const totalEligibleCrew = eligibleCrewCounts.length > 0
        ? Math.max(...eligibleCrewCounts)
        : 0;

      const crewWhoWorkedRole = role.crewWorkedOnRoleCount || 0;

      const vsRoleAvgPct = role.avgFairnessIndexPct !== null && avgFairnessAcrossRoles > 0
        ? role.avgFairnessIndexPct - avgFairnessAcrossRoles
        : null;

      const trend = calculateFairnessTrend(role.byDateAverages || []);

      const lorenzData = role.lorenzCurveData?.map(point => ({
        crewPct: point.populationShare * 100,
        hoursPct: point.workShare * 100,
      })) || [];

      return {
        id: role.roleId,
        name: role.roleName,
        emoji,
        giniCoefficient: role.avgGiniCoefficient || 0,
        trend,
        crewCount: crewWhoWorkedRole,
        totalCrew: totalEligibleCrew,
        avgMinutes: avgMinutesPerDay,
        medianHours: role.minutesWorkedOnRoleTotal ? role.minutesWorkedOnRoleTotal / 60 : 0,
        vsRoleAvgPct,
        lorenzData,
        minutesWorkedOnRoleTotal: role.minutesWorkedOnRoleTotal,
        totalMinutesWorkedSelection: role.totalMinutesWorkedSelection,
        minutesOnRoleVsTotalWorkPct: role.minutesOnRoleVsTotalWorkPct,
        avgFairnessIndexPct: role.avgFairnessIndexPct,
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
  }, [dashboardSnapshot]);

  const computedSatisfactionByDate = React.useMemo(() => {
    if (!dashboardSnapshot) return [];

    return dashboardSnapshot.selection.logbooks.map((lb, index) => {
      const [year, month, day] = lb.logbook.date.split('-').map(Number);
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const monthName = monthNames[month - 1];
      const yearShort = String(year).slice(-2);

      return {
        shiftNumber: index + 1,
        shiftDate: `${day} ${monthName}, ${yearShort}`,
        satisfaction: Math.round(lb.dayAggregate.satisfactionPct * 100) / 100,
      };
    });
  }, [dashboardSnapshot]);

  const computedSatisfactionBoxPlot = React.useMemo(() => {
    if (!dashboardSnapshot) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [] };
    }

    const allSatisfactionScores = dashboardSnapshot.selection.logbooks.flatMap(lb =>
      lb.crewStats
        .filter(cs => cs.preferencesTotal > 0)
        .map(cs => cs.avgSatisfactionPct)
    );

    if (allSatisfactionScores.length === 0) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [] };
    }

    const sorted = [...allSatisfactionScores].sort((a, b) => a - b);

    const q1Index = Math.floor(sorted.length * 0.25);
    const q2Index = Math.floor(sorted.length * 0.5);
    const q3Index = Math.floor(sorted.length * 0.75);

    const minVal = sorted[0];
    const q1 = sorted[q1Index];
    const median = sorted[q2Index];
    const q3 = sorted[q3Index];
    const maxVal = sorted[sorted.length - 1];

    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    const outliers = sorted.filter(val => val < lowerBound || val > upperBound);

    const nonOutliers = sorted.filter(val => val >= lowerBound && val <= upperBound);
    const whiskerMin = nonOutliers.length > 0 ? nonOutliers[0] : minVal;
    const whiskerMax = nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : maxVal;

    return {
      min: Math.round(whiskerMin * 100) / 100,
      q1: Math.round(q1 * 100) / 100,
      median: Math.round(median * 100) / 100,
      q3: Math.round(q3 * 100) / 100,
      max: Math.round(whiskerMax * 100) / 100,
      outliers: outliers.map(o => Math.round(o * 100) / 100),
    };
  }, [dashboardSnapshot]);

  const computedPreferenceData = React.useMemo(() => {
    if (!dashboardSnapshot) return [];

    const logbooks = dashboardSnapshot.selection.logbooks;
    if (logbooks.length === 0) return [];

    const aggregated = new Map<number, { eligible: number; met: number }>();
    for (const lb of logbooks) {
      for (const breakdown of lb.dayAggregate.breakdownByRuleType) {
        const existing = aggregated.get(breakdown.roleRuleId) ?? { eligible: 0, met: 0 };
        aggregated.set(breakdown.roleRuleId, {
          eligible: existing.eligible + breakdown.eligible,
          met: existing.met + breakdown.met,
        });
      }
    }

    return Array.from(aggregated.entries()).map(([roleRuleId, totals]) => {
      const rule = roleRules.find(r => r.roleRuleId === roleRuleId);
      const label = rule?.type ? formatRuleTypeLabel(rule.type) : `Rule ${roleRuleId}`;
      const description = rule?.description || undefined;

      return {
        label,
        description,
        totalCount: totals.eligible,
        satisfiedCount: totals.met,
      };
    });
  }, [dashboardSnapshot, roleRules]);

  const computedRoleBoxPlot = React.useMemo(() => {
    const roleToUse = selectedRole ?? rolePanelCard;
    if (!dashboardSnapshot || !roleToUse) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [], hasDistribution: false };
    }

    const allCrewMinutes: number[] = dashboardSnapshot.selection.logbooks.flatMap(lb =>
      lb.crewStats
        .map(cs => cs.avgMinutesPerAssignmentByRole[roleToUse.id] || 0)
        .filter(minutes => minutes > 0)
    );

    if (allCrewMinutes.length === 0) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [], hasDistribution: false };
    }

    const sorted = allCrewMinutes.slice().sort((a, b) => a - b);

    const uniqueValues = new Set(sorted);
    if (uniqueValues.size < 2) {
      return { min: 0, q1: 0, median: 0, q3: 0, max: 0, outliers: [], hasDistribution: false };
    }

    const q1Index = Math.floor(sorted.length * 0.25);
    const medianIndex = Math.floor(sorted.length * 0.5);
    const q3Index = Math.floor(sorted.length * 0.75);

    const q1 = sorted[q1Index];
    const median = sorted[medianIndex];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    const outliers = sorted.filter(val => val < lowerBound || val > upperBound);

    const nonOutliers = sorted.filter(val => val >= lowerBound && val <= upperBound);
    const whiskerMin = nonOutliers.length > 0 ? nonOutliers[0] : sorted[0];
    const whiskerMax = nonOutliers.length > 0 ? nonOutliers[nonOutliers.length - 1] : sorted[sorted.length - 1];

    return {
      min: Math.round(whiskerMin * 100) / 100,
      q1: Math.round(q1 * 100) / 100,
      median: Math.round(median * 100) / 100,
      q3: Math.round(q3 * 100) / 100,
      max: Math.round(whiskerMax * 100) / 100,
      outliers: outliers.map(o => Math.round(o * 100) / 100),
      hasDistribution: true,
    };
  }, [dashboardSnapshot, selectedRole, rolePanelCard]);

  const computedRoleHeatmap = React.useMemo(() => {
    const roleToUse = selectedRole ?? rolePanelCard;
    if (!dashboardSnapshot || !roleToUse) {
      return { weeks: [], data: [] };
    }

    const logbooks = dashboardSnapshot.selection.logbooks;
    if (logbooks.length === 0) {
      return { weeks: [], data: [] };
    }

    const weekMap = new Map<string, { weekLabel: string; dates: { date: string; dayOfWeek: string; avgHours: number }[] }>();

    logbooks.forEach(lb => {
      const date = new Date(lb.logbook.date);

      const dayOfWeek = date.getUTCDay();
      const startOfWeek = new Date(date);
      startOfWeek.setUTCDate(date.getUTCDate() - dayOfWeek);

      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);

      const startDay = startOfWeek.getUTCDate();
      const endDay = endOfWeek.getUTCDate();
      const startMonth = startOfWeek.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      const endMonth = endOfWeek.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
      const year = String(startOfWeek.getUTCFullYear()).slice(-2);

      const weekLabel = startMonth === endMonth
        ? `${startDay}-${endDay} ${startMonth}, ${year}`
        : `${startDay} ${startMonth}-${endDay} ${endMonth}, ${year}`;

      const weekKey = startOfWeek.toISOString().split('T')[0];

      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, { weekLabel, dates: [] });
      }

      const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const dayLabel = dayLabels[dayOfWeek];

      const roleStats = lb.crewStats.filter(cs => {
        const minutes = cs.avgMinutesPerAssignmentByRole[roleToUse.id] || 0;
        return minutes > 0;
      });

      const totalMinutes = roleStats.reduce((sum, cs) => sum + (cs.avgMinutesPerAssignmentByRole[roleToUse.id] || 0), 0);
      const avgHours = roleStats.length > 0 ? totalMinutes / roleStats.length / 60 : 0;

      weekMap.get(weekKey)!.dates.push({
        date: lb.logbook.date,
        dayOfWeek: dayLabel,
        avgHours,
      });
    });

    const weeks: string[] = [];
    const data: { week: string; dayOfWeek: string; avgHours: number }[] = [];

    const sortedWeeks = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));

    sortedWeeks.forEach(([, weekData]) => {
      weeks.push(weekData.weekLabel);

      weekData.dates.forEach(dateData => {
        data.push({
          week: weekData.weekLabel,
          dayOfWeek: dateData.dayOfWeek,
          avgHours: dateData.avgHours,
        });
      });
    });

    return { weeks, data };
  }, [dashboardSnapshot, selectedRole, rolePanelCard]);

  const computedCrewFairnessTable = React.useMemo(() => {
    const roleToUse = selectedRole ?? rolePanelCard;
    if (!dashboardSnapshot || !roleToUse) {
      return [];
    }

    const crewRollups = dashboardSnapshot.selection.selectionCrewRollups;
    const roleId = roleToUse.id;

    const crewWithRole = crewRollups.filter(crew => {
      const minutes = crew.avgMinutesPerAssignmentByRoleSelection[roleId];
      return minutes !== undefined && minutes > 0;
    });

    if (crewWithRole.length === 0) {
      return [];
    }

    const totalMinutes = crewWithRole.reduce((sum, crew) =>
      sum + crew.avgMinutesPerAssignmentByRoleSelection[roleId], 0
    );
    const overallAvg = totalMinutes / crewWithRole.length;

    const today = new Date();

    return crewWithRole.map(crew => {
      const minsPerShift = crew.avgMinutesPerAssignmentByRoleSelection[roleId];
      const lastAssignedDate = crew.lastAssignedDateByRoleSelection[roleId];

      let lastAssignedDays = 0;
      if (lastAssignedDate) {
        const lastDate = new Date(lastAssignedDate);
        const diffTime = today.getTime() - lastDate.getTime();
        lastAssignedDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      }

      const deviation = overallAvg > 0
        ? ((minsPerShift - overallAvg) / overallAvg) * 100
        : 0;

      return {
        name: crew.crewName,
        minsPerShift,
        lastAssignedDays,
        deviation,
      };
    });
  }, [dashboardSnapshot, selectedRole, rolePanelCard]);

  const rolePanelSparkline = React.useMemo(() => (
    dashboardSnapshot?.selection.logbooks.map(lb => {
      if (!rolePanelCard) return 0;
      const roleStats = lb.roleStats.find((r: any) => r.roleId === rolePanelCard.id);
      if (!roleStats || roleStats.giniCoefficient === null) return 0;
      return Math.round((1 - roleStats.giniCoefficient) * 10000) / 100;
    }) || [0]
  ), [dashboardSnapshot, rolePanelCard]);

  return {
    computedDashboardData,
    computedCrewCards,
    computedRoleCards,
    computedSatisfactionByDate,
    computedSatisfactionBoxPlot,
    computedPreferenceData,
    computedRoleBoxPlot,
    computedRoleHeatmap,
    computedCrewFairnessTable,
    rolePanelSparkline,
  };
}
