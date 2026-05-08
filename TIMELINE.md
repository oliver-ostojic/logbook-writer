# Logbook Writer — Development Timeline

Logbook Writer is a crew scheduling system that produces optimized daily schedules for retail stores. A Next.js wizard UI collects shift, role, and coverage data; a Fastify API with Prisma handles persistence; and a Python CP-SAT solver (OR-Tools) generates assignments. The project lives in a Turborepo monorepo and went through three distinct generalization arcs before reaching its current form.

---

## Phase 1 — One Store, Hardcoded Domain
**November 6–13, 2025**

The project started as a scheduler for a single Trader Joe's. The schema reflected that exactly: a `TaskType` enum with TJ-specific role names (`REGISTER`, `PRODUCT`, `PARKING_HELM`, `ORDER_WRITER`, `ART`, `TRUCK`, `DEMO`), a `Store` model with fields like `minRegisterHours` and `StoreHourRule` rows storing `requiredRegisters`/`minParking` per hour, and a `CrewMember` with a single `roleId` — no store relation, because there was only one store.

The solver matched: a single monolithic `solver.py` with `LogbookSolver`, 30-minute slots hardcoded, and role names like `PARKING_HELM` and `MEAL_BREAK` baked directly into the constraint logic as Python string literals.

- Set up Turborepo monorepo with Fastify API, Next.js web app, and shared-types package
- Defined Prisma schema for crew, roles, logbooks, tasks, and store hour rules
- Shipped `LogbookSolver` as a single class — decision variables `x[(crew_id, slot, role_string)]`, constraints and objective all in one file

---

## Phase 2 — Any Trader Joe's Store
**November 15–16, 2025**

The first generalization: crew was linked to a store (`storeId` added to `CrewMember`), `Store.name` became a field, and `CrewMemberRole` replaced the single `roleId` — crew could now hold multiple roles. `WINE_DEMO` was added to `TaskType` as a second demo variant. The schema could now represent any TJ location, not just one.

The solver gained store-awareness: `baseSlotMinutes`, `openMinutesFromMidnight`, and `closeMinutesFromMidnight` were read from the store record instead of hardcoded. The monolithic class was split into a `logbook_solver/` package — `core.py`, `constraints.py`, `objective.py`, `diagnostics.py` — so constraint logic could be developed and tested independently.

- CI pipeline added with GitHub Actions running Postgres-backed integration tests (46 passing)
- Coverage wizard built: multi-step flow for defining shift segments, coverage windows, and crew requirements
- API refactored into modular route/service structure with full CRUD for crew, roles, and stores

---

## Phase 3 — Any Store, Metadata-Driven Solver
**November 18 – December 2025**

The second and deeper generalization: roles stopped being an enum and became database records. `Role` gained `assignmentModel`, `taskLength`, `isCoverageRole`, `isBreakRole`, `isParkingRole`, `isConsecutive`, and min/max minute constraints. `Store` gained `timezone`, generic break window offsets, and `baseSlotMinutes`. `StoreHourRule`'s TJ-specific fields were replaced by a generic `CoverageWindow` model with `MIN/MAX/EXACTLY` constraint rules.

The solver was rewritten as `logbook_solver_v2/` — a fully metadata-driven `SolverV2` that consumes a `SolverInputV2` payload. Roles are now integer DB IDs, not string codes. A `TimeGrid` is computed dynamically from task lengths. Decision variables became `(crew_id, slot, role_id, task_slots)` to support variable-length task blocks. The TypeScript side grew a `solver2/` directory with separate constraint appliers for block-size, consecutive-policy, and coverage rules — each wired directly to DB-driven `roleRules`.

The PDF generator (`pdf-generator.ts`) was also built in this phase using PDFKit with Open Sans fonts, rendering a Gantt-style grid: crew on the Y-axis sorted by earliest start time, 30-minute slots on the X-axis across store hours. Same-role slots are merged within each hour into single labeled cells; multi-page output automatically redraws the header.

The auto-tune script (`auto-tune-preference-weights.ts`) was introduced alongside the preference pipeline: five weighting strategies (`balanced`, `minority`, `majority`, `gradient`, `hybrid`) run against real solve history and are scored as `metRate × 40 + avgSatisfaction × 30 + typeCoverage × 30`, with results appended to `tuning-history.json`.

- Preference pipeline built end-to-end: `BREAK`/`MEAL_BREAK` normalization, `FIRST_HOUR` role scoring, `TIMING` preferences on assigned breaks
- Satisfaction tuning system: solver weights adjusted from historical outcomes; crew ID migrated to 7-character strings
- `HOURLY_AND_SOLVER` hybrid assignment mode added; ML-style training data collection for schedule learning
- Tiered soft-boost added for fair role rotation; solver diagnosis mode for debugging infeasible runs

---

## Phase 4 — Fairness Engine & Dashboard v1
**January 2026 (early)**

After each logbook is saved, `logbook-manager.ts` fetches `CrewRoleRule` records for every crew member who worked that day, evaluates each rule as binary met/not-met via `calculateCrewRuleSatisfaction()`, aggregates to `eligiblePreferences`, `preferencesMet`, `avgSatisfaction`, and `fairnessIndex`, and writes a `LogPreferenceMetadata` row. It also computes a SHA-256 input hash over shifts + coverage windows + crew quotas (truncated to 16 hex chars) so re-runs can detect whether the underlying data actually changed. DRAFT logbooks are reused in-place on re-solve; PUBLISHED logbooks always produce a new record.

