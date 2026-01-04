# Logbook ML - Schedule Learning Module

A PyTorch-based machine learning module that learns from historical logbook data, 
manager adjustments, and crew feedback to improve future schedule generation.

## Architecture

The model uses a multi-input architecture with four tensor types:

1. **Logbook Tensor** `[R×H×C×F]` - Original schedule (roles × hours × crew × features)
2. **Adjustment Tensor** `[R×H×C]` - Manager modifications to the schedule
3. **Crew Rating Tensor** `[C×D]` - Individual crew satisfaction ratings (1-5 scale)
4. **Statistics Tensor** `[S]` - Aggregate metrics (satisfaction, fairness, preferences met)

These tensors are encoded separately and fused together to predict:
- Optimal schedule adjustments
- Expected crew satisfaction
- Fairness scores

## Installation

```bash
cd apps/ml
pip install -e ".[dev]"
```

## Project Structure

```
apps/ml/
├── logbook_ml/
│   ├── __init__.py
│   ├── model/
│   │   ├── __init__.py
│   │   ├── unified_model.py      # Main PyTorch model
│   │   ├── encoders.py           # Tensor-specific encoders
│   │   └── heads.py              # Prediction heads
│   ├── data/
│   │   ├── __init__.py
│   │   ├── tensors.py            # Tensor schema definitions
│   │   ├── dataset.py            # PyTorch Dataset class
│   │   └── loader.py             # Data extraction from API/DB
│   ├── training/
│   │   ├── __init__.py
│   │   ├── trainer.py            # Training loop
│   │   ├── losses.py             # Multi-task loss functions
│   │   └── metrics.py            # Evaluation metrics
│   └── inference/
│       ├── __init__.py
│       └── predictor.py          # Inference utilities
├── scripts/
│   ├── train.py                  # Training script
│   ├── evaluate.py               # Evaluation script
│   └── export_training_data.py   # Data export from DB
├── tests/
│   └── ...
├── pyproject.toml
└── README.md
```

## Usage

### Training

```bash
python scripts/train.py --data-dir ./data --epochs 100 --batch-size 32
```

### Inference

```python
from logbook_ml.inference import SchedulePredictor

predictor = SchedulePredictor.load("checkpoints/best_model.pt")
predictions = predictor.predict(logbook_tensor, crew_ratings)
```

## Integration with Solver

The ML model outputs are used to adjust solver weights:

1. **Preference weights** - Increase weights for preferences that correlate with high satisfaction
2. **Adjustment predictions** - Pre-adjust the schedule before final optimization
3. **Fairness targets** - Set per-crew fairness constraints based on learned patterns
