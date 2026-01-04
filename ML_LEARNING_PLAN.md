# ML Schedule Learning Module - Design Plan

---

## V1 Policies (Non-Negotiable)

These policies are locked for v1. Do not deviate during implementation.

1. **Baseline-Only Penalty:** Pass 3 penalizes only `x[c,t,baseline_role[c,t]]`. Swapping to any other eligible role escapes the penalty.
2. **Output Shape:** `edit_risk_slot[C × T]` (scalar per slot), NOT `[C × T × R]`.
3. **`assigned_baseline` Definition:** `assigned_baseline[c,t] = 1` iff `baseline_role[c,t] != ROLE_NONE`.
4. **`assigned_edited` Definition:** `assigned_edited[c,t] = 1` iff `edited_role[c,t] != ROLE_NONE`.
5. **ROLE_NONE Handling (v1):** `ROLE_NONE` means **unassigned slot**. It may occur off-shift or as an on-shift gap.
6. **Training Mask (v1):** `train_mask[c,t] = crew_on_shift_mask[c,t]`.
7. **Penalty Scope (v1):** penalties apply only where `crew_on_shift_mask[c,t] == 1` and `assigned_baseline[c,t] == 1`.
8. **Eligibility Guardrail:** For every slot where `baseline_role[c,t] != ROLE_NONE`, assert `eligible_at(c,t,baseline_role[c,t]) == 1`. Hard-fail if not.
    - Where `eligible_at(c,t,r)` is either `eligible[c,t,r]` (time-varying eligibility) or `eligible[c,r]` (time-invariant eligibility).
9. **Back-Casting Requirements:** Historical inputs must be reconstructed/stored: `store_customer_open_mask` (customer-facing metrics only), `coverage_requirements`, `eligible`. Log `eligibility_drift_flag` when historical eligibility differs from current.
10. **Volatility Handling:** Use Strategy B (inverse-sqrt role weighting). Checkpoint must include `edit_profile.json`.
11. **Required Metrics:** Always report both `edit_avoidance_proxy` (diff Pass3 vs Pass1) and `true_edit_reduction` (diff manager_final vs Pass1 compared to manager_final vs Pass3).

---

## V1 Invariants (read this first)

These are the v1 “physics laws”. If any is violated, treat it as a **bug**, not “model behavior”.

- **Fixed time axis:** $T = 48$ slots (30-minute granularity).
- **Slot integrity (v1):** at most one role per slot: $\sum_r \texttt{schedule}[c,t,r] \in \{0,1\}$.
- **Training mask (v1):** `train_mask[c,t] = crew_on_shift_mask[c,t]`.
- **Baseline-only Pass 3 penalty:** penalize only `x[c,t,baseline_role[c,t]]`; swapping to any other eligible role escapes the penalty.
- **Penalty mask (v1):** `penalty_mask[c,t] = crew_on_shift_mask[c,t] * assigned_baseline[c,t]`.
- **Eligibility guardrail:** every baseline assignment must satisfy `eligible == 1` (export hard-fail otherwise).
- **Volatility contract:** checkpoint must include `edit_profile.json` and volatility weighting uses Strategy B.

## Overview

A PyTorch-based machine learning module that learns from historical logbook data, manager adjustments, and crew feedback to improve future schedule generation. The model runs between Pass 1 and Pass 3 to generate objective penalties (v1), making schedules that better match manager preferences and maximize crew satisfaction.

**Key Insight:** CLP (solver) handles hard constraints. ML handles soft guidance by learning what managers actually want and what makes crew happy.

---

## V1 Scope

