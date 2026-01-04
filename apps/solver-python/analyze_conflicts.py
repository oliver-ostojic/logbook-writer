"""Conflict Analysis Tool - Aggregate and analyze conflicts across multiple dates.

This script:
1. Runs tuning loops for multiple dates
2. Collects conflict data from each
3. Aggregates and analyzes patterns across dates
4. Provides multiple views: by crew, by role, by rule type, etc.
"""

import json
import sys
import urllib.request
import urllib.error
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, List, Set, Tuple

sys.path.insert(0, ".")

from logbook_solver_v2 import solve
from tuning_engine.driver import run_tuning_loop, vectorize_satisfaction, global_score
from tuning_engine.stabilizer import detect_conflicts, ConflictPair


# Configuration
STORE_ID = "768"
DATES = ["2025-11-25", "2025-12-15"]
API_BASE = "http://localhost:4000"
MAX_ITERATIONS = 6
TIME_LIMIT_PER_SOLVE = 10
MIN_ITERATIONS = 5  # For conflict detection


@dataclass
class DateConflictData:
    """Conflict data for a single date."""
    date: str
    crew_count: int
    assignment_count: int
    rule_count: int
    eligible_count: int
    initial_satisfaction: float
    final_satisfaction: float
    conflicts: List[ConflictPair] = field(default_factory=list)
    same_crew_conflicts: List[ConflictPair] = field(default_factory=list)
    rules_by_id: Dict[int, Dict] = field(default_factory=dict)
    

@dataclass 
class AggregatedConflict:
    """A conflict pattern seen across multiple dates."""
    rule_a_type: str
    rule_b_type: str
    occurrences: int = 0
    dates_seen: Set[str] = field(default_factory=set)
    correlations: List[float] = field(default_factory=list)
    crew_ids: Set[str] = field(default_factory=set)
    role_codes_a: Set[str] = field(default_factory=set)
    role_codes_b: Set[str] = field(default_factory=set)
    example_rule_ids: List[Tuple[int, int]] = field(default_factory=list)


def fetch_solver_input(store_id: str, date: str) -> Dict[str, Any]:
    """Fetch solver input from API."""
    url = f"{API_BASE}/solver/v2/input?storeId={store_id}&date={date}"
    try:
        with urllib.request.urlopen(url, timeout=30) as response:
            result = json.loads(response.read().decode())
        return result["data"]
    except urllib.error.URLError as e:
        raise Exception(f"Failed to connect to API: {e}")


def solver_wrapper(payload: Dict[str, Any], weights: Dict[int, float]) -> Dict[str, Any]:
    """Wrapper that calls solve() with weights."""
    return solve(payload, time_limit_seconds=TIME_LIMIT_PER_SOLVE, weights=weights)


