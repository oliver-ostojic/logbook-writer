-- Allow fractional requiredHours for daily role constraints
ALTER TABLE "DailyRoleConstraint"
ALTER COLUMN "requiredHours"
TYPE DOUBLE PRECISION
USING "requiredHours"::double precision;