**Phase 1 (this doc):** Learn from manager edits via a **two-pass solve**
- Pass 1: Run baseline solver (today's behavior) → produces a baseline schedule
- Pass 2: ML predicts `edit_risk_slot` from that baseline schedule
- Pass 3: Re-solve with penalties to reduce future edits
- No crew ratings yet (add in Phase 2)

**Phase 2 (future):** Add crew satisfaction learning
- Collect crew ratings over time
- Add satisfaction prediction head
- Blend edit avoidance + satisfaction maximization

### V1 Contract (inputs/outputs that must not drift)

**Inference-time inputs (Phase 1):**
- Solve-time tensors: coverage requirements, masks, role rules, crew history features
- `baseline_schedule` from Pass 1 (today's baseline solver behavior)

**Inference-time output (Phase 1):**
- `edit_risk_slot[c,t] ∈ [0,1]` used only to construct an *objective penalty term* in Pass 3

**Training signal (Phase 1):**
- Manager edits: `(original_logbook, edited_logbook)` → supervised edit labels (defined below)

---

## Time axis convention (lock this for v1)

We commit to **Option A** for v1:
- $T = 48$ fixed 30-minute slots covering the full day (midnight → midnight)
- Shifts and assignments may exist outside customer-open hours.
- `store_customer_open_mask[t]` is for customer-facing / coverage metrics only; it is **not** used for v1 training or Pass-3 penalties.

This prevents confusion while keeping tensors fixed-shape.

## Input Tensors

### SOLVE-TIME INPUTS
*These tensors are available when generating a NEW schedule (before solve)*

### 1. Coverage Requirements Tensor
**Purpose:** Staffing demand - how many crew needed per role per time slot
**Shape:** `[T × R]` (Time Slots × Roles)

| Dimension | Size | Description |
|-----------|------|-------------|
| T | 48 | 30-minute slots (full 24 hours) |
| R | ~10-15 | Role demand count per slot |

**Contains:**
- Number of crew needed for Register at hour 10 = 2
- Number of crew needed for Product at hour 14 = 1
- Derived from shift constraints in the DB

**Why needed:** Model must know staffing demand to reason about assignments. Without this, it can't tell if "crew on register" is over/under-staffed.

---

### 2. Masks Tensor
**Purpose:** Tell the model which slots are valid (avoid learning from zeros)
**Shape:** `store_customer_open_mask[T]` + `crew_on_shift_mask[C×T]`

| Mask | Shape | Description |
|------|-------|-------------|
| `store_customer_open_mask` | `[T]` | 1 if store is customer-open at slot t, else 0 (customer-facing metrics only) |
| `crew_on_shift_mask` | `[C×T]` | 1 if crew c is scheduled to work at slot t, else 0. **Source of truth (v1):** Derived from the `Shift` table for that day. |

**Why needed:** 
- Most of the 48 slots are zeros (store closed, crew not working)
- Without masks, model might learn "predict 0" for everything
- Masks let loss function focus only on valid slots

**Source of truth (v1):**
- `crew_on_shift_mask` is derived from the **Shift table** for the day.
- Schedule-derived notions like `(role != ROLE_NONE)` must be treated as **debug assertions only**, not as definitions.

**V1 Definition of ROLE_NONE (updated):**
- `ROLE_NONE` means **unassigned slot**.
- It may occur off-shift or as an on-shift gap.
    - **Current stance:** do **not** hard-fail at runtime save/solve time (we allow infeasibility experiments and imperfect solver outputs).
    - **Recommended:** catch this during dataset export / evaluation dumps (and/or as a separate offline audit) and fix upstream mapping.

**Definitions (source of truth):**
- `crew_on_shift_mask[c,t] = 1` iff crew is scheduled to work (from `Shift` table)
- `assigned_baseline[c,t] = 1` iff `baseline_role[c,t] != ROLE_NONE`
- `assigned_edited[c,t] = 1` iff `edited_role[c,t] != ROLE_NONE`

**Debug assertions (optional, NOT invariants):**
- `assigned_baseline` and `assigned_edited` may differ from `crew_on_shift_mask` because gaps are allowed.

---

### 2b. Eligibility Tensor (Hard feasibility) - SOLVE-TIME INPUT (v1 minimum fix)

**Purpose:** Encode hard constraints that determine which assignments are feasible.

Even with a strong `edit_risk`, Pass 3 may be unable to change the schedule if the only “good” alternatives are infeasible.

**Preferred shape:** `eligible[C×T×R]`
- `eligible[c,t,r] = 1` if crew `c` is allowed to work role `r` at time `t`
- `eligible[c,t,r] = 0` otherwise

If eligibility is time-invariant (`eligible[C×R]`), interpret `eligible[c,t,r] := eligible[c,r]` for all `t`.

**Fallback shape (if time-dependent availability is hard to compute):** `eligible[C×R]`.
*Note: If using fallback, eligibility is assumed time-invariant. Any time-window hard rules must be enforced by the solver via other constraints.*

**Examples of what should be reflected:**
- Crew certification / authorization constraints
- Time-window constraints that forbid certain roles at certain times
- Hard role capacity constraints (if modeled as hard per-time limits)

**How it is used (v1):**
- **Solver Constraints (Pass 3):** Explicitly constrain the solver so it cannot swap to an ineligible role (`x[c,t,r] <= eligible[c,t,r]`).
- Mask Pass-3 penalties: do not apply penalties to assignments where `eligible=0`.
- Mask replacement-role distributions (if we add Head B): do not predict/encourage ineligible roles.

---

### 3. Role Rules Tensor
**Purpose:** Captures each crew member's soft role rules/preferences
**Shape:** `[C × RR × F]` (Crew × Role Rules × Features per rule)

**Variable length note (required for implementation):** `RR` varies per crew.

**Padding + mask strategy (v1):**
- Pad each crew's rules to `RR_max`
- Add `role_rule_mask: [C × RR_max]` where 1 = real rule, 0 = padding
- Encode each rule with an MLP and then do **masked mean pooling** over `RR_max`

This prevents order dependence and keeps tensors fixed-shape.

**Features per role rule:**
| Feature | Type | Description |
|---------|------|-------------|
| `rule_type` | Enum | PREFERRED_HOUR, CANNOT_WORK, TIMING, MAX_CONSECUTIVE, etc. |
| `role_id` | Int | Which role this rule applies to |
| `role_family` | Enum | REGISTER, PRODUCT, DEMO, BREAK, etc. |
| `value` | Int/Float | Rule value (e.g., -1/0/1 for TIMING, hour for PREFERRED_HOUR) |
| `is_soft` | Bool | Soft or hard constraint |

**Note:** `was_satisfied` is NOT included here - that's a training label, not solve-time input.

---

### TRAINING LABELS / HISTORICAL OUTCOMES
*These tensors are computed from HISTORICAL data for training. Not available at solve time.*

### 4. Logbook Tensor (Original & Edited) - TRAINING ONLY
**Purpose:** Historical schedules - both solver-generated original and manager-edited final version
**Shape:** `[C × T × R]` (Crew × Time Slots × Roles)

| Dimension | Size | Description |
|-----------|------|-------------|
| C | Variable (~5-20) | Crew working that day |
| T | 48 | 30-minute slots (full 24 hours, indexed by minutes from midnight) |
| R | ~10-15 | One-hot encoded role assignment |

**Contains:**
- Role assigned at each 30-min slot for each crew
- Empty slots (0) when crew isn't working
- Captures: Register, Product, Demo, Break, Parking Helms, etc.

**Why 30-min granularity:** Matches minimum assignment size (parking helms, breaks)

**We store BOTH:**
- `original_logbook`: Solver output before manager edits
- `edited_logbook`: Final version after manager edits

**Training use:** Model learns diff patterns (what gets edited → avoid those placements)

---

## Label + mask definitions (Phase 1, implementation-grade)

This block is the **source of truth** for Phase 1 supervision and masking.

### Canonical per-slot role extraction

### Slot integrity invariant (v1 hard rule)

This is the **slot integrity** contract for v1 exports and training examples:

- For all `(c,t)`, at most one role is active:

$$
    \sum_r \texttt{schedule}[c,t,r] \in \{0,1\}
$$

This allows `ROLE_NONE` both off-shift and for on-shift gaps.

**Note (runtime vs export):** This doc treats the above as a *data contract* for ML training/eval. We intentionally do **not** enforce these invariants as API hard-fails when persisting solver output, because that blocks infeasibility exploration and makes the pipeline brittle. Instead, enforce them in offline export/audit tooling.

Define:
- `baseline_role[c,t]`: role index for crew `c` at slot `t` in the **Pass 1 baseline** schedule
- `edited_role[c,t]`: role index for crew `c` at slot `t` in the **manager-edited** schedule (training only)

For one-hot / multi-hot tensors `schedule[c,t,r] ∈ {0,1}`:

- If a role is active at `(c,t)`, that role index is the role index.
- If no role is active, role is `ROLE_NONE`.
- If multiple roles are active, treat as a **data error** (hard-fail). As a last-resort debug aid (never normal behavior), you may apply a deterministic tie-breaker:
    1) Prefer `BREAK` if present
    2) Else take `argmax(schedule[c,t,:])`

We include `ROLE_NONE` and `BREAK` in the **global role universe** so this mapping is always defined.

### What counts as an “edit” (v1)

We use **slot edits** in v1:

$$
    \texttt{target\_edit\_slot}[c,t] = \mathbb{1}[\texttt{baseline\_role}[c,t] \ne \texttt{edited\_role}[c,t]]
$$

Interpretation for common manager actions (with gaps allowed):
- **Swap:** `A → B`
- **Fill gap:** `ROLE_NONE → B`
- **Create gap:** `A → ROLE_NONE`

Interpretation for common manager actions:
- Swapping roles between two crew → **two slot edits**
- Moving a break by 30 minutes → typically **two slot edits**
- Splitting/merging blocks → **many slot edits** (each changed slot counts)

### Volatile edit sources policy (v1, data-driven)

We should not hard-code which roles “dominate edits” (BREAK often does, but it’s an assumption).

**V1 policy:** every training run computes an **Edit Profile** from historical diffs, then uses it to:
- identify `volatile_roles` (or volatile role families / time buckets)
- generate loss weights (or split KPIs) so one source can’t dominate training

#### Edit Profile (computed from training data)

For each global role `r`, compute:

- `edit_involvement_rate(r)` = fraction of edited slots where role appears on either side:
    - `(baseline_role == r) OR (edited_role == r)`
- `edit_out_rate(r)` = fraction of edited slots where baseline was `r` and edited changed away
- `edit_into_rate(r)` = fraction of edited slots where edited becomes `r`

Compute the same breakdowns by:
- role family
- hour-of-day buckets
- (optional) rule_type buckets if we can attribute edits to violations

Also compute a **usage rate** for each role (how often it appears in baseline assignments), so we can detect “disproportionate volatility”.

#### Volatile role selection rule

Define `volatile_roles` using a simple threshold rule (tunable):

- **Share-based:** role is volatile if its edit involvement share is ≥ `p` (e.g., `p=0.25`)
- **Disproportionate volatility:** role is volatile if `(edit_involvement_rate / usage_rate) > 2.0`

This catches BREAK if it’s the culprit, but also catches whatever actually dominates (parking helms, demo swaps, register volatility, etc.).

#### Automatic strategies (choose one per run)

**V1 requirement:** implement **Strategy B** and report the **non-volatile KPI** (defined in the evaluation section). 

(Strategy A and Strategy C are allowed experiments later, but are **not required for v1**.)