def collect_date_conflicts(date: str) -> DateConflictData:
    """Run tuning loop for a date and collect conflict data."""
    print(f"\n{'='*70}")
    print(f"COLLECTING DATA FOR {date}")
    print('='*70)
    
    # Fetch data
    payload = fetch_solver_input(STORE_ID, date)
    all_rules = payload.get("roleRules", [])
    crew = payload.get("crew", [])
    
    # Filter to crew rules
    rules = [r for r in all_rules if r.get("source") == "crew"]
    
    # Build rule lookup
    rules_by_id = {r.get("id"): r for r in rules}
    
    print(f"   Crew: {len(crew)}, Crew Rules: {len(rules)}")
    
    # Initial solve
    initial_weights = {r.get("id", i): 1.0 for i, r in enumerate(rules)}
    initial_result = solver_wrapper(payload, initial_weights)
    assignments = initial_result.get("assignments", [])
    
    initial_sat = vectorize_satisfaction(assignments, rules, crew)
    eligible = sum(1 for s in initial_sat if s >= 0)
    satisfied = sum(1 for s in initial_sat if s == 1)
    initial_satisfaction = satisfied / eligible if eligible > 0 else 0
    
    print(f"   Initial: {satisfied}/{eligible} satisfied ({100*initial_satisfaction:.1f}%)")
    
    # Run tuning loop
    state = run_tuning_loop(
        payload,
        solver_wrapper,
        max_iterations=MAX_ITERATIONS,
        min_iterations=MIN_ITERATIONS,
        min_improvement=0.001,
    )
    
    # Final satisfaction
    final_sat = state['satisfaction_history'][-1] if state['satisfaction_history'] else []
    final_eligible = sum(1 for s in final_sat if s >= 0)
    final_satisfied = sum(1 for s in final_sat if s == 1)
    final_satisfaction = final_satisfied / final_eligible if final_eligible > 0 else 0
    
    print(f"   Final: {final_satisfied}/{final_eligible} satisfied ({100*final_satisfaction:.1f}%)")
    print(f"   Iterations: {state['iteration'] + 1}")
    
    # Detect conflicts
    conflicts = detect_conflicts(
        state['satisfaction_history'],
        rules,
        threshold=-0.5,
        min_samples=3,
    )
    
    # Separate same-crew conflicts
    same_crew = [c for c in conflicts 
                 if c.rule_a_info.get("crewId") == c.rule_b_info.get("crewId")]
    
    print(f"   Conflicts: {len(conflicts)} total, {len(same_crew)} same-crew")
    
    return DateConflictData(
        date=date,
        crew_count=len(crew),
        assignment_count=len(assignments),
        rule_count=len(rules),
        eligible_count=eligible,
        initial_satisfaction=initial_satisfaction,
        final_satisfaction=final_satisfaction,
        conflicts=conflicts,
        same_crew_conflicts=same_crew,
        rules_by_id=rules_by_id,
    )


def aggregate_conflicts(date_data: List[DateConflictData]) -> Dict[Tuple[str, str], AggregatedConflict]:
    """Aggregate conflict patterns across dates."""
    aggregated: Dict[Tuple[str, str], AggregatedConflict] = {}
    
    for dd in date_data:
        for conflict in dd.conflicts:
            type_a = conflict.rule_a_info.get("type", "UNKNOWN")
            type_b = conflict.rule_b_info.get("type", "UNKNOWN")
            
            # Normalize key order for consistent aggregation
            key = tuple(sorted([type_a, type_b]))
            
            if key not in aggregated:
                aggregated[key] = AggregatedConflict(
                    rule_a_type=key[0],
                    rule_b_type=key[1],
                )
            
            agg = aggregated[key]
            agg.occurrences += 1
            agg.dates_seen.add(dd.date)
            agg.correlations.append(conflict.correlation)
            
            # Collect crew IDs
            crew_a = conflict.rule_a_info.get("crewId")
            crew_b = conflict.rule_b_info.get("crewId")
            if crew_a:
                agg.crew_ids.add(crew_a)
            if crew_b:
                agg.crew_ids.add(crew_b)
            
            # Collect role codes
            role_a = conflict.rule_a_info.get("roleCode")
            role_b = conflict.rule_b_info.get("roleCode")
            if role_a:
                agg.role_codes_a.add(role_a)
            if role_b:
                agg.role_codes_b.add(role_b)
            
            # Keep some examples
            if len(agg.example_rule_ids) < 5:
                agg.example_rule_ids.append((conflict.rule_a_id, conflict.rule_b_id))
    
    return aggregated


def analyze_by_crew(date_data: List[DateConflictData]) -> Dict[str, Dict]:
    """Analyze conflicts by crew member."""
    crew_conflicts: Dict[str, Dict] = defaultdict(lambda: {
        "total_conflicts": 0,
        "dates": set(),
        "conflict_types": defaultdict(int),
        "conflicting_roles": set(),
        "same_crew_conflicts": 0,
    })
    
    for dd in date_data:
        for conflict in dd.conflicts:
            crew_a = conflict.rule_a_info.get("crewId")
            crew_b = conflict.rule_b_info.get("crewId")
            type_a = conflict.rule_a_info.get("type", "UNKNOWN")
            type_b = conflict.rule_b_info.get("type", "UNKNOWN")
            role_a = conflict.rule_a_info.get("roleCode")
            role_b = conflict.rule_b_info.get("roleCode")
            
            for crew_id in [crew_a, crew_b]:
                if crew_id:
                    crew_conflicts[crew_id]["total_conflicts"] += 1
                    crew_conflicts[crew_id]["dates"].add(dd.date)
                    crew_conflicts[crew_id]["conflict_types"][type_a] += 1
                    crew_conflicts[crew_id]["conflict_types"][type_b] += 1
                    if role_a:
                        crew_conflicts[crew_id]["conflicting_roles"].add(role_a)
                    if role_b:
                        crew_conflicts[crew_id]["conflicting_roles"].add(role_b)
            
            # Same crew conflict
            if crew_a == crew_b and crew_a:
                crew_conflicts[crew_a]["same_crew_conflicts"] += 1
    
    return dict(crew_conflicts)


