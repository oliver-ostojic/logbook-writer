# Metadata-Driven Solver Refactor Plan

## Goals

1. **No legacy enums** – the solver must never depend on hard-coded task names.
2. **Role-first logic** – every behavior (coverage, windows, breaks, preferences) flows from role metadata + constraint tables.
3. **Modular pipeline** – each stage (input builder, MILP model, post-processing) is decomposed into small, testable units.
4. **Side-by-side migration** – build the new system in parallel files, keep the current solver untouched until the new one replicates results.

## Role fields and how the new solver will use them

| Field | Source | Usage in new solver |
| --- | --- | --- |
| `assignmentModel` (`HOURLY`, `HOURLY_WINDOW`, `DAILY`, `SOLVER`) | `Role.assignmentModel` array (can include multiple models) | Each value enqueues a generator: hourly coverage grid, time-window coverage, per-crew daily totals, or solver-managed “free” roles (per-slot/per-crew variables). |
| `consecutivePolicy` | `Role.consecutivePolicy` | Chooses constraint behaviour: REQUIRED → hard consecutive block, PREFERRED → soft penalty term, NONE → no additional handling. |
| `minSlots` / `maxSlots` | `Role` | Bounds every contiguous assignment chunk produced for that role. Converted to minutes via `Store.baseSlotMinutes` when needed. |
| `blockSize` | `Role` | Forces assignments to be a multiple of this slot count (e.g., 2-slot blocks for 1-hour register shifts). |
| `windowStartOffsetMin` / `windowEndOffsetMin` | `Role` | Optional relative shift offsets (minutes from shift start) used to filter candidate placements (breaks, demos, etc.). |
| `allowOutsideStoreHours` | `Role` | If false, candidate assignments are clipped to store open/close minutes; if true, they may extend beyond the store schedule (e.g., set-up roles). |
| Store timing fields | `Store.baseSlotMinutes`, `openMinutesFromMidnight`, `closeMinutesFromMidnight` | Provide the global time grid and scheduling bounds. |
| Role gating fields | `Role.minShiftLengthForRoleAccess` | Optional minimum shift length (minutes) required before a crew can perform the role. Enables per-role access control (e.g., only long shifts can take BREAK). |
| Constraint tables | `HourlyRoleConstraint`, `WindowRoleConstraint`, `DailyRoleConstraint` | Supply the numerical demand per store/date/role combination (hourly counts, window coverage ranges, per-crew hours). |
| Crew eligibility | `CrewRole` | Determines which crews are eligible for which roles; the solver never infers eligibility from codes. |
| Preferences | `RolePreference` + `CrewPreference` | Already keyed by IDs; weights, crew opts-ins, and banking metadata remain unchanged and drive the objective. |
| Shifts & Store context | `Shift`, `Store`, `Crew` | Provide actual working windows, timezone info, and crew identities for assignment generation. |

All solver behaviour must be derived from these concrete schema fields. Any “flags” required by the MILP (e.g., identifying break-like roles) are inferred from combinations of existing metadata—for example, a role with `SOLVER` assignment plus `windowStartOffsetMin/End` defining its allowed shift offsets.

## High-level architecture

```

apps/
  api/
    src/
      solver2/          # entirely new pipeline
        builder.ts      # build metadata-driven SolverInputV2
        model.ts        # MILP model generation in TypeScript
        python/
          solver_v2.py  # mirrored python model (if kept in Python)
        postprocess.ts  # translate solver output back to logbook records
```

### Stage 1 – Input Builder (`builder.ts`)
1. Fetch store, roles (with metadata), crew, shifts, constraints, preferences.
2. Normalize roles:
   - Ensure every role has derived properties (window offsets, min/max minutes, etc.).
   - Split roles into three buckets by assignment model (hourly, window, daily).
3. Build `RoleDescriptor[]` objects (derived strictly from schema fields):
    ```ts
    type RoleDescriptor = {
       id: number;
       code: string;
       assignmentModels: AssignmentModel[];
       blockSize: number;
       minSlots: number;
       maxSlots: number;
       allowOutsideStoreHours: boolean;
       windowOffset?: { start: number; end: number };
       consecutivePolicy: 'REQUIRED' | 'PREFERRED' | 'NONE';
    };
    ```
    Additional helper values (e.g., `minMinutes = minSlots * store.baseSlotMinutes`) remain derived inside the builder—no extra columns are needed.
