# Consecutive Policy Refactor Plan

## Goals
- Replace legacy boolean `isConsecutive` / `slotsMustBeConsecutive` usage with the new `consecutivePolicy` enum (`REQUIRED`, `PREFERRED`, `NONE`).
- Surface an optional `consecutiveWeight` multiplier all the way from Prisma models through API/domain types, solver input JSON, and the Python solver.
- Preserve existing behavior for roles previously marked consecutive by mapping:
  - `REQUIRED` → existing hard constraint behavior.
  - `PREFERRED` → soft penalty (initially reuse former `isConsecutive` logic until richer heuristics are added).
  - `NONE` → no constraint/penalty.

## Workstream Outline
1. **Inventory current usage**
   - Search for `isConsecutive`, `slotsMustBeConsecutive`, and related logic across:
     - Prisma migrations / scripts.
     - API routes (`routes/roles.ts`, `routes/solver-input.ts`, `routes/solver.ts`).
     - Domain packages (`packages/domain`, `packages/shared-types`).
     - Solver input fixtures (`apps/solver-python/**`).
     - Python solver code (look for `slots_must_be_consecutive` or similar).
   - Note any sample data (`solver_input_*.json`) that will need regenerating.

2. **Domain + API updates**
   - Update shared types to expose `consecutivePolicy` (string enum) and `consecutiveWeight: number`.
   - Remove `isConsecutive`/`slotsMustBeConsecutive` from API responses and mappers.
   - Ensure `/roles` CRUD endpoints accept/return the new fields (default `NONE`, weight `1.0`).

3. **Solver input generation (TypeScript)**
   - When building solver input JSON (`routes/solver-input.ts`), emit:
     ```json
     {
       "consecutivePolicy": "REQUIRED",
       "consecutiveWeight": 1.0
     }
     ```
   - Keep legacy keys for a short transition only if the Python side still expects them; otherwise remove once the solver is updated.

4. **Python solver ingestion**
   - Update metadata parsing to read the new fields.
   - Map policies to behavior:
     - `REQUIRED`: enforce current hard consecutive constraint.
     - `PREFERRED`: introduce soft penalty weighted by `consecutiveWeight` (initial implementation can reuse existing penalty infrastructure).
     - `NONE`: skip both constraint and penalty.

5. **Tests & fixtures**
   - Refresh solver input fixture JSON files to include the new properties.
   - Update unit/integration tests on both TS & Python sides to cover each policy value.
   - Add regression coverage ensuring old boolean flags are gone.

6. **Validation**
   - `pnpm --filter @logbook-writer/api lint && pnpm --filter @logbook-writer/api test` (or equivalent) for TypeScript changes.
   - Run Python solver unit tests / smoke run using regenerated sample input.
   - Verify end-to-end by running `apps/api/scripts/test-full-solver-integration.ts` (if available) or a targeted schedule generation.

## Usage Audit — 2025-12-03

### Database / Prisma layer
- `apps/api/prisma/schema.prisma` already exposes `Role.consecutivePolicy`/`consecutiveWeight` **without** `slotsMustBeConsecutive`, so every code path still reading that column is now out of sync with the schema/client.
- `apps/api/scripts/migrate_consecutive_policy.js` documents the manual migration that dropped `slotsMustBeConsecutive`; ensure any fresh environments run a legit Prisma migration rather than this ad-hoc script once the refactor codifies things.

### API routes / services (TypeScript)
- `apps/api/src/routes/roles.ts` request types and create handler still accept/write `slotsMustBeConsecutive` but never expose the new enum/weight.
- `apps/api/src/routes/solver-input.ts` emits `slotsMustBeConsecutive` and `isConsecutive` inside `RoleMetadata` for the solver payload.
- `apps/api/src/routes/solver.ts`
   - Preference logging logic around line 200 uses a local `isConsecutive` flag purely for satisfaction math (independent of role metadata).
   - Solver input builder (≈line 680) mirrors the legacy booleans when deriving `roleMetadata`.
- `apps/api/src/services/constraint-analyzer.ts` checks `meta.slotsMustBeConsecutive` to report violations.
- `apps/api/src/services/preference-satisfaction.ts` implements the CONSECUTIVE preference scorer via assignment comparisons (no role metadata dependency but will likely reuse `consecutivePolicy` for thresholds/weights).

### Shared types / domain packages
- `packages/shared-types/src/solver.ts` defines `RoleMetadata.slotsMustBeConsecutive` and `isConsecutive` fields; no mention of `consecutivePolicy`/`consecutiveWeight` yet (dist artifacts mirror this).
- `packages/domain/src/constraints/types.ts` treats `RoleConfig.slotsMustBeConsecutive` as required.
- `packages/domain/src/constraints/validators/consecutiveSlots.ts` and `packages/domain/src/constraints/scorers/consecutive.ts` gate behavior on the old boolean.
- Docs + tests referencing the boolean:
   - `packages/domain/CONSTRAINTS.md` (Consecutive Slots section).
   - `packages/domain/src/constraints/types.ts` (type definition) and validator docstrings.
   - `packages/domain/test/constraints/**/*.test.ts` seed roles with `slotsMustBeConsecutive`.
   - `VALIDATOR_SCORER_MAPPING.md` calls out `_consecutive_slots()` keyed off the boolean.

### Solver fixtures & generated data
- `apps/api/solver_input_store768_2025-11-25.json` plus every JSON fixture under `apps/solver-python/solver_input_11_22_v*`, `solver_input_11_22_test.json`, and `test_consecutive_constraint.json` embed both `slotsMustBeConsecutive` and `isConsecutive`.

### Python solver
- `apps/solver-python/logbook_solver/constraints.py::_consecutive_slots` enforces the HARD constraint by reading `meta['slotsMustBeConsecutive']`.
- `apps/solver-python/logbook_solver/objective.py::_consecutive_role_penalty` looks at `meta['isConsecutive']` to add a soft penalty term (currently fixed at -500 weight).
- Any role metadata map is populated directly from the JSON (so the TS → JSON step must provide the new enum/weight once implemented).

### Miscellaneous references
- `VALIDATOR_SCORER_MAPPING.md` and other docs explicitly describe the boolean behavior and will need wording updates once the enum lands.
- No existing code consumes `consecutivePolicy`/`consecutiveWeight`; they are schema-only so the refactor must thread them through every layer above.

## Open Questions
- Do we need runtime migrations to backfill `consecutivePolicy` for existing roles, or has the manual script already set proper values?
- Should `consecutiveWeight` be configurable per role via UI/API now, or default to `1.0` until tuning is needed?
- For `PREFERRED`, what exact penalty structure should we use initially (simple penalty vs. proportional to break size)?

## Next Steps
1. Complete the usage audit (Todo #2) to quantify code touch points.
2. Implement shared type + API changes, then propagate downstream per the outline above.
3. Circle back to the timing-window TODO once this refactor is merged.
