"""Decision variable scaffolding for Solver V2."""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Set

from ortools.sat.python import cp_model

from .time_grid import CrewShiftWindow, TimeGrid

ASSIGNMENT_MODELS = ("HOURLY", "HOURLY_WINDOW", "DAILY", "SOLVER")


@dataclass
class AssignmentVariable:
    """Represents an assignment block for a crew member to a role.
    
    For blockSize=1 roles (like Product): represents a single 30-min slot
    For blockSize=2 roles (like Register): represents a 1-hour block (2 slots)
    
    The slot_index is the STARTING slot of the block.
    The slot_count indicates how many consecutive slots this block covers.
    """
    key: str
    role_id: int
    crew_id: str
    slot_index: int  # Starting slot index of this block
    slot_count: int  # Number of slots this block covers (= blockSize)
    start_minute: int
    end_minute: int
    hour: int
    models: Set[str] = field(default_factory=set)
    cp_var: cp_model.IntVar | None = None
    
    @property
    def slot_indexes(self) -> List[int]:
        """Return all slot indexes covered by this block."""
        return list(range(self.slot_index, self.slot_index + self.slot_count))


@dataclass
class VariableBundle:
    """Container summarizing the decision tensors and CP-SAT handles."""

    model: cp_model.CpModel
    slot_variables: Dict[str, AssignmentVariable] = field(default_factory=dict)
    model_index: Dict[str, List[str]] = field(
        default_factory=lambda: {model: [] for model in ASSIGNMENT_MODELS}
    )
    metadata: Dict[str, Any] = field(default_factory=dict)

    def register(self, variable: AssignmentVariable, models: Iterable[str]) -> bool:
        """Register a variable for the provided assignment models.

        Returns True if the variable was newly created.
        """

        model_list = {model for model in models if model in ASSIGNMENT_MODELS}
        if not model_list:
            return False

        existing = self.slot_variables.get(variable.key)
        created = existing is None
        if created:
            variable.models |= model_list
            variable.cp_var = self.model.NewBoolVar(variable.key)
            self.slot_variables[variable.key] = variable
            target = variable
        else:
            existing.models |= model_list
            target = existing

        for model in model_list:
            if target.key not in self.model_index[model]:
                self.model_index[model].append(target.key)

        return created

    def summary(self) -> Dict[str, int]:
        return {
            "hourly": len(self.model_index["HOURLY"]),
            "window": len(self.model_index["HOURLY_WINDOW"]),
            "daily": len(self.model_index["DAILY"]),
            "solver_managed": len(self.model_index["SOLVER"]),
            "slot_variables": len(self.slot_variables),
        }


