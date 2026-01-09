/**
 * Lorenz Curve Generator
 *
 * Generates Lorenz curve data for visualizing inequality/fairness distribution.
 * Used to show how work is distributed across crew members.
 */

import type { LorenzCurvePoint } from '../types';

/**
 * Generate Lorenz curve points from work distribution data
 *
 * The Lorenz curve plots cumulative population share vs cumulative work share.
 * Perfect equality = diagonal line from (0,0) to (1,1).
 * Greater inequality = curve bows further from diagonal.
 *
 * @param minutesWorkedByCrew Map of crewId to total minutes worked on a specific role
 * @returns Array of Lorenz curve points, including endpoints (0,0) and (1,1)
 *
 * @example
 * // Equal distribution: 3 crew each work 60 minutes
 * buildLorenzCurve(new Map([['A', 60], ['B', 60], ['C', 60]]))
 * // Returns points close to diagonal: [(0,0), (0.33,0.33), (0.67,0.67), (1,1)]
 *
 * @example
 * // Unequal distribution: one crew works 180, others work 0
 * buildLorenzCurve(new Map([['A', 180], ['B', 0], ['C', 0]]))
 * // Returns curve bowed from diagonal: [(0,0), (0.33,0), (0.67,0), (1,1)]
 */
export function buildLorenzCurve(
  minutesWorkedByCrew: Map<string, number>
): LorenzCurvePoint[] {
  const entries = Array.from(minutesWorkedByCrew.entries());

  // Handle edge cases
  if (entries.length === 0) {
    return [
      { populationShare: 0, workShare: 0 },
      { populationShare: 1, workShare: 1 },
    ];
  }

  // Sort crew by minutes worked (ascending)
  const sortedEntries = entries.sort((a, b) => a[1] - b[1]);

  // Calculate total work
  const totalWork = sortedEntries.reduce((sum, [, minutes]) => sum + minutes, 0);

  // Handle degenerate case: no work done
  if (totalWork === 0) {
    return [
      { populationShare: 0, workShare: 0 },
      { populationShare: 1, workShare: 1 },
    ];
  }

  // Build curve points
  const points: LorenzCurvePoint[] = [];
  const populationCount = sortedEntries.length;

  // Start at origin
  points.push({ populationShare: 0, workShare: 0 });

  // Add cumulative points for each crew member
  let cumulativeWork = 0;
  sortedEntries.forEach(([, minutes], index) => {
    cumulativeWork += minutes;

    const populationShare = (index + 1) / populationCount;
    const workShare = cumulativeWork / totalWork;

    points.push({
      populationShare,
      workShare,
    });
  });

  return points;
}

/**
 * Calculate Gini coefficient from Lorenz curve points
 *
 * Gini coefficient = 2 * (area between diagonal and Lorenz curve)
 * Range: 0 (perfect equality) to 1 (maximum inequality)
 *
 * @param points Lorenz curve points
 * @returns Gini coefficient (0-1)
 */
export function calculateGiniFromLorenzCurve(points: LorenzCurvePoint[]): number {
  if (points.length <= 2) return 0;

  // Calculate area under Lorenz curve using trapezoidal rule
  let areaUnderCurve = 0;

  for (let i = 1; i < points.length; i++) {
    const x1 = points[i - 1].populationShare;
    const x2 = points[i].populationShare;
    const y1 = points[i - 1].workShare;
    const y2 = points[i].workShare;

    // Trapezoid area: (base * average height)
    const trapezoidArea = (x2 - x1) * (y1 + y2) / 2;
    areaUnderCurve += trapezoidArea;
  }

  // Area under perfect equality line (diagonal): 0.5
  const areaUnderDiagonal = 0.5;

  // Gini = 2 * (area between diagonal and curve)
  // = 2 * (areaUnderDiagonal - areaUnderCurve)
  const gini = 2 * (areaUnderDiagonal - areaUnderCurve);

  // Clamp to [0, 1] to handle floating point errors
  return Math.max(0, Math.min(1, gini));
}

/**
 * Calculate Gini coefficient directly from work distribution
 *
 * @param minutesWorkedByCrew Map of crewId to minutes worked
 * @returns Gini coefficient (0-1)
 */
export function calculateGini(minutesWorkedByCrew: Map<string, number>): number {
  const lorenzCurve = buildLorenzCurve(minutesWorkedByCrew);
  return calculateGiniFromLorenzCurve(lorenzCurve);
}

/**
 * Convert Gini coefficient to fairness index (percentage)
 *
 * FairnessIndex = 100 - (Gini * 100)
 * Range: 0 (max inequality) to 100 (perfect equality)
 *
 * @param gini Gini coefficient (0-1)
 * @param maxPossibleFairnessScore Maximum possible fairness score (default: 100)
 * @returns Fairness index percentage (0-100)
 */
export function giniToFairnessIndex(
  gini: number,
  maxPossibleFairnessScore: number = 100
): number {
  return 100 - (gini / (maxPossibleFairnessScore / 100)) * 100;
}
