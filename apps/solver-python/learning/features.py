from typing import Dict, Any, List, Tuple
from collections import Counter
import statistics

class FeatureExtractor:
    """
    Converts a solver payload into a numerical feature vector.
    Used for finding similar historical days (Nearest Neighbor).
    
    Feature Groups:
    - Global Context (crew count, roles, duration)
    - Supply/Demand Balance
    - Shift Distribution (when people start/end)
    - Rule Competition Density (per-hour congestion)
    - Rule Type Mix
    """
    
    # All known rule types for consistent feature ordering
    RULE_TYPES = [
        "MIN_CONSECUTIVE_MINUTES",
        "MAX_CONSECUTIVE_MINUTES", 
        "ASSIGN_BEFORE_SHIFT_MIN_X",
        "ASSIGN_AFTER_SHIFT_MIN_X",
        "CANNOT_BE_ASSIGNED_AFTER",
        "MIN_SHIFT_LENGTH_FOR_ACCESS",
        "ALLOW_HALF_BLOCKSIZE",
        "MAX_CREW_ON_AT_A_TIME",
    ]
    
    def extract(self, payload: Dict[str, Any]) -> List[float]:
        """
        Extracts a fixed-length feature vector from the payload.
        """
        features = []
        
        # === Group 1: Global Context ===
        global_features = self._extract_global_context(payload)
        features.extend(global_features)
        
        # === Group 2: Supply/Demand Balance ===
        supply_demand = self._extract_supply_demand(payload)
        features.extend(supply_demand)
        
        # === Group 3: Shift Distribution ===
        shift_features = self._extract_shift_distribution(payload)
        features.extend(shift_features)
        
        # === Group 4: Per-Hour Rule Competition ===
        competition_features = self._extract_rule_competition(payload)
        features.extend(competition_features)
        
        # === Group 5: Rule Type Mix ===
        rule_mix = self._extract_rule_type_mix(payload)
        features.extend(rule_mix)
        
        # === Group 6: Crew Role Archetypes ===
        archetype_features = self._extract_crew_archetypes(payload)
        features.extend(archetype_features)
        
        # === Group 7: Crew Rule Archetypes (rule profile similarity) ===
        rule_archetype_features = self._extract_crew_rule_archetypes(payload)
        features.extend(rule_archetype_features)
        
        return features
    
    def _extract_global_context(self, payload: Dict[str, Any]) -> List[float]:
        """Basic counts and store info."""
        store = payload.get("store", {})
        crew = payload.get("crew", [])
        roles = payload.get("roles", [])
        
        num_crew = len(crew)
        num_roles = len(roles)
        
        open_min = store.get("openMinutesFromMidnight", 480)  # Default 8am
        close_min = store.get("closeMinutesFromMidnight", 1320)  # Default 10pm
        store_duration = max(0, close_min - open_min)
        
        return [
            float(num_crew),           # 0
            float(num_roles),          # 1
            float(store_duration),     # 2
        ]
    
    def _extract_supply_demand(self, payload: Dict[str, Any]) -> List[float]:
        """Demand from quotas vs supply from crew availability."""
        crew = payload.get("crew", [])
        quotas = payload.get("crewQuotas", [])
        
        # Demand (from Quotas)
        total_demand = 0
        role_demand: Dict[int, int] = {}
        for q in quotas:
            mins = q.get("minMinutes", 0)
            total_demand += mins
            rid = q.get("roleId")
            if rid:
                role_demand[rid] = role_demand.get(rid, 0) + mins
        
        # Supply (from Crew)
        total_supply = 0
        role_supply: Dict[int, int] = {}
        for c in crew:
            shift_start = c.get("shiftStartMin", 0)
            shift_end = c.get("shiftEndMin", 0)
            shift_mins = max(0, shift_end - shift_start)
            total_supply += shift_mins
            
            for rid in c.get("roleIds", []):
                role_supply[rid] = role_supply.get(rid, 0) + shift_mins
        
        # Contention ratio
        contention_ratio = total_demand / total_supply if total_supply > 0 else 0
        
        # Max role scarcity
        max_scarcity = 0.0
        for rid, demand in role_demand.items():
            supply = role_supply.get(rid, 0)
            if supply > 0:
                ratio = demand / supply
                max_scarcity = max(max_scarcity, ratio)
            elif demand > 0:
                max_scarcity = max(max_scarcity, 5.0)  # Cap
        
        return [
            float(total_demand),       # 3
            float(total_supply),       # 4
            float(contention_ratio),   # 5
            float(max_scarcity),       # 6
        ]
    
    def _extract_shift_distribution(self, payload: Dict[str, Any]) -> List[float]:
        """When do shifts start/end? How spread out?"""
        crew = payload.get("crew", [])
        
        if not crew:
            return [0.0] * 7
        
        shift_starts = []
        shift_ends = []
        shift_lengths = []
        
        for c in crew:
            start = c.get("shiftStartMin", 0)
            end = c.get("shiftEndMin", 0)
            if end > start:
                shift_starts.append(start)
                shift_ends.append(end)
                shift_lengths.append(end - start)
        
        if not shift_starts:
            return [0.0] * 7
        
        # Shift start stats
        start_mean = statistics.mean(shift_starts)
        start_std = statistics.stdev(shift_starts) if len(shift_starts) > 1 else 0
        
        # Shift length stats  
        length_mean = statistics.mean(shift_lengths)
        length_std = statistics.stdev(shift_lengths) if len(shift_lengths) > 1 else 0
        
        # Time-of-day distribution
        noon = 720  # 12:00
        afternoon = 840  # 2:00 PM
        
        morning_pct = sum(1 for s in shift_starts if s < noon) / len(shift_starts) * 100
        afternoon_pct = sum(1 for s in shift_starts if s >= afternoon) / len(shift_starts) * 100
        
        # Peak hour density (max crew overlapping in any 15-min window)
        peak_density = self._compute_peak_density(shift_starts, shift_ends)
        
        return [
            float(start_mean),         # 7
            float(start_std),          # 8
            float(length_mean),        # 9
            float(length_std),         # 10
            float(morning_pct),        # 11
            float(afternoon_pct),      # 12
            float(peak_density),       # 13
        ]
    
    def _compute_peak_density(self, starts: List[int], ends: List[int]) -> int:
        """Find the max number of crew working at the same time."""
        if not starts:
            return 0
        
        events = []
        for s, e in zip(starts, ends):
            events.append((s, 1))   # Start: +1
            events.append((e, -1))  # End: -1
        
        events.sort(key=lambda x: (x[0], -x[1]))  # Sort by time, ends before starts at same time
        
        current = 0
        peak = 0
        for _, delta in events:
            current += delta
            peak = max(peak, current)
        
        return peak
    
    def _extract_rule_competition(self, payload: Dict[str, Any]) -> List[float]:
        """How many rules compete per hour?"""
        crew = payload.get("crew", [])
        all_rules = payload.get("roleRules", [])
        crew_rules = [r for r in all_rules if r.get("source") == "crew"]
        if not crew_rules:
            crew_rules = all_rules
        
        if not crew or not crew_rules:
            return [0.0, 0.0, 0.0]
        
        store = payload.get("store", {})
        open_min = store.get("openMinutesFromMidnight", 480)
        close_min = store.get("closeMinutesFromMidnight", 1320)
        
        # Build crew schedule lookup
        crew_schedule = {}
        for c in crew:
            crew_schedule[c.get("id")] = (c.get("shiftStartMin", 0), c.get("shiftEndMin", 0))
        
        # Count rules per hour
        rules_per_hour = Counter()
        for hour_start in range(open_min, close_min, 60):
            hour_end = hour_start + 60
            for rule in crew_rules:
                cid = rule.get("crewId")
                if cid and cid in crew_schedule:
                    shift_start, shift_end = crew_schedule[cid]
                    # Rule is "active" if crew is working during this hour
                    if shift_start < hour_end and shift_end > hour_start:
                        rules_per_hour[hour_start] += 1
        
        if not rules_per_hour:
            return [0.0, 0.0, 0.0]
        
        counts = list(rules_per_hour.values())
        avg_rules = statistics.mean(counts)
        max_rules = max(counts)
        congested_hours = sum(1 for c in counts if c > 50)  # Hours with heavy competition
        
        return [
            float(avg_rules),          # 14
            float(max_rules),          # 15
            float(congested_hours),    # 16
        ]
    
    def _extract_rule_type_mix(self, payload: Dict[str, Any]) -> List[float]:
        """What % of rules are each type?"""
        all_rules = payload.get("roleRules", [])
        crew_rules = [r for r in all_rules if r.get("source") == "crew"]
        if not crew_rules:
            crew_rules = all_rules
        
        total = len(crew_rules) if crew_rules else 1
        
        type_counts = Counter(r.get("type") for r in crew_rules)
        
        # Return percentage for each known rule type
        percentages = []
        for rt in self.RULE_TYPES:
            pct = type_counts.get(rt, 0) / total * 100
            percentages.append(float(pct))
        
        return percentages  # 17-24 (8 rule types)
    
    def _extract_crew_archetypes(self, payload: Dict[str, Any]) -> List[float]:
        """
        Analyze crew role "archetypes" — groups of crew with identical role capabilities.
        
        This captures:
        - How many unique archetypes exist
        - Distribution of crew across archetypes
        - Flexibility metrics (how many roles per crew)
        - Competition intensity (crew with same capabilities compete)
        """
        crew = payload.get("crew", [])
        
        if not crew:
            return [0.0] * 8
        
        # Build archetype signatures: frozenset of roleIds -> count of crew
        archetype_counts: Counter = Counter()
        role_counts_per_crew = []
        
        for c in crew:
            role_ids = tuple(sorted(c.get("roleIds", [])))
            archetype_counts[role_ids] += 1
            role_counts_per_crew.append(len(role_ids))
        
        num_archetypes = len(archetype_counts)
        counts = list(archetype_counts.values())
        
        # Archetype distribution stats
        largest_archetype = max(counts) if counts else 0
        smallest_archetype = min(counts) if counts else 0
        avg_archetype_size = statistics.mean(counts) if counts else 0
        
        # Crew flexibility (how many roles can each crew do?)
        avg_roles_per_crew = statistics.mean(role_counts_per_crew) if role_counts_per_crew else 0
        min_roles_per_crew = min(role_counts_per_crew) if role_counts_per_crew else 0
        max_roles_per_crew = max(role_counts_per_crew) if role_counts_per_crew else 0
        
        # Competition index: larger archetypes = more competition within group
        # Normalized by total crew
        competition_index = largest_archetype / len(crew) * 100 if crew else 0
        
        return [
            float(num_archetypes),       # 25: How many unique role combos
            float(largest_archetype),    # 26: Size of biggest archetype
            float(smallest_archetype),   # 27: Size of smallest archetype
            float(avg_archetype_size),   # 28: Average archetype size
            float(avg_roles_per_crew),   # 29: Average flexibility
            float(min_roles_per_crew),   # 30: Least flexible crew
            float(max_roles_per_crew),   # 31: Most flexible crew
            float(competition_index),    # 32: % of crew in largest competing group
        ]
    
    def feature_names(self) -> List[str]:
        """Return human-readable names for each feature."""
        names = [
            # Global (0-2)
            "num_crew",
            "num_roles", 
            "store_duration",
            # Supply/Demand (3-6)
            "total_demand",
            "total_supply",
            "contention_ratio",
            "max_role_scarcity",
            # Shift Distribution (7-13)
            "shift_start_mean",
            "shift_start_std",
            "shift_length_mean",
            "shift_length_std",
            "morning_crew_pct",
            "afternoon_crew_pct",
            "peak_density",
            # Rule Competition (14-16)
            "avg_rules_per_hour",
            "max_rules_per_hour",
            "congested_hours",
        ]
        # Rule Type Mix (17-24)
        for rt in self.RULE_TYPES:
            names.append(f"pct_{rt}")
        
        # Crew Archetypes (25-32)
        names.extend([
            "num_archetypes",
            "largest_archetype",
            "smallest_archetype",
            "avg_archetype_size",
            "avg_roles_per_crew",
            "min_roles_per_crew",
            "max_roles_per_crew",
            "competition_index",
        ])
        
        # Crew Rule Archetypes (33-42)
        names.extend([
            "num_rule_archetypes",
            "largest_rule_archetype",
            "avg_rule_archetype_size",
            "avg_rules_per_crew",
            "max_rules_per_crew",
            "crew_with_no_rules_pct",
            "rule_archetype_competition_idx",
            "short_shift_rule_density",
            "long_shift_rule_density",
            "shift_rule_density_ratio",
        ])
        
        return names
    
    def _extract_crew_rule_archetypes(self, payload: Dict[str, Any]) -> List[float]:
        """
        Analyze crew rule "archetypes" — groups of crew with identical rule profiles.
        
        This captures:
        - How many unique rule combos exist
        - Distribution of crew across rule archetypes
        - Correlation between shift length and rule density
        """
        crew = payload.get("crew", [])
        all_rules = payload.get("roleRules", [])
        crew_rules = [r for r in all_rules if r.get("source") == "crew"]
        if not crew_rules:
            crew_rules = all_rules
        
        if not crew:
            return [0.0] * 10
        
        # Build crew_id -> list of rule signatures
        crew_rule_profiles: Dict[str, List[str]] = {c.get("id"): [] for c in crew}
        crew_shift_lengths: Dict[str, int] = {}
        
        for c in crew:
            cid = c.get("id")
            shift_start = c.get("shiftStartMin", 0)
            shift_end = c.get("shiftEndMin", 0)
            crew_shift_lengths[cid] = max(0, shift_end - shift_start)
        
        for rule in crew_rules:
            cid = rule.get("crewId")
            if cid and cid in crew_rule_profiles:
                # Create rule signature using roleRuleId for maximum granularity
                # This distinguishes TIMING:BRK from TIMING:REG
                role_rule_id = rule.get("roleRuleId") or rule.get("id")
                crew_rule_profiles[cid].append(str(role_rule_id))
        
        # Build rule archetype signatures
        archetype_counts: Counter = Counter()
        rules_per_crew = []
        
        for cid, rules in crew_rule_profiles.items():
            # Sort and tuple-ify for consistent hashing
            profile = tuple(sorted(rules))
            archetype_counts[profile] += 1
            rules_per_crew.append(len(rules))
        
        num_rule_archetypes = len(archetype_counts)
        counts = list(archetype_counts.values())
        
        largest_rule_archetype = max(counts) if counts else 0
        avg_rule_archetype_size = statistics.mean(counts) if counts else 0
        
        avg_rules_per_crew = statistics.mean(rules_per_crew) if rules_per_crew else 0
        max_rules_per_crew = max(rules_per_crew) if rules_per_crew else 0
        
        # % of crew with no rules
        crew_with_no_rules = sum(1 for r in rules_per_crew if r == 0)
        crew_with_no_rules_pct = crew_with_no_rules / len(crew) * 100 if crew else 0
        
        # Rule archetype competition index
        rule_archetype_competition_idx = largest_rule_archetype / len(crew) * 100 if crew else 0
        
        # Correlate shift length with rule density
        # Short shift = < 6 hours (360 min), Long shift = >= 6 hours
        short_shift_rules = []
        long_shift_rules = []
        
        for cid, length in crew_shift_lengths.items():
            num_rules = len(crew_rule_profiles.get(cid, []))
            if length < 360:
                short_shift_rules.append(num_rules)
            else:
                long_shift_rules.append(num_rules)
        
        short_shift_rule_density = statistics.mean(short_shift_rules) if short_shift_rules else 0
        long_shift_rule_density = statistics.mean(long_shift_rules) if long_shift_rules else 0
        
        # Ratio: do long-shift crew have more rules?
        shift_rule_density_ratio = (
            long_shift_rule_density / short_shift_rule_density 
            if short_shift_rule_density > 0 else 0
        )
        
        return [
            float(num_rule_archetypes),          # 33
            float(largest_rule_archetype),       # 34
            float(avg_rule_archetype_size),      # 35
            float(avg_rules_per_crew),           # 36
            float(max_rules_per_crew),           # 37
            float(crew_with_no_rules_pct),       # 38
            float(rule_archetype_competition_idx), # 39
            float(short_shift_rule_density),     # 40
            float(long_shift_rule_density),      # 41
            float(shift_rule_density_ratio),     # 42
        ]

