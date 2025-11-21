# Logbook Writer

[![API Tests](https://github.com/oliver-ostojic/logbook-writer/actions/workflows/api-tests.yml/badge.svg)](https://github.com/oliver-ostojic/logbook-writer/actions/workflows/api-tests.yml)

Logbook Writer turns crew shifts, preferences, and store rules into a published daily logbook. It enforces hard constraints (required role hours, break rules), optimizes soft goals (preferences, continuity, fairness), and version-controls schedules with exports and audit trails. The target solver runs in seconds for medium stores (≤100 crew) and produces explainable KPIs.

## What it does

- Ingests a “wizard” setup (crew with shifts, store defaults, role requirements, coverage windows)
- Segments each shift into PRODUCT edges and interior FLEX time using store register window defaults
- Prepares a complete engine input (requirements + coverage + segmented shifts)
- Produces a daily logbook (tasks) for each crew member with register/product/role/break allocations (engine integration WIP)

## Monorepo layout

- `apps/api` – Fastify + Prisma REST API (PostgreSQL)
- `apps/web` – Next.js app (UI, WIP)
- `packages/domain` – core domain logic (normalize, solve, validate)
- `packages/shared-types` – shared TypeScript types
- `infra` – docker-compose and DB migrations (when applicable)

## Tech stack

- Runtime: Node.js, TypeScript, Fastify
- Data: Prisma ORM, PostgreSQL
- Web: Next.js (app router)
- Tooling: pnpm, Turborepo, Vitest, ESLint

## Key features implemented

- UTC-safe date handling
	- Daily date fields stored as `@db.Date` (calendar date semantics) to avoid TZ drift
	- Utilities parse input as UTC midnights for stable comparisons
- Store register window defaults
	- `Store.regHoursStartMin`/`regHoursEndMin` as minutes since midnight with defaults 08:00 → 480, 21:00 → 1260
- Shift segmentation service
	- `segmentShiftByRegisterWindow` splits shifts into PRODUCT edges and FLEX interior
	- `GET /wizard/segments` exposes per-crew segments based on store defaults
- Coverage and requirements
	- `POST /wizard/requirements` upserts per-crew required role hours
	- `POST /wizard/coverage` upserts role coverage windows (e.g., DEMO) with per-hour demand inside the window
- Schedule pipeline
	- `POST /schedule/run` builds the engine input from normalized shifts + requirements + coverage
	- Returns `segmentedShifts` for debugging until the engine is integrated
- CRUD for roles and crew
	- `/roles` and `/crew` endpoints with comprehensive CRUD
	- Tests validate edge cases, duplicates, and relationship updates

## API surface (high level)

- Wizard
	- `POST /wizard/init` – normalize shifts and initial feasibility (returns `normalizedDate`)
	- `POST /wizard/requirements` – upsert `DailyRoleRequirement` (returns `normalizedDate`)
	- `POST /wizard/coverage` – upsert `DailyRoleCoverage` (returns `normalizedDate`)
	- `POST /wizard/segments` – compute PRODUCT/FLEX segments per crew (returns `normalizedDate`)

Note: Wizard endpoints coerce the provided date (string/number/Date) to a canonical ISO date via the domain normalizer and include it as `normalizedDate` in responses.
- Schedule
	- `POST /schedule/run` – prepare solver input (segmented shifts + requirements + coverage)
	- `GET /schedule/logbook` – fetch current logbook/tasks (engine output placeholder)
- Roles
	- `POST /roles`, `GET /roles`, `GET /roles?id=...`, `GET /roles/:name/crew`, `PUT /roles/:id`, `DELETE /roles/:id`
- Crew
	- `POST /crew`, `GET /crew`, `GET /crew?id=...`, `PUT /crew/:id`, `POST /crew/:id/add-role`, `DELETE /crew/:id`

### Tuning (preferences & weights)

- `GET /tuning/preferences` – derive recommended preference weights from current crew distribution.

Query params:
```
mode=rarity|popularity   # scaling strategy (default rarity)
storeId=NUMBER           # optional: restrict to one store
min=INT                  # minimum weight bound (default 0)
max=INT                  # maximum weight bound (default 100)
penaltyScale=INT         # scale for consecutive PRODUCT/REGISTER penalty suggestions (default 10)
```

Sample response (truncated):
```json
{
	"storeId": 768,
	"totalCrew": 89,
	"mode": "rarity",
	"bounds": { "min": 0, "max": 100 },
	"generatedAt": "2025-11-20T21:04:15.123Z",
	"dimensions": {
		"prefTask": {
			"counts": { "REGISTER": 50, "PRODUCT": 30, "NONE": 9 },
			"recommendations": { "REGISTER": 40, "PRODUCT": 60 }
		},
		"prefFirstHour": { "counts": { ... }, "recommendations": { ... } },
		"prefBreakTiming": {
			"counts": { "early": 25, "late": 40, "none": 24 },
			"recommendations": { "early": 75, "late": 50 }
		},
		"consecutive": {
			"suggestions": { "consecutiveProdWeight": 10, "consecutiveRegWeight": 5 },
			"reasoning": "Heuristic based on relative PRODUCT vs REGISTER proportions and selected mode."
		}
	}
}
```

Use these recommendation blocks to batch update crew preference weights or to feed scenario experiments before running the solver.

## Getting started

Prereqs
- pnpm 8+
- Node 18/20 LTS
- PostgreSQL and a `DATABASE_URL`

Install and generate
```bash
pnpm install --frozen-lockfile
```

API (apps/api)
```bash
cd apps/api
export DATABASE_URL="postgresql://user:pass@localhost:5432/logbook"
# For local dev, keep schema in sync and seed demo data
pnpm db:push
pnpm db:seed
# Run API
pnpm dev
```

Web (apps/web)
```bash
cd apps/web
pnpm dev
```

Run tests (API)
```bash
cd apps/api
pnpm test
# or a subset
pnpm test crud
```

## Progress snapshot (Nov 2025)

1) Date storage migration
	 - Switched daily date fields to `@db.Date`; added robust UTC parsing utilities
2) Store register window
	 - Added `regHoursStartMin/regHoursEndMin` with defaults 08:00–21:00; migrations applied
3) Coverage testing
	 - Comprehensive tests for `DailyRoleCoverage` (create/upsert/defaults/ISO/validation)
4) Segmentation implementation
	 - Service + unit tests splitting shifts into PRODUCT/FLEX and summarizing allocations
5) Wizard segments route
	 - `GET /wizard/segments` returns per-crew segments using store defaults
6) Schedule/run integration
	 - Builds full engine input and returns segmented shifts for debug
7) CRUD hardening
	 - Added full CRUD tests for roles and crew; stabilized crew IDs to 7 chars (schema: `@db.Char(7)`), added per-test cleanup; all tests passing

## Next up

- Crew preference system
	- Add fields to `CrewMember` for weights and values
	- UI drag-and-drop ranking with priority tiers (4, 2–3, 1)
	- Endpoints to save/retrieve preferences
	- Integrate into engine multi-objective cost function
- Engine integration
	- Replace stubbed segmentation debug with actual solver output
	- Produce `Task` assignments and persisted `Logbook`

## Gotchas / troubleshooting

- Crew IDs are exactly 7 characters (`@db.Char(7)`). Tests and seeds use IDs like `TCRW001`.
- Daily dates use `@db.Date` to avoid time zone drift; supply dates as `YYYY-MM-DD`.

## License

See `LICENSE`.
