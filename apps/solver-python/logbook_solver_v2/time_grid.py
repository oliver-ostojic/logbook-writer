"""Time grid utilities for SolverV2.

This module centralizes time discretization. We use 30-minute slots as the base
grid resolution, derived from the GCD of typical task lengths (30, 60 min).

All external interfaces work in minutes; slots are an internal implementation detail.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import gcd
from functools import reduce
from typing import Iterable, List, Tuple

TOTAL_DAY_MINUTES = 24 * 60
DEFAULT_SLOT_MINUTES = 30  # 30-min boundaries


def compute_grid_resolution(task_lengths: List[int]) -> int:
    """Compute optimal grid resolution as GCD of all task lengths.
    
    Falls back to DEFAULT_SLOT_MINUTES if no task lengths provided or GCD is too small.
    """
    if not task_lengths:
        return DEFAULT_SLOT_MINUTES
    
    # Filter out invalid values
    valid_lengths = [t for t in task_lengths if t and t > 0]
    if not valid_lengths:
        return DEFAULT_SLOT_MINUTES
    
    resolution = reduce(gcd, valid_lengths)
    
    # Ensure resolution divides 60 (for hour alignment) and is reasonable
    if resolution < 15 or 60 % resolution != 0:
        return DEFAULT_SLOT_MINUTES
    
    return resolution


@dataclass(frozen=True)
class TimeGrid:
    """Discrete representation of a store day.

    The grid uses a fixed slot size (default 30 min). Slots are an internal
    discretization; all public methods work with minutes.
    """

    slot_minutes: int
    open_minutes: int
    close_minutes: int

    @classmethod
    def from_store(cls, *, open_minutes: int, close_minutes: int, task_lengths: List[int] | None = None) -> "TimeGrid":
        """Create a TimeGrid from store hours and optional task lengths.
        
        Args:
            open_minutes: Store open time in minutes from midnight
            close_minutes: Store close time in minutes from midnight  
            task_lengths: List of role task lengths to compute optimal grid resolution
        """
        slot_minutes = compute_grid_resolution(task_lengths or [])
        open_minutes = max(0, int(open_minutes or 0))
        close_minutes = min(TOTAL_DAY_MINUTES, int(close_minutes or TOTAL_DAY_MINUTES))
        if close_minutes <= open_minutes:
            raise ValueError("Store closeMinutes must be after openMinutes")
        return cls(slot_minutes=slot_minutes, open_minutes=open_minutes, close_minutes=close_minutes)

    @property
    def num_slots(self) -> int:
        return TOTAL_DAY_MINUTES // self.slot_minutes

    @property
    def slots(self) -> range:
        return range(self.num_slots)

    @property
    def slots_per_hour(self) -> int:
        return 60 // self.slot_minutes

    def minutes_to_slot_floor(self, minutes: int) -> int:
        """Convert minutes to slot index, rounding down."""
        return max(0, minutes // self.slot_minutes)

    def minutes_to_slot_ceil(self, minutes: int) -> int:
        """Convert minutes to slot index, rounding up."""
        minute_value = max(0, minutes)
        quotient, remainder = divmod(minute_value, self.slot_minutes)
        return quotient + (1 if remainder else 0)

    def slot_to_minutes(self, slot: int) -> Tuple[int, int]:
        """Convert slot index to (start_min, end_min) tuple."""
        start = slot * self.slot_minutes
        end = start + self.slot_minutes
        return start, end

    def slot_to_hour(self, slot: int) -> int:
        """Convert slot index to hour of day."""
        return slot // self.slots_per_hour

    def task_length_to_slots(self, task_length: int) -> int:
        """Convert a task length in minutes to number of slots it occupies."""
        return max(1, task_length // self.slot_minutes)

    def slots_in_window(self, start_min: int, end_min: int) -> List[int]:
        """Return list of slot indices that fall within the given minute window."""
        start_slot = self.minutes_to_slot_floor(start_min)
        end_slot = self.minutes_to_slot_ceil(end_min)
        return list(range(start_slot, end_slot))

    def clamp_slots_to_store(self, slots: Iterable[int]) -> list[int]:
        """Filter slots to only those within store hours."""
        open_slot = self.minutes_to_slot_floor(self.open_minutes)
        close_slot = self.minutes_to_slot_floor(self.close_minutes)
        return [slot for slot in slots if open_slot <= slot < close_slot]

    def shift_slot_window(self, start_min: int, end_min: int) -> Tuple[int, int]:
        """Convert a minute window to (start_slot, end_slot) tuple."""
        start_slot = self.minutes_to_slot_floor(start_min)
        end_slot = self.minutes_to_slot_floor(end_min)
        return (max(0, start_slot), min(self.num_slots, max(start_slot, end_slot)))

    def shift_with_offsets(
        self,
        *,
        shift_start: int,
        shift_end: int,
        offset_start_min: int | None,
        offset_end_min: int | None,
    ) -> Tuple[int, int]:
        """Return slot bounds for a role limited by shift offsets.

        Offsets are measured from the crew's shift start in minutes. When offsets
        are absent the function returns the full shift window.
        """
        start = shift_start
        end = shift_end
        if offset_start_min is not None:
            start = min(shift_end, shift_start + offset_start_min)
        if offset_end_min is not None:
            end = max(shift_start, shift_start + offset_end_min)
        start_slot = self.minutes_to_slot_floor(start)
        end_slot = self.minutes_to_slot_floor(end)
        return (start_slot, max(start_slot + 1, end_slot))


__all__ = ["TimeGrid", "compute_grid_resolution"]