**Strategy A — Multi-label separation (most robust, Phase 2+ optional):**
- Define `edit_nonvolatile` and `edit_volatile` using the `volatile_roles` set
- Use `edit_nonvolatile` as the primary KPI; track `edit_volatile` separately

**Strategy B — Weighted loss by role involvement (simplest + scalable, REQUIRED v1):**
- Let `share(r)` be role’s edit involvement share
- Define role weight:

$$
    \texttt{w\_role}(r) = \texttt{clamp}\Big(\frac{1}{\sqrt{\texttt{share}(r)}},\; w_{min},\; w_{max}\Big)
$$

- Slot weight uses the role(s) involved in that edit:
    - `role_involved = {baseline_role[c,t], edited_role[c,t]}`
    - `w_slot[c,t] = w_base * max(w_role(role_involved))`

Suggested v1 clamps:
- `w_min=0.25`, `w_max=2.0`

**Strategy C — Curriculum (Phase 2+ optional):**
- Early epochs: Strategy B (broad learning)
- Later epochs: focus on underperforming edit types / non-volatile only

#### Contract: store profile with checkpoint

Every training run must write an `edit_profile.json` next to the checkpoint containing:
- top sources by edit-involvement share (roles/families/hours)
- the chosen `volatile_roles` rule + thresholds
- the generated weights (per role/family/hour bucket)

Inference/evaluation uses the checkpoint’s `edit_profile.json` so metrics are interpreted consistently.

#### Shift invariants & supervision mask (v1)

In v1, the shift definition is fixed for the day, but **gaps are allowed**.

- `crew_on_shift_mask[c,t]` (from `Shift` table) indicates scheduled-to-work slots.
- A slot may still be unassigned (resolve to `ROLE_NONE`) even if `crew_on_shift_mask[c,t] == 1`.
- Slot integrity: at most one active role per slot.

We keep the helper definitions for readability:

- `assigned_baseline[c,t] = 1` iff `baseline_role[c,t] != ROLE_NONE`
- `assigned_edited[c,t] = 1` iff `edited_role[c,t] != ROLE_NONE`

**Expected invariants (v1, must assert at export time):**

$$
    \sum_r \texttt{schedule}[c,t,r] \in \{0,1\}
$$

**Canonical training mask (v1):**

$$
                \\texttt{train\_mask}[c,t] = \texttt{crew\_on\_shift\_mask}[c,t]
$$

**Penalty mask (v1):** Pass-3 penalties apply only where the crew is scheduled and the baseline assigned a role:

$$
                                \\texttt{penalty\_mask}[c,t] = \texttt{crew\_on\_shift\_mask}[c,t] \cdot \texttt{assigned\_baseline}[c,t]
$$

### Output masking (critical)

In a valid baseline schedule, each `(c,t)` has at most one assigned role.
We train a **scalar** loss over `[C×T]`. We do **not** train a dense `[C×T×R]` head in V1.

**V1 masking rule:** train only on scheduled slots.

Define:

$$
                \\texttt{train\_mask}[c,t] = \texttt{crew\_on\_shift\_mask}[c,t]
$$

Pseudo-code:

```python
def compute_train_mask(
    crew_on_shift_mask,       # [C,T] {0,1} (from Shift table)
):
    return crew_on_shift_mask
```

### Replacement-role label (directional edit signal)

Edits are directional (e.g., managers often replace `REGISTER → PRODUCT`, not just “REGISTER is bad”).

For edited slots, store the replacement role label:

- `target_new_role[c,t] = edited_role[c,t]` only where `target_edit_slot[c,t] = 1` **and** `edited_role[c,t] != ROLE_NONE`
- Undefined otherwise (mask it out)

Even if we don’t use it to steer the solver in v1, we will use it for evaluation/debugging to verify the model learns *what managers replace with*, not just *where edits happen*.

---

### 5. Crew History Features (Per-Crew) - SOLVE-TIME AVAILABLE
**Purpose:** Per-crew features computed from **history before the day being solved** (no leakage)
**Shape:** `[C × S]` (Crew × Stats features)

**Core metrics:**
| Metric | Type | Description |
|--------|------|-------------|
| `hist_preferences_met_count` | Int | Preferences met across last N logbooks |
| `hist_preferences_total_count` | Int | Total eligible preferences across last N logbooks |
| `hist_preferences_met_ratio` | Float | met / total |
| `hist_edit_rate` | Float | Fraction of assigned slots historically edited |
| `hist_logbook_count` | Int | Number of historical logbooks used |

**Per-role-family metrics (fixed-size histograms):**
| Metric | Shape | Description |
|--------|-------|-------------|
| `family_time_ratio[family]` | `[F]` | % of shift on each role family (F families) |
| `family_block_histogram[family]` | `[F × 4]` | Histogram: [30min, 60min, 90min, 120min+] block counts |
| `family_block_mean[family]` | `[F]` | Mean block size per family |
| `family_block_max[family]` | `[F]` | Max block size per family |

**Per-individual-role metrics (fixed-size histograms):**
| Metric | Shape | Description |
|--------|-------|-------------|
| `role_time_ratio[role]` | `[R]` | % of shift on each specific role |
| `role_block_histogram[role]` | `[R × 4]` | Histogram: [30min, 60min, 90min, 120min+] block counts |
| `role_block_mean[role]` | `[R]` | Mean block size per role |
| `role_block_max[role]` | `[R]` | Max block size per role |

**Why histograms instead of lists:**
- Variable-length lists (e.g., `[30, 60, 90, ...]`) don't work with fixed tensor shapes
- Histograms are fixed-size (4 bins) and capture the distribution
- Summary stats (mean, max) provide additional signal

---

### 6. Logbook Statistics Tensor (Per-Logbook) - TRAINING ONLY
**Purpose:** Aggregate metrics for the entire logbook
**Shape:** `[L]` (Vector of logbook-level stats)

**Stored for BOTH original and edited versions:**

| Metric | Type | Description |
|--------|------|-------------|
| `total_preferences_met` | Int | Count across all crew |
| `total_preferences_count` | Int | Total preferences across all crew |
| `preferences_met_ratio` | Float | met / total |
| `total_crew_count` | Int | Number of crew in logbook |
| `total_slots_filled` | Int | How many crew-slots have assignments |
| `coverage_ratio` | Float | slots_filled / required_slots |
| `edit_count` | Int | Number of slot changes (original → edited) |
| `edit_ratio` | Float | edit_count / total_slots_filled |

---

### 6b. Baseline Schedule Features (Optional) - PASS 1 DERIVED
**Purpose:** Features computed from the **Pass 1 baseline schedule** for the day being solved
**Shape:** `[C × S_baseline]` (small vector)

Examples:
- role-family mix in baseline schedule
- max consecutive minutes per role in baseline
- baseline rule satisfaction summary (computed post-solve from baseline)

**No leakage:** these come from Pass 1 output, not from manager edits.

**V1 decision:** Remove this from v1.

Rationale:
- The model already consumes `baseline_schedule[C×T×R]`, so a second, derived summary vector adds moving parts.
- If we later see generalization issues, we can reintroduce a *small* `S_baseline` set with a clear ablation.

---

### 7. Crew Ratings Tensor - PHASE 2 ONLY
**Purpose:** Training target - crew satisfaction with THEIR OWN schedule row
**Shape:** `[C]` (One rating per crew)

**Scale:** 1-5 stars (single overall rating, no dimensions)

**Note:** This is NOT used in Phase 1 (edit-learning only). Added in Phase 2.