def build_assignment_variables(
    model: cp_model.CpModel,
    solver_input: Dict[str, Any],
    grid: TimeGrid,
) -> VariableBundle:
    roles: List[Dict[str, Any]] = solver_input.get("roles", [])
    crews: List[Dict[str, Any]] = solver_input.get("crew", [])
    crew_lookup = {crew["id"]: crew for crew in crews}

    bundle = VariableBundle(model=model)
    role_slot_counts: Dict[int, int] = defaultdict(int)
    crew_slot_counts: Dict[str, int] = defaultdict(int)
    
    # DEBUG: Track variables per role per hour
    import sys
    role_hour_var_counts: Dict[tuple, int] = defaultdict(int)
    
    # Build lookup for daily requirements: (role_id, crew_id) -> requiredMinutes
    daily_requirements_lookup: Dict[tuple, int] = {}
    for req in solver_input.get("dailyRequirements", []):
        key = (req["roleId"], req["crewId"])
        daily_requirements_lookup[key] = req.get("requiredMinutes", 0)
    
    # Build lookup for window requirements: role_id -> (startMinute, endMinute)
    window_bounds_lookup: Dict[int, tuple] = {}
    for req in solver_input.get("windowRequirements", []):
        role_id = req["roleId"]
        start_minute = req["startHour"] * 60
        end_minute = req["endHour"] * 60
        window_bounds_lookup[role_id] = (start_minute, end_minute)
    
    # Build lookup for hourly requirements: (role_id, hour) -> required count
    # This tracks which hours have constraints for HOURLY roles
    hourly_requirements_lookup: Dict[tuple, int] = {}
    for req in solver_input.get("hourlyRequirements", []):
        key = (req["roleId"], req["hour"])
        hourly_requirements_lookup[key] = req.get("required", 0)
    
    # Build set of role_ids that have ANY hourly requirement
    roles_with_hourly_constraints: set = set()
    for req in solver_input.get("hourlyRequirements", []):
        roles_with_hourly_constraints.add(req["roleId"])

    for role in roles:
        assignment_models = role.get("assignmentModels", [])
        default_block_size = max(1, int(role.get("blockSize", 1) or 1))
        min_shift_length = role.get("minShiftLengthForRoleAccess") or 0
        allowed_crews = _eligible_crews_for_role(role, crews, grid, min_shift_length)
        is_daily_role = "DAILY" in assignment_models
        is_window_role = "HOURLY_WINDOW" in assignment_models
        is_hourly_role = "HOURLY" in assignment_models
        
        # For HOURLY_WINDOW roles, skip if there's no window constraint
        if is_window_role and role["id"] not in window_bounds_lookup:
            continue
        
        # For HOURLY roles, skip if there are no hourly constraints for this role
        if is_hourly_role and not is_window_role and not is_daily_role:
            if role["id"] not in roles_with_hourly_constraints:
                continue
        
        # Get window bounds if this is a window role
        window_bounds = None
        if is_window_role and role["id"] in window_bounds_lookup:
            window_bounds = window_bounds_lookup[role["id"]]

        for crew_id in allowed_crews:
            crew = crew_lookup[crew_id]
            crew_window = grid.crew_windows.get(crew_id)
            if not crew_window:
                continue
            
            # Determine block sizes to generate for this crew-role combination
            if is_daily_role:
                # For DAILY roles, decompose requirement into hour blocks + optional half-hour
                required_minutes = daily_requirements_lookup.get((role["id"], crew_id), 0)
                block_sizes_to_generate = _decompose_daily_into_block_sizes(required_minutes, default_block_size)
            else:
                # For non-DAILY roles, use the role's default block size
                block_sizes_to_generate = [default_block_size]
            
            # Generate variables for each block size
            for block_size in block_sizes_to_generate:
                block_starts = _eligible_block_starts_for_role_and_crew(
                    role, crew_window, grid, block_size, window_bounds
                )
                
                for block_start in block_starts:
                    start_slot = grid.slots[block_start]
                    end_slot_idx = block_start + block_size - 1
                    end_slot = grid.slots[end_slot_idx]
                    
                    # For HOURLY roles (not window), only create variable if this hour has a constraint
                    if is_hourly_role and not is_window_role and not is_daily_role:
                        hour = start_slot.hour
                        if (role["id"], hour) not in hourly_requirements_lookup:
                            continue
                    
                    # Key includes block_size to distinguish block types
                    key = f"{role['id']}::{crew_id}::{block_start}::{block_size}"
                    variable = AssignmentVariable(
                        key=key,
                        role_id=role["id"],
                        crew_id=crew_id,
                        slot_index=block_start,
                        slot_count=block_size,
                        start_minute=start_slot.start_minute,
                        end_minute=end_slot.end_minute,
                        hour=start_slot.hour,
                    )
                    created = bundle.register(variable, assignment_models)
                    if created:
                        role_slot_counts[role["id"]] += 1
                        crew_slot_counts[crew_id] += 1
                        # DEBUG: Track per-hour counts for HOURLY roles
                        if is_hourly_role:
                            role_hour_var_counts[(role["id"], start_slot.hour)] += 1

    # DEBUG: Print Register variables per hour
    register_role_id = None
    for role in roles:
        if role.get("code") == "REG":
            register_role_id = role["id"]
            break
    
    register_vars_by_hour = {}
    if register_role_id:
        print("\n=== REGISTER VARIABLES PER HOUR ===", file=sys.stderr)
        for hour in range(5, 22):
            count = role_hour_var_counts.get((register_role_id, hour), 0)
            req = hourly_requirements_lookup.get((register_role_id, hour), 0)
            register_vars_by_hour[hour] = {"variables": count, "required": req}
            status = "✓" if count >= req else f"✗ NEED {req}"
            print(f"  Hour {hour}: {count} variables (required: {req}) {status}", file=sys.stderr)
        print("=== END REGISTER VARS ===\n", file=sys.stderr)

    bundle.metadata["role_slot_counts"] = dict(role_slot_counts)
    bundle.metadata["crew_slot_counts"] = dict(crew_slot_counts)
    bundle.metadata["role_count"] = len(roles)
    bundle.metadata["crew_count"] = len(crews)
    bundle.metadata["slot_variables"] = len(bundle.slot_variables)
    bundle.metadata["register_vars_by_hour"] = register_vars_by_hour
    return bundle


def _decompose_daily_into_block_sizes(required_minutes: int, default_block_size: int) -> List[int]:
    """
    Decompose a daily requirement into optimal block sizes.
    
    For daily requirements, we generate:
    - blockSize=2 (1-hour blocks) that snap to hour boundaries
    - blockSize=1 (30-min blocks) for any half-hour remainder
    
    This allows clean hour-aligned scheduling while handling partial hours.
    
    Examples:
    - 60 min -> [2] (one 1-hour block)
    - 90 min -> [2, 1] (one 1-hour block + one 30-min block)  
    - 150 min -> [2, 1] (hour blocks + 30-min remainder)
    - 180 min -> [2] (all hour blocks)
    - 0 min -> [] (no blocks - no daily constraint means no assignment)
    
    Returns list of unique block sizes to generate variables for.
    """
    if required_minutes <= 0:
        # No daily requirement - don't create any variables for this crew/role
        return []
    
    block_sizes = set()
    
    # How many full hours?
    full_hours = required_minutes // 60
    if full_hours > 0:
        block_sizes.add(2)  # 1-hour blocks (blockSize=2)
    
    # Any half-hour remainder?
    remainder = required_minutes % 60
    if remainder == 30:
        block_sizes.add(1)  # 30-min block (blockSize=1)
    elif remainder > 0 and remainder != 30:
        # Odd remainder (not 30 min) - fall back to 30-min blocks for flexibility
        block_sizes.add(1)
    
    # If no blocks determined (e.g., 0 minutes), use default
    if not block_sizes:
        return [default_block_size]
    
    return sorted(block_sizes)


