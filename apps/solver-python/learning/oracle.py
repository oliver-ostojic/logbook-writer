import json
import math
import os
import sys
from typing import Dict, Any, List, Tuple, Optional
from .features import FeatureExtractor

class NearestNeighborOracle:
    """
    Finds the k most similar historical days and returns averaged weights.
    
    With k=1: Returns exact weights from closest match (original behavior)
    With k>1: Averages weights from k closest matches (more robust)
    """
    
    def __init__(self, data_path: str = "solver_training_data.jsonl", k: int = 10):
        self.data_path = data_path
        self.k = k
        self.extractor = FeatureExtractor()
        self.history: List[Dict[str, Any]] = []
        self.vectors: List[List[float]] = []
        self._load_data()
        
    def _load_data(self) -> None:
        """Load and vectorize historical data."""
        if not os.path.exists(self.data_path):
            print(f"⚠️ Oracle: No training data found at {self.data_path}", file=sys.stderr)
            return
            
        print(f"🔮 Oracle: Loading training data from {self.data_path}...", file=sys.stderr)
        count = 0
        with open(self.data_path, "r") as f:
            for line in f:
                try:
                    record = json.loads(line)
                    # We need the payload to extract features
                    payload = record.get("payload")
                    if not payload:
                        continue
                        
                    # Re-extract features to ensure consistency with current FeatureExtractor version
                    vector = self.extractor.extract(payload)
                    
                    self.history.append(record)
                    self.vectors.append(vector)
                    count += 1
                except json.JSONDecodeError:
                    continue
        print(f"🔮 Oracle: Loaded {count} historical records (k={self.k}).", file=sys.stderr)

    def predict(self, payload: Dict[str, Any], k: Optional[int] = None) -> Optional[Dict[int, float]]:
        """
        Find the k nearest neighbors and return averaged weights.
        
        Args:
            payload: Solver input to find similar days for
            k: Override instance k value (useful for testing different k values)
            
        Returns:
            Dictionary of rule_id -> weight, averaged across k neighbors
        """
        if not self.history:
            return None
        
        k_to_use = k if k is not None else self.k
        k_to_use = min(k_to_use, len(self.history))  # Can't use more than we have
            
        query_vector = self.extractor.extract(payload)
        
        # Calculate distances to all records
        distances: List[Tuple[float, int]] = []
        for i, vector in enumerate(self.vectors):
            dist = self._euclidean_distance(query_vector, vector)
            distances.append((dist, i))
        
        # Sort by distance and take top k
        distances.sort(key=lambda x: x[0])
        top_k = distances[:k_to_use]
        
        if not top_k:
            return None
        
        # Log the matches
        print(f"🔮 Oracle: Found {len(top_k)} neighbors (k={k_to_use})", file=sys.stderr)
        closest_dist, closest_idx = top_k[0]
        closest_match = self.history[closest_idx]
        print(f"   Closest: {closest_match.get('date')} (Dist: {closest_dist:.4f}, Score: {closest_match.get('solution', {}).get('satisfaction_score')})", file=sys.stderr)
        
        if k_to_use > 1:
            # Show date distribution of top k
            dates = [self.history[idx].get('date') for _, idx in top_k]
            date_counts = {}
            for d in dates:
                date_counts[d] = date_counts.get(d, 0) + 1
            print(f"   Top {k_to_use} from: {dict(date_counts)}", file=sys.stderr)
        
        # Average weights across k neighbors (weighted by inverse distance)
        averaged_weights: Dict[int, float] = {}
        weight_counts: Dict[int, float] = {}
        
        for dist, idx in top_k:
            record = self.history[idx]
            raw_weights = record.get("solution", {}).get("weights", {})
            
            # Use inverse distance as weight (closer = more influence)
            # Add small epsilon to avoid division by zero for exact matches
            influence = 1.0 / (dist + 1e-6)
            
            for rule_id_str, weight in raw_weights.items():
                rule_id = int(rule_id_str)
                if rule_id not in averaged_weights:
                    averaged_weights[rule_id] = 0.0
                    weight_counts[rule_id] = 0.0
                averaged_weights[rule_id] += float(weight) * influence
                weight_counts[rule_id] += influence
        
        # Normalize by total influence
        for rule_id in averaged_weights:
            if weight_counts[rule_id] > 0:
                averaged_weights[rule_id] /= weight_counts[rule_id]
        
        return averaged_weights

    def _euclidean_distance(self, v1: List[float], v2: List[float]) -> float:
        """Calculate Euclidean distance between two vectors."""
        if len(v1) != len(v2):
            return float("inf")
        
        sum_sq = 0.0
        for a, b in zip(v1, v2):
            sum_sq += (a - b) ** 2
        return math.sqrt(sum_sq)
