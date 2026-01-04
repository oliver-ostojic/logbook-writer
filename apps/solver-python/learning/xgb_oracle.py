"""XGBoost-based Oracle for predicting optimal rule weights.

Level 2 in the ML Model Progression:
- Trains a regression model to predict weights from input features
- Can generalize beyond exact matches (unlike kNN Oracle)
- Handles non-linear patterns in the data

Usage:
    from learning.xgb_oracle import XGBOracle
    
    oracle = XGBOracle()
    oracle.train()  # Train on historical data
    weights = oracle.predict(payload)  # Predict weights for new payload
"""
from __future__ import annotations

import json
import os
import sys
import pickle
from typing import Dict, Any, List, Optional, Tuple
from collections import defaultdict

import numpy as np

try:
    import xgboost as xgb
    HAS_XGB = True
except ImportError:
    HAS_XGB = False
    print("⚠️ XGBoost not installed. Run: pip install xgboost", file=sys.stderr)

from .features import FeatureExtractor


class XGBOracle:
    """
    XGBoost-based weight predictor.
    
    Trains one regressor per rule to predict optimal weights.
    Uses FeatureExtractor to convert payloads to feature vectors.
    
    Model Architecture:
    - Input: Feature vector from FeatureExtractor (fixed size)
    - Output: Predicted weight for each rule (one model per rule)
    
    Training Data Format (solver_training_data.jsonl):
    {
        "payload": {...},
        "solution": {
            "weights": {rule_id: weight, ...},
            "satisfaction_score": N,
            ...
        }
    }
    """
    
    def __init__(
        self,
        data_path: str = "solver_training_data.jsonl",
        model_path: str = "xgb_oracle_models.pkl",
        min_samples: int = 20,
    ):
        self.data_path = data_path
        self.model_path = model_path
        self.min_samples = min_samples
        self.extractor = FeatureExtractor()
        
        # One model per rule_id
        self.models: Dict[int, xgb.XGBRegressor] = {}
        self.rule_id_to_idx: Dict[int, int] = {}
        self.is_trained = False
        
        # Training data stats
        self.n_samples = 0
        self.feature_dim = 0
        self.rule_ids: List[int] = []
        
        # Try to load pre-trained models
        self._load_models()
    
    def _load_models(self) -> bool:
        """Load pre-trained models from disk."""
        if not os.path.exists(self.model_path):
            return False
        
        try:
            with open(self.model_path, "rb") as f:
                data = pickle.load(f)
            
            self.models = data.get("models", {})
            self.rule_id_to_idx = data.get("rule_id_to_idx", {})
            self.rule_ids = data.get("rule_ids", [])
            self.n_samples = data.get("n_samples", 0)
            self.feature_dim = data.get("feature_dim", 0)
            self.is_trained = len(self.models) > 0
            
            if self.is_trained:
                print(f"🌲 XGBOracle: Loaded {len(self.models)} models from {self.model_path}", file=sys.stderr)
            return self.is_trained
        except Exception as e:
            print(f"⚠️ XGBOracle: Failed to load models: {e}", file=sys.stderr)
            return False
    
    def _save_models(self) -> None:
        """Save trained models to disk."""
        data = {
            "models": self.models,
            "rule_id_to_idx": self.rule_id_to_idx,
            "rule_ids": self.rule_ids,
            "n_samples": self.n_samples,
            "feature_dim": self.feature_dim,
        }
        with open(self.model_path, "wb") as f:
            pickle.dump(data, f)
        print(f"💾 XGBOracle: Saved {len(self.models)} models to {self.model_path}", file=sys.stderr)
    
    def _load_training_data(self) -> Tuple[np.ndarray, Dict[int, np.ndarray], List[int]]:
        """
        Load and process training data.
        
        Returns:
            X: Feature matrix (n_samples, n_features)
            y_dict: Dict[rule_id] -> array of weights (n_samples,)
            rule_ids: List of all rule IDs
        """
        if not os.path.exists(self.data_path):
            print(f"⚠️ XGBOracle: No training data at {self.data_path}", file=sys.stderr)
            return np.array([]), {}, []
        
        print(f"🌲 XGBOracle: Loading training data from {self.data_path}...", file=sys.stderr)
        
        features_list: List[List[float]] = []
        weights_by_rule: Dict[int, List[float]] = defaultdict(list)
        all_rule_ids: set = set()
        
        with open(self.data_path, "r") as f:
            for line in f:
                try:
                    record = json.loads(line)
                    payload = record.get("payload")
                    solution = record.get("solution", {})
                    weights = solution.get("weights", {})
                    
                    if not payload or not weights:
                        continue
                    
                    # Extract features
                    features = self.extractor.extract(payload)
                    features_list.append(features)
                    
                    # Collect weights for each rule
                    for rule_id_str, weight in weights.items():
                        rule_id = int(rule_id_str)
                        all_rule_ids.add(rule_id)
                        weights_by_rule[rule_id].append(float(weight))
                        
                except json.JSONDecodeError:
                    continue
        
        if not features_list:
            return np.array([]), {}, []
        
        X = np.array(features_list)
        n_samples = len(features_list)
        
        # Ensure all rules have the same number of samples (pad with 1.0 if missing)
        rule_ids = sorted(all_rule_ids)
        y_dict = {}
        for rule_id in rule_ids:
            weights = weights_by_rule.get(rule_id, [])
            # Pad with 1.0 (default weight) if missing for some samples
            if len(weights) < n_samples:
                weights.extend([1.0] * (n_samples - len(weights)))
            y_dict[rule_id] = np.array(weights[:n_samples])
        
        print(f"🌲 XGBOracle: Loaded {n_samples} samples, {len(rule_ids)} rules, {X.shape[1]} features", file=sys.stderr)
        
        return X, y_dict, rule_ids
    
    def train(self, force: bool = False) -> bool:
        """
        Train XGBoost models on historical data.
        
        Args:
            force: If True, retrain even if models exist
            
        Returns:
            True if training succeeded, False otherwise
        """
        if not HAS_XGB:
            print("❌ XGBOracle: XGBoost not installed", file=sys.stderr)
            return False
        
        if self.is_trained and not force:
            print(f"🌲 XGBOracle: Already trained ({len(self.models)} models). Use force=True to retrain.", file=sys.stderr)
            return True
        
        X, y_dict, rule_ids = self._load_training_data()
        
        if len(X) < self.min_samples:
            print(f"⚠️ XGBOracle: Not enough samples ({len(X)} < {self.min_samples})", file=sys.stderr)
            return False
        
        self.n_samples = len(X)
        self.feature_dim = X.shape[1]
        self.rule_ids = rule_ids
        self.rule_id_to_idx = {rid: idx for idx, rid in enumerate(rule_ids)}
        
        print(f"🌲 XGBOracle: Training {len(rule_ids)} models...", file=sys.stderr)
        
        # Train one model per rule
        self.models = {}
        for i, rule_id in enumerate(rule_ids):
            y = y_dict[rule_id]
            
            # Skip if all weights are the same (nothing to learn)
            if np.std(y) < 0.01:
                continue
            
            model = xgb.XGBRegressor(
                n_estimators=100,
                max_depth=4,
                learning_rate=0.1,
                random_state=42,
                verbosity=0,
            )
            model.fit(X, y)
            self.models[rule_id] = model
            
            if (i + 1) % 50 == 0:
                print(f"   Trained {i + 1}/{len(rule_ids)} models...", file=sys.stderr)
        
        self.is_trained = True
        self._save_models()
        
        print(f"✅ XGBOracle: Training complete! {len(self.models)} models trained.", file=sys.stderr)
        return True
    
    def predict(self, payload: Dict[str, Any]) -> Optional[Dict[int, float]]:
        """
        Predict optimal weights for a new payload.
        
        Args:
            payload: Solver input payload
            
        Returns:
            Dict[rule_id, weight] or None if not trained
        """
        if not self.is_trained:
            # Try to train on-the-fly
            if not self.train():
                print("⚠️ XGBOracle: Cannot predict - no trained models", file=sys.stderr)
                return None
        
        # Extract features
        features = self.extractor.extract(payload)
        X = np.array([features])
        
        # Predict weights for all rules
        weights = {}
        for rule_id, model in self.models.items():
            pred = model.predict(X)[0]
            # Clamp to reasonable range [0.1, 10.0]
            weights[rule_id] = max(0.1, min(10.0, float(pred)))
        
        # For rules without a model, use default weight of 1.0
        all_rules = payload.get("roleRules", [])
        for rule in all_rules:
            rule_id = rule.get("id")
            if rule_id is not None and rule_id not in weights:
                weights[rule_id] = 1.0
        
        print(f"🌲 XGBOracle: Predicted weights for {len(weights)} rules", file=sys.stderr)
        return weights
    
    def evaluate(self, test_ratio: float = 0.2) -> Dict[str, float]:
        """
        Evaluate model performance using train/test split.
        
        Returns:
            Dict with evaluation metrics (MAE, RMSE, R²)
        """
        if not HAS_XGB:
            return {"error": "XGBoost not installed"}
        
        X, y_dict, rule_ids = self._load_training_data()
        
        if len(X) < self.min_samples:
            return {"error": f"Not enough samples ({len(X)})"}
        
        # Train/test split
        n = len(X)
        n_test = int(n * test_ratio)
        n_train = n - n_test
        
        indices = np.random.permutation(n)
        train_idx = indices[:n_train]
        test_idx = indices[n_train:]
        
        X_train, X_test = X[train_idx], X[test_idx]
        
        all_mae = []
        all_rmse = []
        
        for rule_id in rule_ids:
            y = y_dict[rule_id]
            y_train, y_test = y[train_idx], y[test_idx]
            
            if np.std(y_train) < 0.01:
                continue
            
            model = xgb.XGBRegressor(
                n_estimators=100,
                max_depth=4,
                learning_rate=0.1,
                random_state=42,
                verbosity=0,
            )
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)
            
            mae = np.mean(np.abs(y_test - y_pred))
            rmse = np.sqrt(np.mean((y_test - y_pred) ** 2))
            
            all_mae.append(mae)
            all_rmse.append(rmse)
        
        return {
            "n_samples": n,
            "n_train": n_train,
            "n_test": n_test,
            "n_rules_evaluated": len(all_mae),
            "mean_mae": float(np.mean(all_mae)) if all_mae else 0.0,
            "mean_rmse": float(np.mean(all_rmse)) if all_rmse else 0.0,
        }


def main():
    """CLI for training and evaluating the XGBOracle."""
    import argparse
    
    parser = argparse.ArgumentParser(description="XGBoost Oracle for weight prediction")
    parser.add_argument("--train", action="store_true", help="Train the model")
    parser.add_argument("--evaluate", action="store_true", help="Evaluate model performance")
    parser.add_argument("--force", action="store_true", help="Force retrain even if models exist")
    parser.add_argument("--data", default="solver_training_data.jsonl", help="Training data path")
    parser.add_argument("--model", default="xgb_oracle_models.pkl", help="Model save path")
    args = parser.parse_args()
    
    oracle = XGBOracle(data_path=args.data, model_path=args.model)
    
    if args.train:
        success = oracle.train(force=args.force)
        if success:
            print("✅ Training complete!")
        else:
            print("❌ Training failed")
            return 1
    
    if args.evaluate:
        metrics = oracle.evaluate()
        print("\n📊 Evaluation Results:")
        for key, value in metrics.items():
            print(f"   {key}: {value}")
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
