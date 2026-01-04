'use client';

import { ChevronDown } from 'lucide-react';
import { type TimeInterval } from './RoleGiniGraph';

// =============================================================================
// Types
// =============================================================================

export interface TimeIntervalOption {
  value: TimeInterval;
  label: string;
  days: number;
}

export interface TimeIntervalSelectorProps {
  value: TimeInterval;
  onChange: (interval: TimeInterval) => void;
  className?: string;
}

// =============================================================================
// Constants
// =============================================================================

export const TIME_INTERVAL_OPTIONS: TimeIntervalOption[] = [
  { value: '1w', label: 'Last 7 days', days: 7 },
  { value: '1m', label: 'Last 30 days', days: 30 },
  { value: '1y', label: 'Last year', days: 365 },
  { value: '2y', label: 'Last 2 years', days: 730 },
  { value: 'all', label: 'All time', days: Infinity },
];

/**
 * Get the number of days for a time interval.
 */
export function getIntervalDays(interval: TimeInterval): number {
  const option = TIME_INTERVAL_OPTIONS.find(o => o.value === interval);
  return option?.days ?? 30;
}

/**
 * Get the label for a time interval.
 */
export function getIntervalLabel(interval: TimeInterval): string {
  const option = TIME_INTERVAL_OPTIONS.find(o => o.value === interval);
  return option?.label ?? 'Last 30 days';
}

// =============================================================================
// Component
// =============================================================================

export function TimeIntervalSelector({
  value,
  onChange,
  className = '',
}: TimeIntervalSelectorProps) {
  return (
    <div className={`relative inline-block ${className}`}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as TimeInterval)}
        className="appearance-none rounded-lg border border-gray-300 bg-white pl-3 pr-9 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 cursor-pointer"
      >
        {TIME_INTERVAL_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
    </div>
  );
}
