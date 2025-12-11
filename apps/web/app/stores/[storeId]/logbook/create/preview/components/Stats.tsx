'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { LogbookMetadata, PreferenceMetadata } from './LogbookView';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

type RunStatus = 'QUEUED' | 'RUNNING' | 'FEASIBLE' | 'OPTIMAL' | 'TIME_LIMIT' | 'INFEASIBLE' | 'FAILED' | 'CANCELED' | 'DRAFT' | 'PUBLISHED';

interface StatsProps {
  metadata?: LogbookMetadata | null;
  preferenceMetadata?: PreferenceMetadata | null;
  loading?: boolean;
}

interface Badge {
  label: string;
  color: 'green' | 'blue' | 'amber' | 'red' | 'gray';
}

interface HistoricalBaselines {
  preferencesOverallPct: number;
  preferencesOverallTolerance: number;
  perCrewAvgPct: number;
  perCrewAvgTolerance: number;
  fairnessPct: number;
  fairnessTolerance: number;
}

// Default values for when no historical data is available
const defaultBaselines: HistoricalBaselines = {
  preferencesOverallPct: 50,
  preferencesOverallTolerance: 5,
  perCrewAvgPct: 50,
  perCrewAvgTolerance: 5,
  fairnessPct: 85,
  fairnessTolerance: 5,
};

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

// Badge computation functions
function getPreferencesBadge(
  preferencesMetPct: number,
  preferencesBaselinePct: number,
  tolerancePct: number,
): Badge {
  if (preferencesMetPct < 50) {
    return { label: 'Critical', color: 'red' };
  }
  if (preferencesMetPct >= preferencesBaselinePct + tolerancePct) {
    return { label: 'Above Avg', color: 'green' };
  }
  if (preferencesMetPct <= preferencesBaselinePct - tolerancePct) {
    return { label: 'Below Avg', color: 'amber' };
  }
  return { label: 'Typical', color: 'blue' };
}

function getSolverBadge(runStatus: RunStatus): Badge {
  switch (runStatus) {
    case 'OPTIMAL':
      return { label: 'Optimal', color: 'green' };
    case 'FEASIBLE':
      return { label: 'Feasible', color: 'blue' };
    case 'TIME_LIMIT':
      return { label: 'Time Limit', color: 'amber' };
    case 'INFEASIBLE':
      return { label: 'Infeasible', color: 'red' };
    case 'FAILED':
      return { label: 'Failed', color: 'red' };
    case 'CANCELED':
      return { label: 'Canceled', color: 'gray' };
    default:
      return { label: runStatus, color: 'gray' };
  }
}

function getFairnessBadge(
  fairnessScore: number,
  fairnessBaseline: number,
  fairnessTolerance: number,
): Badge {
  if (fairnessScore < 50) {
    return { label: 'Unfair', color: 'red' };
  }
  if (fairnessScore >= fairnessBaseline + fairnessTolerance) {
    return { label: 'Very Fair', color: 'green' };
  }
  if (fairnessScore <= fairnessBaseline - fairnessTolerance) {
    return { label: 'Skewed', color: 'amber' };
  }
  return { label: 'Balanced', color: 'blue' };
}

