'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import RadioGroup from './WindowRoleRadioGroup';
import DailyAssignmentGrid from './DailyAssignmentGrid';
import HourlyRoleRow from './HourlyRoleRows';
import ErrorMessageBox from './ErrorMessageBox';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

type RoleWithCrew = {
  roleId: number;
  roleCode: string;
  roleName: string;
  crewCount: number;
  assignmentModel: string;
};

type HourlyRoleMeta = {
  roleId: number;
  roleCode: string;
  roleName: string;
  assignmentModel: string;
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

type ConstraintRule = 'MIN' | 'MAX' | 'EXACTLY';
const DEFAULT_CONSTRAINT_RULE: ConstraintRule = 'EXACTLY';

type WindowConstraintDraft = {
  roleId: number;
  startHour: number;   // Actually minutes from midnight (legacy name)
  endHour: number;     // Actually minutes from midnight (legacy name)
  requiredPerHour: number;
  constraintRule: ConstraintRule;
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
  constraintRule: ConstraintRule;
};

type StoreShift = {
  crewId: string;
  start: string;
  end: string;
};

type WindowConstraintPrefill = Record<number, { time: string; duration: string; crewPerHour: number; constraintRule: ConstraintRule }>;
type DailyConstraintPrefill = Record<string, number>;
type HourlyConstraintPrefill = Record<number, Record<number, { count: number; constraintRule: ConstraintRule }>>;

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
    ).sort((a, b) => (a.specialization ?? '').localeCompare(b.specialization ?? ''))
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
          authFetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/crew-with-shifts?date=${encodeURIComponent(date!)}`),
          authFetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/daily-roles?date=${encodeURIComponent(date!)}`),
          authFetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/crew-per-hour?date=${encodeURIComponent(date!)}`),
          authFetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/constraints?date=${encodeURIComponent(date!)}`),
          authFetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/hourly-roles`),
          authFetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/hours`),
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

          // NEW: Parse coverageWindows from API (minutes-based)
          // For Step 1 (window roles): find windows that span multiple hours with same crewPerTaskLength
          // For Step 3 (hourly roles): find windows that are exactly 1 hour (60 min)
          const coverageWindows = constraintData?.coverageWindows ?? [];

          // Group coverage windows by roleId to detect window vs hourly constraints
          const windowsByRole: Record<number, Array<{ startMin: number; endMin: number; crewPerTaskLength: number; constraintRule: ConstraintRule }>> = {};
          coverageWindows.forEach((entry: any) => {
            if (typeof entry?.roleId !== 'number') return;
            if (!windowsByRole[entry.roleId]) windowsByRole[entry.roleId] = [];
            const ruleRaw = typeof entry?.constraintRule === 'string' ? entry.constraintRule : DEFAULT_CONSTRAINT_RULE;
            const rule: ConstraintRule = ruleRaw === 'MIN' || ruleRaw === 'MAX' || ruleRaw === 'EXACTLY' ? ruleRaw : DEFAULT_CONSTRAINT_RULE;
            windowsByRole[entry.roleId].push({
              startMin: entry.startMin,
              endMin: entry.endMin,
              // API returns crewPerMinute, fallback to crewPerTaskLength for backwards compat
              crewPerTaskLength: entry.crewPerMinute ?? entry.crewPerTaskLength ?? 0,
              constraintRule: rule,
            });
          });

          // Process each role's windows
          Object.entries(windowsByRole).forEach(([roleIdStr, windows]) => {
            const roleId = Number(roleIdStr);

            // Check if this looks like a single window constraint (one entry spanning multiple hours)
            // or hourly constraints (multiple 60-min entries)
            const isSingleWindow = windows.length === 1 && (windows[0].endMin - windows[0].startMin) > 60;

            if (isSingleWindow) {
              // Step 1: Window constraint
              const w = windows[0];
              // Store start/end as minutes directly (startHour/endHour are now minutes)
              const startMin = w.startMin;
              const endMin = w.endMin;
              const durationMinutes = endMin - startMin;
              windowDrafts[roleId] = {
                roleId,
                startHour: startMin,  // Now stores minutes
                endHour: endMin,      // Now stores minutes
                requiredPerHour: w.crewPerTaskLength,
                constraintRule: w.constraintRule,
              };
              // Format time with proper hour:minute for the UI
              const startHourPart = Math.floor(startMin / 60);
              const startMinPart = startMin % 60;
              windowPrefill[roleId] = {
                time: `${String(startHourPart).padStart(2, '0')}:${String(startMinPart).padStart(2, '0')}`,
                duration: String(durationMinutes),
                crewPerHour: w.crewPerTaskLength,
                constraintRule: w.constraintRule,
              };
            } else {
              // Step 3: Hourly constraints (multiple 60-min windows or single 60-min window)
              windows.forEach((w) => {
                const hour = Math.floor(w.startMin / 60);
                const key = `${roleId}-${hour}`;
                hourlyDrafts[key] = {
                  roleId,
                  hour,
                  requiredPerHour: w.crewPerTaskLength,
                  constraintRule: w.constraintRule,
                };
                if (!hourlyPrefill[roleId]) hourlyPrefill[roleId] = {};
                hourlyPrefill[roleId][hour] = { count: w.crewPerTaskLength, constraintRule: w.constraintRule };
              });
            }
          });

          // NEW: Parse crewQuotas from API (minutes-based) → convert to hours for UI
          (constraintData?.crewQuotas ?? []).forEach((entry: any) => {
            if (typeof entry?.roleId !== 'number' || typeof entry?.crewId !== 'string') return;
            const key = `${entry.roleId}-${entry.crewId}`;
            const requiredHours = (entry.requiredMin ?? 60) / 60; // Convert minutes to hours
            dailyDrafts[key] = {
              roleId: entry.roleId,
              crewId: entry.crewId,
              requiredHours,
            };
            dailyPrefill[key] = requiredHours;
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
        current.requiredPerHour === constraint.requiredPerHour &&
        current.constraintRule === constraint.constraintRule;

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

  const handleHourlyConstraintsChange = useCallback((entries: Array<{ roleId: number; hour: number; requiredPerHour: number; constraintRule: ConstraintRule }>) => {
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

    setSaving(true);
    setErrors([]);

    try {
      // Fetch shifts FIRST so we can use crew shift times for crewQuotas
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

      // Build a map of crewId -> shift times (in minutes from midnight)
      const shiftsByCrewId = new Map<string, { startMin: number; endMin: number }>();
      for (const shift of shiftsData) {
        // Parse shift times (format: "HH:MM" or ISO string)
        const parseTimeToMinutes = (timeStr: string): number => {
          if (timeStr.includes('T')) {
            // ISO format - extract time part
            const timePart = timeStr.split('T')[1]?.substring(0, 5) || '00:00';
            const [hours, minutes] = timePart.split(':').map(Number);
            return hours * 60 + minutes;
          } else {
            // HH:MM format
            const [hours, minutes] = timeStr.split(':').map(Number);
            return hours * 60 + minutes;
          }
        };
        shiftsByCrewId.set(shift.crewId, {
          startMin: parseTimeToMinutes(shift.start),
          endMin: parseTimeToMinutes(shift.end),
        });
      }

      // Convert window constraints (Step 1) to coverageWindows format (already in minutes)
      const windowCoverageWindows = Object.values(windowConstraintDrafts).map((entry) => ({
        roleId: entry.roleId,
        startMin: entry.startHour,   // Already in minutes from WindowRoleRadioGroup
        endMin: entry.endHour,       // Already in minutes from WindowRoleRadioGroup
        crewPerTaskLength: entry.requiredPerHour,
        constraintRule: 'EXACTLY' as ConstraintRule,
      }));

      // Convert hourly constraints (Step 3) to coverageWindows format (each hour = 60 min window)
      const hourlyCoverageWindows = Object.values(hourlyConstraintDrafts).map((entry) => ({
        roleId: entry.roleId,
        startMin: entry.hour * 60,
        endMin: (entry.hour + 1) * 60,
        crewPerTaskLength: entry.requiredPerHour,
        constraintRule: entry.constraintRule,
      }));

      // Combine all coverage windows
      const coverageWindows = [...windowCoverageWindows, ...hourlyCoverageWindows];

      // Convert daily constraints (Step 2) to crewQuotas format (minutes)
      // Use crew's actual shift times instead of full day
      const crewQuotas = Object.values(dailyConstraintDrafts).map((entry) => {
        const rounded = Math.round(Number(entry.requiredHours) * 2) / 2;
        const requiredMin = Math.max(30, rounded * 60); // Convert hours to minutes, min 30 min
        
        // Get crew's shift times, fallback to full day if not found
        const shiftTimes = shiftsByCrewId.get(entry.crewId);
        const startMin = shiftTimes?.startMin ?? 0;
        const endMin = shiftTimes?.endMin ?? 1440;
        
        return {
          roleId: entry.roleId,
          crewId: entry.crewId,
          startMin,
          endMin,
          requiredMin,
        };
      });

      const response = await authFetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/constraints`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          date,
          coverageWindows,
          crewQuotas,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to save constraints');
      }

      let logbookId: string | undefined;
      
      // Check if shifts/constraints have changed since last generation
      const checkChangesResponse = await fetch(
        `${API_URL}/schedule/logbook/check-changes?store_id=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}`
      );
      
      if (checkChangesResponse.ok) {
        const changeResult = await checkChangesResponse.json();
        
        // If no changes and we have an existing logbook, skip regeneration
        if (!changeResult.needsRegeneration && changeResult.existingLogbookId) {
          console.log('No changes detected, skipping regeneration');
          setSaving(false);
          router.push(`/stores/${storeId}/logbook/create/preview?logbookId=${encodeURIComponent(changeResult.existingLogbookId)}${date ? `&date=${encodeURIComponent(date)}` : ''}`);
          return;
        }
        
        // If there's an existing logbook but we need to regenerate, delete it
        if (changeResult.existingLogbookId && changeResult.needsRegeneration) {
          const deleteResponse = await fetch(
            `${API_URL}/schedule/logbook/${encodeURIComponent(changeResult.existingLogbookId)}`,
            { method: 'DELETE' }
          );
          if (!deleteResponse.ok && deleteResponse.status !== 404) {
            console.warn('Failed to delete existing logbook, will try to create new one anyway');
          }
        }
      } else {
        // Fallback: if check-changes endpoint fails, use old logic
        const logbookResponse = await fetch(
          `${API_URL}/schedule/logbook?store_id=${encodeURIComponent(storeId)}&date=${encodeURIComponent(date)}`
        );

        if (logbookResponse.ok) {
          // Logbook exists - delete it so we can regenerate with updated constraints
          const existingLogbook = await logbookResponse.json();
          if (existingLogbook && existingLogbook.id) {
            const deleteResponse = await fetch(
              `${API_URL}/schedule/logbook/${encodeURIComponent(existingLogbook.id)}`,
              { method: 'DELETE' }
            );
            if (!deleteResponse.ok && deleteResponse.status !== 404) {
              console.warn('Failed to delete existing logbook, will try to create new one anyway');
            }
          }
        } else if (logbookResponse.status !== 404) {
          // Unexpected error from logbook check
          const errorText = await logbookResponse.text();
          throw new Error(errorText || 'Failed to verify logbook status.');
        }
      }

      // Create a new logbook via solver with updated constraints
      const numericStoreId = Number(storeId);
      if (!Number.isFinite(numericStoreId)) {
        throw new Error('Invalid store identifier.');
      }

      // shiftsData already fetched above for crewQuotas

      const solverResponse = await authFetch(`${API_URL}/solver/v2/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          storeId: numericStoreId,
          date,
          saveLogbook: true,
        }),
      });

      const solverPayload = await solverResponse.json().catch(() => ({}));

      if (!solverResponse.ok || !solverPayload.success) {
        const violations: unknown =
          solverPayload?.violations ??
          solverPayload?.metadata?.violations ??
          solverPayload?.metadata?.feasibilityViolations;
        if (Array.isArray(violations) && violations.length > 0) {
          setErrors(violations.map(String));
        } else {
          const message =
            (typeof solverPayload?.error === 'string' && solverPayload.error) ||
            'Solver failed to generate a logbook.';
          setErrors([message]);
        }
        setSaving(false);
        return;
      }

      logbookId = solverPayload.logbookId;

      // Navigate with logbookId - required for preview page
      if (!logbookId) {
        setErrors(['No logbook ID returned']);
        setSaving(false);
        return;
      }
      router.push(`/stores/${storeId}/logbook/create/preview?logbookId=${encodeURIComponent(logbookId)}${date ? `&date=${encodeURIComponent(date)}` : ''}`);
    } catch (error) {
      console.error('Failed to finish logbook setup', error);
      setErrors([error instanceof Error ? error.message : 'Failed to finish logbook setup']);
    } finally {
      setSaving(false);
    }
  }, [saving, storeId, date, windowConstraintDrafts, dailyConstraintDrafts, hourlyConstraintDrafts, API_URL, router, setErrors]);

  return (
    <div className="flex flex-col gap-6">
      {/* Error message box - outside outer card */}
      {errors.length > 0 && <ErrorMessageBox errors={errors} />}

      {/* All steps wrapped in outer glass pill card */}
      <div
        className="ai-glass-border rounded-[1.5rem]"
        style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
      >
        <div
          className="rounded-[1.5rem]"
          style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '24px' }}
        >
          <div className="grid grid-cols-1 gap-6">
            {/* First row (Step 1) */}
            <div
              data-tutorial-id="constraints-step-1"
              className="ai-glass-border rounded-[1.5rem]"
              style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
            >
            <div
              className="rounded-[1.5rem]"
              style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '24px' }}
            >
              {/* Step number + Title + Description in glass pill card */}
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('1.5rem') }}>
                <div
                  style={{
                    ...aiGlassLightContentStyle('1.5rem', 0.6),
                    padding: '20px',
                  }}
                >
                  {/* Step number + Title in inner bubble */}
                  <div className="ai-glass-border mb-3" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                    <div
                      className="flex items-center gap-2"
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.6),
                        padding: '6px 14px 6px 6px',
                      }}
                    >
                      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px', '220, 38, 38', 0.25), width: 24, height: 24 }}>
                        <div
                          style={{
                            ...aiGlassLightContentStyle('9999px', 1),
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            color: 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))',
                            backdropFilter: 'none',
                            WebkitBackdropFilter: 'none',
                            background: 'hsla(var(--brand-h), var(--brand-s), var(--brand-l), 0.08)',
                          }}
                        >
                          1
                        </div>
                      </div>
                      <span style={{ fontWeight: 500, color: '#2C2C2C', fontFamily: 'var(--font-open-sans)', fontSize: '14px' }}>Set coverage windows</span>
                    </div>
                  </div>
                  <p className="text-sm/6 text-gray-600">
                    Define windows for roles that use the same staffing each hour. If a role needs different staffing at different times, you'll handle that in Hourly Staffing later.
                  </p>
                </div>
              </div>
              {loading ? (
                <div className="mt-6 text-sm text-gray-500">Loading available roles...</div>
              ) : !date ? (
                <div className="mt-6 text-sm text-red-600">No date selected. Please select shifts first.</div>
              ) : rolesWithCrew.length === 0 ? (
                <div className="mt-6 text-sm text-gray-500">No roles available for this date. Please ensure crew members have shifts assigned and roles configured.</div>
              ) : (
                <div className="ai-glass-border mt-6" style={{ ...aiGlassLightBorderStyle('1.5rem') }}>
                  <div style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '20px' }}>
                    <RadioGroup
                      roles={rolesWithCrew}
                      lockedRoleIds={step3ConfiguredRoles}
                      onRoleConfigured={handleStep1RoleConfigured}
                      initialConstraints={initialWindowPrefill}
                      onConstraintChange={handleWindowConstraintChange}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Second row (Step 2) */}
          <div
            data-tutorial-id="constraints-step-2"
            className="ai-glass-border rounded-[1.5rem]"
            style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
          >
            <div className="rounded-[1.5rem]" style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '24px' }}>
              {/* Step number + Title + Description in glass pill card */}
              <div className="ai-glass-border mb-4" style={{ ...aiGlassLightBorderStyle('1.5rem') }}>
                <div
                  style={{
                    ...aiGlassLightContentStyle('1.5rem', 0.6),
                    padding: '20px',
                  }}
                >
                  {/* Step number + Title in inner bubble */}
                  <div className="ai-glass-border mb-3" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                    <div
                      className="flex items-center gap-2"
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.6),
                        padding: '6px 14px 6px 6px',
                      }}
                    >
                      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px', '220, 38, 38', 0.25), width: 24, height: 24 }}>
                        <div
                          style={{
                            ...aiGlassLightContentStyle('9999px', 1),
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            color: 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))',
                            backdropFilter: 'none',
                            WebkitBackdropFilter: 'none',
                            background: 'hsla(var(--brand-h), var(--brand-s), var(--brand-l), 0.08)',
                          }}
                        >
                          2
                        </div>
                      </div>
                      <span style={{ fontWeight: 500, color: '#2C2C2C', fontFamily: 'var(--font-open-sans)', fontSize: '14px' }}>Set daily role requirements</span>
                    </div>
                  </div>
                  {/* Description + Select all on the same row */}
                  <div className="flex justify-between items-center gap-4">
                    <p className="text-sm/6 text-gray-600">
                      Specify how many hours each role needs to work throughout the entire day.
                    </p>
                    <label className="flex items-center gap-2 text-sm text-gray-700 shrink-0">
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
                </div>
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
                <div className="ai-glass-border mt-6" style={{ ...aiGlassLightBorderStyle('1.5rem') }}>
                  <div style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '20px' }}>
                    <DailyAssignmentGrid
                      items={dailyConstraintItems}
                      selectAll={selectAllDaily}
                      initialAssignments={initialDailyPrefill}
                      onAssignmentsChange={handleDailyAssignmentsChange}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Third row (Step 3) */}
          <div
            data-tutorial-id="constraints-step-3"
            className="ai-glass-border rounded-[1.5rem]"
            style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
          >
            <div className="rounded-[1.5rem]" style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '24px' }}>
              {/* Step number + Title + Description in glass pill card */}
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('1.5rem'), marginBottom: '6px' }}>
                <div
                  style={{
                    ...aiGlassLightContentStyle('1.5rem', 0.6),
                    padding: '20px',
                  }}
                >
                  {/* Step number + Title in inner bubble */}
                  <div className="ai-glass-border mb-3" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                    <div
                      className="flex items-center gap-2"
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.6),
                        padding: '6px 14px 6px 6px',
                      }}
                    >
                      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px', '220, 38, 38', 0.25), width: 24, height: 24 }}>
                        <div
                          style={{
                            ...aiGlassLightContentStyle('9999px', 1),
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            color: 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))',
                            backdropFilter: 'none',
                            WebkitBackdropFilter: 'none',
                            background: 'hsla(var(--brand-h), var(--brand-s), var(--brand-l), 0.08)',
                          }}
                        >
                          3
                        </div>
                      </div>
                      <span style={{ fontWeight: 500, color: '#2C2C2C', fontFamily: 'var(--font-open-sans)', fontSize: '14px' }}>Set hourly staffing requirements</span>
                    </div>
                  </div>
                  <p className="text-sm/6 text-gray-600">
                    Click on each hour below to specify how many crew members you need for each role during that time period.
                  </p>
                </div>
              </div>

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

          {/* Fourth row (Step 4) */}
          <div
            className="ai-glass-border rounded-[1.5rem]"
            style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
          >
            <div
              className="rounded-[1.5rem]"
              style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '24px' }}
            >
              {/* Step number + Title + Description in glass pill card */}
              <div className="ai-glass-border mb-4" style={{ ...aiGlassLightBorderStyle('1.5rem') }}>
                <div
                  style={{
                    ...aiGlassLightContentStyle('1.5rem', 0.6),
                    padding: '20px',
                  }}
                >
                  {/* Step number + Title in inner bubble */}
                  <div className="ai-glass-border mb-3" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                    <div
                      className="flex items-center gap-2"
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.6),
                        padding: '6px 14px 6px 6px',
                      }}
                    >
                      <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px', '220, 38, 38', 0.25), width: 24, height: 24 }}>
                        <div
                          style={{
                            ...aiGlassLightContentStyle('9999px', 1),
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            color: 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))',
                            backdropFilter: 'none',
                            WebkitBackdropFilter: 'none',
                            background: 'hsla(var(--brand-h), var(--brand-s), var(--brand-l), 0.08)',
                          }}
                        >
                          4
                        </div>
                      </div>
                      <span style={{ fontWeight: 500, color: '#2C2C2C', fontFamily: 'var(--font-open-sans)', fontSize: '14px' }}>Generate logbook</span>
                    </div>
                  </div>
                  <p className="text-sm/6 text-gray-600">
                    Review your setup, then hit <em>Finish</em> to save today's coverage windows, role rules, and hourly staffing for the solver.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <div data-tutorial-id="constraints-finish-btn" className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px') }}>
                  <div style={{ ...aiGlassLightContentStyle('9999px', 0.6) }}>
                    <button
                      type="button"
                      onClick={handleFinish}
                      disabled={saving}
                      className={`w-full rounded-full px-5 py-3 text-sm font-semibold font-sans border-0 focus:outline-none focus:ring-0 transition-colors ${
                        saving
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] text-white hover:bg-[hsl(var(--brand-h)_var(--brand-s)_calc(var(--brand-l)_-_5%))]'
                      }`}
                      style={{ outline: 'none', boxShadow: 'none' }}
                    >
                      {saving ? 'Finishing…' : 'Finish'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}
