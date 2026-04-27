# Unified Rule Evaluator — Design Doc

**Goal:** Replace the two divergent evaluators (TypeScript `crew-rule-satisfaction.ts` used by frontend/logbook-manager, and Python `tuning_engine/rule_evaluator.py` used by CLI/tuning) with a single canonical semantics. Both call sites read from the same spec so a schedule has exactly **one** satisfaction number.

## Why

Today the frontend reports ~90% average satisfaction while the CLI reports ~75% on the same schedule. The gap is not a bug in either — they compute different metrics with different rule semantics. Downstream consequence: the tuning engine optimizes against one definition while the user sees another.

## Principles

1. **One definition per rule type.** The canonical semantics live here; both implementations must match.
2. **Binary vs gradient is a deliberate per-rule choice,** not an artifact of the implementation.
3. **Eligibility rules are explicit.** For every rule type, state exactly when the rule is skipped (dropped from denominator) vs evaluated.
4. **Aggregation is explicit.** `percentMet` (binary, rule-weighted), `avgSatisfaction` (gradient, rule-weighted), `avgSatisfactionPerCrew` (gradient, crew-weighted) all reported separately — no headline number that silently changes meaning.

## Canonical rule semantics

### `MIN_CONSECUTIVE_MINUTES`

**Intent:** "Minimum means minimum for **all** blocks — no fragmentation allowed."

**Semantics:** Binary.
- If role not assigned → ineligible (dropped from denominator).
- Else: satisfaction = 1.0 iff **every** consecutive block of this role ≥ `valueInt` minutes. Else 0.0.
- Checked against the **shortest** block.

**Current state:**
- TS: ✅ matches canonical.
- Python: ❌ uses `longest_run / min_minutes` with gradient. Needs to change to binary-all-blocks.

**Example (min=120):**
| Blocks | Canonical sat |
|---|---|
| [120, 180] | 1.0 |
| [60, 180, 120] | 0.0 (60min fragment) |
| [90, 90] | 0.0 |
| [120] | 1.0 |
| [] (role not assigned) | ineligible |

---

### `MAX_CONSECUTIVE_MINUTES`

**Intent:** "I want to stay on this role for up to X minutes — a target, not a hard cap."

**Semantics:** Binary.
- If role not assigned → ineligible.
- Else: satisfaction = 1.0 iff the longest consecutive block ≥ `valueInt`. Else 0.0.
- Treats `valueInt` as a **target** to reach, not a limit to stay under.

**Current state:**
- TS: ❌ treats as a **limit** — 1.0 iff every block ≤ max. Binary, but wrong interpretation.
- Python: ❌ gradient `longest_run / max_minutes` — right interpretation (target), wrong form (gradient instead of binary).
- Both need to change to: binary, longest-block ≥ target.

**Note on the solver:** The solver has no encoding for this rule — it passes through as a soft objective bonus proportional to how close the longest block gets to the target. That gradient approach is correct for optimization. The evaluator is a post-solve binary check of whether the target was reached.

---

### `TIMING`

**Intent:** "Assign this role early / in the middle / late in my shift."

**Semantics:** Binary.
- If role not assigned → ineligible.
- Valid range = crew's shift, **narrowed** by any `ASSIGN_BEFORE_SHIFT_MIN_X` or `ASSIGN_AFTER_SHIFT_MIN_X` rules on the same crew + role. If the narrowed range is degenerate (start ≥ end), fall back to full shift.
- Split valid range into thirds: early = first third, middle = second third, late = last third.
- satisfaction = 1.0 iff ANY assignment for this role starts in the correct third. Else 0.0.
- `valueInt`: -1 = early, 0 = middle, 1 = late.

**Current state:**
- TS: ✅ matches canonical (binary thirds + ASSIGN_BEFORE/AFTER narrowing + degenerate-range fallback).
- Python evaluator: ✅ matches canonical (binary thirds + narrowing).
- Python solver: uses gradient bonus in the **objective** (not the evaluator). That's intentional — the solver nudges assignments toward the preferred third during optimization; the evaluator is a binary post-solve check of whether the outcome landed in the right third. These serve different purposes and do not need to match.

---

### `DISTRIBUTION_BETWEEN_ROLE_X`

**Intent:** "I want to spend more / equal / less time on this role's family compared to the target role's family."

**Semantics:** Binary, family-level.
- If neither role's family has any assigned time → ineligible.
- Look up `roleId → familyId` and `targetRoleId → familyId`. Sum all assignment minutes across every role in each family for this crew.
- If either role has no family mapping, fall back to comparing the individual roles directly.
- `valueInt = -1`: satisfied iff `primary_family_minutes > target_family_minutes`.
- `valueInt = +1`: satisfied iff `target_family_minutes > primary_family_minutes`.
- `valueInt = 0`: satisfied iff `|primary - target| ≤ 30 minutes` (one block tolerance for equal).
- satisfaction = 1.0 or 0.0 (binary).

**Current state:**
- TS: ✅ matches canonical (family-level with role fallback, binary zones, `total === 0` → ineligible).
- Python evaluator: ✅ matches canonical (family-level with role fallback, binary zones).
- Python solver: ✅ matches canonical (family-level with role fallback, objective bonus).

---

*More rules to be added as we work through them.*