def _eligible_crews_for_role(
    role: Dict[str, Any],
    crews: List[Dict[str, Any]],
    grid: TimeGrid,
    min_shift_length: int,
) -> List[str]:
    result: List[str] = []
    role_id = role["id"]
    for crew in crews:
        if role_id not in crew.get("roleIds", []):
            continue
        window = grid.crew_windows.get(crew["id"])
        if not window:
            continue
        if min_shift_length and window.duration_minutes < min_shift_length:
            continue
        result.append(crew["id"])
    return result


def _eligible_block_starts_for_role_and_crew(
    role: Dict[str, Any],
    crew_window: CrewShiftWindow,
    grid: TimeGrid,
    block_size: int,
    window_bounds: tuple = None,
) -> List[int]:
    """
    Determine valid block starting positions for a crew member and role.
    
    Block alignment rule: a block must start at a slot index divisible by its blockSize.
    - blockSize=1: can start at any slot (0, 1, 2, 3...)
    - blockSize=2: can start at even slots only (0, 2, 4, 6...)
    - blockSize=3: can start at every 3rd slot (0, 3, 6, 9...)
    
    If window_bounds is provided (for HOURLY_WINDOW roles), only generate variables
    within that time window.
    
    This ensures blocks snap to natural hour boundaries and don't overlap awkwardly.
    """
    allow_outside_hours = bool(role.get("allowOutsideStoreHours"))
    window_offsets = role.get("windowOffsets")

    eligible: List[int] = []
    
    slot_start = crew_window.slot_start
    slot_end = crew_window.slot_end
    
    # If window bounds provided, restrict slot range to within window
    if window_bounds:
        window_start_minute, window_end_minute = window_bounds
        # Convert window minutes to slot indices
        window_start_slot = grid.minute_to_slot_index(window_start_minute)
        window_end_slot = grid.minute_to_slot_index(window_end_minute)
        if window_start_slot is not None:
            slot_start = max(slot_start, window_start_slot)
        if window_end_slot is not None:
            slot_end = min(slot_end, window_end_slot)
    
    # Align start to the next valid block boundary
    # Find the first slot >= slot_start where slot_index % block_size == 0
    if slot_start % block_size != 0:
        slot_start = slot_start + (block_size - (slot_start % block_size))
    
    current = slot_start
    while current + block_size <= slot_end:
        # Check if ALL slots in this block are valid
        block_valid = True
        
        for offset in range(block_size):
            slot_index = current + offset
            if slot_index >= len(grid.slots):
                block_valid = False
                break
                
            slot = grid.slots[slot_index]
            
            # Check store hours constraint
            if not allow_outside_hours and not grid.is_within_store_hours(slot.start_minute, slot.end_minute):
                block_valid = False
                break
            
            # Check window offsets (for roles with timing restrictions relative to shift)
            if window_offsets:
                block_start_min = grid.slots[current].start_minute
                block_end_min = grid.slots[current + block_size - 1].end_minute
                if not _satisfies_window_offsets_block(
                    crew_window, block_start_min, block_end_min, window_offsets
                ):
                    block_valid = False
                    break
        
        if block_valid:
            eligible.append(current)
        
        # Step by block_size to stay aligned to boundaries
        current += block_size
    
    return eligible


def _satisfies_window_offsets_block(
    crew_window: CrewShiftWindow,
    block_start_minute: int,
    block_end_minute: int,
    window_offsets: Dict[str, Any],
) -> bool:
    """Check if a block satisfies window offset constraints."""
    start_offset = window_offsets.get("startOffsetMin")
    end_offset = window_offsets.get("endOffsetMin")
    if start_offset is None or end_offset is None:
        return True

    relative_start = block_start_minute - crew_window.start_minute
    relative_end = block_end_minute - crew_window.start_minute
    return relative_start >= start_offset and relative_end <= end_offset


def _satisfies_window_offsets(
    crew_window: CrewShiftWindow,
    block_start: int,
    block_end: int,
    window_offsets: Dict[str, Any],
) -> bool:
    """Legacy function - kept for compatibility."""
    start_offset = window_offsets.get("startOffsetMin")
    end_offset = window_offsets.get("endOffsetMin")
    if start_offset is None or end_offset is None:
        return True

    relative_start = block_start - crew_window.start_minute
    relative_end = block_end - crew_window.start_minute
    return relative_start >= start_offset and relative_end <= end_offset