**Key behaviors:**
- Each crew rates ONLY their own row/schedule
- Rating is optional (incentive: better schedules if you rate)
- Stored in DB: `(crew_id, logbook_id, rating, date)`

---

## Model Architecture

### High-Level Flow (Phase 1 = Two-Pass)
```
Pass 1: Baseline Solve → baseline_schedule
Pass 2: ML Inference → edit_risk_slot
Pass 3: Re-solve with penalties → final schedule
```

### Architecture Diagram (Phase 1 - Two-Pass Edit Learning)
```
═══════════════════════════════════════════════════════════════════════════
                      UNIFIED SCHEDULE LEARNING MODEL (v1)
═══════════════════════════════════════════════════════════════════════════

    INFERENCE INPUTS (runtime)
    ─────────────────────────
    coverage_req ─────→ [Coverage Encoder (Conv1D over time)] ─┐
    [T×R]                                                      │
                                                                                                                         │
    masks ────────────→ [Used for masking/pooling only] ───────┤
    [T] + [C×T]                                                │
                                                                                                                         │
    role_rules ───────→ [Rule Encoder (MLP + masked pool)] ─────┤
    [C×RR×F] + mask                                             │
                                                                                                                         │
    crew_history_features → [MLP Encoder] ──────────────────────┤
    [C×S]                                                      │
                                                                                                                         │
    baseline_schedule (Pass 1 output) → [Conv1D Encoder] ───────┤
    [C×T×R]                                                     │
                                                                                                                         ├──→ [Team Context] → [Fusion] → [Edit-Risk Head]
                                                                                                                         │
                                                                                                                         ▼
                                                                                                     edit_risk_slot[C×T]

    TRAINING LABELS (historical)
    ───────────────────────────
    target_edit_slot[c,t] = 1 where edited_role[c,t] != baseline_role[c,t]
    (masked by train_mask)
```

### Layer Details

**Encoding Stage:**
- Coverage Encoder: Conv1D over time on `[T×R]` (roles as channels) → pooled vector
- Role Rules Encoder: rule MLP per rule → **masked pooling** over `RR_max`
- Crew History Encoder: MLP (S→32)
- Baseline Schedule Encoder: Role embedding (R→32) → Conv1D (k=3, 64 filters) → Conv1D (k=5, 64) → (optionally attention) → outputs per-slot features for edit risk

**Training target construction (Phase 1):**
- `target_edit_slot[c,t] = 1` if crew c's slot t changed in edited vs original
- Optional: `target_edit_role[c,t,r] = 1` if role r differs (for richer supervision)

We train the model to predict edit risk directly from the baseline schedule.

**Team Context Aggregation (NEW):**
- Pool crew embeddings: `team_mean = mean(crew_embeds, dim=0)`
- Pool crew embeddings: `team_max = max(crew_embeds, dim=0)`
- Concatenate back: `crew_final = [crew_embed, team_mean, team_max]`
- **Why:** Allows model to reason about fairness across the team

**Fusion Stage:**
- Concatenate all encodings per crew (including team context)
- MLP: 384 → 256 → 128

**Prediction Heads (Phase 1):**
- Head A: Edit Risk → `edit_risk_slot[C×T]` (bounded [0,1], scalar per slot)

**No learned minority boost head in v1:** minority handling is done via deterministic frequency-based weighting in the loss.

**Phase 2 Additions (future):**
- Head C: Crew Satisfaction → [C] (predicted 1-5 rating)
- Head D: Fairness Adjustments → [C] (based on satisfaction variance)

### Output Guardrails (Bounded Multipliers)

**Problem:** Unbounded multipliers can destabilize the solver.

**Solution:** Use sigmoid to bound outputs to a safe range.

```python
def bounded_sigmoid(raw_output: Tensor) -> Tensor:
    """Bound raw network output to [0, 1] (probability/edit-risk)."""
    return torch.sigmoid(raw_output)

# Example usage in prediction head:
class EditRiskHead(nn.Module):
    def forward(self, x):
        raw = self.linear(x)  # Unbounded
        return bounded_sigmoid(raw)  # Safe [0, 1]
```

**Bounds (Phase 1):**
| Output | Range | Rationale |
|--------|-------|-----------|
| `edit_risk_slot` | [0, 1] | Probability/score used to derive penalties |

### Model Specs
- **Total layers:** ~8-10 (many parallel)
- **Parameters:** ~300K - 500K (smaller for v1)
- **Inference time:** ~5-10ms on Apple MPS, ~20-50ms on CPU
- **Framework:** PyTorch with MPS (Apple Silicon) support

---

## Model Outputs (Phase 1)

The model produces **edit-risk scores** that feed into the solver as **objective penalties**:

| Output | Shape | Range | Description |
|--------|-------|-------|-------------|
| `edit_risk_slot` | `[C × T]` | [0, 1] | Predicted probability/risk that the baseline assignment at (c,t) will be edited |

**How it becomes solver penalties:**
- API converts `edit_risk_slot` to a penalty tensor
- Adds that penalty into the Pass 3 objective so the solver avoids high-risk placements

### Pass 3 objective term (mathematically specified)

Assume the solver uses binary assignment decision variables:

- $x[c,t,r] \in \{0,1\}$ meaning “crew $c$ is assigned to role $r$ at time slot $t$”.

In Pass 3 (Re-solve), we add an ML penalty term **targeted only at the baseline assignment**:

$$
\min\; \; \; \text{(baseline solver objective)} 
\; + \; \lambda_{edit} \sum_{c,t} \Big(
                \\texttt{edit\_risk\_slot}[c,t]
\cdot \mathbb{1}[\texttt{baseline\_role}[c,t] \ne \texttt{ROLE\_NONE}]
\cdot x[c,t,\texttt{baseline\_role}[c,t]]
\Big)
$$

**Why:** This allows the solver to escape the penalty by choosing **any other eligible role**.
If we penalized all roles, the solver might be trapped (forcing understaffing).
By penalizing only the specific decision variable the ML disliked (`baseline_role`), we create a "smart escape artist" dynamic.

Key points:
- `edit_risk_slot ∈ [0,1]` is a scalar probability per slot.
- The penalty applies only if the solver *keeps* the baseline role.
- If the solver swaps to *any* other role, the penalty is 0.

#### Calibration for $\lambda_{edit}$ (v1)

We need $\lambda_{edit}$ large enough to change decisions, but not so large it overrides coverage/fairness.

**V1 guardrail:** compare ML penalty sum against a stable *reference objective component*.

Instead of `|baseline_objective|` (which may mix multiple differently-scaled terms), define:
- `preference_term_sum`: absolute value of the solver’s preference-related objective component (or whichever single component is the main soft guidance term)

Monitor:

$$
    \texttt{penalty\_ratio} = \frac{\lambda_{edit} \sum edit\_risk \cdot x}{|\texttt{preference\_term\_sum}| + \epsilon}
$$

and keep it in a tuning range $\rho \in [0.05, 0.20]$.

If `penalty_ratio` exceeds ρ:
- reduce $\lambda_{edit}$, or
- clamp risks: `edit_risk = clip(edit_risk, 0, r_max)` with `r_max=0.95`, or
- skip Pass 3.

#### Where penalties apply

Penalties apply only where:

$$
                \\texttt{penalty\_mask}[c,t] = \texttt{crew\_on\_shift\_mask}[c,t] \cdot \texttt{assigned\_baseline}[c,t]
$$

### Optional replacement encouragement term (Phase 1 experimental)

If we include a replacement head `p_replace[c,t,r]` (see heads section), we may add a small encouragement term:

$$
- \lambda_{rep} \sum_{c,t,r} \Big(
            \\texttt{penalty\_mask}[c,t]
\cdot \texttt{eligible}[c,t,r]
\cdot p\_replace[c,t,r]
\cdot x[c,t,r]
\Big)
$$

**V1 default:** implement the label + head, but start with $\lambda_{rep}=0$ (debug/eval only).

**Example application (Phase 1):**
```python
# Pass 1: baseline solve
baseline = solve(payload, penalties=None)

# Pass 2: ML predicts edit risk for the baseline schedule
edit_risk = ml.predict(
    coverage_req=coverage_req,
    masks=masks,
    role_rules=role_rules,
    crew_history_features=crew_history_features,
    baseline_schedule=baseline
)

# Pass 3: convert edit risk → objective penalties and re-solve
penalties = LAMBDA_EDIT_RISK * edit_risk
final = solve(payload, penalties=penalties)
```

---

## Integration Flow

### Two-Pass Solve (Phase 1)
```
1. API receives solve request
2. Pass 1: API calls solver baseline → baseline schedule
3. Pass 2: API calls ML server → edit_risk_slot (~5-10ms)
4. Pass 3: API converts edit_risk → penalties and calls solver again (Re-solve)
5. Solver returns improved schedule
```

### Phase 2 Note (future)
- When we add “learned weights” (ratings-driven), the API can still pre-compute final per-crew/per-role weights before calling the solver.
- Phase 1 is **penalty-based** (edit_risk → objective penalties), not weight-based.

---

## Data Collection & Storage

### Target Store
**Training on Store 768** - Our primary test store with real operational data.

### Training Data Requirements

| Data Volume | What You Can Expect |
|-------------|---------------------|
| **10-50 logbooks** | Basic patterns emerge, high variance |
| **50-100 logbooks** | Reliable preference learning, some adjustment patterns |
| **100-200 logbooks** | Good adjustment prediction, stable weights |
| **200+ logbooks** | Full model potential, nuanced per-crew learning |

**Recommended minimum:** **50 logbooks** (10 real + 40 synthetic to start)

**Why 50?**
- ~15 crew × 50 logbooks = 750 crew-schedule samples
- Enough variance to learn preference patterns
- Can bootstrap with synthetic, improve with real data over time

**Data augmentation strategies:**
- Synthetic logbooks with realistic patterns
- Perturb real logbooks (shift times, swap roles)
- Generate fake "manager edits" based on rules you know

### Current Data Available
- ~10 real logbooks to start
- Role rules per crew (in DB)
- RoleFamily table exists ✅
- No adjustment tracking yet
- No crew ratings yet

### New Data Needed

**1. Adjustment Tracking (on Publish):**
```
When manager hits "Publish":
1. Fetch Pass-1 baseline solver output (need to store this!)
2. Compare to current edited version
3. Store both as tensors in ML database
```

### Operations: "Back-Casting" Pipeline (Required)

**Change:** Ensure the model always corrects the current solver, not an old one.

**Problem:** If we train on `original_logbook` from 3 months ago, we are learning to correct v1.0 of the solver. If we are now running v1.5, those corrections might be obsolete or harmful.

**Workflow:** When training, do not use stored `original_logbook` data from months ago.

**Action:**
1. Fetch historical manager edits (the final schedules).
2. **Re-run the CURRENT Pass 1 Solver** on those historical inputs (constraints/requirements from that day).
3. Generate a **fresh baseline** (`baseline_schedule`).
4. Calculate fresh diffs (`target_edit_slot`) between this fresh baseline and the historical manager edit.
5. Train on these fresh pairs.

This ensures the ML always learns "how to fix the solver I am about to use."

**Back-Casting Reconstruction Requirements:**

To re-run "the day" correctly, the following must be stored or reconstructable per historical date:
- `store_customer_open_mask[T]` (customer-facing metrics only)
- `coverage_requirements[T,R]` (from `RoleCoverageWindow`)
- `shifts` (from `Shift` table) — **mandatory in v1** to reconstruct `crew_on_shift_mask[C×T]`
- `eligible[C,R]` (from `CrewRole` + `RoleRule` FORBID entries)

**Eligibility drift handling (v1 pragmatic fix):**
- Use **current** eligibility for back-casting (simplest).
- Log an `eligibility_drift_flag = True` when:
    - A role was historically used but is now ineligible, OR
    - A role is now eligible but wasn't used historically
- Include `eligibility_drift_flag` in training metadata.
- Monitor drift rate; if > 10% of training samples have drift, investigate before trusting model.

### ROLE_OTHER frequency gate (prevent junk-bucket learning)

During export/training, compute:

- `role_other_freq = (# assigned slots with role == ROLE_OTHER) / (# assigned slots)`

**V1 requirement:** `role_other_freq < 0.02` (2%).

If exceeded, block training and require updating the global role mapping.

Training-time policy (v1):
- Default: train on the most recent solver version(s)
- If mixing versions, include `solver_version` as an input feature or stratify evaluation by version

**2. Crew Ratings Table:**
```sql
CREATE TABLE crew_ratings (
    id SERIAL PRIMARY KEY,
    crew_id INT NOT NULL,
    logbook_id INT NOT NULL,
    rating INT CHECK (rating >= 1 AND rating <= 5),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**3. Crew Rating Web App:**
- Simple mobile-friendly page
- Crew opens link, sees their schedule, submits 1-5 rating
- Optional submission (incentive = better future schedules)

### Synthetic Data Generator
- Build script to create fake shifts/constraints for testing
- Manually edit to simulate manager adjustments
- Bootstrap training before real data accumulates

---

## Training Strategy

### Data Isolation
- **Per-store training** - each store has its own model weights
- Stores learn their own patterns/preferences independently
- New stores start with base model, specialize over time

### Loss Functions (Phase 1 - Edit Learning)
```python
# Phase 1: Supervised edit-risk prediction
# target_edit_slot is derived from (original_logbook, edited_logbook)

# w_slot is computed from the checkpoint's edit_profile (data-driven volatility handling)

# train_mask: [C,T]
train_mask = crew_on_shift_mask

# Target: [C,T]
target = target_edit_slot

edit_prediction_loss = weighted_masked_bce(
    predicted=edit_risk_slot,
    target=target,
    mask=train_mask,
    weight=w_slot,  # [C,T] derived from edit_profile.json
)

# Optional (recommended): replacement-role head loss (only where edited)
# p_replace is softmax over roles; mask out ineligible roles before softmax.
replace_loss = masked_cross_entropy(
    predicted_logits=replace_logits,         # [C,T,R]
    target_index=target_new_role,            # [C,T] int
    mask=(train_mask * target_edit_slot),    # [C,T]
)

# Minority handling is deterministic:
# - Use inverse-frequency weights per rule_type / role / hour bucket when computing loss
# - No learned minority_boosts head in v1

