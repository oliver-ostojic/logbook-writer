# Implementation Plan: Logbook Writer Tuning Machine

**Project:** Logbook Writer – Tuning Engine Integration  \
**Objective:** Implement a feedback control loop that optimizes **CrewRoleRules weights** to maximize global satisfaction while maintaining fairness.

---

## Phase 1: Architecture Overview

The system operates as a **Human-in-the-Loop optimization cycle**. It does not just solve for the best schedule once; it iteratively refines the **importance** (weight) of every preference based on the results of the previous attempt.

### The Core Loop

1. **Warm Start:** Initialize weights.
2. **Solver Run:** Generate a schedule ($N$).
3. **Analysis:** Compare $N$ to $N-1$ using the Difference Matrix.
4. **Tuning:** Adjust weights based on **Pain** (lost preferences) vs. **Gain** (won preferences).
5. **Repeat:** Until stability is reached.

---

## Module 1: The Driver (MVP)

**Goal:** Establish the feedback loop. Prove that changing weights alters the schedule.

### 1.1 Logic Flow

1. **Initialize:** Set all CrewRoleRule weights ($W$) to 1.0.
2. **Run Solver:** Generate the first schedule ($\text{Logbook}_0$).
3. **Vectorize:** Convert the schedule into a Satisfaction Vector ($S$)—a list of 1s (Satisfied) and 0s (Unsatisfied) for every rule.
4. **Calculate Global Score:**

$$
Score = \frac{\sum_i (S_i \times W_i)}{\sum_i W_i}
$$

5. **Naïve Tuning:**
   - Identify every rule where $S_i = 0$.
   - Increase weight by fixed step (e.g., +0.5).
6. **Loop:** Run the solver again with new weights.

### 1.2 Verifiable Success

- [ ] Does the Global Score change between Run 0 and Run 1?
- [ ] Do rules that were 0 in the first run flip to 1 in the second run?

---

## Module 2: The Stabilizer (Differential Analysis)

**Goal:** Prevent the “Ping-Pong Effect” (Oscillation) where satisfying Crew A breaks Crew B, ad infinitum.

### 2.1 The Difference Matrix

Compare the current run ($t$) to the previous run ($t-1$).

$$
D = S_t - S_{t-1}
$$

Interpretation:
- **+1 (Gain):** We won a new preference.
- **−1 (Pain):** We lost a preference that was previously satisfied. *(Critical warning)*
- **0 (Stagnant):** No change.

### 2.2 Volatility Check (Hamming Distance)

Calculate the total number of bit flips between satisfaction vectors:

$$
H = \sum_i \lvert S_t(i) - S_{t-1}(i) \rvert
$$

Logic:
- If $H > \text{MaxVolatility}$ (e.g., 10% of total rules), **reject the new weights**. The result is too chaotic.

### 2.3 Damped Tuning

Replace naïve tuning with a damped update to prevent overshooting.

- Learning rate: $\alpha = 0.2$

$$
W_{new} = W_{current} + \alpha \times (TargetWeight - W_{current})
$$

### 2.4 Verifiable Success

- [ ] The system stops oscillating between two distinct schedules.
- [ ] Total iterations to convergence decreases.

---

## Module 3: The Equalizer (Fairness)

**Goal:** Ensure the high score isn’t achieved by sacrificing one specific crew member.

### 3.1 Gini Coefficient Calculation

1. Calculate satisfaction % for each crew member individually ($C_1, C_2, \ldots, C_n$).
2. Compute **Gini coefficient** ($G$):

- $0.0$ = Perfect equality
- $1.0$ = One person has everything

### 3.2 Fairness Weighting

Adjust tuning aggression based on the crew’s standing:

- **Bottom 10% crew:** Apply **2×** multiplier to their weight boosts.
- **Top 10% crew:** Apply **0.5×** multiplier (or freeze) their weight boosts.

### 3.3 Verifiable Success

- [ ] The gap between the “Happiest Crew” and “Saddest Crew” shrinks over iterations.
- [ ] No single crew member remains at 0% satisfaction if a solution exists.

---

## Module 4: The Pruner (Optimization Intelligence)

**Goal:** Stop the solver from trying to solve the impossible (dead ends).

### 4.1 Stagnation Detection

Track “zero-chains” in the Difference Matrix.

Condition:
- If a rule has been unsatisfied for 3 consecutive iterations despite weight increases:

$$
Rule_i \in \{0_t, 0_{t-1}, 0_{t-2}\}
$$

### 4.2 The “Lock” Action

Mark rule $i$ as **Unsatisfiable / Hard Constraint Conflict**.

- Freeze weight: stop increasing its weight to prevent value explosion.
- Report: return these rules to the user as “Impossible Requests.”

### 4.3 Verifiable Success

- [ ] Solver time decreases (weights don’t explode to infinity).
- [ ] System produces a clean list of “Unsatisfiable” rules at the end.

---

## Developer Checklist (VS Code)

### Phase 1: Setup

- [ ] **Vectorizer function:** Transform CrewRoleRules output into a `[0, 1, 0, 1, ...]` array.
- [ ] **Global score function:** Calculate weighted average of the vector.

### Phase 2: Comparison Logic

- [ ] **Comparator function:** Perform $Vector_N - Vector_{N-1}$.
- [ ] **Hamming calculator:** Sum the absolute differences.

### Phase 3: Tuning Logic

- [ ] **Damping math:** Implement the $W_{new}$ update formula.
- [ ] **Gini math:** Implement standard Gini coefficient formula.

### Phase 4: Control Loop

- [ ] **While loop:** Wrap the solver.
- Break condition 1: Improvement stalls (<1% gain).
- Break condition 2: Volatility low (Hamming distance near 0).
- Break condition 3: Max iterations reached (safety).
