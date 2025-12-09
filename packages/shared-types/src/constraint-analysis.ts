export type ConstraintViolationSeverity = 'error' | 'warning' | 'info';

export type ConstraintViolationCategory =
  | 'coverage'
  | 'quota'
  | 'hourly'
  | 'window'
  | 'daily'
  | 'outside-hours'
  | 'shift'
  | 'slot-block'
  | 'consecutive'
  | 'preference'
  | 'consistency'
  | 'other';

export interface ConstraintViolation {
  severity: ConstraintViolationSeverity;
  category: ConstraintViolationCategory;
  message: string;
  details?: Record<string, unknown>;
}

export interface PreferenceSatisfactionSummary {
  totalPreferences: number;
  satisfiedPreferences: number;
  weightedScore: number;
}

export interface ConstraintAnalysisSummary {
  violations: ConstraintViolation[];
  summaryLines: string[];
  preferenceSummary?: PreferenceSatisfactionSummary;
}
