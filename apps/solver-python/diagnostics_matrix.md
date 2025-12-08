# Solver Constraint Diagnostics Matrix

| Constraint helper | What it enforces | Current diagnostic coverage | Needed improvements |
| --- | --- | --- | --- |
| `_one_task_per_slot` | Each crew can perform at most one role per slot | None (implicit via model) | Add sanity check to ensure crews with overlapping requirements still have at least one eligible role per slot (optional) |
| `_store_hours` | Blocks roles outside store open/close minutes unless explicitly allowed | None | Detect when requirements/coverage demand roles during slots no crew can legally work (store closed) |
| `_hourly_staffing_requirements` | Balanced hourly requirements for REGISTER/PRODUCT/PARKING_HELM using role blockSize | Partial (Check 1) | Update diagnostics to mirror new block-balanced math and respect role blockSize + parking-first-hour constraints |
| `_parking_first_hour` | Parking roles forbidden during crew's first working hour | None | Warn when hourly/coverage needs exceed available crew once first-hour blockouts applied |
| `_crew_role_requirements` | Crew-specific daily hours for DAILY roles | Covered (Check 2) | Ensure integer slot math reflects new slot length; include blockSize feasibility |
| `_coverage_windows` | Balanced per-block coverage for HOURLY_WINDOW roles | Partial (Check 3) | Mirror block distribution logic and min/max slot availability |
| `_role_min_max` | Per-crew per-role min/max slots (incl. register overrides) | None | Add diagnostics when required minSlots exceed available windows or when maxSlots < required demand |
| `_meal_breaks` | Ensures eligible crew take exactly one break within store policy window | Partial (Check 4) | Expand to surface insufficient break windows (shift length or store window mismatches) |
| `_block_size_snap` | Roles with blockSize must be scheduled in multiples of N consecutive slots | None | Check that shift lengths and eligibility provide enough full blocks to meet requirements |
| `_consecutive_slots` | Roles marked consecutive REQUIRED must be contiguous | None | Inspect available slot runs per crew+role and report when multiple disjoint segments exist |

This matrix guides the expanded diagnostics work: add heuristics/calculations for the "Needed improvements" column so infeasible solver runs always emit actionable violation messages.