4. For each role, gather associated constraints:
   - Hourly: `Array<{ hour: number; required: number }>`
   - Window: `Array<{ startHour: number; endHour: number; requiredPerHour: number }>`
   - Daily: `Array<{ crewId: string; requiredHours: number }>`
5. Build crew descriptors with shift bounds and role eligibility (list of role IDs from `CrewRole`). No fallback logic beyond what the schema provides.
6. Assemble `SolverInputV2` JSON. In addition to the legacy fields, emit the new metadata-driven payload pieces:
   - `bankedPreferences: BankedPreferenceDescriptor[]` capturing at most one ACTIVE credit per `(crewId, rolePreferenceId)` (enforced via DB unique index / upsert). Fields: `crewId`, `rolePreferenceId`, `remainingWeight`, `originalDate`, `expiresAt`, `reason`, `bankedPreferenceId`.
   - `fairnessTrackers: FairnessTrackerDescriptor[]` mirroring rows from `RoleFairnessTracker` (`roleId`, `storeId`, `lookbackDays`, `enabled`). Also include `roles[n].fairnessTracking?: { lookbackDays: number }` so solver toggles behavior per role inline.
   - `fairnessHistory: FairnessHistoryDescriptor[]` built from the currently-active `CrewRoleFairnessHistory` window per `(roleId, crewId)` with fields `{ roleId, crewId, minutesAssigned, windowStart, windowEnd, lookbackDays }`.
   - Preference records augmented with `bankedWeightBoost` (scalar computed from any matching credit + age factor) and `bankingMetadata` (credit ids/reasons) so the objective builder can consume the boost without re-querying the DB.

### Stage 2 – Solver Model (`solver_v2.py`)
- **Module structure:**
  - `time_grid.py`: handles slot indexing, store hours, shift windows.
  - `variables.py`: functions like `build_hourly_variables(role, crew, time_grid)` returning MILP variable dictionaries.
  - `constraints.py`: one function per constraint type (hourly coverage, window coverage, daily totals, shift window enforcement, consecutive policy).
  - `objective.py`: builds weighted sum from preferences + penalties (e.g., fairness, consecutive preference, idle time minimization).
  - `solver_v2.py`: orchestrates the above (imports modules, solves, returns output).
- **No enums**: each constraint function receives role descriptors and acts generically.
- **Shift-window enforcement**: before creating variables for `(crew, role, time block)`, run a predicate that checks:
  - Within crew shift + store hours.
  - Satisfies role window offsets (`windowOffsetStartMinutes <= start - shiftStart <= ...`).
- **Break and timing policies**: rely on actual metadata combos—`windowStartOffsetMin`/`windowEndOffsetMin` determine when a role can fall inside a crew shift, while `Role.minShiftLengthForRoleAccess` lets individual roles enforce minimum shift lengths (e.g., breaks only for 6hr+ shifts). No extra boolean flags are required.

### Stage 3 – Output + Post-processing
- Convert MILP assignments back into DB-ready records using role IDs.
- Compute metadata (total hours, constraint satisfaction) directly from role descriptors and constraint tables, not enum buckets.
- Preference satisfaction already keyed by `rolePreferenceId`, so just match assignments by role ID.

## Suggested phases (with parallel files)
1. **Phase 0 – Schema prep**
   - (Done) Ensure role metadata fields exist: `assignmentModel[]`, `consecutivePolicy`, `minSlots/maxSlots`, `blockSize`, `windowStartOffsetMin/windowEndOffsetMin`, `allowOutsideStoreHours`.
   - Backfill/store-level data for existing roles so every field reflects real behavior (e.g., populate window offsets for breaks, tighten min/max slots for demos).

2. **Phase 1 – Builder + schema**
   - Implement `builder.ts` to emit `SolverInputV2` JSON.
   - Write Jest tests comparing V1 vs V2 input for existing stores to validate completeness.

3. **Phase 2 – Python model rewrite**
   - Implement `solver_v2.py` + helper modules.
   - Feed it the same data used for current solver and iterate until outputs align (ignoring enum names).

