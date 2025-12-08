'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import RadioGroup from './WindowRoleRadioGroup';
import DailyAssignmentGrid from './DailyAssignmentGrid';
import HourlyRoleRow from './HourlyRoleRows';
import ErrorMessageBox from './ErrorMessageBox';

type RoleWithCrew = {
  roleId: number;
  roleCode: string;
  roleName: string;
  crewCount: number;
  assignmentModel: string[];
};

type HourlyRoleMeta = {
  roleId: number;
  roleCode: string;
  roleName: string;
  assignmentModel: string[];
  allowOutsideStoreHours: boolean;
  crewCount: number;
};

type DailyRole = {
  roleId: number;
  roleCode: string;
  roleName: string;
  crew: Array<{ crewId: string; crewName: string; specialization?: string | null }>;
};

type HourlyAvailability = {
  hour: number;
  label: string;
  crewAvailable: number;
  inStock: boolean;
};

type WindowConstraintDraft = {
  roleId: number;
  startHour: number;
  endHour: number;
  requiredPerHour: number;
};

type DailyConstraintDraft = {
  roleId: number;
  crewId: string;
  requiredHours: number;
};

type HourlyConstraintDraft = {
  roleId: number;
  hour: number;
  requiredPerHour: number;
};

type StoreShift = {
  crewId: string;
  start: string;
  end: string;
};

type WindowConstraintPrefill = Record<number, { time: string; duration: string; crewPerHour: number }>;
type DailyConstraintPrefill = Record<string, number>;
type HourlyConstraintPrefill = Record<number, Record<number, number>>;

type StoreHours = {
  id: number;
  name: string;
  timezone: string;
  openMinutesFromMidnight: number;
  closeMinutesFromMidnight: number;
  baseSlotMinutes: number;
};

interface BentoGridProps {
  onError?: (errors: string[]) => void;
  errors?: string[];
}

