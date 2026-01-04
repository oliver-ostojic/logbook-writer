# High Satisfaction Learning System

**Status:** Future Implementation  
**Created:** December 26, 2025  
**Branch:** ml-schedule-learning

## The Idea

Capture high-satisfaction solver outputs and study them to understand what conditions and patterns lead to better schedules. Learn from the best results to replicate success.

## The Challenge

CP-SAT has inherent randomness in how it explores the solution space. The *path* to a solution (branch-and-bound decisions, LNS neighborhoods) isn't deterministic, so we can't simply replay "the steps that worked."

## What IS Learnable

Despite solver randomness, we can capture and analyze:

### 1. The Solution Itself
- Full assignment matrix (who got what role, when)
- Patterns in successful schedules
- Which crew-role pairings appear in high-sat days

### 2. Input Characteristics
What did the day look like when we got 72.7% satisfaction?
- Crew mix (experience levels, preference distributions)
- Shift structure (slot count, time distribution)
- Constraint density (how constrained was the problem?)
- Gini state going in (were rotation counts already balanced?)

### 3. Preference Alignment Patterns
- Which preference types got satisfied vs sacrificed?
- Role preferences vs time preferences vs coworker preferences
- Preference conflict density

### 4. Constraint Tightness
- Which constraints were "tight" (binding) vs slack?
- What's blocking even higher satisfaction?

## Proposed Approaches

| Approach | What We Capture | What We Learn |
|----------|-----------------|---------------|
| **Solution Mining** | Full assignment matrix on high-sat days | Common patterns in "good" schedules |
| **Feature Correlation** | Input features → satisfaction score | Which input conditions predict high scores |
| **Constraint Relaxation Study** | Which constraints were tight vs slack | What's blocking higher satisfaction |
| **Preference Portfolio Analysis** | Satisfaction breakdown by preference type | Which preferences are easy/hard to satisfy |

## Implementation Plan

### Phase 1: Logging Infrastructure
```typescript
interface HighSatLog {
  // Metadata
  date: string;
  storeId: number;
  satisfactionScore: number;
  giniCoefficient: number;
  
  // Input snapshot
  input: {
    crewCount: number;
    slotCount: number;
    constraintCount: number;
    preferenceCount: number;
    constraintDensity: number;  // constraints per slot
    preferenceDensity: number;  // preferences per crew
    giniIncoming: number;
  };
  
  // Output snapshot
  output: {
    assignments: Assignment[];
    satisfiedPreferences: PreferenceResult[];
    unsatisfiedPreferences: PreferenceResult[];
    tightConstraints: string[];
    slackConstraints: string[];
  };
  
  // Solver metadata
  solver: {
    regionWinner: number;
    objectiveValue: number;
    timeToSolve: number;
    baseBoost: number;
  };
}
```

### Phase 2: Threshold-Based Capture
- Define "high satisfaction" threshold (e.g., > 70%)
- Automatically log full context when threshold exceeded
- Store in JSONL format for analysis

### Phase 3: Pattern Analysis
- Correlate input features with satisfaction scores
- Identify "golden conditions" that predict high scores
- Build feature importance model

### Phase 4: Actionable Insights
Two paths to value:

1. **Inform Scheduling Design** - If we learn certain conditions produce high satisfaction, influence the *inputs*:
   - Shift design recommendations
   - Crew availability gathering improvements
   - Constraint authoring guidelines

2. **Solver Hints** - Use learned patterns as soft hints:
   - Pre-seed promising crew-role assignments
   - Adjust preference weights based on historical success
   - Dynamic BASE_BOOST based on input characteristics

## Key Questions to Answer

1. **Is satisfaction predictable from inputs?**
   - Can we predict before solving whether it'll be a "good" day?

2. **Are there recurring patterns in high-sat solutions?**
   - Do certain crew members consistently appear in high-sat schedules?
   - Are there role-time combinations that always work well?

3. **What's the theoretical maximum?**
   - Given constraint conflicts, what's the ceiling on satisfaction?

4. **Does Gini state affect satisfaction ceiling?**
   - Are balanced rotation counts prerequisite for high satisfaction?

## Success Metrics

- Identify 3+ input features correlated with satisfaction (R² > 0.3)
- Reduce satisfaction variance by 20% through input optimization
- Build predictive model with >80% accuracy on high/low classification

## Related Work

- `BASE_BOOST_TUNING_RESULTS.md` - Parameter optimization findings
- `SOLVER_OPTIMIZATION_RESULTS.md` - Tuning engine configuration
- `solver.config.ts` - Current production configuration

## Notes

This fits into the broader `ml-schedule-learning` branch goals of using ML/data to improve scheduling outcomes beyond pure optimization.
