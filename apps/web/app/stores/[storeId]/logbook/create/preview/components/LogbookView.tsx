"use client";

import * as React from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { useSearchParams, useParams, useRouter } from 'next/navigation';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { ChevronDownIcon } from '@heroicons/react/20/solid';
import LogTable, { type AssignmentEditPayload } from './LogTable';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

type PreviewAssignment = {
  id: string;
  crewId: string;
  crewName: string;
  roleId: number;
  roleCode: string;
  roleName: string;
  startTime: string;
  endTime: string;
};

type PreviewRole = {
  id: number;
  code: string;
  displayName: string;
  blockSize: number;
};

type PreviewCrew = {
  id: string;
  name: string;
  eligibleRoleIds: number[];
};

type PreviewShift = {
  id: number;
  crewId: string;
  startMinutes: number;
  endMinutes: number;
  startTime: string;
  endTime: string;
};

export type QuotaWarning = {
  crewId: string;
  crewName: string;
  roleId: number;
  roleCode: string;
  requiredMinutes: number;
  actualMinutes: number;
  shortfallMinutes: number;
  message: string;
};

export type LogbookMetadata = {
  solver: {
    status: string;
    runtimeMs: number;
    objectiveScore?: number;
    numCrew?: number;
    numHours?: number;
    numAssignments?: number;
  };
  schedule: {
    totalAssignments: number;
    crewScheduled: number;
    totalHours: number;
  };
  constraints: {
    hourlyConstraints: number;
    windowConstraints: number;
    dailyConstraints: number;
  };
  preferences: {
    total: number;
    met: number;
    averageSatisfaction: number;
  };
  quotaWarnings?: QuotaWarning[];
  violations?: string[];
  generatedAt: string;
};

export type PreferenceMetadata = {
  id: string;
  logbookId: string;
  // Core Preference Metrics
  eligiblePreferences: number;
  preferencesMet: number;
  percentMet: number;
  avgSatisfaction: number;
  // Crew Metrics
  eligibleCrew: number;
  avgSatisfactionPerCrew: number;
  // Fairness
  fairnessIndex: number;
  fairnessGrade: string;
  // Per-RoleRule Breakdown
  breakdownByRoleRule: Array<{
    roleRuleId: number;
    ruleType: string;
    eligible: number;
    met: number;
    avgSatisfaction: number;
    percentMet: number;
  }>;
};

