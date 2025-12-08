"""Time grid utilities for SolverV2.

This module centralizes every conversion between minutes, slots, and hours so
constraint builders can reason about time without duplicating math.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Tuple

TOTAL_DAY_MINUTES = 24 * 60


def _sanitize_slot_minutes(value: int | None) -> int:
    minutes = int(value or 30)
    if minutes <= 0:
        raise ValueError("baseSlotMinutes must be positive")
    if 60 % minutes != 0:
        raise ValueError("baseSlotMinutes must divide 60 so hourly grids align")
    return minutes


@dataclass(frozen=True)
class TimeGrid:
    """Discrete representation of a store day.

    The grid assumes a constant slot size (store.baseSlotMinutes). Helpers expose
    conversions that other modules can reuse without worrying about rounding
    inconsistencies.
    """

    slot_minutes: int
    open_minutes: int
    close_minutes: int

    @classmethod
    def from_store(cls, *, base_slot_minutes: int | None, open_minutes: int, close_minutes: int) -> "TimeGrid":
        slot_minutes = _sanitize_slot_minutes(base_slot_minutes)
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
        return max(0, minutes // self.slot_minutes)

    def minutes_to_slot_ceil(self, minutes: int) -> int:
        minute_value = max(0, minutes)
        quotient, remainder = divmod(minute_value, self.slot_minutes)
        return quotient + (1 if remainder else 0)

    def slot_to_minutes(self, slot: int) -> Tuple[int, int]:
        start = slot * self.slot_minutes
        end = start + self.slot_minutes
        return start, end

    def slot_to_hour(self, slot: int) -> int:
        return slot // self.slots_per_hour

    def clamp_slots_to_store(self, slots: Iterable[int]) -> list[int]:
        open_slot = self.minutes_to_slot_floor(self.open_minutes)
        close_slot = self.minutes_to_slot_floor(self.close_minutes)
        return [slot for slot in slots if open_slot <= slot < close_slot]

    def shift_slot_window(self, start_min: int, end_min: int) -> Tuple[int, int]:
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
        """Return inclusive slot bounds for a role limited by shift offsets.

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


__all__ = ["TimeGrid"]