def analyze_by_role(date_data: List[DateConflictData]) -> Dict[str, Dict]:
    """Analyze conflicts by role code."""
    role_conflicts: Dict[str, Dict] = defaultdict(lambda: {
        "total_conflicts": 0,
        "dates": set(),
        "conflict_types": defaultdict(int),
        "crew_involved": set(),
    })
    
    for dd in date_data:
        for conflict in dd.conflicts:
            role_a = conflict.rule_a_info.get("roleCode")
            role_b = conflict.rule_b_info.get("roleCode")
            type_a = conflict.rule_a_info.get("type", "UNKNOWN")
            type_b = conflict.rule_b_info.get("type", "UNKNOWN")
            crew_a = conflict.rule_a_info.get("crewId")
            crew_b = conflict.rule_b_info.get("crewId")
            
            for role, crew, rtype in [(role_a, crew_a, type_a), (role_b, crew_b, type_b)]:
                if role:
                    role_conflicts[role]["total_conflicts"] += 1
                    role_conflicts[role]["dates"].add(dd.date)
                    role_conflicts[role]["conflict_types"][rtype] += 1
                    if crew:
                        role_conflicts[role]["crew_involved"].add(crew)
    
    return dict(role_conflicts)


def analyze_by_rule_type(date_data: List[DateConflictData]) -> Dict[str, Dict]:
    """Analyze conflicts by rule type."""
    type_conflicts: Dict[str, Dict] = defaultdict(lambda: {
        "total_conflicts": 0,
        "dates": set(),
        "conflicts_with": defaultdict(int),
        "roles_involved": set(),
        "crew_involved": set(),
        "avg_correlation": 0.0,
        "correlations": [],
    })
    
    for dd in date_data:
        for conflict in dd.conflicts:
            type_a = conflict.rule_a_info.get("type", "UNKNOWN")
            type_b = conflict.rule_b_info.get("type", "UNKNOWN")
            role_a = conflict.rule_a_info.get("roleCode")
            role_b = conflict.rule_b_info.get("roleCode")
            crew_a = conflict.rule_a_info.get("crewId")
            crew_b = conflict.rule_b_info.get("crewId")
            
            # Update type A
            type_conflicts[type_a]["total_conflicts"] += 1
            type_conflicts[type_a]["dates"].add(dd.date)
            type_conflicts[type_a]["conflicts_with"][type_b] += 1
            type_conflicts[type_a]["correlations"].append(conflict.correlation)
            if role_a:
                type_conflicts[type_a]["roles_involved"].add(role_a)
            if crew_a:
                type_conflicts[type_a]["crew_involved"].add(crew_a)
            
            # Update type B
            type_conflicts[type_b]["total_conflicts"] += 1
            type_conflicts[type_b]["dates"].add(dd.date)
            type_conflicts[type_b]["conflicts_with"][type_a] += 1
            type_conflicts[type_b]["correlations"].append(conflict.correlation)
            if role_b:
                type_conflicts[type_b]["roles_involved"].add(role_b)
            if crew_b:
                type_conflicts[type_b]["crew_involved"].add(crew_b)
    
    # Calculate average correlations
    for rtype, data in type_conflicts.items():
        if data["correlations"]:
            data["avg_correlation"] = sum(data["correlations"]) / len(data["correlations"])
    
    return dict(type_conflicts)