export type LogbookPreviewResponse = {
  id: string;
  status: string;
  date: string;
  metadata?: LogbookMetadata;
  preferenceMetadata?: PreferenceMetadata;
  assignments: PreviewAssignment[];
  crew: PreviewCrew[];
  roles: PreviewRole[];
  shifts: PreviewShift[];
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function friendlyErrorOverride(message: string): string | null {
  if (message.toLowerCase().includes('no logbook')) {
    return 'No data to display for this date—generate a logbook first.';
  }
  return null;
}

function normalizeErrorMessage(message: string | null): string {
  const defaultMessage = 'Unable to load logbook preview. Try refreshing.';
  if (!message) {
    return defaultMessage;
  }

  const normalizedDirect = friendlyErrorOverride(message);
  if (normalizedDirect) {
    return normalizedDirect;
  }

  try {
    const parsed = JSON.parse(message);
    if (typeof parsed === 'object' && parsed !== null) {
      if (typeof (parsed as { error?: unknown }).error === 'string') {
        const parsedError = (parsed as { error: string }).error;
        return friendlyErrorOverride(parsedError) ?? parsedError;
      }
      if (typeof (parsed as { message?: unknown }).message === 'string') {
        const parsedMessage = (parsed as { message: string }).message;
        return friendlyErrorOverride(parsedMessage) ?? parsedMessage;
      }
    }
  } catch {
    // message was not JSON; fall through
  }

  return message || defaultMessage;
}

// Hook to fetch logbook preview data
export function useLogbookPreview() {
  const searchParams = useSearchParams();
  const logbookId = searchParams?.get('logbookId');

  const [preview, setPreview] = React.useState<LogbookPreviewResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => {
    if (!logbookId) {
      setPreview(null);
      setError('No logbook ID provided');
      setLoading(false);
      return;
    }

    let cancelled = false;
    async function loadPreview() {
      setLoading(true);
      setError(null);

      try {
        const url = `${API_URL}/schedule/logbook/${encodeURIComponent(logbookId!)}`;
        const res = await fetch(url);

        if (!res.ok) {
          const message = await res.text();
          throw new Error(message || 'Failed to load logbook preview');
        }

        const data: LogbookPreviewResponse = await res.json();
        if (!cancelled) {
          setPreview(data);
        }
      } catch (err) {
        if (!cancelled) {
          const rawMessage = err instanceof Error ? err.message : null;
          setPreview(null);
          setError(normalizeErrorMessage(rawMessage));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [logbookId, reloadKey]);

  return { preview, loading, error, logbookId };
}

// Props for LogbookView component
type LogbookViewProps = {
  preview: LogbookPreviewResponse | null;
  loading: boolean;
  error: string | null;
};

export default function LogbookView({ preview, loading, error }: LogbookViewProps) {
  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();
  const logbookId = searchParams?.get('logbookId');
  const storeId = params?.storeId as string;

  // Filter state: null means "Show all", otherwise it's the start time in minutes from midnight (UTC)
  const [selectedStartTime, setSelectedStartTime] = React.useState<number | null>(null);

  const crew = preview?.crew ?? [];
  const roles = preview?.roles ?? [];

  const shifts = (preview?.shifts ?? []).map((shift) => ({
    id: String(shift.id),
    crewId: shift.crewId,
    startTime: new Date(shift.startTime),
    endTime: new Date(shift.endTime),
  }));

  const assignments = (preview?.assignments ?? []).map((assignment) => ({
    id: assignment.id,
    crewId: assignment.crewId,
    roleId: assignment.roleId,
    roleCode: assignment.roleCode,
    startTime: new Date(assignment.startTime),
    endTime: new Date(assignment.endTime),
  }));

  // Track local edits keyed by "crewId-startMinutes" for slot-level granularity
  const [localEdits, setLocalEdits] = React.useState<Map<string, AssignmentEditPayload>>(new Map());
  const [isPublishing, setIsPublishing] = React.useState(false);

  // Build a map of original assignments for comparison (to detect "undo" edits)
  // Explode to 30-min slots to match edit granularity
  const originalAssignmentsByKey = React.useMemo(() => {
    const SLOT_MINUTES = 30;
    const map = new Map<string, { roleId: number; roleCode: string }>();
    
    for (const a of assignments) {
      const startMinutes = a.startTime.getUTCHours() * 60 + a.startTime.getUTCMinutes();
      const endMinutes = a.endTime.getUTCHours() * 60 + a.endTime.getUTCMinutes();
      
      // Create a key for each 30-min slot within this assignment
      let currentStart = startMinutes;
      while (currentStart < endMinutes) {
        const key = `${a.crewId}-${currentStart}`;
        map.set(key, { roleId: a.roleId, roleCode: a.roleCode });
        currentStart += SLOT_MINUTES;
      }
    }
    return map;
  }, [assignments]);

  const handleAssignmentEdit = React.useCallback((payload: AssignmentEditPayload) => {
    console.log('Assignment edit:', payload);
    // Key by crewId-startMinutes for slot-level tracking
    const key = `${payload.crewId}-${payload.startMinutes}`;
    
    // Check if this edit is the same as the original (i.e., user "undid" the change)
    const original = originalAssignmentsByKey.get(key);
    const isUndo = original && payload.newRoleIds[0] === original.roleId;
    
    setLocalEdits((prev) => {
      const next = new Map(prev);
      if (isUndo) {
        // Remove from edits if it matches original
        next.delete(key);
      } else {
        next.set(key, payload);
      }
      return next;
    });
  }, [originalAssignmentsByKey]);

  // Publish handler - saves any pending edits, publishes the logbook, and navigates to publish page
  const handlePublish = React.useCallback(async () => {
    if (!logbookId) {
      console.error('No logbook ID');
      return;
    }

    setIsPublishing(true);
    try {
      // Step 1: Save any pending edits
      if (localEdits.size > 0) {
        const updates = Array.from(localEdits.values()).map((edit) => ({
          crewId: edit.crewId,
          startMinutes: edit.startMinutes,
          endMinutes: edit.endMinutes,
          roleId: edit.newRoleIds[0],
        }));

        const editRes = await authFetch(`${API_URL}/schedule/logbook/${encodeURIComponent(logbookId)}/assignments`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ updates }),
        });

        if (!editRes.ok) {
          const errorText = await editRes.text();
          throw new Error(errorText || 'Failed to save changes');
        }

        console.log('Saved edits before publishing');
      }

      // Step 2: Publish the logbook (set status to PUBLISHED)
      const publishRes = await authFetch(`${API_URL}/schedule/logbook/${encodeURIComponent(logbookId)}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          editCount: localEdits.size,
        }),
      });

      if (!publishRes.ok) {
        const errorText = await publishRes.text();
        throw new Error(errorText || 'Failed to publish logbook');
      }

      const result = await publishRes.json();
      console.log('Publish result:', result);

      // Step 3: Navigate to publish page
      router.push(`/stores/${storeId}/logbook/create/publish?logbookId=${encodeURIComponent(logbookId)}`);
    } catch (err) {
      console.error('Failed to publish:', err);
      alert(`Failed to publish: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsPublishing(false);
    }
  }, [logbookId, localEdits, router, storeId]);

  // Explode assignments into 30-min slots and apply local edits
  // This is necessary because assignments can be 60min blocks, but edits are at 30min granularity
  const editedAssignments = React.useMemo(() => {
    const SLOT_MINUTES = 30;
    const explodedSlots: typeof assignments = [];
    
    // First, explode all assignments into 30-min slots
    for (const a of assignments) {
      const startMinutes = a.startTime.getUTCHours() * 60 + a.startTime.getUTCMinutes();
      const endMinutes = a.endTime.getUTCHours() * 60 + a.endTime.getUTCMinutes();
      const baseDate = new Date(a.startTime);
      baseDate.setUTCHours(0, 0, 0, 0);
      
      let currentStart = startMinutes;
      let slotIndex = 0;
      
      while (currentStart < endMinutes) {
        const slotEnd = Math.min(currentStart + SLOT_MINUTES, endMinutes);
        
        // Create start/end times for this slot
        const slotStartTime = new Date(baseDate.getTime() + currentStart * 60 * 1000);
        const slotEndTime = new Date(baseDate.getTime() + slotEnd * 60 * 1000);
        
        explodedSlots.push({
          id: `${a.id}_slot${slotIndex}`,
          crewId: a.crewId,
          roleId: a.roleId,
          roleCode: a.roleCode,
          startTime: slotStartTime,
          endTime: slotEndTime,
        });
        
        currentStart = slotEnd;
        slotIndex++;
      }
    }
    
    // If no edits, return exploded slots as-is
    if (localEdits.size === 0) return explodedSlots;
    
    // Apply edits to the exploded slots
    return explodedSlots.map((a) => {
      const startMinutes = a.startTime.getUTCHours() * 60 + a.startTime.getUTCMinutes();
      const key = `${a.crewId}-${startMinutes}`;
      const edit = localEdits.get(key);
      if (edit) {
        return {
          ...a,
          roleId: edit.newRoleIds[0],
          roleCode: edit.newRoleCodes[0],
        };
      }
      return a;
    });
  }, [assignments, localEdits]);

  // Extract unique shift start times (in minutes from midnight UTC)
  const uniqueStartTimes = React.useMemo(() => {
    const startTimesSet = new Set<number>();
    shifts.forEach((shift) => {
      const minutes = shift.startTime.getUTCHours() * 60 + shift.startTime.getUTCMinutes();
      startTimesSet.add(minutes);
    });
    return Array.from(startTimesSet).sort((a, b) => a - b);
  }, [shifts]);

  // Format time for display (e.g., "9AM", "2:30PM")
  const formatTimeLabel = (minutes: number) => {
    let hour24 = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const meridiem = hour24 >= 12 ? 'PM' : 'AM';
    if (hour24 === 0) hour24 = 12;
    else if (hour24 > 12) hour24 -= 12;
    
    if (mins === 0) {
      return `${hour24}${meridiem}`;
    }
    return `${hour24}:${mins.toString().padStart(2, '0')}${meridiem}`;
  };

  // Get the label for the current selection
  const currentFilterLabel = selectedStartTime === null 
    ? 'Show all' 
    : `Starts at ${formatTimeLabel(selectedStartTime)}`;

  let statusMessage: string | null = null;
  if (!logbookId) {
    statusMessage = 'No logbook ID provided.';
  } else if (error) {
    statusMessage = error;
  } else if (loading) {
    statusMessage = 'Loading logbook…';
  }

  return (
    <>
      {/* Table section */}
      <div className="space-y-6">
        {/* Unified card: embedded header on top, LogTable on bottom */}
        <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('1.5rem') }}>
          <div className="flex flex-col rounded-[1.5rem] overflow-hidden" style={{ ...aiGlassLightContentStyle('1.5rem', 0.5) }}>
            {/* Embedded header: title bubble + filter dropdown + publish button */}
            <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('1.5rem 1.5rem 0 0') }}>
              <div className="flex items-center justify-between gap-4" style={{ ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.85), padding: '16px 20px' }}>
                {/* Title bubble */}
                <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                  <div style={{ ...aiGlassLightContentStyle('9999px', 0.6), padding: '6px 16px' }}>
                    <span className="text-sm font-medium text-gray-700 font-sans">Logbook Preview</span>
                  </div>
                </div>

                {/* Right side: dropdown and publish button */}
                <div className="flex items-center gap-3">
                  {/* Show all dropdown as glass pill */}
                  <Menu as="div" className="relative inline-flex text-left">
                    <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                      <MenuButton
                        className="inline-flex items-center gap-1.5 rounded-full text-sm font-medium text-gray-700 font-sans hover:bg-white/40 transition-colors"
                        style={{ ...aiGlassLightContentStyle('9999px', 0.6), padding: '6px 14px' }}
                      >
                        {currentFilterLabel}
                        <ChevronDownIcon aria-hidden="true" className="size-4 text-gray-500" />
                      </MenuButton>
                    </div>
                    <MenuItems
                      anchor="bottom end"
                      className="z-50 mt-2 w-48 origin-top-right divide-y divide-gray-100 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black/5 focus:outline-none"
                    >
                      <div className="py-1 text-sm text-gray-700">
                        <MenuItem>
                          {({ active }) => (
                            <button
                              type="button"
                              onClick={() => setSelectedStartTime(null)}
                              className={`block w-full px-4 py-2 text-left ${active ? 'bg-gray-100 text-gray-900' : ''} ${selectedStartTime === null ? 'font-semibold text-gray-900' : ''}`}
                            >
                              Show all
                            </button>
                          )}
                        </MenuItem>
                        {uniqueStartTimes.map((startMinutes) => (
                          <MenuItem key={startMinutes}>
                            {({ active }) => (
                              <button
                                type="button"
                                onClick={() => setSelectedStartTime(startMinutes)}
                                className={`block w-full px-4 py-2 text-left ${active ? 'bg-gray-100 text-gray-900' : ''} ${selectedStartTime === startMinutes ? 'font-semibold text-gray-900' : ''}`}
                              >
                                Starts at {formatTimeLabel(startMinutes)}
                              </button>
                            )}
                          </MenuItem>
                        ))}
                      </div>
                    </MenuItems>
                  </Menu>

                  {/* Publish button as glass pill with red theme */}
                  <div data-tutorial-id="preview-publish-btn" className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px', '220, 38, 38', 0.4), width: 'fit-content' }}>
                    <button
                      type="button"
                      onClick={handlePublish}
                      disabled={isPublishing}
                      className={`inline-flex items-center rounded-full text-sm font-semibold font-sans transition-colors ${isPublishing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-100/60'}`}
                      style={{
                        ...aiGlassLightContentStyle('9999px', 0.6),
                        backgroundColor: 'rgba(220, 38, 38, 0.08)',
                        color: 'rgb(185, 28, 28)',
                        padding: '6px 16px'
                      }}
                    >
                      {isPublishing ? 'Publishing...' : localEdits.size > 0 ? `Publish (${localEdits.size} changes)` : 'Publish'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* LogTable as bottom of unified card */}
            <LogTable
              crew={crew}
              roles={roles}
              shifts={shifts}
              assignments={editedAssignments}
              filterStartTimeMinutes={selectedStartTime}
              onAssignmentEdit={handleAssignmentEdit}
            />
          </div>
        </div>

        {statusMessage && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-2 text-sm text-gray-600">
            {statusMessage}
          </div>
        )}
      </div>
    </>
  );
}