function formatRuntime(seconds: number): string {
  if (seconds < 1) {
    const ms = seconds * 1000;
    return Number.isInteger(ms) ? `${ms}ms` : `${ms.toFixed(1)}ms`;
  }
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(2)}s`;
}

function formatPercent(value: number): string {
  return Number.isInteger(value) ? `${value}%` : `${value.toFixed(1)}%`;
}

function getBadgeColorClasses(color: Badge['color']): string {
  switch (color) {
    case 'green':
      return 'text-green-700 bg-green-50 ring-green-600/20';
    case 'blue':
      return 'text-blue-700 bg-blue-50 ring-blue-600/20';
    case 'amber':
      return 'text-amber-700 bg-amber-50 ring-amber-600/20';
    case 'red':
      return 'text-red-700 bg-red-50 ring-red-600/20';
    case 'gray':
      return 'text-gray-700 bg-gray-50 ring-gray-600/20';
  }
}

export default function Stats({ metadata, preferenceMetadata, loading }: StatsProps) {
  const params = useParams();
  const storeId = params?.storeId as string | undefined;
  const [baselines, setBaselines] = useState<HistoricalBaselines>(defaultBaselines);

  // Fetch historical baselines for this store
  useEffect(() => {
    if (!storeId) return;

    const fetchBaselines = async () => {
      try {
        const res = await fetch(`${API_URL}/schedule/stats/baselines?storeId=${storeId}&days=14`);
        if (res.ok) {
          const data = await res.json();
          if (!data.useDefaults) {
            setBaselines({
              preferencesOverallPct: data.preferencesOverallPct,
              preferencesOverallTolerance: data.preferencesOverallTolerance,
              perCrewAvgPct: data.perCrewAvgPct,
              perCrewAvgTolerance: data.perCrewAvgTolerance,
              fairnessPct: data.fairnessPct,
              fairnessTolerance: data.fairnessTolerance,
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch baselines:', err);
        // Keep defaults on error
      }
    };

    fetchBaselines();
  }, [storeId]);

  // Derive stats from metadata
  const solverStatus = (metadata?.solver?.status ?? 'DRAFT') as RunStatus;
  const runtimeMs = metadata?.solver?.runtimeMs ?? 0;
  const runtimeSeconds = runtimeMs / 1000;
  
  // Preferences from preferenceMetadata or metadata.preferences
  const totalPrefs = preferenceMetadata?.totalPreferences ?? metadata?.preferences?.total ?? 0;
  const metPrefs = preferenceMetadata?.preferencesMet ?? metadata?.preferences?.met ?? 0;
  const preferencesMetPct = totalPrefs > 0 ? (metPrefs / totalPrefs) * 100 : 0;
  
  // Fairness from preferenceMetadata - already stored as 0-100
  const fairnessScore = preferenceMetadata?.fairnessIndex ?? 0;

  // Average satisfaction from preferenceMetadata or metadata.preferences
  const avgSatisfaction = preferenceMetadata?.averageSatisfaction ?? metadata?.preferences?.averageSatisfaction ?? 0;
  // Convert to percentage (0-100) if it's stored as 0-1
  const avgSatisfactionPct = avgSatisfaction > 1 ? avgSatisfaction : avgSatisfaction * 100;

  // Compute badges based on historical baselines
  const avgSatisfactionBadge = getPreferencesBadge(
    avgSatisfactionPct,
    baselines.perCrewAvgPct,
    baselines.perCrewAvgTolerance,
  );
  const preferencesBadge = getPreferencesBadge(
    preferencesMetPct,
    baselines.preferencesOverallPct,
    baselines.preferencesOverallTolerance,
  );
  const solverBadge = getSolverBadge(solverStatus);
  const fairnessBadge = getFairnessBadge(
    fairnessScore,
    baselines.fairnessPct,
    baselines.fairnessTolerance,
  );

  const stats = [
    {
      label: 'Preferences met',
      name: 'Per-Crew Avg.',
      value: loading ? '—' : formatPercent(avgSatisfactionPct),
      badge: avgSatisfactionBadge,
    },
    {
      label: 'Preferences met',
      name: 'Overall',
      value: loading ? '—' : formatPercent(preferencesMetPct),
      badge: preferencesBadge,
    },
    {
      label: 'Solver',
      name: 'Runtime',
      value: loading ? '—' : formatRuntime(runtimeSeconds),
      badge: solverBadge,
    },
    {
      label: 'Preferences met',
      name: 'Fairness',
      value: loading ? '—' : formatPercent(fairnessScore),
      badge: fairnessBadge,
    },
  ];

  return (
    <div className="relative isolate overflow-hidden">
      <div className="border-b border-b-gray-900/10 lg:border-t lg:border-t-gray-900/5">
        <dl className="mx-auto grid max-w-7xl grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:px-2 xl:px-0">
          {stats.map((stat, statIdx) => (
            <div
              key={stat.name}
              className={classNames(
                statIdx % 2 === 1 ? 'sm:border-l' : statIdx === 2 ? 'lg:border-l' : '',
                'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-t border-gray-900/5 px-4 py-10 sm:px-6 lg:border-t-0 xl:px-8',
              )}
            >
              <dt className="text-sm/6 font-medium text-gray-500">
                {'label' in stat && stat.label && (
                  <span className="block text-xs text-gray-400 mb-0.5">{stat.label}</span>
                )}
                {stat.name}
              </dt>
              <dd
                className={classNames(
                  getBadgeColorClasses(stat.badge.color),
                  'rounded-md px-2 py-1 text-xs font-medium ring-1 ring-inset',
                )}
              >
                {stat.badge.label}
              </dd>
              <dd className="w-full flex-none text-3xl/10 font-medium tracking-tight text-gray-900">
                {stat.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div
        aria-hidden="true"
        className="absolute left-0 top-full -z-10 mt-96 origin-top-left translate-y-40 -rotate-90 transform-gpu opacity-20 blur-3xl sm:left-1/2 sm:-ml-96 sm:-mt-10 sm:translate-y-0 sm:rotate-0 sm:opacity-50"
      >
        <div
          style={{
            clipPath:
              'polygon(100% 38.5%, 82.6% 100%, 60.2% 37.7%, 52.4% 32.1%, 47.5% 41.8%, 45.2% 65.6%, 27.5% 23.4%, 0.1% 35.3%, 17.9% 0%, 27.7% 23.4%, 76.2% 2.5%, 74.2% 56%, 100% 38.5%)',
          }}
          className="aspect-[1154/678] w-[72.125rem] bg-gradient-to-br from-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] to-[#9089FC]"
        />
      </div>
    </div>
  );
}