4. **Phase 3 – API integration**
   - Add a new endpoint `/solve-logbook/v2` wired to the new builder + solver.
   - Keep `/solve-logbook` pointing to legacy solver until V2 is verified in staging.

5. **Phase 4 – Cutover**
   - Switch `/solve-logbook` to use V2 internally.
   - Remove V1 files, TaskType enum dependencies, and the translation map.

## Notes on modularity & store portability
- Every behavior is metadata-driven; stores create roles with whichever codes they want. The solver only cares about the numerical fields.
- Adding a new role type (e.g., "Wine Ambassador") is just seeding metadata + constraints; no code changes.
- Preferences already reference `rolePreference.roleId`, so they continue to work regardless of naming.
- Break-specific behavior is handled by flags/offsets, so break roles are ordinary roles with window offsets instead of a special enum.

## Next steps
1. Finalize the new role fields (window offsets, behavior flags) and expose them in the admin/editor UI.
2. Start Phase 1: build `SolverInputV2` and unit tests to ensure the new payload has parity with the legacy one.
3. Spin up the new solver modules in parallel so the existing "machine" keeps running until we trust the refactor.

## Next milestone – objective builder (preferences + PREFERRED penalties)

1. **Preference normalization parity** – make the preference/demand builders consult the same assignment-model helpers already used for coverage and daily requirements. This prevents SOLVER-only roles from generating hourly preference terms (and vice versa).
2. **Objective assembly module** – add an `objective-builder.ts` (or equivalent) that consumes normalized preferences, role metadata, and consecutive policies to produce the weighted objective rows. The module should:
   - Emit per-slot coefficients only for assignment models the role advertises.
   - Introduce the `PREFERRED` consecutive penalties as soft constraints tied to block breaks.
   - Remain deterministic so parity tests can diff the coefficient matrix against the legacy solver.
3. **Test coverage** – extend the `__tests__` suite with fixtures where:
   - A HOURLY-only role yields preference weights exclusively on hourly variables.
   - A SOLVER-only role produces solver-variable weights but zero hourly/window impact.
   - A role advertising multiple models creates objective contributions for each applicable generator.
   - PREFERRED consecutive roles add penalties whenever the builder synthesizes multi-block assignments.
4. **Integration & parity pass** – once the objective builder exists, wire it into `milp-model.ts`, run the solver2 parity harness, and document any remaining gaps before moving on to solution post-processing.

## Solver constraint & objective plan

This section locks down the behavior the new solver MUST implement. Every rule is driven by role metadata, store fields, or explicit constraint tables—no hard-coded task names or role-specific branches.

### Variable generation & feasibility guardrails

- Build decision variables only for slots that satisfy **all** of the following: crew is on shift, slot lies within store open/close when `allowOutsideStoreHours` is false, slot respects role `windowStartOffsetMin` / `windowEndOffsetMin`, and the slot index participates in the role’s `blockSize` (e.g., only even slots for 2-slot blocks).
- If a crew has no eligible role covering a slot, the builder must catch it up-front (fail fast) so the solver can keep enforcing `one_task_per_slot = 1` without an “idle” fallback role.

### Assignment-model-specific constraints

| Assignment model | Enforced behavior |
| --- | --- |
| **HOURLY** | For each `(roleId, hour)` in `hourlyRequirements`, sum of assignment variables in that hour equals the required count * slotsPerHour. Extra staffing is NOT allowed; feasibility depends on equality. |
| **HOURLY_WINDOW** | For coverage windows, every hour inside `[startHour, endHour)` enforces the same equality requirement as HOURLY, scoped to the window range. The `requiredPerHour` figure represents headcount, so the solver multiplies by `slotsPerHour` **and** the role’s `blockSize` when building constraints to ensure the total slot count matches both the demand and the minimum chunk size. |
| **DAILY** | For each `(crewId, roleId)` daily requirement, sum of that crew’s slots equals the required minutes ÷ slotMinutes. Additionally cap the total slots per crew/role between `role.minSlots` and `role.maxSlots` (converted to minutes) if those bounds are non-zero. |
| **SOLVER** | Roles marked with SOLVER behave like free-form assignments with no aggregate requirement rows, but they still respect `minSlots`, `maxSlots`, `blockSize`, `windowOffsets`, and any per-crew daily requirements emitted by the builder (e.g., for breaks). |