`role-fairness.service.ts` then records `CrewRoleFairnessHistory` (minutes assigned per crew per role per day) and computes a `RoleFairnessSnapshot` using a Gini coefficient — the pairwise-difference formula `Σ|xi − xj| / (2n · total)` — normalized by **days worked** rather than raw minutes so part-time crew aren't unfairly penalized. The Gini maps to a 0–100 `fairnessIndex` and a letter grade (A+ to F). Tracked roles use the history table; untracked roles query assignment records from logbooks directly so every role always has fairness data.

The preference weight pipeline carries: a `baseWeight`, a per-crew `crewWeight` override, an `adaptiveBoost` for historically under-served crew, and a `bankedWeightBoost` for unmet preferences carried forward up to 30 days. Scaling is configurable via env vars (linear ×100, exponential `base^w`, or logarithmic) with per-type multipliers: first-hour ×1.5, break-timing ×1.2, task ×1.0.

- Shipped fairness dashboard v1: role heatmaps, box plots, and sparklines wired to live logbook data with cross-page state persistence
- Introduced the "AI glass" design system — frosted-glass cards, gradient borders, pill-style components — applied across all list views and the constraints wizard
- Added home page with mini stat cards and activity log; full CRUD for crew, roles, logbooks, and role families; version history panel for logbook runs

---

## Phase 5 — Auth, Navigation & Settings
**January 2026 (mid–late)**

- Implemented authentication, RBAC, and a settings UI with invite codes for multi-user access
- Standardized navigation: unified `TopNavHeader`, account dropdown, secondary nav pill selectors, and consistent pagination across all pages
- Embedded contextual headers into the logbook creation wizard steps; version history panel restyled with title bubbles
- Publish wizard (step 4) shipped as a confirmation page — fetches the logbook's `storedFilePath`, then on "Download PDF" calls `/schedule/logbook/{id}/pdf`, receives the response as a `Blob`, creates an object URL, and triggers a programmatic `<a>` click for the browser download

---

## Phase 6 — Fairness Dashboard Overhaul
**February 2026**

The chart layer was rebuilt from scratch. **Box plot** (`BoxPlotGraph.tsx`): rendered in SVG (viewBox 1000×160), horizontal layout with whisker lines, an IQR rectangle (Q1–Q3), and three marker pills — median tallest at 108px, min/max at 60px, all 10px wide. Every element has a transparent 5px-padded hover zone; hover turns markers and the box red (#ef4444). When stats share a value (e.g. min == median), the tooltip merges them: "Min & Median". Grid lines use a seeded `Math.sin(seed) × 10000` PRNG so gradients are visually random but deterministic across re-renders.

**Stacked pill bar** (`StackedPillBarGraph.tsx`): each bar is two nested pills — a full-height grey "total" pill and an inset (8px) red "satisfied" pill.

**Heatmap** (`RoleHeatmap.tsx`): weeks × days grid (Sun–Sat). Cell color is theme red at opacity 0.2–0.85 scaled by `(hours − minHours) / hoursRange` — relative to the actual data range, not zero-anchored — so even a narrow spread shows contrast. Hovering a cell dims all others to 0.4 opacity.

- Added split-panel layout with condensed crew/role list cards, dynamic nav button for drilling into individual views, and paginated embedded headers
- Polished edge cases: crew with no preferences excluded, minimum bar heights enforced, NaN label guards added

---

## Phase 7 — Constraint Analyzer, Solver Correctness & Portfolio Polish
**April 2026**

The constraint analyzer (`constraint-analyzer.ts`) runs 9 independent check functions over a `SolverInputV2` + assignments pair. Coverage windows are validated by scanning task-length slots and **merging contiguous violated slots into ranges** — so you get one "DEMO: insufficient crew 10AM–2PM" instead of 30 individual slot violations. An assignment-model governance check verifies that `HOURLY`/`WINDOW` roles have a `RoleCoverageWindow` and `DAILY` roles have a `CrewRoleQuota` for that date; `SOLVER` and `HOURLY_AND_SOLVER` assignments are exempt.

The interactive flyover tutorial (`TutorialProvider`) runs as a React portal at the root layout level, state managed in Zustand. Each step declares a `data-tutorial-id` target, a route, a bubble (title + body + position), a scroll mode, and an advance trigger (Next button, click on target, or custom window event). `TutorialProvider` uses `requestAnimationFrame` polling to find the target after navigation, measures its bounding rect clamped to scroll container boundaries, then re-measures after a 150ms stabilize timeout to account for CSS transitions. The overlay renders a spotlight cutout around the target with the rest of the screen dimmed.

The stacked pill bar chart gained horizontal scrollability when there are ≥ 13 preference types — the SVG viewBox expands proportionally and a frosted-glass Y-axis bar stays pinned to the right edge as the chart scrolls. The stat bubble is positioned as a sibling of the scroll container so it escapes `overflow-x: auto` clipping.

The fairness system gained an intra-day block-spread penalty and a lookback filter so crew who worked fewer days don't unfairly skew role fairness scores.

The test-generator admin tool for seeding multi-day demo data has a per-day state machine — `pending → solving → publishing → success | failed` — and shows each day's `pctPrefsMet` and `violationCount` in a progress strip grid.

- Fixed solver correctness: `WINDOW` roles restricted to coverage bands, gap penalties for `PREFERRED` consecutive policy, accurate `DISTRIBUTION_BETWEEN_ROLE_X` and `TIMING` satisfaction; added `MAX_TOTAL_MINUTES` rule type
- Reconciled three divergent Gini values across the fairness dashboard
- Generated 60+ demo PDFs for portfolio preview using the existing PDF generator
