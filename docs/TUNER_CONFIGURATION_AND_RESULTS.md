# Tuner Configuration & Results Summary

## Executive Summary
We have successfully implemented and validated the "Tuning Machine" architecture for the schedule solver. The system uses a feedback loop to dynamically adjust constraint weights, optimizing for both total crew satisfaction and equitable distribution of satisfaction (fairness).

After extensive A/B testing, the **Final Configuration** selected is **Volatility Rejection + Fairness**. This configuration provides the most stable and consistent improvements, mitigating the high variance observed in other modes.

## Final Configuration Parameters

To run the solver with the optimal configuration, use the following settings:

### Mode 1: Standard Production (Balanced)
*Best for typical usage. Fast, stable, and fair.*

```bash
python analyze_portfolio_vs_seeded.py \
  --tune-portfolio \
  --use-annealing \
  --use-locking \
  --use-fairness \
  --use-volatility-rejection \
  --final-shots 3
```

### Mode 2: Parallel Expedition (Ultimate Quality)
*Best for offline generation or when quality matters more than cost. Uses all CPU cores to explore multiple solution regions.*

```bash
python analyze_portfolio_vs_seeded.py \
  --tune-portfolio \
  --use-annealing \
  --use-locking \
  --use-fairness \
  --use-volatility-rejection \
  --parallel-regions 5 \
  --shots-per-region 3
```

### Parameter Descriptions

| Parameter | Value | Description |
|-----------|-------|-------------|
| **Annealing** | `True` | Uses simulated annealing (temp decay 0.95) to escape local optima. |
| **Locking** | `True` | Permanently locks weights for rules that are consistently UNSAT (Pruner module). |
| **Fairness** | `True` | **Module 3 (Equalizer)**: Calculates Gini coefficient. Boosts weights for bottom 10% of crew (2x) and reduces for top 10% (0.5x) to compress the satisfaction spread. |
| **Volatility Rejection** | `True` | **Module 2 (Stabilizer)**: Calculates Hamming distance between iterations. Rejects weight updates if >10% of rule statuses flip, preventing chaotic "thrashing". |
| **Final Shots** | `3` | Runs the final solve 3 times with the best weights and picks the winner to mitigate solver randomness. |
| **Parallel Regions** | `5` | **(Expedition Mode)** Splits the search into 5 independent regions (random seeds) running in parallel. |
| **Shots per Region** | `3` | **(Expedition Mode)** Runs a 3-step "Ladder" in each region, where each step passes its solution as a hint to the next. |
| **Selection Metric** | `Combined` | Winner is chosen by `Score = Satisfaction + (0.5 * Fairness_Index)`. |

---

## Architecture Overview

The Tuner consists of four interacting modules:

1.  **Module 1: Driver (Orchestrator)**
    -   Manages the tuning loop (iterations, time limits).
    -   Applies weight updates based on rule violations.

2.  **Module 2: Stabilizer (Volatility Rejection)**
    -   **Goal**: Prevent the tuner from making wild jumps that destabilize the schedule.
    -   **Mechanism**: Measures "Hamming Distance" (number of rules changing state from Satisfied <-> Violated). If distance > Threshold, the update is rejected.

3.  **Module 3: Equalizer (Fairness)**
    -   **Goal**: Ensure satisfaction is not hoarded by a few lucky crew members.
    -   **Mechanism**:
        -   Computes **Gini Coefficient** (0.0 = perfect equality, 1.0 = perfect inequality).
        -   Identifies "Haves" (Top 10%) and "Have-nots" (Bottom 10%).
        -   Applies multipliers to their specific constraint weights to force the solver to prioritize the "Have-nots".

4.  **Module 4: Pruner (Locking)**
    -   **Goal**: Stop wasting energy on impossible constraints.
    -   **Mechanism**: Detects "Dead Ends" (rules that are never satisfied despite high weights). Locks them to prevent infinite weight inflation.

---

## Validation Results

We compared two primary configurations to make the final decision.

### Configuration A: Volatility Only (No Fairness)
*Optimizes purely for total score, rejecting chaotic moves.*
-   **Avg Improvement**: +5.93 (Higher Peak)
-   **Standard Deviation**: 7.36 (High Variance)
-   **Risk**: High. Some runs resulted in significant regression (-8).
-   **Conclusion**: Too unstable for production use despite high potential peaks.

### Configuration B: Volatility + Fairness (Selected)
*Optimizes for score and equity, rejecting chaotic moves.*
-   **Avg Improvement**: +4.67 (Consistent)
-   **Standard Deviation**: 4.08 (Low Variance)
-   **Risk**: Low. Worst case was only -2.
-   **Conclusion**: The Fairness module acts as a secondary stabilizer, preventing the solver from over-optimizing for a specific subset of crew at the expense of stability.

### Configuration C: Parallel Expedition (Ladder + Regions)
*The "Nuclear Option" for maximum quality.*
-   **Avg Improvement**: **+11.0** (Massive Peak)
-   **Standard Deviation**: **2.94** (Extremely Stable)
-   **Mechanism**: Runs 5 independent "Ladders" in parallel. Each Ladder consists of 3 sequential solves, where the solution of step N is passed as a "Hint" to step N+1.
-   **Conclusion**: By exploring 5 distinct regions of the solution space simultaneously, we find peaks that the standard solver completely misses. This is the recommended mode for high-stakes schedule generation.

## Next Steps
-   Deploy the python solver with these flags enabled by default.
-   Monitor the "Fairness Index" in production logs to ensure the Gini coefficient remains low.