total_loss = α * edit_prediction_loss + β * replace_loss
```

### Phase 2 Loss (Future - Add Satisfaction)
```python
# Phase 2: Add crew satisfaction learning
total_loss = (
    α * edit_prediction_loss +
    β * satisfaction_loss +         # MSE on predicted vs actual crew ratings
    γ * fairness_loss +             # Penalize high satisfaction variance
    δ * regularization
)
```

### Minority Preference Handling
- Track preference type frequency across training data
- Inverse-weight rare preferences in loss function
- Prevents model from ignoring minority preferences

**Note (v1):** Minority boosts are *not* a learned head. They are handled via deterministic loss weighting.

### Cold Start Strategy (New Stores)

**Approach: Hybrid Base Model + Confidence Scaling**

New stores don't start from scratch - they leverage patterns learned from existing stores.

**How it works:**

1. **Base Model:** Trained on Store 768 data (universal scheduling patterns)
2. **New stores** start with base model immediately
3. **Confidence scaling** blends base vs store-specific predictions
4. **Continuous learning** as store-specific data accumulates

```python
class StoreModel:
    def __init__(self, store_id: int):
        self.store_id = store_id
        self.base_model = load_base_model()  # Trained on Store 768
        self.store_weights = None  # Fine-tuned for this store
        
    def get_confidence(self) -> float:
        """How much to trust store-specific learning vs base model"""
        logbook_count = get_logbook_count(self.store_id)
        
        # Phase 1: Only need logbooks (edits)
        # Phase 2: Will also factor in rating_count
        return min(logbook_count / 50, 1.0)
    
    def predict(self, inputs):
        base_pred = self.base_model(inputs)
        
        if self.store_weights is None:
            return base_pred  # Pure base model
        
        store_pred = self.store_model(inputs)
        confidence = self.get_confidence()
        
        # Blend predictions
        return confidence * store_pred + (1 - confidence) * base_pred
