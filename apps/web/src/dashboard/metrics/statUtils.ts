/**
 * Statistical Utilities
 *
 * Pure functions for common statistical operations used in dashboard metrics.
 * All functions handle edge cases (empty arrays, single values, etc.).
 */

/**
 * Calculate median of an array of numbers
 * @param values Array of numbers
 * @returns Median value, or 0 if empty
 */
export function median(values: number[]): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    // Even length: average of two middle values
    return (sorted[mid - 1] + sorted[mid]) / 2;
  } else {
    // Odd length: middle value
    return sorted[mid];
  }
}

/**
 * Calculate mean (average) of an array of numbers
 * @param values Array of numbers
 * @returns Mean value, or 0 if empty
 */
export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

/**
 * Calculate standard deviation (population)
 * @param values Array of numbers
 * @returns Standard deviation, or 0 if empty or single value
 */
export function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;

  const avg = mean(values);
  const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
  const variance = mean(squaredDiffs);

  return Math.sqrt(variance);
}

/**
 * Calculate standard deviation (sample)
 * Uses N-1 denominator (Bessel's correction)
 * @param values Array of numbers
 * @returns Sample standard deviation, or 0 if empty or single value
 */
export function stdDevSample(values: number[]): number {
  if (values.length <= 1) return 0;

  const avg = mean(values);
  const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
  const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / (values.length - 1);

  return Math.sqrt(variance);
}

/**
 * Sum an array of numbers
 * @param values Array of numbers
 * @returns Sum of all values
 */
export function sum(values: number[]): number {
  return values.reduce((total, val) => total + val, 0);
}

/**
 * Find minimum value in array
 * @param values Array of numbers
 * @returns Minimum value, or 0 if empty
 */
export function min(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.min(...values);
}

/**
 * Find maximum value in array
 * @param values Array of numbers
 * @returns Maximum value, or 0 if empty
 */
export function max(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.max(...values);
}

/**
 * Ranking item with value and tiebreaker
 */
export interface RankableItem<T = string> {
  id: T;
  value: number;
}

/**
 * Rank items by value (descending), with tiebreaker by id (ascending)
 * Returns map of id → rank (1-indexed)
 *
 * @param items Items to rank
 * @returns Map of id to rank (1 = highest value)
 *
 * @example
 * rankByValue([
 *   { id: 'B', value: 100 },
 *   { id: 'A', value: 100 },
 *   { id: 'C', value: 50 }
 * ])
 * // Returns: Map { 'A' => 1, 'B' => 2, 'C' => 3 }
 * // A ranks before B due to lexicographic tiebreaker
 */
export function rankByValue<T extends string | number>(
  items: RankableItem<T>[]
): Map<T, number> {
  if (items.length === 0) return new Map();

  // Sort by value descending, then by id ascending (tiebreaker)
  const sorted = [...items].sort((a, b) => {
    if (b.value !== a.value) {
      return b.value - a.value; // Higher value = lower rank number
    }
    // Tiebreaker: lexicographic comparison of id
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
  });

  // Assign ranks (1-indexed)
  const ranks = new Map<T, number>();
  sorted.forEach((item, index) => {
    ranks.set(item.id, index + 1);
  });

  return ranks;
}

/**
 * Calculate percentage safely, handling division by zero
 * @param numerator Numerator
 * @param denominator Denominator
 * @returns Percentage (0-100), or 0 if denominator is 0
 */
export function percentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return (numerator / denominator) * 100;
}

/**
 * Calculate percentage change from baseline
 * @param value Current value
 * @param baseline Baseline value
 * @returns Percentage change, or 0 if baseline is 0
 *
 * @example
 * percentageChange(150, 100) // Returns 50 (50% increase)
 * percentageChange(75, 100)  // Returns -25 (25% decrease)
 */
export function percentageChange(value: number, baseline: number): number {
  if (baseline === 0) return 0;
  return ((value - baseline) / baseline) * 100;
}

/**
 * Clamp a value between min and max
 * @param value Value to clamp
 * @param minValue Minimum allowed value
 * @param maxValue Maximum allowed value
 * @returns Clamped value
 */
export function clamp(value: number, minValue: number, maxValue: number): number {
  return Math.max(minValue, Math.min(maxValue, value));
}

/**
 * Round to specified number of decimal places
 * @param value Value to round
 * @param decimals Number of decimal places (default: 2)
 * @returns Rounded value
 */
export function round(value: number, decimals: number = 2): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Calculate quantiles (percentiles) of a dataset
 * @param values Array of numbers
 * @param quantile Quantile to calculate (0-1, e.g., 0.5 for median)
 * @returns Value at specified quantile, or 0 if empty
 *
 * @example
 * quantile([1, 2, 3, 4, 5], 0.5) // Returns 3 (median)
 * quantile([1, 2, 3, 4, 5], 0.25) // Returns 2 (25th percentile)
 */
export function quantile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  if (quantile <= 0) return min(values);
  if (quantile >= 1) return max(values);

  const sorted = [...values].sort((a, b) => a - b);
  const index = quantile * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) {
    return sorted[lower];
  }

  // Linear interpolation between two closest values
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Group items by a key function
 * @param items Items to group
 * @param keyFn Function to extract grouping key
 * @returns Map of key to array of items
 *
 * @example
 * groupBy(
 *   [{ role: 'A', min: 10 }, { role: 'B', min: 20 }, { role: 'A', min: 15 }],
 *   item => item.role
 * )
 * // Returns: Map { 'A' => [{role:'A',min:10}, {role:'A',min:15}], 'B' => [{role:'B',min:20}] }
 */
export function groupBy<T, K extends string | number>(
  items: T[],
  keyFn: (item: T) => K
): Map<K, T[]> {
  const groups = new Map<K, T[]>();

  for (const item of items) {
    const key = keyFn(item);
    const group = groups.get(key);

    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}
