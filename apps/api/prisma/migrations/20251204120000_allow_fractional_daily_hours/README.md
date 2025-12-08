# Allow fractional daily required hours

This migration changes `DailyRoleConstraint.requiredHours` from an `INT` to `DOUBLE PRECISION` so we can store constraints like 3.5 hours. Existing integer values are preserved by casting the column in-place.