### Role-level structural rules

- **Min/max slots**: For every crew assigned to a role, enforce `role.minSlots <= totalSlots <= role.maxSlots` when those bounds are set (>0). Min applies to crews with requirements (e.g., order writers needing 2 slots); max prevents over-staffing.
- **Block size**: Use helper variables to ensure assignments occur in chunks equal to `role.blockSize`. Example: REGISTER with blockSize=2 forces 2 consecutive slots or nothing.
- **Window offsets**: When a role specifies offsets, ensure entire blocks stay inside the allowed window, not just their first slot.
- **Consecutive policy**:
   - `REQUIRED`: each crew’s assignments for that role must form a single contiguous block (taking blockSize into account).
   - `PREFERRED`: allow splits but add a soft penalty per break (see objective section). `NONE`: no additional handling.
- **Break requirements**: Builder produces per-crew daily requirements for the designated break role based on role metadata (e.g., `minShiftLengthForRoleAccess`, `windowStartOffsetMin/End`). Solver treats those like any other DAILY constraint—no custom break logic needed.

### Shift coverage invariant

- Maintain the `one_task_per_slot == 1` constraint across every crew’s shift, guaranteeing continuous coverage with no overlaps. Because builder validation ensures at least one eligible role per slot, there is no “idle” fallback role.

### Objective components

- **Base preference weight**: Still `baseWeight * crewWeight * adaptiveBoost` per `(crewId, roleId)`.
- **Preference-type semantics**:
   - `FIRST_HOUR`: apply weight only when the chosen role occupies the crew’s earliest slot(s).
   - `FAVORITE`: add weight per slot as today (no additional logic needed).
   - `TIMING`: interpret `intValue` (-1 early, +1 late) and add weight proportional to how close the assignment start time is to the preferred end of the shift.
   - `CONSECUTIVE`: use `intValue` to distinguish desires: `+1` favors a single contiguous block (reward contiguity / penalize splits), `-1` favors bouncing (penalize adjacent slots / reward switches). UI guarantees only one option per role.
- **Role consecutive policy (PREFERRED)**: add a soft penalty when assignments for that role create multiple blocks even if no crew preference exists. Weight is derived from role metadata so stores can tune aggressiveness.
- **Fairness balancing**: when a role has an active `fairnessTracking` config, attach slack variables that measure surplus minutes relative to the store mean in the current window. Penalize positive slack so crews with heavy historical load are deprioritized, while crews below the average implicitly gain advantage. Inputs come from `fairnessHistory` descriptors; penalties stay soft so feasibility is not affected.
- **Banked preference boost**: multiply each preference’s weight by `bankedWeightBoost`, where boosts come from active credits and age-based multipliers (see roadmap below). Credits automatically raise priority without changing constraint structure.
- **No idle penalties**: there is no idle role, so the objective never rewards or penalizes idle time.
- **Coverage slack penalties**: not implemented—hourly/window constraints remain hard equalities, so there’s no slack variable to penalize.
- **Role min/max penalties**: redundant with hard constraints; no additional penalty layer unless metadata later demands soft bounds.

### Enforcement + validation strategy

- All hard constraints live in `constraints.py` with one function per rule. No special branching by role name; everything inspects metadata or requirement rows.
- Objective logic resides in `objective.py` and mirrors the preference enum semantics exactly.

### Execution flow & constraint assembly order

The solver still follows a deterministic pipeline even though CP-SAT enforces every constraint simultaneously once the model is built.

