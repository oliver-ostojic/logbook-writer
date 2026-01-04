# Project Black Box: Store-Specific Scheduling AI

## Objective
Build a "Learning Machine" that evolves with the store. The system will record successful schedules, learn the patterns of "what works" (optimal constraint weights), and use this knowledge to "warm start" future solves, drastically reducing tuning time and improving quality.

## Architecture

### 1. The Black Box (Data Recorder) - *Completed*
-   **Role**: Capture the "DNA" of every high-quality schedule.
-   **Input**: Solver Payload (The Problem), Final Assignments (The Solution), Tuned Weights (The Strategy).
-   **Storage**: `solver_training_data.jsonl` (JSON Lines format).

### 2. The Cartographer (Feature Extractor) - *Next Step*
-   **Role**: Convert raw JSON payloads into mathematical vectors ("Maps") that an AI can understand.
-   **Global Features**:
    -   `contention_ratio`: Total Hours Needed / Total Crew Hours Available.
    -   `role_scarcity`: Demand vs Supply for specific roles (e.g., Managers).
    -   `day_profile`: Day of week, Open/Close times.
-   **Rule Features**:
    -   `rule_type`: (e.g., "min_hours", "no_clopen").
    -   `crew_context`: (e.g., Crew Member's historical satisfaction).

### 3. The Oracle (Inference Engine)
-   **Role**: Predict the optimal starting weights for a new day.
-   **Strategy A (Nearest Neighbor)**: "I've seen a day like this before."
    -   Find the historical day with the closest "Global Feature Vector".
    -   Copy its weights.
-   **Strategy B (Regression Model)**: "I can calculate the perfect weight."
    -   Train a model (Random Forest/Neural Net) to predict specific rule weights based on input features.

### 4. The Loop (Continuous Improvement)
-   Every time the solver runs in "Expedition Mode", it adds to the dataset.
-   The Oracle gets smarter.
-   The Solver gets faster.

## Implementation Plan

### Phase 1: The Foundation (Now)
1.  [x] **Data Recorder**: Save full payloads and results.
2.  [ ] **Feature Extractor**: Implement `learning/features.py` to vectorize payloads.
3.  [ ] **Similarity Engine**: Implement `learning/oracle.py` to find the "Nearest Neighbor" day.

### Phase 2: Integration
4.  [ ] **Hook into Solver**: Modify `solve()` to query the Oracle for initial weights.
5.  [ ] **Validation**: Run A/B tests (Cold Start vs. Warm Start).

### Phase 3: Advanced AI (Future)
6.  [ ] **Train Regressor**: Use Scikit-Learn/PyTorch to predict weights for unseen scenarios.
7.  [ ] **Manager Feedback Loop**: Incorporate manual edits from the UI into the training data.
