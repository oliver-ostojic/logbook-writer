'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import type { LogbookMetadata, PreferenceMetadata, QuotaWarning } from './LogbookView';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

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

// Returns RGB color values for badge border and text color for badge
function getBadgeColors(color: Badge['color']): { rgb: string; textClass: string; bgRgba: string } {
  switch (color) {
    case 'green':
      return { rgb: '34, 197, 94', textClass: 'text-green-700', bgRgba: 'rgba(34, 197, 94, 0.08)' };
    case 'blue':
      return { rgb: '59, 130, 246', textClass: 'text-blue-700', bgRgba: 'rgba(59, 130, 246, 0.08)' };
    case 'amber':
      return { rgb: '245, 158, 11', textClass: 'text-amber-700', bgRgba: 'rgba(245, 158, 11, 0.08)' };
    case 'red':
      return { rgb: '239, 68, 68', textClass: 'text-red-700', bgRgba: 'rgba(239, 68, 68, 0.08)' };
    case 'gray':
      return { rgb: '107, 114, 128', textClass: 'text-gray-700', bgRgba: 'rgba(107, 114, 128, 0.08)' };
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
  
  // Preferences from preferenceMetadata (new schema)
  const eligiblePrefs = preferenceMetadata?.eligiblePreferences ?? 0;
  const metPrefs = preferenceMetadata?.preferencesMet ?? 0;
  const preferencesMetPct = preferenceMetadata?.percentMet ?? (eligiblePrefs > 0 ? (metPrefs / eligiblePrefs) * 100 : 0);
  
  // Fairness from preferenceMetadata - stored as 0-100
  const fairnessScore = preferenceMetadata?.fairnessIndex ?? 0;
  const fairnessGrade = preferenceMetadata?.fairnessGrade ?? '';

  // Average satisfaction per crew from preferenceMetadata - stored as 0-100
  const avgSatisfactionPct = preferenceMetadata?.avgSatisfactionPerCrew ?? preferenceMetadata?.avgSatisfaction ?? 0;
  
  // Eligible crew count
  const eligibleCrew = preferenceMetadata?.eligibleCrew ?? 0;

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

  // Helper to get badge from grade
  function getGradeBadge(grade: string): Badge {
    if (grade.startsWith('A')) return { label: grade, color: 'green' };
    if (grade.startsWith('B')) return { label: grade, color: 'blue' };
    if (grade.startsWith('C')) return { label: grade, color: 'amber' };
    if (grade.startsWith('D') || grade === 'F') return { label: grade, color: 'red' };
    return { label: grade || '—', color: 'gray' };
  }

  const stats = [
    {
      label: `${eligibleCrew} eligible crew`,
      name: 'Per-Crew Avg.',
      value: loading ? '—' : formatPercent(avgSatisfactionPct),
      badge: avgSatisfactionBadge,
    },
    {
      label: `${metPrefs}/${eligiblePrefs} preferences`,
      name: 'Overall Met',
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
      label: 'Distribution',
      name: 'Fairness',
      value: loading ? '—' : formatPercent(fairnessScore),
      badge: fairnessGrade ? getGradeBadge(fairnessGrade) : fairnessBadge,
    },
  ];

  // Extract quota warnings and violations
  const quotaWarnings = metadata?.quotaWarnings ?? [];
  const violations = metadata?.violations ?? [];

  // Helper to abbreviate crew name (First Last -> First L.)
  function abbreviateName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) return parts[0];
    const firstName = parts[0];
    const lastInitial = parts[parts.length - 1][0];
    return `${firstName} ${lastInitial}.`;
  }

  const renderStatCard = (stat: typeof stats[number]) => {
    const badgeColors = getBadgeColors(stat.badge.color);
    return (
      <div
        key={stat.name}
        className="ai-glass-border rounded-[1.5rem]"
        style={aiGlassLightBorderStyle('1.5rem')}
      >
        <div
          className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 rounded-[1.5rem]"
          style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '16px 20px' }}
        >
          <dt className="text-sm/6 font-medium text-gray-500">
            {'label' in stat && stat.label && (
              <span className="block text-xs text-gray-400 mb-0.5">{stat.label}</span>
            )}
            {stat.name}
          </dt>
          <dd>
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px', badgeColors.rgb, 0.4), width: 'fit-content' }}>
              <div className="flex items-center justify-center" style={{ ...aiGlassLightContentStyle('9999px', 0.6), backgroundColor: badgeColors.bgRgba, padding: '4px 12px' }}>
                <span className={`text-sm font-semibold font-sans ${badgeColors.textClass}`}>{stat.badge.label}</span>
              </div>
            </div>
          </dd>
          <dd className="w-full flex-none text-3xl/10 font-medium tracking-tight text-gray-900 mt-2">
            {stat.value}
          </dd>
        </div>
      </div>
    );
  };

  return (
    <div className="relative isolate overflow-hidden px-6 py-6">
      <dl className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        {/* Per-Crew Avg + Overall Met grouped for tutorial spotlight */}
        <div
          data-tutorial-id="preview-preferences-stats"
          className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4"
        >
          {renderStatCard(stats[0])}
          {renderStatCard(stats[1])}
        </div>
        {/* Runtime */}
        {renderStatCard(stats[2])}
        {/* Fairness */}
        <div data-tutorial-id="preview-fairness-stat">
          {renderStatCard(stats[3])}
        </div>
      </dl>

      {/* Quota Warnings Section */}
      {quotaWarnings.length > 0 && (
        <div className="mt-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {quotaWarnings.length} hard constraint{quotaWarnings.length === 1 ? '' : 's'} could not be fully met
              </p>
              <ul className="mt-2 text-sm text-gray-600 space-y-1">
                {quotaWarnings.map((warning, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <span className="text-gray-400">•</span>
                    <span>
                      <span className="font-medium text-gray-700">{abbreviateName(warning.crewName)}</span>
                      {' '}could only get {(warning.actualMinutes / 60).toFixed(1)}h of {warning.roleCode}{' '}
                      <span className="text-gray-400">(needed {(warning.requiredMinutes / 60).toFixed(1)}h)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Violations Section (if any) */}
      {violations.length > 0 && (
        <div className="mt-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">
                {violations.length} constraint violation{violations.length === 1 ? '' : 's'} detected
              </p>
              <ul className="mt-2 text-sm text-gray-600 space-y-1">
                {violations.map((violation, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <span className="text-red-400">•</span>
                    <span>{violation}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

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
