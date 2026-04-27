/**
 * Production Solver Configuration
 * 
 * Centralized configuration for the OR-Tools CP-SAT solver.
 * Tested and optimized on December 25, 2025.
 */

// =============================================================================
// TUNING ENGINE CONFIG (Parallel Region Search)
// =============================================================================

export const TUNING_CONFIG = {
  /**
   * Number of parallel regions for portfolio search.
   * Each region explores a different part of the solution space.
   * 
   * Tested: 8, 10, 12, 14, 16
   * Optimal: 12 (best speed/quality balance on 8-core machines)
   */
  numRegions: 12,

  /**
   * Ladder iterations per region.
   * Each shot improves upon the previous with tighter time limits.
   * 
   * Tested: 1, 2, 3, 5
   * Optimal: 3 (diminishing returns after 3)
   */
  shotsPerRegion: 3,

  /**
   * Time limit per solve shot in seconds.
   * Longer = better quality, shorter = faster iteration.
   * 
   * Tested: 10, 15, 20, 30
   * Optimal: 15 (good balance, ~45s total per region)
   */
  timeLimitPerShot: 15,

  /**
   * Solver workers per region (parallelism within each region).
   * 1 = deterministic, >1 = faster but non-deterministic.
   * 
   * Optimal: 1 (determinism preferred for reproducibility)
   */
  workersPerRegion: 1,

  /**
   * Weight for fairness in the scoring function (0-1).
   * Higher = prioritize fairness over other objectives.
   * 
   * Optimal: 0.5 (balanced with constraint satisfaction)
   */
  fairnessWeight: 0.5,
} as const;


// =============================================================================
// SINGLE-SHOT SOLVER CONFIG (Direct CP-SAT)
// =============================================================================

export const SOLVER_CONFIG = {
  /**
   * Default time limit for single-shot solves.
   * Used when not using the tuning engine.
   */
  timeLimitSeconds: 120,

  /**
   * Number of parallel workers (undefined = use CPU count)
   */
  numWorkers: undefined as number | undefined,
} as const;


// =============================================================================
// FAIRNESS SYSTEM CONFIG
// =============================================================================

export const FAIRNESS_CONFIG = {
  /**
   * Enable tiered rotation boost for tracked roles.
   * When true, applies BASE_BOOST to crew who haven't had the role recently.
   * This is the primary mechanism for driving Gini toward 0.
   * 
   * CRITICAL: Must be true for fairness convergence.
   */
  enableHardFairness: true,

  /**
   * Base boost for tiered rotation system.
   * Boost applied to prioritize crew who haven't had the role recently.
   * Lower = more preference satisfaction, Higher = faster Gini convergence.
   * 
   * Tested (Dec 26, 2025) - Comprehensive sweep from 10,000 down to 25:
   * 
   * Phase 1: Coarse sweep (5-day tests)
   * | BASE_BOOST | Day 5 Gini | Avg Sat |
   * |------------|------------|---------|
   * | 10,000     | 0.475      | 62.8%   |
   * | 5,000      | 0.412      | 62.3%   |
   * | 2,500      | 0.389      | 62.9%   |
   * | 1,000      | 0.385      | 63.6%   |
   * | 500        | 0.368      | 66.2%   |
   * | 100        | 0.489      | 64.6%   | ← Too low, Gini gets worse
   * 
   * Phase 2: Fine-grained 1000→500 (5-day tests)
   * | BASE_BOOST | Day 5 Gini | Avg Sat |
   * |------------|------------|---------|
   * | 850        | 0.333      | 64.1%   |
   * | 700        | 0.365      | 66.4%   | ← Peak satisfaction region
   * 
   * Phase 3: Ultra-fine 750→700 (10-day tests)
   * | BASE_BOOST | Final Gini | Avg Sat |
   * |------------|------------|---------|
   * | 750        | 0.233      | 61.8%   |
   * | 740        | 0.264      | 63.3%   | ← Best balance
   * | 730        | 0.256      | 63.2%   |
   * | 720        | 0.252      | 62.9%   |
   * | 710        | 0.264      | 62.2%   |
   * | 700        | 0.275      | 61.9%   |
   * 
   * Phase 4: 31-day validation at 740
   * - Final Gini: 0.203
   * - Avg Satisfaction: 64.1%
   * - Stabilization: Day 11
   * - Peak Satisfaction: 72.7% (Day 22)
   * 
   * Key findings:
   * - U-curve exists: too high OR too low hurts performance
   * - Sweet spot: 700-750 range
   * - 740 optimal: best balance of Gini convergence + satisfaction
   */
  fairnessBaseBoost: 740,

  /**
   * Z-score based boost for under-assigned crew (positive z-score).
   * Applied per-slot based on deviation from mean.
   * 
   * Tested: 100, 300, 500
   * Optimal: 300 (noticeable but doesn't override hard constraints)
   */
  fairnessBoost: 300,

  /**
   * Z-score based penalty for over-assigned crew (negative z-score).
   * Applied per-slot to discourage giving roles to crew who already have many.
   * 
   * Optimal: 300 (symmetric with boost)
   */
  fairnessPenalty: 300,
} as const;