def find_persistent_conflicts(date_data: List[DateConflictData]) -> List[Dict]:
    """Find conflicts that appear on ALL dates (persistent problems)."""
    # Build conflict signature -> dates map
    conflict_dates: Dict[Tuple[str, str, str], Set[str]] = defaultdict(set)
    conflict_examples: Dict[Tuple[str, str, str], List[ConflictPair]] = defaultdict(list)
    
    for dd in date_data:
        for conflict in dd.conflicts:
            crew_a = conflict.rule_a_info.get("crewId", "")
            crew_b = conflict.rule_b_info.get("crewId", "")
            type_a = conflict.rule_a_info.get("type", "")
            type_b = conflict.rule_b_info.get("type", "")
            
            # Signature: same crew + same rule types (sorted)
            if crew_a == crew_b and crew_a:
                sig = (crew_a, *sorted([type_a, type_b]))
                conflict_dates[sig].add(dd.date)
                conflict_examples[sig].append(conflict)
    
    # Filter to those appearing on all dates
    all_dates = {dd.date for dd in date_data}
    persistent = []
    
    for sig, dates in conflict_dates.items():
        if dates == all_dates:
            examples = conflict_examples[sig]
            persistent.append({
                "crew_id": sig[0],
                "rule_types": list(sig[1:]),
                "dates": list(dates),
                "example": examples[0] if examples else None,
            })
    
    return persistent


def print_summary(date_data: List[DateConflictData]):
    """Print overall summary."""
    print("\n" + "=" * 80)
    print("CONFLICT ANALYSIS SUMMARY")
    print("=" * 80)
    
    print("\n📊 DATE OVERVIEW:")
    print("-" * 80)
    print(f"{'Date':<12} {'Crew':<6} {'Rules':<8} {'Eligible':<10} {'Init Sat':<10} {'Final Sat':<10} {'Conflicts':<10}")
    print("-" * 80)
    
    total_conflicts = 0
    for dd in date_data:
        print(f"{dd.date:<12} {dd.crew_count:<6} {dd.rule_count:<8} {dd.eligible_count:<10} "
              f"{100*dd.initial_satisfaction:.1f}%{'':<5} {100*dd.final_satisfaction:.1f}%{'':<5} {len(dd.conflicts):<10}")
        total_conflicts += len(dd.conflicts)
    
    print("-" * 80)
    print(f"{'TOTAL':<12} {'':<6} {'':<8} {'':<10} {'':<10} {'':<10} {total_conflicts:<10}")


def print_aggregated_conflicts(aggregated: Dict[Tuple[str, str], AggregatedConflict]):
    """Print aggregated conflict patterns."""
    print("\n" + "=" * 80)
    print("AGGREGATED CONFLICT PATTERNS (across all dates)")
    print("=" * 80)
    
    # Sort by occurrences
    sorted_agg = sorted(aggregated.values(), key=lambda x: -x.occurrences)
    
    print(f"\n{'Pattern':<60} {'Count':<8} {'Dates':<6} {'Avg Corr':<10} {'Crew':<8}")
    print("-" * 100)
    
    for agg in sorted_agg[:20]:
        pattern = f"{agg.rule_a_type} ↔ {agg.rule_b_type}"
        avg_corr = sum(agg.correlations) / len(agg.correlations) if agg.correlations else 0
        print(f"{pattern:<60} {agg.occurrences:<8} {len(agg.dates_seen):<6} {avg_corr:+.3f}{'':<4} {len(agg.crew_ids):<8}")
    
    if len(sorted_agg) > 20:
        print(f"... and {len(sorted_agg) - 20} more patterns")


def print_crew_analysis(crew_analysis: Dict[str, Dict], top_n: int = 20):
    """Print analysis by crew."""
    print("\n" + "=" * 80)
    print("CONFLICTS BY CREW (sorted by total conflicts)")
    print("=" * 80)
    
    # Sort by total conflicts
    sorted_crew = sorted(crew_analysis.items(), key=lambda x: -x[1]["total_conflicts"])
    
    print(f"\n{'CrewId':<15} {'Total':<8} {'Dates':<6} {'Same-Crew':<10} {'Top Types':<40}")
    print("-" * 100)
    
    for crew_id, data in sorted_crew[:top_n]:
        dates = len(data["dates"])
        same_crew = data["same_crew_conflicts"]
        # Top 3 conflict types
        top_types = sorted(data["conflict_types"].items(), key=lambda x: -x[1])[:3]
        top_str = ", ".join(f"{t[:15]}({c})" for t, c in top_types)
        print(f"{crew_id:<15} {data['total_conflicts']:<8} {dates:<6} {same_crew:<10} {top_str:<40}")
    
    if len(sorted_crew) > top_n:
        print(f"... and {len(sorted_crew) - top_n} more crew members")


