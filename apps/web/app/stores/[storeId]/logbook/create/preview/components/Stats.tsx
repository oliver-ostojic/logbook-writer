'use client';

import type { LogbookMetadata, PreferenceMetadata } from './LogbookView';

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

// Default values for when no data is available
const defaultInputs = {
  constraintsMetPct: 0,
  preferencesBaselinePct: 50,
  tolerancePct: 5,
  fairnessBaseline: 85,
  fairnessTolerance: 5,
};

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

// Badge computation functions
function getConstraintsBadge(constraintsMetPct: number, runStatus: RunStatus): Badge {
  if (runStatus === 'INFEASIBLE' || runStatus === 'FAILED' || constraintsMetPct === 0) {
    return { label: 'Failed', color: 'red' };
  }
  if (constraintsMetPct === 100) {
    return { label: 'Success', color: 'green' };
  }
  return { label: 'Partial', color: 'amber' };
}

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
  
  // For constraints, we assume 100% if solver succeeded (OPTIMAL/FEASIBLE)
  const constraintsMetPct = 
    solverStatus === 'OPTIMAL' || solverStatus === 'FEASIBLE' ? 100 : 
    solverStatus === 'INFEASIBLE' ? 0 : 
    100;

  // Compute badges based on inputs
  const constraintsBadge = getConstraintsBadge(constraintsMetPct, solverStatus);
  const preferencesBadge = getPreferencesBadge(
    preferencesMetPct,
    defaultInputs.preferencesBaselinePct,
    defaultInputs.tolerancePct,
  );
  const solverBadge = getSolverBadge(solverStatus);
  const fairnessBadge = getFairnessBadge(
    fairnessScore,
    defaultInputs.fairnessBaseline,
    defaultInputs.fairnessTolerance,
  );

  const stats = [
    {
      name: 'Constraints met',
      value: loading ? '—' : formatPercent(constraintsMetPct),
      badge: constraintsBadge,
    },
    {
      name: 'Preferences met',
      value: loading ? '—' : formatPercent(preferencesMetPct),
      badge: preferencesBadge,
    },
    {
      name: 'Solver runtime',
      value: loading ? '—' : formatRuntime(runtimeSeconds),
      badge: solverBadge,
    },
    {
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
              <dt className="text-sm/6 font-medium text-gray-500">{stat.name}</dt>
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
