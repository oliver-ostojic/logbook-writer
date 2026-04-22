"""Decision variable construction for SolverV2.

Variables represent potential task assignments: (crew, slot, role).
Each variable indicates whether a crew member starts a task for a role at a slot.
The task's length (taskLength in minutes) determines how many slots the assignment covers.

For roles with canSplitForGaps=True, we create both:
- Full-length variables (taskLength slots) - primary assignments
- Half-length variables (taskLength/2 slots) - for gap-filling only
"""

from __future__ import annotations

import sys
from collections import defaultdict
from typing import Dict, List, Tuple

from ortools.sat.python import cp_model

from .time_grid import TimeGrid

# (crewId, slotIndex, roleId, taskSlots) - taskSlots distinguishes full vs half assignments
AssignmentKey = Tuple[str, int, int, int]


class VariableBuilder:
    """Creates boolean decision variables for every valid (crew, slot, role, taskSlots)."""

    def __init__(self, model: cp_model.CpModel, time_grid: TimeGrid):
        self.model = model
        self.time_grid = time_grid

    def build(
        self,
        *,
        crew_records: List[dict],
        role_records: List[dict],
        crew_quotas: List[dict] | None = None,
    ) -> Dict[AssignmentKey, cp_model.IntVar]:
        DEBUG = False
        role_by_id = {role['id']: role for role in role_records}
        role_code_by_id = {role['id']: role['code'] for role in role_records}
        variables: Dict[AssignmentKey, cp_model.IntVar] = {}
        
        # Build a set of (crewId, roleId) pairs that have daily quotas
        # For DAILY roles, we ONLY create variables if a quota exists
        daily_quota_pairs: set[Tuple[str, int]] = set()
        if crew_quotas:
            for req in crew_quotas:
                crew_id = req.get('crewId')
                role_id = req.get('roleId')
                required_minutes = req.get('requiredMin', 0)  # Note: field is 'requiredMin' not 'requiredMinutes'
                if crew_id and role_id and required_minutes > 0:
                    daily_quota_pairs.add((str(crew_id), role_id))
        
        # Identify which roles have DAILY assignment model
        # Check both 'assignmentModels' (list) and 'assignmentModel' (string) for compatibility
        daily_role_ids: set[int] = set()
        for role in role_records:
            assignment_models = role.get('assignmentModels') or []
            assignment_model = role.get('assignmentModel')  # singular string fallback
            is_daily = 'DAILY' in assignment_models or assignment_model == 'DAILY'
            if is_daily:
                daily_role_ids.add(role['id'])

        if DEBUG: print(f"\n{'='*70}", file=sys.stderr)
        if DEBUG: print("VARIABLE BUILDING DEBUG", file=sys.stderr)
        if DEBUG: print(f"{'='*70}", file=sys.stderr)
        if DEBUG: print(f"Crew count: {len(crew_records)}", file=sys.stderr)
        if DEBUG: print(f"Role count: {len(role_records)}", file=sys.stderr)
        if DEBUG: print(f"DAILY role IDs: {daily_role_ids}", file=sys.stderr)
        if DEBUG: print(f"Daily quota pairs count: {len(daily_quota_pairs)}", file=sys.stderr)
        if DEBUG: print(f"Roles: {[(r['id'], r['code'], r.get('taskLength', 30), r.get('allowOutsideStoreHours', False)) for r in role_records]}", file=sys.stderr)
        if DEBUG: print(f"Time grid: slot_minutes={self.time_grid.slot_minutes}, open={self.time_grid.open_minutes}, close={self.time_grid.close_minutes}", file=sys.stderr)

        # Track variables by crew and by slot for debugging
        vars_by_crew: Dict[str, Dict[int, List[str]]] = defaultdict(lambda: defaultdict(list))
        
        # IMPORTANT: Keep model construction deterministic.
        # Even with CP-SAT random_seed fixed, variable/constraint creation order can
        # affect the search and lead to different feasible solutions.
        crew_records_sorted = sorted(crew_records, key=lambda c: str(c.get('id', '')))

        for crew in crew_records_sorted:
            crew_id = crew['id']
            crew_name = crew.get('name', crew_id)
            eligible_role_ids = set(crew.get('roleIds') or [])
            if not eligible_role_ids:
                if DEBUG: print(f"\n⚠️  Crew {crew_name}: NO roleIds!", file=sys.stderr)
                continue

            shift_start_min = crew['shiftStartMin']
            shift_end_min = crew['shiftEndMin']
            shift_start_slot = self.time_grid.minutes_to_slot_floor(shift_start_min)
            shift_end_slot = self.time_grid.minutes_to_slot_floor(shift_end_min)
            if shift_end_slot <= shift_start_slot:
                if DEBUG: print(f"\n⚠️  Crew {crew_name}: Invalid shift {shift_start_min}-{shift_end_min}", file=sys.stderr)
                continue

            for role_id in sorted(eligible_role_ids):
                role = role_by_id.get(role_id)
                if not role:
                    continue
                
                # For DAILY roles, only create variables if crew has a quota for this role
                if role_id in daily_role_ids:
                    if (crew_id, role_id) not in daily_quota_pairs:
                        if DEBUG: print(f"    Skipping DAILY role {role_code_by_id.get(role_id)} for {crew_name}: no quota", file=sys.stderr)
                        continue

                # Get task length in minutes (default to grid slot size)
                task_length = role.get('taskLength') or self.time_grid.slot_minutes
                task_slots = self.time_grid.task_length_to_slots(task_length)
                can_split = role.get('canSplitForGaps', False)
                
                # Determine which task sizes to create variables for
                task_sizes = [task_slots]
                if can_split and task_slots > 1:
                    # Add half-length variables for gap-filling
                    half_slots = task_slots // 2
                    if half_slots >= 1:
                        task_sizes.append(half_slots)

                for current_task_slots in task_sizes:
                    allowed_slots = self._role_slot_window(
                        role,
                        shift_start_slot=shift_start_slot,
                        shift_end_slot=shift_end_slot,
                        shift_start_min=shift_start_min,
                        task_slots=current_task_slots,
                    )
                    if not allowed_slots:
                        continue

                    for slot in allowed_slots:
                        if not self._slot_is_valid(slot, role, current_task_slots):
                            continue

                        key: AssignmentKey = (crew_id, slot, role_id, current_task_slots)
                        suffix = f"_{current_task_slots}s" if can_split else ""
                        variables[key] = self.model.NewBoolVar(
                            f"x_{crew_id}_{slot}_{role['code']}{suffix}"
                        )
                        
                        # Track for debug output
                        role_code = role_code_by_id.get(role_id, str(role_id))
                        vars_by_crew[crew_name][slot].append(f"{role_code}({current_task_slots})")

        # Print detailed per-crew, per-hour breakdown
        if DEBUG: print(f"\n{'='*70}", file=sys.stderr)
        if DEBUG: print("VARIABLES BY CREW AND HOUR", file=sys.stderr)
        if DEBUG: print(f"{'='*70}", file=sys.stderr)
        
        slot_minutes = self.time_grid.slot_minutes
        
        # Show first 3 crew in detail with slot-by-slot breakdown
        crew_names = sorted(vars_by_crew.keys())[:3]
        for crew_name in crew_names:
            crew_slots = vars_by_crew[crew_name]
            crew_record = next((c for c in crew_records if c.get('name') == crew_name), None)
            if not crew_record:
                continue
                
            shift_start = crew_record['shiftStartMin']
            shift_end = crew_record['shiftEndMin']
            shift_start_slot = self.time_grid.minutes_to_slot_floor(shift_start)
            shift_end_slot = self.time_grid.minutes_to_slot_floor(shift_end)
            
            if DEBUG: print(f"\n📋 {crew_name}", file=sys.stderr)
            if DEBUG: print(f"   Shift: {shift_start}-{shift_end} min ({shift_start//60}:{shift_start%60:02d}-{shift_end//60}:{shift_end%60:02d})", file=sys.stderr)
            if DEBUG: print(f"   Roles: {crew_record.get('roleIds', [])}", file=sys.stderr)
            if DEBUG: print(f"   Slots: {shift_start_slot} to {shift_end_slot}", file=sys.stderr)
            
            # Show slot-by-slot: what STARTS at this slot and what COVERS this slot
            if DEBUG: print(f"   --- Slot-by-slot breakdown ---", file=sys.stderr)
            for slot in range(shift_start_slot, shift_end_slot):
                time_min = slot * slot_minutes
                time_str = f"{time_min//60}:{time_min%60:02d}"
                
                # Variables that START at this slot
                starts_here = crew_slots.get(slot, [])
                
                # Variables that COVER this slot (started earlier but span into it)
                covers_here = []
                for prev_slot in range(max(shift_start_slot, slot - 3), slot):  # Check up to 3 slots back
                    for var_info in crew_slots.get(prev_slot, []):
                        # Parse "ROLE(task_slots)" format
                        if '(' in var_info:
                            role_code = var_info.split('(')[0]
                            task_slots_str = var_info.split('(')[1].rstrip(')')
                            try:
                                var_task_slots = int(task_slots_str)
                                # If this var started at prev_slot and spans task_slots, does it cover current slot?
                                if prev_slot + var_task_slots > slot:
                                    covers_here.append(f"{role_code}@s{prev_slot}")
                            except ValueError:
                                pass
                
                all_options = starts_here + covers_here
                if all_options:
                    if DEBUG: print(f"   s{slot:02d} ({time_str}): starts={starts_here}, covers={covers_here}", file=sys.stderr)
                else:
                    if DEBUG: print(f"   s{slot:02d} ({time_str}): ⚠️  NOTHING AVAILABLE!", file=sys.stderr)
        
        if len(crew_names) < len(vars_by_crew):
            if DEBUG: print(f"\n... and {len(vars_by_crew) - len(crew_names)} more crew (showing first 3)", file=sys.stderr)
        
        # Summary: slots with no variables for any crew
        if DEBUG: print(f"\n{'='*70}", file=sys.stderr)
        if DEBUG: print("SLOT COVERAGE SUMMARY", file=sys.stderr)
        if DEBUG: print(f"{'='*70}", file=sys.stderr)
        
        # Check for slots that have NO covering variables (considering multi-slot tasks)
        crew_with_gaps = []
        for crew_name in sorted(vars_by_crew.keys()):
            crew_record = next((c for c in crew_records if c.get('name') == crew_name), None)
            if not crew_record:
                continue
            
            shift_start_slot = self.time_grid.minutes_to_slot_floor(crew_record['shiftStartMin'])
            shift_end_slot = self.time_grid.minutes_to_slot_floor(crew_record['shiftEndMin'])
            
            gaps = []
            for slot in range(shift_start_slot, shift_end_slot):
                # Check if anything starts here
                has_start = slot in vars_by_crew[crew_name] and vars_by_crew[crew_name][slot]
                
                # Check if anything covers here from previous slots
                has_cover = False
                for prev_slot in range(max(shift_start_slot, slot - 3), slot):
                    for var_info in vars_by_crew[crew_name].get(prev_slot, []):
                        if '(' in var_info:
                            try:
                                var_task_slots = int(var_info.split('(')[1].rstrip(')'))
                                if prev_slot + var_task_slots > slot:
                                    has_cover = True
                                    break
                            except ValueError:
                                pass
                    if has_cover:
                        break
                
                if not has_start and not has_cover:
                    gaps.append(slot)
            
            if gaps:
                crew_with_gaps.append((crew_name, gaps))
        
        if crew_with_gaps:
            if DEBUG: print(f"⚠️  {len(crew_with_gaps)} crew have slots with NO variables:", file=sys.stderr)
            for crew_name, gaps in crew_with_gaps[:10]:
                gap_times = [f"slot {g} ({g*slot_minutes}min)" for g in gaps[:5]]
                if len(gaps) > 5:
                    gap_times.append(f"...+{len(gaps)-5} more")
                if DEBUG: print(f"   {crew_name}: {', '.join(gap_times)}", file=sys.stderr)
            if len(crew_with_gaps) > 10:
                if DEBUG: print(f"   ... and {len(crew_with_gaps) - 10} more crew", file=sys.stderr)
        else:
            if DEBUG: print("✅ All crew have variables for all their shift slots", file=sys.stderr)

        if DEBUG: print(f"\nTotal variables created: {len(variables)}", file=sys.stderr)
        if DEBUG: print(f"{'='*70}\n", file=sys.stderr)
        
        return variables

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    def _role_slot_window(
        self,
        role: dict,
        shift_start_slot: int,
        shift_end_slot: int,
        *,
        shift_start_min: int,
        task_slots: int = 1,
    ) -> list[int]:
        """Return the candidate range of slots for the role within the shift.
        
        The end is adjusted by task_slots so that a task starting at the last
        valid slot can complete within the shift.
        """
        start = shift_start_slot
        # Ensure task fits within shift: last valid start = end - task_slots
        end = shift_end_slot - task_slots + 1

        offsets = role.get('windowOffsets')
        if offsets:
            start_offset = offsets.get('startOffsetMin')
            end_offset = offsets.get('endOffsetMin')
            if start_offset is not None:
                start_minutes = shift_start_min + start_offset
                start = max(start, self.time_grid.minutes_to_slot_floor(start_minutes))
            if end_offset is not None:
                end_minutes = shift_start_min + end_offset
                # Adjust for task length
                end = min(end, self.time_grid.minutes_to_slot_floor(end_minutes) - task_slots + 1)

        if end <= start:
            return []
        return list(range(start, end))

    def _slot_is_valid(self, slot: int, role: dict, task_slots: int = 1) -> bool:
        """Check if a task starting at this slot is valid.
        
        Rules:
        1. Task must not extend outside store hours (unless allowOutsideStoreHours)
        2. Task must start at a time aligned to its length (e.g., 60-min task starts at :00)
        """
        slot_minutes = self.time_grid.slot_minutes
        start_minute, _ = self.time_grid.slot_to_minutes(slot)
        task_length_minutes = task_slots * slot_minutes
        end_minute = start_minute + task_length_minutes
        
        # Check store hours
        if not role.get('allowOutsideStoreHours', False):
            if start_minute < self.time_grid.open_minutes:
                return False
            if end_minute > self.time_grid.close_minutes:
                return False
        
        # Hour-alignment rule: task must start at a time divisible by its length
        # e.g., 60-min task must start at :00 (divisible by 60)
        # e.g., 30-min task can start at :00 or :30 (divisible by 30)
        if start_minute % task_length_minutes != 0:
            return False
            
        return True


__all__ = ["VariableBuilder", "AssignmentKey"]