// =============================================================================
// LNS (Large Neighborhood Search) CONFIG
// =============================================================================

export const LNS_CONFIG = {
  /**
   * Enable LNS for better solution exploration.
   * When true, uses CP-SAT's built-in LNS for local refinement.
   * 
   * CRITICAL: Should always be true for production.
   */
  useLns: true,
} as const;


// =============================================================================
// TRACKED ROLES (for fairness)
// =============================================================================

export const TRACKED_ROLE_IDS = {
  /**
   * Roles that have fairness tracking enabled.
   * These roles get the tiered rotation boost and z-score adjustments.
   */
  PARKING_HELMS: 29,
  WINE_DEMO: 37,
  FOOD_DEMO: 38,
} as const;

export const ALL_TRACKED_ROLE_IDS = Object.values(TRACKED_ROLE_IDS);


// =============================================================================
// COMBINED PRODUCTION CONFIG
// =============================================================================

/**
 * Full production configuration for the solver.
 * Use this when calling the tune or solve endpoints.
 */
export const PRODUCTION_CONFIG = {
  tuning: TUNING_CONFIG,
  solver: SOLVER_CONFIG,
  fairness: FAIRNESS_CONFIG,
  lns: LNS_CONFIG,
  trackedRoles: ALL_TRACKED_ROLE_IDS,
} as const;

/**
 * Settings object to pass to solverInput.settings
 */
export const PRODUCTION_SOLVER_SETTINGS = {
  enableHardFairness: FAIRNESS_CONFIG.enableHardFairness,
  fairnessBaseBoost: FAIRNESS_CONFIG.fairnessBaseBoost,
  fairnessBoost: FAIRNESS_CONFIG.fairnessBoost,
  fairnessPenalty: FAIRNESS_CONFIG.fairnessPenalty,
  intraDayBlockSpreadPenalty: 2000,
} as const;

/**
 * Tuning config to pass to the /solver/v2/tune endpoint
 */
export const PRODUCTION_TUNING_CONFIG = {
  numRegions: TUNING_CONFIG.numRegions,
  shotsPerRegion: TUNING_CONFIG.shotsPerRegion,
  timeLimitPerShot: TUNING_CONFIG.timeLimitPerShot,
  workersPerRegion: TUNING_CONFIG.workersPerRegion,
  fairnessWeight: TUNING_CONFIG.fairnessWeight,
} as const;


// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type TuningConfigType = typeof TUNING_CONFIG;
export type SolverConfigType = typeof SOLVER_CONFIG;
export type FairnessConfigType = typeof FAIRNESS_CONFIG;
export type ProductionConfigType = typeof PRODUCTION_CONFIG;