```

**Confidence progression (Phase 1):**

| Store Data | Confidence | Behavior |
|------------|------------|----------|
| 0 logbooks | 0% | Pure base model |
| 25 logbooks | 50% | 50% base, 50% store-specific |
| 50+ logbooks | 100% | Fully store-specific |

**What transfers from base model:**
- "Long consecutive blocks are often edited"
- "Break timing patterns"
- "Common role sequence issues"

**What stores learn individually:**
- Manager's specific editing habits
- Crew-specific preference weights
- Store-unique role patterns

---

## Evaluation + guardrails (Phase 1 must-have)

We need metrics that answer: “Did Pass 3 reduce edits *without breaking solver quality or runtime?*”

### Daily metrics (per logbook/day)

Compute each metric for:
- Baseline (Pass 1)
- ML two-pass (Pass 3)

**Edit reduction (primary success metric):**
- `edit_count`: number of `(c,t)` slots where final differs from baseline
- `edit_ratio = edit_count / total_assigned_slots`

**Two-metric evaluation (required to avoid self-deception):**

| Metric | Definition | Purpose |
|--------|------------|---------|
| `edit_avoidance_proxy` | `diff(Pass3, Pass1)` | Did ML actually change anything? Immediate feedback. |
| `true_edit_reduction` | Compare `diff(manager_final, Pass1)` vs `diff(manager_final, Pass3)` | Did it reduce what the manager still had to fix? Ground truth. |

Both metrics must be tracked. If you only track `edit_avoidance_proxy`, you can "change a lot" but not reduce manager work.

**Edit-profile reporting (required so we can’t fool ourselves):**
- `edit_ratio_by_role_family` (top 5 families)
- `edit_ratio_top_source` (whatever the checkpoint’s #1 edit source is)
- `edit_ratio_nonvolatile`: edit ratio after excluding `volatile_roles` as defined by the checkpoint’s `edit_profile.json`
- Always report both:
    - `overall_edit_ratio`
    - `edit_ratio_nonvolatile`

This makes the “dominant edit source” data-driven; if tomorrow it’s not breaks but “REGISTER in last hour”, we’ll see it immediately.

**Solver quality / drift:**
- Coverage: any unmet coverage constraints / shortfalls (must remain within baseline tolerance)
- Fairness / distribution: same fairness metrics you already track (compare Pass 3 vs Pass 1)
- Preference satisfaction: overall preference score (compare Pass 3 vs Pass 1)

**Runtime:**
- `t_pass1_ms`, `t_ml_ms`, `t_pass3_ms`, `t_total_ms`
- Track p50/p95 over time

**Safety / dominance check:**
- `ml_penalty_sum = λ_edit * Σ edit_risk * x`
- `penalty_ratio = ml_penalty_sum / (|preference_term_sum| + ε)`
- Enforce `penalty_ratio ≤ ρ` (v1 target ρ ∈ [0.05, 0.20])

**Boxed-in Precheck (Optimization):**
To avoid wasting compute on doomed Pass 3 re-solves:
- For each `(c,t)` where `edit_risk > 0.5`:
    - Count `num_alternatives = count(eligible[c,:] == 1) - 1` (excluding baseline role)
        - Canonical v1 export is time-invariant `eligible[C×R]`. If you conceptually use `eligible[c,t,:]`, interpret it as `eligible[c,:]` broadcast across all `t`.
- If `mean(num_alternatives) < 0.5` for high-risk slots, skip Pass 3 (log "boxed in").

**No-change escape hatch (solver boxed-in detection):**
Sometimes Pass 3 will be identical to Pass 1 because constraints/eligibility leave no alternative. That's not a model failure.
- `no_change_rate = pct of (c,t) where Pass3_role == Pass1_role`
- `day_identical = True` if Pass 3 schedule is identical to Pass 1
- If `no_change_rate > 0.95` or `day_identical`, log as "solver boxed-in" (don't over-tune λ).

**Penalty direction sanity check (masking bugs early):**
Because penalties only apply to the baseline role, assert:
- Penalties only applied where `penalty_mask[c,t] = 1`
- Log `penalty_applied_slots` count per day
- If `penalty_applied_slots == 0` but `mean(edit_risk_slot) > 0`, masking is broken.

**Pareto guardrail (don't get worse):**
- Pass 3 must not reduce preference satisfaction below baseline by more than $\delta$ unless it reduces edits by “a lot”.
    - Example policy: allow `pref_drop ≤ δ` unless `edit_ratio` improves by ≥ X%.
    - This turns “reduce edits” into “reduce edits without unacceptable objective drift”.

### Fallback + anomaly handling (production requirements)

**Always-safe fallback:**
- If ML server fails / times out → return Pass 1 baseline schedule

**Runtime fallback (two-pass cost control):**
- If `t_pass1_ms` exceeds a threshold (e.g., store-specific p95), skip Pass 3.
- Set a stricter time limit for Pass 3 (e.g., 20–30% of Pass 1 time limit) since it’s a refinement.

**Risk sanity checks (skip Pass 3 if violated):**
- If `mean(edit_risk)` is extremely high (e.g., > 0.9) or variance is near-zero (degenerate constant output)
- If penalties would violate `penalty_ratio ≤ ρ` even after clamping

**Clamping rules (v1):**
- `edit_risk = clip(edit_risk, 0.0, 0.95)`
- Apply masks: penalties only where `penalty_mask=1`

### Online A/B testing

When stable:
- Randomly assign days to baseline vs two-pass (per store)
- Compare edit_ratio and drift metrics over at least 2–4 weeks

---

## Appendix: Failure Modes + Mitigations (operational spec)

1) **Pass-3 penalties are ignorable** (objective dominated / constraints force same choice)
    - Penalty applies **only to baseline role** via `x[c,t,baseline_role[c,t]]`; swapping to any other eligible role escapes the penalty (see V1 Policies #1)
    - Calibrate $\lambda_{edit}$ using `penalty_ratio` against a stable anchor (`preference_term_sum`)

2) **No guidance toward alternatives**
    - Store `target_new_role[c,t]` and train `p_replace[c,t,r]` on edited slots
    - Start with $\lambda_{rep}=0$; use replacement accuracy for debugging before encouraging replacements

3) **Break edits swamp learning**
    - Compute `edit_profile.json` (role/family/hour involvement shares)
    - Use volatility-aware weighting or split KPIs into volatile vs non-volatile

4) **Shift/holes assumptions violated (should not happen in v1)**
    - Slot integrity is $\sum_r \texttt{schedule}[c,t,r] \in \{0,1\}$; gaps are allowed.
    - Train mask is `train_mask = crew_on_shift_mask`.

5) **Replacement is infeasible**
    - Add `eligible[c,t,r]` (or `[c,r]`) and mask penalties / replacement distributions

6) **Training data not from Pass-1 baseline source**
    - Store `baseline_source` and train only on matching baseline solver samples (v1)

7) **ROLE_OTHER becomes a junk bucket**
    - Gate training if `role_other_freq ≥ 2%`; force role mapping update

8) **Two-pass runtime too slow**
    - Skip Pass 3 when Pass 1 is already slow; shorten Pass-3 time limit

---

## Deployment

### Development (Local)
```
apps/
├── api/           (Node.js - port 4000)
├── solver-python/ (Python solver)
├── ml/            (NEW - Python ML server - port 5000)
└── web/           (Next.js frontend)
```

### Hardware
- **Apple M-series (MPS):** ~5-10ms inference, training during lunch break
- **CPU fallback:** ~20-50ms inference, still fast enough
- **No GPU required** for this model size

### Production Options
1. **Same server as API** - ML as subprocess/sidecar
2. **Google Cloud Run** - Serverless, ~$5-20/month
3. **Modal.com** - Easy Python deploy, free tier available

---

## Implementation Phases

### Phase 1: Infrastructure (Week 1) - EDIT LEARNING
- [ ] Create `apps/ml/` directory structure
- [ ] Set up PyTorch project with MPS support
- [ ] Create database table for adjustment storage (original vs edited)
- [ ] Build synthetic data generator for testing

### Phase 2: Data Pipeline (Week 2)
- [ ] Implement adjustment tracking on Publish
- [ ] Store Pass-1 baseline solver output before edits
- [ ] Build tensor conversion utilities (with histograms, masks)
- [ ] Export training data script

### Phase 3: Model Core (Week 3)
- [ ] Implement tensor encoders (Conv1D, MLP)
- [ ] Build team context aggregation layer
- [ ] Build fusion layer
- [ ] Create Phase 1 prediction head (edit_risk_slot[C×T])
- [ ] Implement bounded output layer (sigmoid)
- [ ] Set up training loop with masked BCE loss

### Phase 4: Integration (Week 4)
- [ ] FastAPI server for ML inference
- [ ] API integration (two-pass: baseline solve → ML → re-solve)
- [ ] Penalty mapping logic (edit_risk → objective penalties)
- [ ] End-to-end testing

### Phase 5: Training & Tuning (Week 5+)
- [ ] Train on synthetic + real data
- [ ] Evaluate edit avoidance
- [ ] Tune minority boosting
- [ ] A/B test ML-enhanced vs baseline solver

### Phase 6: Add Crew Ratings (Future)
- [ ] Create crew_ratings DB table
- [ ] Build crew rating web app
- [ ] Add satisfaction prediction head
- [ ] Add fairness head
- [ ] Multi-objective training (edits + satisfaction)

---

## Open Implementation Questions

### Q1: What are the exact solver knobs today?
**Need to document:** The current weight config object passed to CP-SAT/ILP.
```python
# TODO: Paste current solver_config structure here
# e.g., { "PREFERENCE_WEIGHT": 50, "CONSECUTIVE_PENALTY": 10, ... }
```

**Relevant current solver behavior (confirmed in repo):** solver preference weights are computed as
`baseWeight * crewWeight * adaptiveBoost` per `(crew_id, role_id)`.

### Q2: What is the canonical role universe?
We need a **global, stable** role mapping so:
- tensors have a consistent shape across stores
- we can train a base model and fine-tune per store without reshaping

**Spec (v1):**

- Define a `global_role_index` mapping from a stable role key (e.g., `role_id` or `{roleFamily}:{roleName}`) to an index `r ∈ [0, R_global)`.
- Reserve two special roles in the global universe:
    - `ROLE_NONE`: no assignment at `(c,t)`
    - `ROLE_OTHER`: unknown/unmapped role fallback

**Per-store behavior:**
- Each store activates a subset of global roles.
- Roles not present in a store are represented with all-zero channels in tensors.
- Any role not in `global_role_index` maps to `ROLE_OTHER`.

**Role families:**
- Each global role maps to exactly one role family.
- If a store doesn’t use a family, family-level histogram/time-ratio features are zeros.

**Padding behavior:**
- `R` in all tensor shapes refers to `R_global`.
- Store-specific roles do **not** change tensor dimensions.

**Versioning:**
- Maintain `role_universe_version` alongside training examples and model checkpoints.
- If the mapping changes (new roles added), increment the version and keep backward-compatible loaders.

### Q3: What are all the rule_type values?
**Need to enumerate:** All soft rule types with their type-specific fields.
```python
# Current RoleRuleType enum (from Prisma):
# CANNOT_BE_ASSIGNED_BEFORE
# CANNOT_BE_ASSIGNED_AFTER
# MIN_CONSECUTIVE_MINUTES
# MAX_CONSECUTIVE_MINUTES
# FORBID_ROLE
# TIMING
# LIKE_ROLE_FOR_HOUR_X
# DISLIKE_ROLE_FOR_HOUR_X
# MIN_SHIFT_LENGTH_FOR_ACCESS
# ASSIGN_BEFORE_SHIFT_MIN_X
# ASSIGN_AFTER_SHIFT_MIN_X
# MAX_CREW_ON_AT_A_TIME
# ALLOW_HALF_BLOCKSIZE
# DISTRIBUTION_BETWEEN_ROLE_X
# CANNOT_ASSIGN_DURING_STORE_HOUR_X
```

### Q4: What is the model's action space?
**Answer:** The model outputs:
- `edit_risk_slot[C × T]` - bounded [0,1]

API maps this into Pass 3 solver objective penalties.

### Crew identity + permutation invariance (v1 + future)

The schedule problem is permutation-invariant in crew ordering, but the model still needs a stable notion of each crew member’s tendencies.

**V1 decision:** no learned crew-ID embeddings.
- Crew is represented by:
    - `crew_history_features[c,:]`
    - `role_rules[c,:,:]`
    - plus pooled team context (mean/max)
- This avoids cold-start complexity and makes inference robust to unseen crew.

**Future option (Phase 2+):** learned crew embeddings
- If we add embeddings keyed by `crew_id`, define cold-start as:
    - unseen crew → use a learned `CREW_UNKNOWN` embedding, plus history features
    - optionally initialize from role-family histogram centroid

### Q5: How many days of history for training?
**Recommendation:** 
- Start with all available history (10 logbooks)
- Add synthetic to reach 50
- No sliding window needed at this scale
- Future: Consider last 90 days if data grows large

---

## File Structure

```
apps/ml/
├── logbook_ml/
│   ├── __init__.py
│   ├── model/
│   │   ├── __init__.py
│   │   ├── unified_model.py      # Main PyTorch model
│   │   ├── encoders.py           # Conv1D, MLP encoders
│   │   ├── fusion.py             # Fusion layer
│   │   └── heads.py              # Prediction heads
│   ├── data/
│   │   ├── __init__.py
│   │   ├── tensors.py            # Tensor schema definitions
│   │   ├── dataset.py            # PyTorch Dataset class
│   │   ├── loader.py             # Data extraction from API/DB
│   │   └── synthetic.py          # Synthetic data generator
│   ├── training/
│   │   ├── __init__.py
│   │   ├── trainer.py            # Training loop
│   │   ├── losses.py             # Multi-task loss functions
│   │   └── metrics.py            # Evaluation metrics
│   └── inference/
│       ├── __init__.py
│       ├── predictor.py          # Inference utilities
│       └── server.py             # FastAPI server
├── scripts/
│   ├── train.py                  # Training script
│   ├── evaluate.py               # Evaluation script
│   └── export_training_data.py   # Data export from DB
├── tests/
│   └── ...
├── checkpoints/                  # Saved model weights
├── pyproject.toml
└── README.md
```

---

## Summary of Decisions

| Topic | Decision |
|-------|----------|
| **Scope** | Phase 1 = two-pass edit-risk learning, Phase 2 = add crew ratings |
| **Time granularity** | 30-minute slots (48 slots for 24 hours) |
| **Logbook shape** | `[C × T × R]` (Crew × 48 slots × Roles) |
| **Coverage requirements** | `[T × R]` tensor for staffing demand |
| **Masks** | `store_customer_open_mask[T]` (metrics only) + `crew_on_shift_mask[C×T]` (training/penalties) |
| **Adjustment representation** | Dual tensor (original + edited) used to derive edit-mask labels |
| **Block sizes** | Fixed-size histograms [4 bins] + mean/max stats |
| **Team context** | Mean/max pooling across crew → concatenate back |
| **Output guardrails** | `edit_risk` bounded via sigmoid [0, 1] |
| **Coverage encoder** | Conv1D over time on `[T×R]` (roles as channels) |
| **Role rules variable length** | Pad to `RR_max` + `role_rule_mask` + masked pooling |
| **Crew features** | `crew_history_features` are solve-time available (no leakage) |
| **Phase 1 input requirement** | Requires Pass 1 baseline schedule at inference (two-pass) |
| **Model architecture** | Conv1D + MLP encoders + Team context + Fusion + Edit-risk head |
| **Phase 1 head** | Edit risk `edit_risk_slot[C×T]` trained with masked BCE |
| **Phase 2 heads** | C) Satisfaction prediction [C], D) Fairness adjustments [C] |
| **Crew ratings** | 1-5 stars, single overall - Phase 2 only |
| **Integration timing** | Two-pass: baseline solve → ML → re-solve |
| **Penalty application** | API converts edit_risk → penalty terms in objective |
| **Data isolation** | Per-store (Store 768 first) |
| **Training data target** | 50+ logbooks (10 real + 40 synthetic to start) |
| **Cold start strategy** | Hybrid: Base model (Store 768) + confidence scaling |
| **Deployment** | Local (Apple MPS) for dev, Cloud Run for prod |
| **Model size** | ~300K-500K parameters, ~5-10ms inference |

---

## Data Mapping & Schema Integration

The integration bridge between the Relational DB (Prisma) and PyTorch Tensors happens in the data extraction layer.

### 1. The Core Mapping: DB → Tensors

### Export-time hard-fail assertions (v1)

These assertions should run during export (both for back-casting training data and for any evaluation dumps). If any fails, **hard-fail** the export and fix the upstream mapping/data.

**Slot integrity (baseline AND edited):**
- For all `(c,t)`: $\sum_r schedule[c,t,r] \in \{0,1\}$.
- `ROLE_NONE` means “unassigned slot” and is allowed both off-shift and as an on-shift gap.

**Eligibility guardrail (already required):**
- For every slot where `baseline_role[c,t] != ROLE_NONE`, the assigned role must be eligible.

**A. Baseline Schedule Tensor (`baseline_schedule`)**
- **Source Table:** `Assignment` where `origin = ENGINE` and `logbookId` matches the Pass 1 result.
    - Pass 3 / final schedules may use `origin = ML_ADJUSTED`.
- **Logic:**
    - Find all assignments for a specific `logbookId`.
    - Map `startTime` and `endTime` into 48 time slots (30-min increments).
    - **Slot Granularity:** Floor timestamps to the nearest 30-min block.
- **Tensor Shape:** `[C, T, R]` (One-hot encoded).
- **Export Format:** `[{ "crew_id": "ABC1234", "slot_idx": 20, "role_id": 5 }, ...]`

**B. Eligibility Tensor (`eligible`)**
- **Source Table:** `CrewRole` (Mapping which crew are certified for which roles).
- **Logic:** If a `(crewId, roleId)` pair exists in `CrewRole`, `eligible[c, r] = 1`.
- **Advanced V1:** Use `RoleRule` + `CrewRoleRule` where `type = FORBID_ROLE` to zero out specific indices even if certified.
- **Tensor Shape:** `[C, R]` (broadcast to `[C, T, R]` if needed).

**V1 Eligibility Guardrail (required assertion):**
During export, assert that every `(crew, role)` used in the baseline has `eligible=1`:
```python
for c, t in all_slots:
    role = baseline_role[c, t]
    if role != ROLE_NONE:
        assert eligible[c, role] == 1, f"Mapping bug: crew {c} assigned role {role} but not eligible"