1. **Input + grid prep** – `solver_v2.py` loads `SolverInputV2`, normalizes slot counts (minutes → slots), and instantiates `time_grid` helpers for store hours and crew shifts.
2. **Variable generation** – `variables.py` creates per-role/per-crew decision tensors for each assignment model (hourly, window, daily, solver-managed) after filtering by eligibility, offsets, and blockSize guardrails.
3. **Guardrail constraints** – immediately bind variables to feasibility rules (`one_task_per_slot`, min/max slots, block contiguity, window offsets). These are added before aggregate coverage so infeasible shapes get eliminated up front.
4. **Coverage/demand constraints** – iterate through hourly, window, and daily requirement tables, adding equality constraints that tie the decision vars to required headcount/minutes.
5. **Policy constraints** – layer on consecutive policy requirements (`REQUIRED` contiguity, optional chunk counters for `PREFERRED`) and any per-store obligations emitted by the builder (e.g., break requirements expressed as daily rows).
6. **Objective construction** – `objective.py` walks the same data to add preference weights, consecutive bonuses/penalties, fairness placeholders, etc., producing a single weighted sum passed to the solver.
7. **Solve** – CP-SAT receives the full model and decides all variables at once. There are no downstream validators; every invariant must already be encoded in the model.

Because every rule is expressed as a constraint before the solve call, there is no sequencing dependency beyond “build variables → add constraints → set objective → solve”.

## Banking + fairness roadmap (must-have details)

### Banking policy & data flow

1. **Credit creation rules**
   - Only create credits after a logbook is published (post-manager edits), using the final satisfaction metrics.
   - Bank a preference if either (a) it was the crew’s highest-weight preference and went unmet, or (b) the crew’s trailing 14-day satisfaction average sits in the bottom 10% of the store distribution.
   - Enforce “one active credit per crew+preference” via a partial unique index on `BankedPreference (crewId, rolePreferenceId)` scoped to `status = ACTIVE`, or by upserting existing rows. Additional unmet instances simply increase the stored `weight` or `reason` on that single record.

2. **Age-based prioritization**
   - Track `originalDate` (already present) and compute `ageDays` when building solver input.
   - Define an age multiplier (env-driven, e.g., `AGE_BOOST_FACTOR = 0.5`) and compute `ageBoost = 1 + min(ageDays / BANKING_CARRYOVER_DAYS, 1) * AGE_BOOST_FACTOR`.
   - Set `bankedWeightBoost = 1 + (creditWeight / BOOST_DIVISOR)` and multiply by `ageBoost` so old credits escalate naturally. Clamp to a configured max (e.g., 3× base weight).
   - If a credit survives multiple runs unmet, increment `runMissCount` (stored on the record) and optionally escalate to “guaranteed” status once it exceeds a threshold (future enhancement).

3. **Builder + objective integration**
   - Builder pulls active credits, applies the one-per-preference rule, and attaches `bankedWeightBoost` + metadata directly to the relevant `PreferenceDescriptor` entries.
   - Objective builder multiplies each term’s coefficient by `bankedWeightBoost`; no solver-side awareness of credit age is needed.
   - Post-solve publishing job marks credits as `USED` when satisfied and creates new credits according to the policy above.

### Fairness tracker system

1. **Schema recap**
   - `RoleFairnessTracker` (one-to-one with `Role`) stores `storeId`, `roleId`, `lookbackDays`, `enabled`. Presence of the row enables fairness balancing for that role.
   - `CrewRoleFairnessHistory` stores rolling windows of minutes per crew/role, refreshed after each logbook publish by aggregating actual assignments. When a window expires, create a new row; otherwise update the existing one.

2. **Solver input requirements**
   - Builder includes `roles[n].fairnessTracking` metadata plus the top-level `fairnessTrackers` array for diagnostics.
   - `fairnessHistory` contains one entry per tracked `(roleId, crewId)` with window bounds + minutes assigned during the rolling lookback.

3. **Solver enforcement**
   - For each tracked role, compute the current average minutes across crews (including today’s decision variables).
   - Introduce slack variables for “surplus minutes” per crew, penalized by a config weight (`fairnessViolationPenalty`). This keeps the constraint soft but biases solutions toward crews with lighter history.
   - Because fairness is metadata-driven, adding/removing trackers requires no code changes—just insert/delete rows.

4. **Post-run bookkeeping**
   - After logbook publish, update/insert `CrewRoleFairnessHistory` windows with the new minutes, prune rows older than the largest lookback window, and recompute per-crew satisfaction stats used by both fairness and banking rules.

These details are non-optional parts of the refactor: the builder, objective, and post-publish jobs must adhere to them so fairness/banking stay deterministic and tunable via metadata.
