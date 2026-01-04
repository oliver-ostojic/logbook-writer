# ML Model Progression Plan

## 🎯 Goal
Build a "Learning Machine" that evolves with the store, predicting optimal solver weights to reduce tuning time and improve schedule quality.

---

## 🧠 Model Upgrade Path

### **Level 1: Nearest Neighbor Oracle** ✅ *Currently Implemented*
- **File**: `learning/oracle.py` → `NearestNeighborOracle`
- **How it works**: "I've seen a day like this before"
- **Logic**: Find the historical day with the closest feature vector, copy its weights
- **Pros**: Simple, no training required, works with small data
- **Data needed**: ~10-50 samples to be useful
- **Status**: ✅ Implemented, collecting training data

### **Level 2: Random Forest / XGBoost Regressor** 🔜 *Next*
- **How it works**: "I can predict the best weight for each rule"
- **Logic**: Train a regression model to predict rule weights from input features
- **Pros**: Can generalize beyond exact matches, handles non-linear patterns
- **Data needed**: ~100-500 samples
- **Implementation**:
  ```python
  from sklearn.ensemble import RandomForestRegressor
  # or
  import xgboost as xgb
  
  # Features: crew count, role distribution, constraint types, etc.
  # Target: optimal weights for each rule
  ```

### **Level 3: Neural Network (MLP)** 🔮 *Future*
- **How it works**: Multi-layer perceptron that learns complex feature interactions
- **Logic**: Encode crew, rules, constraints → predict weight vector
- **Pros**: Better at capturing complex patterns
- **Data needed**: ~500-2000 samples
- **Architecture**:
  ```
  Input Features (64) → Dense(256) → ReLU → Dense(128) → ReLU → Weights Output
  ```

### **Level 4: Transformer / Attention Model** 🌟 *Advanced*
- **How it works**: Attention-based architecture that learns which rules interact
- **Logic**: Rule-to-rule attention, crew-to-rule attention
- **Pros**: Can learn which constraints conflict with each other
- **Data needed**: ~2000+ samples + manager feedback
- **Architecture**:
  ```
  Crew Encoder + Rule Encoder → Cross-Attention → Weight Predictions
  ```

---

## 📊 Current Data Collection Status

| Date | Samples | Status |
|------|---------|--------|
| 2025-12-16 | 0/30 | Pending |
| 2025-12-17 | 0/30 | Pending |
| 2025-12-22 | 0/30 | Pending |
| **Total** | **0/90** | |

---

## 🚀 Implementation Phases

### Phase 1: Data Collection (Current)
1. [x] Implement DataRecorder to save solver inputs/outputs
2. [x] Implement FeatureExtractor for vectorizing payloads
3. [x] Implement NearestNeighborOracle
4. [ ] **Run 90 training samples (30 per date)**
5. [ ] Validate Oracle improves solver performance

### Phase 2: Level 2 Model (After 100+ samples)
6. [ ] Implement XGBoost/RandomForest weight predictor
7. [ ] A/B test: kNN Oracle vs XGBoost Oracle
8. [ ] Integrate best model into production solver

### Phase 3: Level 3 Model (After 500+ samples)
9. [ ] Implement PyTorch MLP model
10. [ ] Add manager feedback loop (schedule edits → training signal)
11. [ ] Online learning: retrain weekly with new data

### Phase 4: Level 4 Model (After 2000+ samples)
12. [ ] Implement Transformer architecture
13. [ ] Add crew satisfaction ratings as training signal
14. [ ] Multi-store transfer learning

---

## 📁 Key Files

```
apps/solver-python/
├── learning/
│   ├── oracle.py           # NearestNeighborOracle (Level 1)
│   ├── features.py         # FeatureExtractor
│   └── xgb_oracle.py       # XGBoost model (Level 2) - TODO
├── tuning_engine/
│   ├── data_recorder.py    # Saves training data
│   └── ...
├── collect_training_data.py # Script to generate samples
└── solver_training_data.jsonl  # Training data file

apps/ml/
├── logbook_ml/
│   └── model/              # PyTorch models (Level 3+)
└── scripts/
    └── train.py            # Training script
```

---

## 🔧 Commands

### Collect Training Data
```bash
cd apps/solver-python
python3 collect_training_data.py --store 768 --start 2025-12-16 --end 2025-12-22 --max-records 90
```

### Run with Oracle Warm-Start
```bash
python3 analyze_portfolio_vs_seeded.py --store 768 --date 2025-12-22 --use-oracle
```