export default function BentoGrid({ onError, errors = [] }: BentoGridProps) {
  const params = useParams();
  const searchParams = useSearchParams();
  const storeId = params.storeId as string;
  const date = searchParams.get('date');
  const router = useRouter();

  const [rolesWithCrew, setRolesWithCrew] = useState<RoleWithCrew[]>([]);
  const [hourlyRoles, setHourlyRoles] = useState<HourlyRoleMeta[]>([]);
  const [storeHours, setStoreHours] = useState<StoreHours | null>(null);
  const [dailyRoles, setDailyRoles] = useState<DailyRole[]>([]);
  const [hourlyAvailability, setHourlyAvailability] = useState<HourlyAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectAllDaily, setSelectAllDaily] = useState(false);
  const [windowConstraintDrafts, setWindowConstraintDrafts] = useState<Record<number, WindowConstraintDraft>>({});
  const [dailyConstraintDrafts, setDailyConstraintDrafts] = useState<Record<string, DailyConstraintDraft>>({});
  const [hourlyConstraintDrafts, setHourlyConstraintDrafts] = useState<Record<string, HourlyConstraintDraft>>({});
  const [initialWindowPrefill, setInitialWindowPrefill] = useState<WindowConstraintPrefill | null>(null);
  const [initialDailyPrefill, setInitialDailyPrefill] = useState<DailyConstraintPrefill | null>(null);
  const [initialHourlyPrefill, setInitialHourlyPrefill] = useState<HourlyConstraintPrefill | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Helper to set errors both locally and propagate to parent
  const setErrors = useCallback((errors: string[]) => {
    setSaveError(errors.length > 0 ? errors[0] : null);
    onError?.(errors);
  }, [onError]);
  
  // Track which roles are configured in which step (for mutual exclusion)
  const [step1ConfiguredRoles, setStep1ConfiguredRoles] = useState<Set<number>>(new Set());
  const [step3ConfiguredRoles, setStep3ConfiguredRoles] = useState<Set<number>>(new Set());

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const dailyConstraintItems = useMemo(() => (
    dailyRoles.flatMap(role =>
      role.crew.map((c) => ({
        id: `${role.roleId}-${c.crewId}`,
        roleId: role.roleId,
        crewId: c.crewId,
        roleTitle: role.roleName,
        crewName: c.crewName,
        specialization: c.specialization ?? undefined,
      }))
    )
  ), [dailyRoles]);

  // Fetch dynamic crew-with-shifts data
  useEffect(() => {
    if (!storeId || !date) {
      setRolesWithCrew([]);
      setHourlyRoles([]);
      setDailyRoles([]);
      setHourlyAvailability([]);
      setWindowConstraintDrafts({});
      setDailyConstraintDrafts({});
      setHourlyConstraintDrafts({});
      setInitialWindowPrefill(null);
      setInitialDailyPrefill(null);
      setInitialHourlyPrefill(null);
      setStoreHours(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrors([]);
    setInitialWindowPrefill(null);
    setInitialDailyPrefill(null);
    setInitialHourlyPrefill(null);
    setStoreHours(null);

    async function fetchData() {
      try {
        const [windowRolesRes, dailyRes, availabilityRes, constraintsRes, hourlyRolesRes, storeHoursRes] = await Promise.all([
          fetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/crew-with-shifts?date=${encodeURIComponent(date!)}`),
          fetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/daily-roles?date=${encodeURIComponent(date!)}`),
          fetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/crew-per-hour?date=${encodeURIComponent(date!)}`),
          fetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/constraints?date=${encodeURIComponent(date!)}`),
          fetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/hourly-roles`),
          fetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/hours`),
        ]);

        if (windowRolesRes.ok) {
          setRolesWithCrew(await windowRolesRes.json());
        } else {
          console.error('Failed to fetch crew-with-shifts:', await windowRolesRes.text());
          setRolesWithCrew([]);
        }

        if (hourlyRolesRes.ok) {
          setHourlyRoles(await hourlyRolesRes.json());
        } else {
          console.error('Failed to fetch hourly roles:', await hourlyRolesRes.text());
          setHourlyRoles([]);
        }

        if (storeHoursRes.ok) {
          setStoreHours(await storeHoursRes.json());
        } else {
          console.error('Failed to fetch store hours:', await storeHoursRes.text());
          setStoreHours(null);
        }

        if (dailyRes.ok) {
          setDailyRoles(await dailyRes.json());
        } else {
          console.error('Failed to fetch daily-roles:', await dailyRes.text());
          setDailyRoles([]);
        }

        if (availabilityRes.ok) {
          setHourlyAvailability(await availabilityRes.json());
        } else {
          console.error('Failed to fetch crew-per-hour:', await availabilityRes.text());
          setHourlyAvailability([]);
        }

        if (constraintsRes.ok) {
          const constraintData = await constraintsRes.json();
          const windowDrafts: Record<number, WindowConstraintDraft> = {};
          const windowPrefill: WindowConstraintPrefill = {};
          const dailyDrafts: Record<string, DailyConstraintDraft> = {};
          const dailyPrefill: DailyConstraintPrefill = {};
          const hourlyDrafts: Record<string, HourlyConstraintDraft> = {};
          const hourlyPrefill: HourlyConstraintPrefill = {};

          (constraintData?.windowConstraints ?? []).forEach((entry: any) => {
            if (typeof entry?.roleId !== 'number') return;
            windowDrafts[entry.roleId] = {
              roleId: entry.roleId,
              startHour: entry.startHour,
              endHour: entry.endHour,
              requiredPerHour: entry.requiredPerHour ?? 0,
            };
            windowPrefill[entry.roleId] = {
              time: `${String(entry.startHour).padStart(2, '0')}:00`,
              duration: String(Math.max(1, entry.endHour - entry.startHour) * 60),
              crewPerHour: entry.requiredPerHour ?? 0,
            };
          });

          (constraintData?.dailyRoleConstraints ?? []).forEach((entry: any) => {
            if (typeof entry?.roleId !== 'number' || typeof entry?.crewId !== 'string') return;
            const key = `${entry.roleId}-${entry.crewId}`;
            dailyDrafts[key] = {
              roleId: entry.roleId,
              crewId: entry.crewId,
              requiredHours: entry.requiredHours ?? 1,
            };
            dailyPrefill[key] = entry.requiredHours ?? 1;
          });

          (constraintData?.hourlyRoleConstraints ?? []).forEach((entry: any) => {
            if (typeof entry?.roleId !== 'number' || typeof entry?.hour !== 'number') return;
            const key = `${entry.roleId}-${entry.hour}`;
            hourlyDrafts[key] = {
              roleId: entry.roleId,
              hour: entry.hour,
              requiredPerHour: entry.requiredPerHour ?? 0,
            };
            if (!hourlyPrefill[entry.roleId]) {
              hourlyPrefill[entry.roleId] = {};
            }
            hourlyPrefill[entry.roleId][entry.hour] = entry.requiredPerHour ?? 0;
          });

          setWindowConstraintDrafts(windowDrafts);
          setDailyConstraintDrafts(dailyDrafts);
          setHourlyConstraintDrafts(hourlyDrafts);
          setInitialWindowPrefill(windowPrefill);
          setInitialDailyPrefill(dailyPrefill);
          setInitialHourlyPrefill(hourlyPrefill);
        } else {
          console.error('Failed to fetch constraint data:', await constraintsRes.text());
          setWindowConstraintDrafts({});
          setDailyConstraintDrafts({});
          setHourlyConstraintDrafts({});
          setInitialWindowPrefill({});
          setInitialDailyPrefill({});
          setInitialHourlyPrefill({});
        }
      } catch (error) {
  console.error('Error fetching roles or constraints:', error);
  setRolesWithCrew([]);
  setHourlyRoles([]);
        setDailyRoles([]);
        setHourlyAvailability([]);
        setWindowConstraintDrafts({});
        setDailyConstraintDrafts({});
        setHourlyConstraintDrafts({});
        setInitialWindowPrefill({});
        setInitialDailyPrefill({});
        setInitialHourlyPrefill({});
        setStoreHours(null);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [storeId, date, API_URL]);

  const handleStep1RoleConfigured = useCallback((roleId: number, isConfigured: boolean) => {
    setStep1ConfiguredRoles(prev => {
      const next = new Set(prev);
      if (isConfigured) {
        next.add(roleId);
      } else {
        next.delete(roleId);
      }
      return next;
    });
  }, []);

  const handleStep3RoleConfigured = useCallback((roleId: number, isConfigured: boolean) => {
    setStep3ConfiguredRoles(prev => {
      const next = new Set(prev);
      if (isConfigured) {
        next.add(roleId);
      } else {
        next.delete(roleId);
      }
      return next;
    });
  }, []);

  const handleWindowConstraintChange = useCallback((roleId: number, constraint?: WindowConstraintDraft) => {
    setWindowConstraintDrafts(prev => {
      const current = prev[roleId];
      if (!constraint) {
        if (current === undefined) {
          return prev;
        }
        const next = { ...prev };
        delete next[roleId];
        return next;
      }

      const isSame =
        current &&
        current.startHour === constraint.startHour &&
        current.endHour === constraint.endHour &&
        current.requiredPerHour === constraint.requiredPerHour;

      if (isSame) {
        return prev;
      }

      return { ...prev, [roleId]: constraint };
    });
  }, []);

  const handleDailyAssignmentsChange = useCallback((assignments: Array<{ id: string; roleId: number; crewId: string; requiredHours: number }>) => {
    setDailyConstraintDrafts(() => {
      const next: Record<string, DailyConstraintDraft> = {};
      assignments.forEach((assignment) => {
        next[`${assignment.roleId}-${assignment.crewId}`] = {
          roleId: assignment.roleId,
          crewId: assignment.crewId,
          requiredHours: assignment.requiredHours,
        };
      });
      return next;
    });
  }, []);

  const handleHourlyConstraintsChange = useCallback((entries: Array<{ roleId: number; hour: number; requiredPerHour: number }>) => {
    setHourlyConstraintDrafts(() => {
      const next: Record<string, HourlyConstraintDraft> = {};
      entries.forEach((entry) => {
        next[`${entry.roleId}-${entry.hour}`] = entry;
      });
      return next;
    });
  }, []);

  const handleFinish = useCallback(async () => {
    if (saving) {
      return;
    }

    if (!storeId || !date) {
      setErrors(['Select a date before saving constraints.']);
      return;
    }

    const windowConstraints = Object.values(windowConstraintDrafts);
    const dailyRoleConstraints = Object.values(dailyConstraintDrafts).map((entry) => {
      const rounded = Math.round(Number(entry.requiredHours) * 2) / 2;
      return {
        roleId: entry.roleId,
        crewId: entry.crewId,
        requiredHours: Math.max(0.5, rounded),
      };
    });
    const hourlyRoleConstraints = Object.values(hourlyConstraintDrafts);

    setSaving(true);
    setErrors([]);

    try {
      const response = await fetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/constraints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          windowConstraints,
          dailyRoleConstraints,
          hourlyRoleConstraints,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to save constraints');
      }

      let logbookId: string | undefined;
      
      // Check if a logbook already exists for this store/date
      const logbookResponse = await fetch(
        `${API_URL}/schedule/logbook?store_id=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}`
      );

      if (logbookResponse.ok) {
        // Logbook exists - delete it so we can regenerate with updated constraints
        const existingLogbook = await logbookResponse.json();
        const deleteResponse = await fetch(
          `${API_URL}/schedule/logbook/${encodeURIComponent(existingLogbook.id)}`,
          { method: 'DELETE' }
        );
        if (!deleteResponse.ok && deleteResponse.status !== 404) {
          console.warn('Failed to delete existing logbook, will try to create new one anyway');
        }
      } else if (logbookResponse.status !== 404) {
        // Unexpected error from logbook check
        const errorText = await logbookResponse.text();
        throw new Error(errorText || 'Failed to verify logbook status.');
      }

      // Create a new logbook via solver with updated constraints
      const numericStoreId = Number(storeId);
      if (!Number.isFinite(numericStoreId)) {
        throw new Error('Invalid store identifier.');
      }

      const shiftsResponse = await fetch(
        `${API_URL}/stores/${encodeURIComponent(storeId)}/shifts?date=${encodeURIComponent(date)}`
      );

      if (!shiftsResponse.ok) {
        const message = await shiftsResponse.text();
        throw new Error(message || 'Unable to load shifts for this date.');
      }

      const shiftsData: StoreShift[] = await shiftsResponse.json();
      if (!Array.isArray(shiftsData) || shiftsData.length === 0) {
        throw new Error('Add at least one shift for this date before generating a logbook.');
      }

      const solverResponse = await fetch(`${API_URL}/solve-logbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          store_id: numericStoreId,
          shifts: shiftsData.map((shift) => ({
            crewId: shift.crewId,
            start: shift.start,
            end: shift.end,
          })),
          time_limit_seconds: 120,
        }),
      });

      const solverPayload = await solverResponse.json().catch(() => ({}));

      if (!solverResponse.ok || !solverPayload.ok) {
        const message =
          (typeof solverPayload?.error === 'string' && solverPayload.error) ||
          'Solver failed to generate a logbook.';
        setErrors([message]);
        setSaving(false);
        return;
      }

      if (!solverPayload.solver?.success) {
        // Get all feasibility violations from metadata, or fall back to single error message
        const violations: string[] = solverPayload.solver?.metadata?.feasibilityViolations;
        if (Array.isArray(violations) && violations.length > 0) {
          setErrors(violations);
        } else {
          const message = solverPayload.solver?.error ?? 'Solver returned without success.';
          setErrors([message]);
        }
        setSaving(false);
        return;
      }
      
      // Get the logbook ID from the solver response
      logbookId = solverPayload.logbookId;

      // Navigate with logbookId - required for preview page
      if (!logbookId) {
        setErrors(['No logbook ID returned']);
        setSaving(false);
        return;
      }
      router.push(`/stores/${storeId}/logbook/create/preview?logbookId=${encodeURIComponent(logbookId)}`);
    } catch (error) {
      console.error('Failed to finish logbook setup', error);
      setErrors([error instanceof Error ? error.message : 'Failed to finish logbook setup']);
    } finally {
      setSaving(false);
    }
  }, [saving, storeId, date, windowConstraintDrafts, dailyConstraintDrafts, hourlyConstraintDrafts, API_URL, router, setErrors]);

  return (
    <div className="bg-gray-50 pt-10 pb-12 sm:pt-16 sm:pb-16">
      <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
        <p className="text-xl font-medium tracking-tight pb-2 text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]" style={{ fontFamily: 'var(--font-heading)' }}>
          Define role constraints
        </p>
        <p className="text-4xl font-semibold tracking-tight text-pretty text-gray-900 sm:text-5xl" style={{ fontFamily: 'var(--font-heading)' }}>
            Decide how each role should be staffed—set hourly targets, total daily hours, and any windows that must stay covered        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16">
          {/* Error message box */}
          {errors.length > 0 && (
            <div className="rounded-xl overflow-hidden">
              <ErrorMessageBox errors={errors} />
            </div>
          )}
          
          {/* First row (Step 1) */}
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-white rounded-t-[3rem]" />
            <div className="relative flex h-full flex-col overflow-hidden rounded-t-[3rem]">
              <div className="p-10 pt-10">
                <h3 className="text-sm/4 font-semibold text-gray-500">Step 1</h3>
                <p className="mt-2 text-xl font-medium tracking-tight text-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>Set coverage windows</p>
                <p className="mt-2 text-sm/6 text-gray-600">
                  Define windows for roles that use the same staffing each hour. If a role needs different staffing at different times, you’ll handle that in Hourly Staffing later.
                </p>
                {loading ? (
                  <div className="mt-6 text-sm text-gray-500">Loading available roles...</div>
                ) : !date ? (
                  <div className="mt-6 text-sm text-red-600">No date selected. Please select shifts first.</div>
                ) : rolesWithCrew.length === 0 ? (
                  <div className="mt-6 text-sm text-gray-500">No roles available for this date. Please ensure crew members have shifts assigned and roles configured.</div>
                ) : (
                  <RadioGroup 
                    roles={rolesWithCrew} 
                    lockedRoleIds={step3ConfiguredRoles}
                    onRoleConfigured={handleStep1RoleConfigured}
                    initialConstraints={initialWindowPrefill}
                    onConstraintChange={handleWindowConstraintChange}
                  />
                )}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5 rounded-t-[3rem]" />
          </div>

          {/* Second row (Step 2) */}
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-white" />
            <div className="relative flex h-full flex-col overflow-hidden">
              <div className="p-10 pt-10">
                <h3 className="text-sm/4 font-semibold text-gray-500">Step 2</h3>
                <p className="mt-2 text-xl font-medium tracking-tight text-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>Set daily role requirements</p>
                <div className="mt-2 flex flex-col lg:flex-row lg:items-center lg:justify-between">
                  <p className="text-sm/6 text-gray-600">
                    Specify how many hours each role needs to work throughout the entire day.
                  </p>
                  <label className="mt-2 lg:mt-0 flex items-center gap-2 text-sm text-gray-700">
                    <input
                      id="select-all-daily"
                      name="select-all-daily"
                      type="checkbox"
                      checked={selectAllDaily}
                      onChange={(e) => setSelectAllDaily(e.target.checked)}
                      aria-describedby="select-all-daily-description"
                      className="appearance-none rounded border border-gray-300 bg-white checked:border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] checked:bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] indeterminate:border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] indeterminate:bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
                    />
                    <span>Select all</span>
                  </label>
                </div>
                {/* Override native hover visuals for the select-all checkbox */}
                <style jsx>{`
                  /* Preserve visual state on hover */
                  input#select-all-daily:hover:not(:checked) {
                    background-color: white; /* keep same as default */
                    border-color: #d1d5db; /* gray-300 */
                    box-shadow: none;
                  }
                  input#select-all-daily:hover:checked {
                    background-color: hsl(var(--brand-h) var(--brand-s) var(--brand-l));
                    border-color: hsl(var(--brand-h) var(--brand-s) var(--brand-l));
                    box-shadow: none;
                  }
                `}</style>
                {loading ? (
                  <div className="mt-6 text-sm text-gray-500">Loading daily roles...</div>
                ) : !date ? (
                  <div className="mt-6 text-sm text-red-600">No date selected. Please select shifts first.</div>
                ) : dailyRoles.length === 0 ? (
                  <div className="mt-6 text-sm text-gray-500">No daily roles available for this date.</div>
                ) : (
                  <DailyAssignmentGrid
                    items={dailyConstraintItems}
                    selectAll={selectAllDaily}
                    initialAssignments={initialDailyPrefill}
                    onAssignmentsChange={handleDailyAssignmentsChange}
                  />
                )}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5" />
          </div>

          {/* Third row (Step 3) */}
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-white" />
            <div className="relative flex flex-col overflow-hidden">
              <div className="p-10 pt-10">
                <h3 className="text-sm/4 font-semibold text-gray-500">Step 3</h3>
                <p className="mt-2 text-xl font-medium tracking-tight text-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>Set hourly staffing requirements</p>
                <p className="mt-2 text-sm/6 text-gray-600 pb-4">
                  Click on each hour below to specify how many crew members you need for each role during that time period.
                </p>
                
                {loading ? (
                  <div className="mt-6 text-sm text-gray-500">Loading hourly data...</div>
                ) : !date ? (
                  <div className="mt-6 text-sm text-red-600">No date selected. Please select shifts first.</div>
                ) : hourlyAvailability.length === 0 ? (
                  <div className="mt-6 text-sm text-gray-500">No crew availability data for this date.</div>
                ) : hourlyRoles.length === 0 ? (
                  <div className="mt-6 text-sm text-gray-500">No hourly roles are available for this store.</div>
                ) : (
                  <HourlyRoleRow 
                    hourlyData={hourlyAvailability} 
                    roles={hourlyRoles}
                    lockedRoleIds={step1ConfiguredRoles}
                    onRoleConfigured={handleStep3RoleConfigured}
                    initialConstraints={initialHourlyPrefill}
                    onHourlyConstraintsChange={handleHourlyConstraintsChange}
                    storeHours={storeHours}
                  />
                )}
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5" />
          </div>

          {/* Fourth row (Step 4) */}
          <div className="relative">
            <div className="absolute inset-0 rounded-lg bg-white rounded-b-[3rem]" />
            <div className="relative flex flex-col overflow-hidden rounded-b-[3rem]">
              <div className="p-10 pt-10">
                <h3 className="text-sm/4 font-semibold text-gray-500">Step 4</h3>
                <p className="mt-2 text-xl font-medium tracking-tight text-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>Generate logbook</p>
                <p className="mt-2 text-sm/6 text-gray-600">
                  Review your setup, then hit <em>Finish</em> to save today's coverage windows, role rules, and hourly staffing for the solver.
                </p>
                
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={handleFinish}
                    disabled={saving}
                    className={`inline-flex items-center rounded-md px-5 py-2 text-sm font-semibold shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                      saving
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed focus-visible:outline-gray-300'
                        : 'bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] text-white hover:bg-[hsl(var(--brand-h)_var(--brand-s)_calc(var(--brand-l)_-_5%))] focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]'
                    }`}
                  >
                    {saving ? 'Finishing…' : 'Finish'}
                  </button>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5 rounded-b-[3rem]" />
          </div>
        </div>
      </div>
    </div>
  )
}