def print_role_analysis(role_analysis: Dict[str, Dict]):
    """Print analysis by role."""
    print("\n" + "=" * 80)
    print("CONFLICTS BY ROLE (sorted by total conflicts)")
    print("=" * 80)
    
    # Sort by total conflicts
    sorted_roles = sorted(role_analysis.items(), key=lambda x: -x[1]["total_conflicts"])
    
    print(f"\n{'Role':<12} {'Total':<8} {'Dates':<6} {'Crew Involved':<15} {'Top Conflict Types':<40}")
    print("-" * 100)
    
    for role, data in sorted_roles:
        dates = len(data["dates"])
        crew_count = len(data["crew_involved"])
        top_types = sorted(data["conflict_types"].items(), key=lambda x: -x[1])[:3]
        top_str = ", ".join(f"{t[:12]}({c})" for t, c in top_types)
        print(f"{role:<12} {data['total_conflicts']:<8} {dates:<6} {crew_count:<15} {top_str:<40}")


def print_type_analysis(type_analysis: Dict[str, Dict]):
    """Print analysis by rule type."""
    print("\n" + "=" * 80)
    print("CONFLICTS BY RULE TYPE (sorted by total conflicts)")
    print("=" * 80)
    
    # Sort by total conflicts
    sorted_types = sorted(type_analysis.items(), key=lambda x: -x[1]["total_conflicts"])
    
    print(f"\n{'Rule Type':<35} {'Total':<8} {'Dates':<6} {'Avg Corr':<10} {'Roles':<8} {'Crew':<8}")
    print("-" * 100)
    
    for rtype, data in sorted_types:
        dates = len(data["dates"])
        avg_corr = data["avg_correlation"]
        roles = len(data["roles_involved"])
        crew = len(data["crew_involved"])
        print(f"{rtype:<35} {data['total_conflicts']:<8} {dates:<6} {avg_corr:+.3f}{'':<4} {roles:<8} {crew:<8}")
    
    # Show what each type conflicts with
    print("\n" + "-" * 80)
    print("CONFLICT PAIRS BY TYPE:")
    print("-" * 80)
    
    for rtype, data in sorted_types[:5]:
        conflicts_with = sorted(data["conflicts_with"].items(), key=lambda x: -x[1])
        print(f"\n{rtype}:")
        for other_type, count in conflicts_with[:5]:
            print(f"   ↔ {other_type}: {count}")


def print_persistent_conflicts(persistent: List[Dict]):
    """Print conflicts that appear on ALL dates."""
    print("\n" + "=" * 80)
    print("PERSISTENT CONFLICTS (same-crew conflicts appearing on ALL dates)")
    print("=" * 80)
    
    if not persistent:
        print("\n   No conflicts appear on all dates")
        return
    
    print(f"\nFound {len(persistent)} persistent same-crew conflict patterns:")
    print("-" * 80)
    
    for p in persistent[:20]:
        crew = p["crew_id"]
        dates = ", ".join(p["dates"])
        print(f"\n   Crew {crew}:")
        print(f"      Dates: {dates}")
        
        if p["example"]:
            ex = p["example"]
            # Use the new describe() method for full context
            print(f"      Conflict: {ex.rule_a_description}")
            print(f"             ↔ {ex.rule_b_description}")
            print(f"      Correlation: {ex.correlation:.2f}")


