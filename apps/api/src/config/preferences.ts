// Preference validation configuration - easily tunable for extensive testing
export const PREFERENCE_CONFIG = {
  // Weight ranges for preference strengths (0-4 is typical, but can be adjusted)
  weightRange: {
    min: parseInt(process.env.PREFERENCE_WEIGHT_MIN || '0'),
    max: parseInt(process.env.PREFERENCE_WEIGHT_MAX || '4')
  },

  // Valid task types - automatically includes all enum values from schema
  validTasks: ['REGISTER', 'PRODUCT'] as const,

  // Add new validation rules here as needed for tuning
  allowNegativeWeights: process.env.ALLOW_NEGATIVE_WEIGHTS === 'true',
  customValidationEnabled: process.env.CUSTOM_VALIDATION === 'true',
} as const;

export type PreferenceConfig = typeof PREFERENCE_CONFIG;

// ============================================================================
// ADVANCED PREFERENCE OPTIMIZATION FEATURES
// ============================================================================

/**
 * Configuration for maximizing crew satisfaction through optimal preference distribution
 * These parameters help balance individual preferences against overall schedule quality
 */
export const SATISFACTION_TUNING = {
  
  // 1. WEIGHT SCALING STRATEGIES
  // Different approaches to interpret and scale preference weights
  weightScaling: {
    // Linear: weight * multiplier (simple, predictable)
    // Exponential: base^weight (emphasizes strong preferences more)
    // Logarithmic: log(weight + 1) * multiplier (diminishing returns on high weights)
    strategy: (process.env.WEIGHT_SCALING_STRATEGY || 'linear') as 'linear' | 'exponential' | 'logarithmic',
    
    // Multipliers for each strategy
    linearMultiplier: parseFloat(process.env.LINEAR_MULTIPLIER || '100'),
    exponentialBase: parseFloat(process.env.EXPONENTIAL_BASE || '2.5'),
    logMultiplier: parseFloat(process.env.LOG_MULTIPLIER || '150'),
  },

  // 2. FAIRNESS BALANCING
  // Ensure preferences are distributed equitably across all crew
  fairness: {
    // Enable fairness constraints (prevents one person from getting all preferences)
    enabled: process.env.ENABLE_FAIRNESS === 'true',
    
    // Minimum satisfaction score each crew member should achieve (0-1)
    minSatisfactionPerCrew: parseFloat(process.env.MIN_SATISFACTION_PER_CREW || '0.3'),
    
    // Maximum variance allowed in satisfaction scores (lower = more equal)
    maxSatisfactionVariance: parseFloat(process.env.MAX_SATISFACTION_VARIANCE || '0.2'),
    
    // Penalty for violating fairness (added to objective)
    fairnessViolationPenalty: parseFloat(process.env.FAIRNESS_PENALTY || '1000'),
  },

  // 3. PREFERENCE PRIORITIZATION
  // Weight different preference types differently based on importance
  preferenceWeights: {
    // Multiplier for first hour task preference (high impact on day start)
    firstHourMultiplier: parseFloat(process.env.FIRST_HOUR_WEIGHT || '1.5'),
    
    // Multiplier for general task preference (affects entire shift)
    taskPreferenceMultiplier: parseFloat(process.env.TASK_PREF_WEIGHT || '1.0'),
    
    // Multiplier for break timing preference (quality of life)
    breakTimingMultiplier: parseFloat(process.env.BREAK_TIMING_WEIGHT || '1.2'),
    
    // Penalty multiplier for consecutive task switches (fatigue factor)
    consecutiveSwitchPenalty: parseFloat(process.env.SWITCH_PENALTY || '0.8'),
  },

  // 4. ADAPTIVE WEIGHT ADJUSTMENT
  // Dynamically adjust weights based on crew history and patterns
  adaptive: {
    enabled: process.env.ENABLE_ADAPTIVE_WEIGHTS === 'true',
    
    // Boost weights for crew who rarely get preferences met
    boostUnsatisfiedCrew: process.env.BOOST_UNSATISFIED === 'true',
    boostMultiplier: parseFloat(process.env.BOOST_MULTIPLIER || '1.3'),
    
    // Reduce weights for crew who frequently get preferences met
    dampOverSatisfied: process.env.DAMP_OVERSATISFIED === 'true',
    dampMultiplier: parseFloat(process.env.DAMP_MULTIPLIER || '0.7'),
    
    // Number of past schedules to consider for history
    historyWindowDays: parseInt(process.env.HISTORY_WINDOW_DAYS || '14'),
  },

  // 5. CONFLICT RESOLUTION
  // How to handle when multiple crew have conflicting preferences
  conflictResolution: {
    // Strategy: 'rotation', 'seniority', 'random', 'highest-weight'
    strategy: (process.env.CONFLICT_STRATEGY || 'rotation') as 'rotation' | 'seniority' | 'random' | 'highest-weight',
    
    // For rotation: ensure fair distribution over time
    rotationCycleDays: parseInt(process.env.ROTATION_CYCLE || '7'),
    
    // Enable preference "banking" - save unmet preferences for future use
    enablePreferenceBanking: process.env.ENABLE_BANKING === 'true',
    bankingCarryoverDays: parseInt(process.env.BANKING_CARRYOVER_DAYS || '30'),
  },

  // 6. SOFT VS HARD CONSTRAINTS
  // Control how strictly preferences are enforced
  constraintTypes: {
    // Treat all preferences as soft (optimize but don't require)
    allSoftPreferences: process.env.ALL_SOFT_PREFS !== 'false',
    
    // Weight threshold to treat as "hard" constraint (must satisfy)
    hardConstraintThreshold: parseInt(process.env.HARD_CONSTRAINT_THRESHOLD || '4'),
    
    // Penalty for violating a "hard" preference
    hardViolationPenalty: parseFloat(process.env.HARD_VIOLATION_PENALTY || '10000'),
  },

  // 7. DIVERSITY INCENTIVES
  // Encourage variety in task assignments for crew development
  diversity: {
    enabled: process.env.ENABLE_DIVERSITY === 'true',
    
    // Reward for assigning crew to different task types
    diversityBonus: parseFloat(process.env.DIVERSITY_BONUS || '50'),
    
    // Minimum number of different task types per shift
    minTaskTypesPerShift: parseInt(process.env.MIN_TASK_TYPES || '2'),
    
    // Balance between preference satisfaction and diversity (0-1)
    // 0 = all preference, 1 = all diversity
    diversityWeight: parseFloat(process.env.DIVERSITY_WEIGHT || '0.2'),
  },

  // 8. TEMPORAL PREFERENCES
  // Handle time-based preference patterns
  temporal: {
    // Boost morning preferences for "morning people"
    morningPersonBoost: parseFloat(process.env.MORNING_BOOST || '1.2'),
    
    // Boost evening preferences for "evening people"
    eveningPersonBoost: parseFloat(process.env.EVENING_BOOST || '1.2'),
    
    // Hours considered "morning" and "evening"
    morningHours: [8, 9, 10, 11],
    eveningHours: [17, 18, 19, 20],
  },

  // 9. SATISFACTION METRICS
  // Track and optimize for different satisfaction measures
  metrics: {
    // Calculate individual satisfaction score for each crew member
    trackIndividualScores: process.env.TRACK_INDIVIDUAL === 'true',
    
    // Target metrics: 'average', 'median', 'min-max', 'pareto-optimal'
    optimizationTarget: (process.env.OPTIMIZATION_TARGET || 'median') as 'average' | 'median' | 'min-max' | 'pareto-optimal',
    
    // Export satisfaction reports for analysis
    exportReports: process.env.EXPORT_SATISFACTION_REPORTS === 'true',
    reportPath: process.env.REPORT_PATH || './satisfaction_reports',
  },

  // 10. REAL-TIME TUNING PARAMETERS
  // Live adjustments during optimization
  realtime: {
    // Enable dynamic weight adjustment during solve
    dynamicAdjustment: process.env.ENABLE_DYNAMIC_ADJUSTMENT === 'true',
    
    // If satisfaction < threshold, increase preference weights
    lowSatisfactionThreshold: parseFloat(process.env.LOW_SAT_THRESHOLD || '0.4'),
    weightBoostFactor: parseFloat(process.env.WEIGHT_BOOST_FACTOR || '1.5'),
    
    // Maximum solver iterations to find optimal distribution
    maxOptimizationIterations: parseInt(process.env.MAX_OPT_ITERATIONS || '3'),
  },

} as const;

