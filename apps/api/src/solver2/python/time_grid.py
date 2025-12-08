"""Time grid utilities for Solver V2.

Creates a discrete slot grid spanning the store day plus all crew shift bounds
so later modeling stages can reason about contiguous slots, hour buckets, and
per-crew eligibility without duplicating indexing logic.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import ceil
from typing import Any, Dict, List, Optional


@dataclass
class SlotDescriptor:
    index: int
    start_minute: int
    end_minute: int

    @property
    def hour(self) -> int:
        return self.start_minute // 60


@dataclass
class CrewShiftWindow:
    crew_id: str
    start_minute: int
    end_minute: int
    slot_start: int
    slot_end: int  # exclusive

    @property
    def duration_minutes(self) -> int:
        return max(0, self.end_minute - self.start_minute)

    @property
    def slot_indexes(self) -> range:
        return range(self.slot_start, self.slot_end)


@dataclass
class TimeGrid:
    base_slot_minutes: int
    open_minutes: int
    close_minutes: int
    day_start_minute: int
    day_end_minute: int
    slots: List[SlotDescriptor]
    crew_windows: Dict[str, CrewShiftWindow]

    @property
    def slots_per_day(self) -> int:
        return len(self.slots)

    def summary(self) -> Dict[str, Any]:
        return {
            "base_slot_minutes": self.base_slot_minutes,
            "slots_per_day": self.slots_per_day,
            "crew_windows": len(self.crew_windows),
        }

    def minute_to_slot_index(self, minute: int) -> Optional[int]:
        if minute < self.day_start_minute or minute >= self.day_end_minute:
            return None
        offset = minute - self.day_start_minute
        return offset // self.base_slot_minutes

    def slot_index_to_minute(self, slot_index: int) -> int:
        return self.day_start_minute + slot_index * self.base_slot_minutes

    def block_bounds(self, slot_index: int, block_size_slots: int) -> Optional[tuple[int, int]]:
        if slot_index < 0 or slot_index >= len(self.slots):
            return None
        end_index = slot_index + block_size_slots - 1
        if end_index >= len(self.slots):
            return None
        return (
            self.slots[slot_index].start_minute,
            self.slots[end_index].end_minute,
        )

    def is_within_store_hours(self, start_minute: int, end_minute: int) -> bool:
        return start_minute >= self.open_minutes and end_minute <= self.close_minutes


def build_time_grid(solver_input: Dict[str, Any]) -> TimeGrid:
    store = solver_input.get("store", {})
    crew_records = solver_input.get("crew", [])
    base_slot_minutes = int(store.get("baseSlotMinutes", 30))
    open_minutes = int(store.get("openMinutesFromMidnight", 0))
    close_minutes = int(store.get("closeMinutesFromMidnight", 24 * 60))

    if crew_records:
        earliest_shift = min(int(crew.get("shiftStartMin", open_minutes)) for crew in crew_records)
        latest_shift = max(int(crew.get("shiftEndMin", close_minutes)) for crew in crew_records)
    else:
        earliest_shift = open_minutes
        latest_shift = close_minutes

    day_start_minute = min(open_minutes, earliest_shift)
    day_end_minute = max(close_minutes, latest_shift)
    if day_end_minute <= day_start_minute:
        day_end_minute = day_start_minute + base_slot_minutes

    slot_count = ceil((day_end_minute - day_start_minute) / base_slot_minutes)
    slots: List[SlotDescriptor] = []
    for index in range(slot_count):
        start = day_start_minute + index * base_slot_minutes
        end = start + base_slot_minutes
        slots.append(SlotDescriptor(index=index, start_minute=start, end_minute=end))

    crew_windows: Dict[str, CrewShiftWindow] = {}
    for crew in crew_records:
        start_minute = int(crew.get("shiftStartMin", day_start_minute))
        end_minute = int(crew.get("shiftEndMin", start_minute))
        if end_minute <= start_minute:
            continue
        slot_start = max(0, (start_minute - day_start_minute) // base_slot_minutes)
        slot_end = min(slot_count, ceil((end_minute - day_start_minute) / base_slot_minutes))
        if slot_end <= slot_start:
            continue
        crew_windows[crew["id"]] = CrewShiftWindow(
            crew_id=crew["id"],
            start_minute=start_minute,
            end_minute=end_minute,
            slot_start=slot_start,
            slot_end=slot_end,
        )

    return TimeGrid(
        base_slot_minutes=base_slot_minutes,
        open_minutes=open_minutes,
        close_minutes=close_minutes,
        day_start_minute=day_start_minute,
        day_end_minute=day_end_minute,
        slots=slots,
        crew_windows=crew_windows,
    )