```
If this assertion fails, it's a mapping bug (not a model bug). Fix the eligibility tensor before training.

**C. Role Rules Tensor (`role_rules`)**
- **Source Tables:** `RoleRule` (Template) + `CrewRoleRule` (Crew-specific).
- **Mapping:**
    - `RoleRule.type` (Enum) → Integer ID for `rule_type` feature.
    - `RoleRule.constraintType` → 0 for SOFT, 1 for HARD.
    - `CrewRoleRule.valueInt` → `value` feature.
- **Tensor Shape:** `[C, RR_max, F]`.

**D. Historical Edit Labels (Training Only)**
- **Source Table:** `Assignment` filtered by `logbookId`.
- **Diff Logic:**
    - Pull `Assignment` where `origin = ENGINE` (ML input).
    - Pull `Assignment` where `origin = MANUAL` (Manager fix).
    - Compare per slot. If `roleId` differs, `target_edit_slot[c, t] = 1`.
- **Mask derivation (source of truth):**
    - `crew_on_shift_mask[c,t]` comes from the `Shift` table.
    - Never derive “on shift” from `role != ROLE_NONE`.
        - `assigned_baseline` / `assigned_edited` are derived from roles and may be 0 even when `crew_on_shift_mask == 1` (gaps allowed).

### 2. The JSON "Edit Profile" (Checkpoint Contract)

Generated at the start of every training run to handle volatility.

```json
{
  "checkpoint_id": "v1_2025_12_17",
  "volatile_roles": [102, 105], // Role IDs for "BREAK" or "PARKING"
  "role_weights": {
    "101": 1.0,  // Register: Standard weight
    "102": 0.25, // Break: High volatility, low weight (Strategy B)
    "108": 1.85  // Specialized Tech: Rare edits, high weight
  },
  "family_shares": {
    "1": 0.45,   // Frontend family involved in 45% of edits
    "2": 0.10    // Backoffice family involved in 10% of edits
  }
}
```

### 3. Crew History Features (`CrewHistory` Tensor)

- **Metric: `hist_edit_rate`**
    - Query: Count `Assignment` for `crewId` where `origin = MANUAL` / Total Assignments over last 30 days.
- **Metric: `family_time_ratio`**
    - Query: Sum duration of `Assignment` grouped by `Role -> RoleFamily`.
- **Metric: `hist_preferences_met_ratio`**
    - Query: Use `PreferenceSatisfaction` table. `AVG(satisfaction)` for that `crewId` over last 10 logbooks.

### 4. DB Schema Updates (Implemented)

- **`AssignmentOrigin` Enum:** Added `ML_ADJUSTED` to track ML-influenced schedules.
- **`MLEditAudit` Table:** Added to snapshot diffs at publication time.

---