/**
 * Utility function to calculate scaled preference weight based on strategy
 */
export function calculateScaledWeight(baseWeight: number | null | undefined, preferenceType: 'firstHour' | 'task' | 'breakTiming'): number {
  // Treat null/undefined as 0 (no preference)
  if (baseWeight == null) {
    return 0;
  }
  
  const { weightScaling, preferenceWeights } = SATISFACTION_TUNING;
  
  // Apply base scaling strategy
  let scaledWeight = baseWeight;
  switch (weightScaling.strategy) {
    case 'exponential':
      scaledWeight = Math.pow(weightScaling.exponentialBase, baseWeight);
      break;
    case 'logarithmic':
      scaledWeight = Math.log(baseWeight + 1) * weightScaling.logMultiplier;
      break;
    case 'linear':
    default:
      scaledWeight = baseWeight * weightScaling.linearMultiplier;
  }
  
  // Apply preference-type multiplier
  const multiplier = 
    preferenceType === 'firstHour' ? preferenceWeights.firstHourMultiplier :
    preferenceType === 'breakTiming' ? preferenceWeights.breakTimingMultiplier :
    preferenceWeights.taskPreferenceMultiplier;
  
  return scaledWeight * multiplier;
}

/**
 * Utility to check if a preference should be treated as a hard constraint
 */
export function isHardConstraint(weight: number): boolean {
  return !SATISFACTION_TUNING.constraintTypes.allSoftPreferences &&
         weight >= SATISFACTION_TUNING.constraintTypes.hardConstraintThreshold;
}