'use client';

import { ChevronDown } from 'lucide-react';
import { type TimeInterval } from './RoleGiniGraph';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

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
      <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08)}>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as TimeInterval)}
          style={{
            ...aiGlassLightContentStyle('9999px', 0.6),
            padding: '8px 32px 8px 14px',
            border: 'none',
            outline: 'none',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '14px',
            color: '#2C2C2C',
            fontWeight: 500,
            cursor: 'pointer',
            appearance: 'none',
          }}
        >
          {TIME_INTERVAL_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
    </div>
  );
}
