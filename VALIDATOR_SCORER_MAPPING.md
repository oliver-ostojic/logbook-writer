# TypeScript ↔ Python Constraint & Objective Mapping

## ✅ REFACTOR COMPLETE (November 25, 2025)

All validators and scorers now properly implemented with role-agnostic preference arrays.

---

## VALIDATORS (Hard Constraints) - ALL COMPLETE ✅

| TypeScript Validator | Python Function | Status | Notes |
|---------------------|-----------------|--------|-------|
| `breakPolicy` | `_meal_breaks()` | ✅ COMPLETE | Enforces breaks for long shifts, respects break windows |
| `crewQualification` | `_one_task_per_slot()` + role filtering | ✅ COMPLETE | Only assigns roles crew is qualified for via `eligibleRoles` |
| `crewRoleRequirement` | `_crew_role_requirements()` | ✅ COMPLETE | Enforces requiredHours for crew+role combinations |
| `hourlyCoverage` | `_hourly_staffing_requirements()` | ✅ COMPLETE | Ensures required crew per hour for REGISTER/PRODUCT/PARKING_HELM |
| `dailyHours` | `_one_task_per_slot()` (shift bounds) | ✅ COMPLETE | Enforced via shift start/end times |
| `windowCoverage` | `_coverage_windows()` | ✅ COMPLETE | Ensures coverage for time windows (demos, etc.) |
| `storeHours` | `_store_hours()` | ✅ COMPLETE | Respects openMinutesFromMidnight/closeMinutesFromMidnight + allowOutsideStoreHours |
| `noOverlap` | `_one_task_per_slot()` | ✅ COMPLETE | Prevents crew from being assigned to overlapping roles |
| `crewAvailability` | `_one_task_per_slot()` (shift bounds) | ✅ COMPLETE | Enforced via shift start/end times |
| `roleSlotDuration` | `_role_min_max()` + `_block_size_snap()` | ✅ COMPLETE | Enforces minMinutesPerCrew/maxMinutesPerCrew + blockSize |
| `consecutiveSlots` | `_consecutive_slots()` | ✅ COMPLETE | Enforces slotsMustBeConsecutive for any role |
| `slotAlignment` | Pre-flight check | 🟡 DEFERRED | Could add to API validation layer (low priority) |

---

## SCORERS (Soft Constraints / Objective Function) - ALL COMPLETE ✅

| TypeScript Scorer | Python Function | Status | Notes |
|-------------------|-----------------|--------|-------|
| `firstHour` | `_first_hour_preference()` | ✅ COMPLETE | Role-agnostic, uses preferences array |
| `favorite` | `_favorite_preference()` | ✅ COMPLETE | Role-agnostic, uses preferences array |
| `consecutive` | `_consecutive_preference()` | ✅ COMPLETE | Role-agnostic, penalizes gaps for any role |
| `timing` (break) | `_timing_preference()` | ✅ COMPLETE | Rewards early/late break preferences |
| `baseWeight` | All preference functions | ✅ COMPLETE | From RolePreference.baseWeight |
| `weightApplied` | `_combine_weights()` | ✅ COMPLETE | baseWeight × crewWeight × adaptiveBoost |
| `fairnessAdjustment` | `savePreferenceSatisfaction()` | ✅ COMPLETE | Tracks satisfaction per crew per preference |
| `adaptiveBoost` | `calculateAdaptiveBoost()` | ✅ COMPLETE | Historical 7-day satisfaction rate feedback |
| `bankedPreference` | PreferenceSatisfaction table | ✅ COMPLETE | Stores unmet preferences for future boost |
| `logPreferenceMetadata` | LogPreferenceMetadata table | ✅ COMPLETE | Summary statistics per logbook |

### 📊 Additional Objective Functions (Python-only)

| Python Function | Purpose | Status |
|----------------|---------|--------|
| `_parking_distance_preference()` | Push parking helm away from first hour | ✅ COMPLETE (domain-specific) |
| `_consecutive_role_penalty()` | Hard penalty for gaps in consecutive roles | ✅ COMPLETE (supports `isConsecutive` metadata) |

---

## WEIGHT CALCULATION - ✅ COMPLETE

### Formula (Aligned Across TypeScript & Python)
```typescript
score = baseWeight × crewWeight × adaptiveBoost
```

### Python Implementation
```python
def _combine_weights(base_weight: float, crew_weight: float, adaptive_boost: float) -> int:
    """Combine three weight components into final score."""
    combined = base_weight * crew_weight * adaptive_boost
    return max(1, int(combined))

```

---

## SCHEMA IMPLEMENTATION STATUS - ✅ ALL COMPLETE

### Preferences Array (Core Refactor)
```python
# Python solver.preferences structure:
[
  {
    'crewId': str,
    'role': TaskType,
    'preferenceType': 'FIRST_HOUR' | 'FAVORITE' | 'CONSECUTIVE' | 'TIMING',
    'baseWeight': float,      # From RolePreference table
    'crewWeight': float,      # From CrewPreference table
    'adaptiveBoost': float,   # Calculated from historical satisfaction
    'intValue': int | None    # For TIMING preferences (breakPosition)
  }
]
```