def print_top_same_crew_conflicts(date_data: List[DateConflictData], limit: int = 20):
    """Print the most severe same-crew conflicts with full descriptions."""
    print("\n" + "=" * 80)
    print("TOP SAME-CREW CONFLICTS (with full context)")
    print("=" * 80)
    
    # Collect all same-crew conflicts across dates
    all_same_crew = []
    for dd in date_data:
        for conflict in dd.same_crew_conflicts:
            all_same_crew.append((dd.date, conflict))
    
    # Sort by correlation (most negative = worst conflict)
    all_same_crew.sort(key=lambda x: x[1].correlation)
    
    if not all_same_crew:
        print("\n   No same-crew conflicts found")
        return
    
    print(f"\nShowing top {min(limit, len(all_same_crew))} conflicts:")
    print("-" * 80)
    
    for i, (date, conflict) in enumerate(all_same_crew[:limit], 1):
        crew_id = conflict.rule_a_info.get("crewId", "?")
        print(f"\n{i}. Crew {crew_id} ({date}) [r={conflict.correlation:.2f}]")
        print(f"   {conflict.rule_a_description}")
        print(f"   ↔ {conflict.rule_b_description}")


def save_analysis_json(date_data: List[DateConflictData], filename: str = "conflict_analysis.json"):
    """Save analysis data to JSON for further processing."""
    output = {
        "dates_analyzed": [dd.date for dd in date_data],
        "date_summaries": [],
        "all_conflicts": [],
    }
    
    for dd in date_data:
        output["date_summaries"].append({
            "date": dd.date,
            "crew_count": dd.crew_count,
            "rule_count": dd.rule_count,
            "eligible_count": dd.eligible_count,
            "initial_satisfaction": dd.initial_satisfaction,
            "final_satisfaction": dd.final_satisfaction,
            "conflict_count": len(dd.conflicts),
            "same_crew_conflict_count": len(dd.same_crew_conflicts),
        })
        
        for conflict in dd.conflicts:
            output["all_conflicts"].append({
                "date": dd.date,
                "rule_a_id": conflict.rule_a_id,
                "rule_b_id": conflict.rule_b_id,
                "correlation": conflict.correlation,
                "rule_a_description": conflict.rule_a_description,
                "rule_b_description": conflict.rule_b_description,
                "rule_a_type": conflict.rule_a_info.get("type"),
                "rule_b_type": conflict.rule_b_info.get("type"),
                "rule_a_crew": conflict.rule_a_info.get("crewId"),
                "rule_b_crew": conflict.rule_b_info.get("crewId"),
                "rule_a_role": conflict.rule_a_info.get("roleCode"),
                "rule_b_role": conflict.rule_b_info.get("roleCode"),
                "rule_a_target_role": conflict.rule_a_info.get("targetRoleCode"),
                "rule_b_target_role": conflict.rule_b_info.get("targetRoleCode"),
                "rule_a_value": conflict.rule_a_info.get("valueInt"),
                "rule_b_value": conflict.rule_b_info.get("valueInt"),
                "same_crew": conflict.is_same_crew,
            })
    
    with open(filename, "w") as f:
        json.dump(output, f, indent=2)
    
    print(f"\n📁 Analysis saved to {filename}")


def main():
    print("=" * 80)
    print("MULTI-DATE CONFLICT ANALYZER")
    print("=" * 80)
    print(f"Analyzing dates: {', '.join(DATES)}")
    print(f"Store: {STORE_ID}")
    
    # Collect data for each date
    date_data: List[DateConflictData] = []
    for date in DATES:
        try:
            dd = collect_date_conflicts(date)
            date_data.append(dd)
        except Exception as e:
            print(f"\n❌ Error processing {date}: {e}")
    
    if not date_data:
        print("\n❌ No data collected!")
        return
    
    # Aggregate and analyze
    aggregated = aggregate_conflicts(date_data)
    crew_analysis = analyze_by_crew(date_data)
    role_analysis = analyze_by_role(date_data)
    type_analysis = analyze_by_rule_type(date_data)
    persistent = find_persistent_conflicts(date_data)
    
    # Print reports
    print_summary(date_data)
    print_aggregated_conflicts(aggregated)
    print_crew_analysis(crew_analysis)
    print_role_analysis(role_analysis)
    print_type_analysis(type_analysis)
    print_persistent_conflicts(persistent)
    print_top_same_crew_conflicts(date_data)  # NEW: Show conflicts with full context
    
    # Save to JSON
    save_analysis_json(date_data)
    
    print("\n" + "=" * 80)
    print("✅ ANALYSIS COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    main()
