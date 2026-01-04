import json
import time
import os
from typing import Any, Dict, List
from collections import Counter

class DataRecorder:
    """
    Records solver inputs, tuned weights, and results to build a training dataset
    for the 'Store-Specific Brain' (Learning to Optimize).
    """
    
    def __init__(self, output_file: str = "solver_training_data.jsonl"):
        self.output_file = output_file

    def _compute_per_rule_type_satisfaction(
        self, 
        assignments: List[Dict[str, Any]], 
        payload: Dict[str, Any]
    ) -> Dict[str, Dict[str, Any]]:
        """
        Compute satisfaction breakdown by rule type.
        Returns: {rule_type: {satisfied: N, eligible: N, pct: float}}
        """
        from .rule_evaluator import evaluate_all_rules
        
        all_rules = payload.get("roleRules", [])
        crew_rules = [r for r in all_rules if r.get("source") == "crew"]
        if not crew_rules:
            crew_rules = all_rules
        crew = payload.get("crew", [])
        
        if not assignments or not crew_rules:
            return {}
        
        results = evaluate_all_rules(crew_rules, assignments, crew)
        
        # Group by rule type
        by_type: Dict[str, List] = {}
        for r in results:
            rt = r.rule_type or "UNKNOWN"
            if rt not in by_type:
                by_type[rt] = []
            by_type[rt].append(r)
        
        # Compute stats per type
        stats = {}
        for rt, rule_results in by_type.items():
            eligible = sum(1 for r in rule_results if r.eligible)
            satisfied = sum(1 for r in rule_results if r.eligible and r.satisfaction >= 1.0)
            stats[rt] = {
                "satisfied": satisfied,
                "eligible": eligible,
                "pct": (satisfied / eligible * 100) if eligible > 0 else 0.0,
            }
        
        return stats

    def _compute_crew_archetypes(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compute crew role archetypes — groups of crew with identical role capabilities.
        Returns detailed breakdown for analysis.
        """
        crew = payload.get("crew", [])
        roles = payload.get("roles", [])
        
        # Build role id -> code mapping
        role_code_map = {r.get("id"): r.get("code") for r in roles}
        
        # Build archetype signatures
        archetype_details: Dict[str, Dict] = {}
        
        for c in crew:
            role_ids = tuple(sorted(c.get("roleIds", [])))
            role_codes = tuple(sorted(role_code_map.get(rid, str(rid)) for rid in role_ids))
            key = ",".join(role_codes)
            
            if key not in archetype_details:
                archetype_details[key] = {
                    "role_ids": list(role_ids),
                    "role_codes": list(role_codes),
                    "crew_count": 0,
                    "crew_ids": [],
                }
            archetype_details[key]["crew_count"] += 1
            archetype_details[key]["crew_ids"].append(c.get("id"))
        
        # Sort by crew count descending
        sorted_archetypes = sorted(
            archetype_details.values(),
            key=lambda x: x["crew_count"],
            reverse=True
        )
        
        return {
            "num_archetypes": len(archetype_details),
            "archetypes": sorted_archetypes,
        }

    def _compute_crew_rule_archetypes(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compute crew rule archetypes — groups of crew with identical rule profiles.
        Returns detailed breakdown for analysis.
        """
        crew = payload.get("crew", [])
        all_rules = payload.get("roleRules", [])
        crew_rules = [r for r in all_rules if r.get("source") == "crew"]
        if not crew_rules:
            crew_rules = all_rules
        
        # Build crew shift info
        crew_info: Dict[str, Dict] = {}
        for c in crew:
            cid = c.get("id")
            shift_start = c.get("shiftStartMin", 0)
            shift_end = c.get("shiftEndMin", 0)
            crew_info[cid] = {
                "shift_length": max(0, shift_end - shift_start),
                "shift_start": shift_start,
                "rules": [],
            }
        
        # Collect rules per crew - use roleRuleId for maximum granularity
        for rule in crew_rules:
            cid = rule.get("crewId")
            if cid and cid in crew_info:
                role_rule_id = rule.get("roleRuleId") or rule.get("id")
                rule_type = rule.get("type", "UNKNOWN")
                crew_info[cid]["rules"].append({
                    "roleRuleId": str(role_rule_id),
                    "type": rule_type,
                })
        
        # Build rule archetype signatures
        archetype_details: Dict[str, Dict] = {}
        
        for cid, info in crew_info.items():
            # Create signature from sorted roleRuleIds for maximum granularity
            rule_sig = tuple(sorted(r["roleRuleId"] for r in info["rules"]))
            key = "|".join(rule_sig) if rule_sig else "NO_RULES"
            
            if key not in archetype_details:
                archetype_details[key] = {
                    "rule_ids": list(rule_sig),
                    "rule_types": list(set(r["type"] for r in info["rules"])),
                    "rule_count": len(info["rules"]),
                    "crew_count": 0,
                    "crew_ids": [],
                    "avg_shift_length": 0,
                    "shift_lengths": [],
                }
            archetype_details[key]["crew_count"] += 1
            archetype_details[key]["crew_ids"].append(cid)
            archetype_details[key]["shift_lengths"].append(info["shift_length"])
        
        # Compute avg shift length per archetype
        for arch in archetype_details.values():
            lengths = arch.pop("shift_lengths")
            arch["avg_shift_length"] = sum(lengths) / len(lengths) if lengths else 0
        
        # Sort by crew count descending
        sorted_archetypes = sorted(
            archetype_details.values(),
            key=lambda x: x["crew_count"],
            reverse=True
        )
        
        return {
            "num_rule_archetypes": len(archetype_details),
            "rule_archetypes": sorted_archetypes,
        }

    def record(self, 
               payload: Dict[str, Any], 
               weights: Dict[int, float], 
               satisfaction: int, 
               eligible: int,
               fairness_index: float,
               date: str,
               metadata: Dict[str, Any] = None) -> None:
        """
        Save a successful solve record to the dataset.
        """
        store = payload.get("store", {})
        crew = payload.get("crew", [])
        roles = payload.get("roles", [])
        
        # Extract basic features (The Context)
        features = {
            "num_crew": len(crew),
            "num_roles": len(roles),
            "store_open_minutes": store.get("openMinutesFromMidnight"),
            "store_close_minutes": store.get("closeMinutesFromMidnight"),
        }
        
        # Compute per-rule-type satisfaction breakdown
        assignments = metadata.get("assignments") if metadata else None
        rule_type_stats = {}
        if assignments:
            rule_type_stats = self._compute_per_rule_type_satisfaction(assignments, payload)
        
        # Compute crew archetypes (role-based)
        archetype_data = self._compute_crew_archetypes(payload)
        
        # Compute crew rule archetypes (rule-based)
        rule_archetype_data = self._compute_crew_rule_archetypes(payload)
        
        # The Solution (The Treasure)
        solution_data = {
            "satisfaction_score": satisfaction,
            "eligible_count": eligible,
            "satisfaction_pct": (satisfaction / eligible * 100) if eligible > 0 else 0,
            "fairness_index": fairness_index,
            "weights": weights,
            "rule_type_satisfaction": rule_type_stats,
            "crew_archetypes": archetype_data,
            "crew_rule_archetypes": rule_archetype_data,  # NEW: rule archetype breakdown
        }
        
        record = {
            "timestamp": time.time(),
            "store_id": store.get("id"),
            "date": date,
            "payload": payload, 
            "solution": solution_data,
            "metadata": metadata or {}
        }
        
        try:
            with open(self.output_file, "a") as f:
                f.write(json.dumps(record) + "\n")
            # Use stderr to avoid polluting JSON output on stdout
            import sys
            print(f"💾 Recorded training data to {self.output_file}", file=sys.stderr)
        except Exception as e:
            import sys
            print(f"⚠️ Failed to record training data: {e}", file=sys.stderr)