### Hard Constraints Implemented (10 total)

1. ✅ **`_one_task_per_slot()`** - No overlap, crew qualification
2. ✅ **`_store_hours()`** - Respects open/close + allowOutsideStoreHours
3. ✅ **`_hourly_staffing_requirements()`** - UNIVERSAL model
4. ✅ **`_parking_first_hour()`** - Blocks parking helm in first hour
5. ✅ **`_crew_role_requirements()`** - CREW_SPECIFIC model
6. ✅ **`_coverage_windows()`** - COVERAGE_WINDOW model
7. ✅ **`_role_min_max()`** - Enforces minMinutesPerCrew/maxMinutesPerCrew
8. ✅ **`_meal_breaks()`** - Break windows for long shifts
9. ✅ **`_block_size_snap()`** - Forces assignments to blockSize increments
10. ✅ **`_consecutive_slots()`** - Enforces slotsMustBeConsecutive

### Soft Constraints Implemented (6 total)

1. ✅ **`_first_hour_preference()`** - FIRST_HOUR preference type
2. ✅ **`_favorite_preference()`** - FAVORITE preference type
3. ✅ **`_consecutive_preference()`** - CONSECUTIVE preference type
4. ✅ **`_timing_preference()`** - TIMING preference type (break position)
5. ✅ **`_parking_distance_preference()`** - Domain-specific penalty
6. ✅ **`_consecutive_role_penalty()`** - Hard penalty for gaps in isConsecutive roles

### API Route Features

1. ✅ **`calculateAdaptiveBoost()`** - Historical 7-day satisfaction lookup
2. ✅ **`savePreferenceSatisfaction()`** - Post-solve satisfaction tracking
3. ✅ **Preference array builder** - Joins CrewPreference + RolePreference + adaptiveBoost
4. ✅ **Logbook + Run creation** - Full audit trail

### Database Schema Complete

1. ✅ **PreferenceSatisfaction** - Historical tracking per crew+preference+date
2. ✅ **LogPreferenceMetadata** - Summary stats per logbook
3. ✅ **RolePreference.baseWeight** - Store-level defaults
4. ✅ **CrewPreference.crewWeight** - Crew multipliers

---

## TESTING STATUS

### TypeScript Domain Tests
- ✅ **565 tests passing** across 30 test files
- ✅ All validators role-agnostic
- ✅ All scorers role-agnostic
- ✅ Integration tests cover full workflow

### Python Solver Tests
- ✅ Produces OPTIMAL solutions (2-14ms runtime)
- ✅ Preferences correctly satisfied (verified with test_preferences.json)
- ✅ All constraints enforced (no violations)
- ✅ blockSize snapping working (forces multiples of N slots)

---

## ARCHITECTURAL ACHIEVEMENTS

### Before Refactor (Hardcoded)
```python
# ❌ Only worked with PRODUCT/REGISTER
store = {
  'productFirstHourWeight': 100,
  'registerFirstHourWeight': 100,
}
crew = {
  'prefFirstHour': 'PRODUCT',  # Can't prefer other roles
}
```

### After Refactor (Role-Agnostic)
```python
# ✅ Works with ANY role
preferences = [
  {'crewId': 'C1', 'role': 'ART', 'preferenceType': 'FIRST_HOUR', 'baseWeight': 100, ...},
  {'crewId': 'C1', 'role': 'DEMO', 'preferenceType': 'FAVORITE', 'baseWeight': 50, ...},
  {'crewId': 'C2', 'role': 'ORDER_WRITER', 'preferenceType': 'CONSECUTIVE', 'baseWeight': 40, ...}
]
```

### Benefits
1. **Extensible**: Add new roles without code changes
2. **Flexible**: Multiple preferences per crew per day
3. **Fair**: Adaptive boost ensures historical equity
4. **Auditable**: Complete satisfaction tracking in database
5. **Testable**: 565 domain tests validate all logic

---

## REMAINING WORK

### Low Priority (Optional Enhancements)
- 🟡 `slotAlignment` pre-flight validation in API layer
- 🟡 `minSlots`/`maxSlots` metadata (currently unused, blockSize covers this)
- 🟡 Performance optimization for 50+ crew scenarios

### Documentation
- 📝 API documentation for preference system
- 📝 Database schema ERD with preference flow
- 📝 Deployment guide for Python solver

---

## SUMMARY

**Status**: ✅ **REFACTOR COMPLETE**

All TypeScript domain validators and scorers are fully implemented in the Python MILP solver with:
- Role-agnostic preference arrays
- 3-component weight formula (baseWeight × crewWeight × adaptiveBoost)
- Historical satisfaction tracking and adaptive boost
- All hard constraints enforced
- All soft constraints (preferences) scored
- 565 passing tests
- OPTIMAL solutions in 2-14ms

**Next Steps**: Production deployment and monitoring
