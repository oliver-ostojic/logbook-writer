/**
 * Bucket Distribution Generator
 *
 * Creates quantile-based (equal-frequency) buckets for histogram visualization.
 * Used to show how crew members are distributed across different work amounts.
 */

import type { DistributionBucket } from '../types';
import { quantile } from './statUtils';

/**
 * Build quantile-based distribution buckets
 *
 * Creates buckets with approximately equal number of crew members in each bucket.
 * Bucket count is adaptive based on crew count:
 *   - min(10, max(4, floor(sqrt(crewCount))))
 *
 * @param minutesWorkedByCrew Map of crewId to minutes worked
 * @returns Array of distribution buckets
 *
 * @example
 * // 9 crew: bucketCount = floor(sqrt(9)) = 3
 * buildBucketDistribution(new Map([
 *   ['A', 0], ['B', 10], ['C', 20],
 *   ['D', 30], ['E', 40], ['F', 50],
 *   ['G', 60], ['H', 70], ['I', 80]
 * ]))
 * // Returns 3 buckets, each with ~3 crew
 */
export function buildBucketDistribution(
  minutesWorkedByCrew: Map<string, number>
): DistributionBucket[] {
  const entries = Array.from(minutesWorkedByCrew.entries());
  const crewCount = entries.length;

  // Handle empty case
  if (crewCount === 0) {
    return [];
  }

  // Extract minutes values
  const minutesValues = entries.map(([, minutes]) => minutes);

  // Handle degenerate case: all crew have identical values
  const uniqueValues = new Set(minutesValues);
  if (uniqueValues.size === 1) {
    const value = minutesValues[0];
    return [
      {
        minInclusive: value,
        maxExclusive: value + 1, // Slightly above to make it inclusive in practice
        crewCount,
      },
    ];
  }

  // Calculate adaptive bucket count
  const bucketCount = Math.min(10, Math.max(4, Math.floor(Math.sqrt(crewCount))));

  // Build quantile boundaries
  const boundaries: number[] = [];
  for (let i = 0; i <= bucketCount; i++) {
    const q = i / bucketCount;
    boundaries.push(quantile(minutesValues, q));
  }

  // Build buckets from boundaries
  const buckets: DistributionBucket[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const minInclusive = boundaries[i];
    const maxExclusive = boundaries[i + 1];

    // Count crew in this bucket
    // For last bucket, include max value (closed interval)
    const isLastBucket = i === bucketCount - 1;
    const count = minutesValues.filter(minutes => {
      if (isLastBucket) {
        return minutes >= minInclusive && minutes <= maxExclusive;
      } else {
        return minutes >= minInclusive && minutes < maxExclusive;
      }
    }).length;

    // Only include non-empty buckets (can happen with repeated values)
    if (count > 0) {
      buckets.push({
        minInclusive,
        maxExclusive,
        crewCount: count,
      });
    }
  }

  // Merge adjacent buckets with identical boundaries (handles edge case of many repeated values)
  const mergedBuckets: DistributionBucket[] = [];
  let currentBucket: DistributionBucket | null = null;

  for (const bucket of buckets) {
    if (!currentBucket) {
      currentBucket = { ...bucket };
    } else if (currentBucket.maxExclusive === bucket.minInclusive) {
      // Extend current bucket
      currentBucket.maxExclusive = bucket.maxExclusive;
      currentBucket.crewCount += bucket.crewCount;
    } else {
      // Save current bucket and start new one
      mergedBuckets.push(currentBucket);
      currentBucket = { ...bucket };
    }
  }

  // Don't forget the last bucket
  if (currentBucket) {
    mergedBuckets.push(currentBucket);
  }

  return mergedBuckets.length > 0 ? mergedBuckets : buckets;
}

/**
 * Format bucket label for display
 *
 * @param bucket Distribution bucket
 * @returns Human-readable label (e.g., "30-60 min", "120+ min")
 */
export function formatBucketLabel(bucket: DistributionBucket): string {
  const minLabel = Math.round(bucket.minInclusive);
  const maxLabel = Math.round(bucket.maxExclusive);

  if (maxLabel === minLabel + 1) {
    // Single value bucket
    return `${minLabel} min`;
  }

  return `${minLabel}-${maxLabel} min`;
}

/**
 * Get bucket index for a specific minutes value
 *
 * @param minutes Minutes value
 * @param buckets Array of distribution buckets
 * @returns Bucket index (0-based), or -1 if not found
 */
export function getBucketIndex(
  minutes: number,
  buckets: DistributionBucket[]
): number {
  for (let i = 0; i < buckets.length; i++) {
    const bucket = buckets[i];
    const isLastBucket = i === buckets.length - 1;

    if (isLastBucket) {
      // Last bucket: inclusive on both ends
      if (minutes >= bucket.minInclusive && minutes <= bucket.maxExclusive) {
        return i;
      }
    } else {
      // Other buckets: inclusive min, exclusive max
      if (minutes >= bucket.minInclusive && minutes < bucket.maxExclusive) {
        return i;
      }
    }
  }

  return -1;
}
