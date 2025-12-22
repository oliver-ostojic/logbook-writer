import React from 'react';

type TimeRange = {
  startMinutes: number; // minutes from midnight
  endMinutes: number;
};

type CrewMember = {
  id: string;
  name: string;
  eligibleRoleIds?: number[];
};

type RoleInfo = {
  id: number;
  code: string;
  displayName?: string;
  blockSize?: number;
};

type AssignmentInput = {
  id: string;
  crewId: string;
  roleId?: number;
  roleCode?: string;
  taskType?: string;
  startTime?: Date | string | number;
  endTime?: Date | string | number;
  startMinutes?: number;
  endMinutes?: number;
};

type ShiftInput = {
  id: string;
  crewId: string;
  startTime?: Date | string;
  endTime?: Date | string;
  startMinutes?: number;
  endMinutes?: number;
};

type AssignmentForTimeline = TimeRange & {
  id: string;
  crewId: string;
  roleId?: number;
  roleCode: string;
};

type ShiftForTimeline = TimeRange & {
  id: string;
  crewId: string;
};

// Represents a role option in the edit dropdown
type RoleOption = {
  label: string;
  // For single-block: just one roleId
  // For multi-block: array of roleIds (e.g., [BRK_ID, PROD_ID] for "BRK | PROD")
  roleIds: number[];
  roleCodes: string[];
};

// Edit state for a cell
type EditingCell = {
  assignmentId: string;
  crewId: string;
  startMinutes: number;
  endMinutes: number;
  blockCount: number; // how many 30-min blocks this segment spans
};

// Callback when an assignment is edited
export type AssignmentEditPayload = {
  assignmentId: string;
  crewId: string;
  startMinutes: number;
  endMinutes: number;
  newRoleIds: number[];
  newRoleCodes: string[];
};

type LogbookScheduleProps = {
  assignments?: AssignmentInput[];
  crew?: CrewMember[];
  roles?: RoleInfo[];
  shifts?: ShiftInput[];
  slotMinutes?: number;
  columnWidth?: number;
  filterStartTimeMinutes?: number | null;
  onAssignmentEdit?: (payload: AssignmentEditPayload) => void;
};

const ASSIGNMENT_PILL_BASE_CLASSES =
  'flex w-full items-center justify-center rounded-lg px-3 text-[11px] font-bold shadow-sm transition-colors duration-150';

// Wiggle animation CSS (injected via style tag)
const WIGGLE_KEYFRAMES = `
@keyframes wiggle {
  0%, 100% { transform: rotate(-3deg); }
  50% { transform: rotate(3deg); }
}
.wiggle {
  animation: wiggle 0.35s ease-in-out infinite;
}
@keyframes segment-pop-in {
  0% { 
    opacity: 0;
    transform: scale(0.3) rotate(-3deg);
  }
  50% {
    opacity: 1;
    transform: scale(1.08) rotate(2deg);
  }
  100% { 
    opacity: 1;
    transform: scale(1) rotate(-3deg);
  }
}
.segment-pop-in {
  animation: segment-pop-in 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}
`;

const DEFAULT_ASSIGNMENT_THEME =
  'bg-indigo-50/80 text-indigo-700 group-hover:bg-indigo-200/70 group-hover:text-indigo-900';

const ROLE_THEME_RED_SOFT =
  'bg-red-200/80 text-red-900 group-hover:bg-red-200/90 group-hover:text-red-950';
const ROLE_THEME_RED_BOLD =
  'bg-red-500 text-white font-bold group-hover:bg-red-600 group-hover:text-white';
const ROLE_THEME_BLUE_SOFT =
  'bg-blue-200/80 text-blue-900 group-hover:bg-blue-200/90 group-hover:text-blue-950';
const ROLE_THEME_GREEN_SOFT =
  'bg-green-200/80 text-green-900 group-hover:bg-green-200/90 group-hover:text-green-950';
const ROLE_THEME_GREEN_MEDIUM =
  'bg-green-300/80 text-green-900 group-hover:bg-green-300/90 group-hover:text-green-950';
const ROLE_THEME_STONE_SOFT =
  'bg-stone-200/80 text-stone-900 group-hover:bg-stone-200/90 group-hover:text-stone-950';
const ROLE_THEME_INDIGO_SOFT =
  'bg-indigo-200/80 text-indigo-900 group-hover:bg-indigo-200/90 group-hover:text-indigo-950';
const ROLE_THEME_SLATE_DARK =
  'bg-slate-900 text-white group-hover:bg-slate-900/90 group-hover:text-white';
const ROLE_THEME_ROSE_MEDIUM =
  'bg-rose-300/80 text-rose-900 group-hover:bg-rose-300/90 group-hover:text-rose-950';

const ROLE_ASSIGNMENT_THEMES: Record<number, string> = {
  30: ROLE_THEME_RED_BOLD,    // Bold red with white text
  35: ROLE_THEME_ROSE_MEDIUM, // SL - darker rose to differentiate from product red
  33: ROLE_THEME_RED_SOFT,    // PROD - red
  37: ROLE_THEME_GREEN_MEDIUM, // Slightly darker green
  38: ROLE_THEME_GREEN_SOFT,
  29: ROLE_THEME_BLUE_SOFT,   // P_HELM - blue
  34: ROLE_THEME_INDIGO_SOFT,
  36: ROLE_THEME_SLATE_DARK,
};

// little helper for minutes - uses UTC to match server-side times
const minutesFromDateTime = (value?: Date | string | number | null) => {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return value;

  const date = typeof value === 'string' ? new Date(value) : value;
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return undefined;

  return date.getUTCHours() * 60 + date.getUTCMinutes();
};

function formatTimeLabel(minutes: number) {
  let hour24 = Math.floor(minutes / 60);
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';

  if (hour24 === 0) hour24 = 12;
  else if (hour24 > 12) hour24 -= 12;

  return `${hour24}${meridiem}`;
}

function getTimelineBounds(assignments: TimeRange[]) {
  if (assignments.length === 0) {
    return { start: 0, end: 0 };
  }

  return {
    start: Math.min(...assignments.map((item) => item.startMinutes)),
    end: Math.max(...assignments.map((item) => item.endMinutes)),
  };
}

export default function LogbookSchedule({
  assignments = [],
  crew = [],
  roles = [],
  shifts = [],
  slotMinutes = 30,
  columnWidth = 80,
  filterStartTimeMinutes = null,
  onAssignmentEdit,
}: LogbookScheduleProps) {
  // State for which crew row is in edit mode (exploded into 30-min slots)
  const [editingCrewId, setEditingCrewId] = React.useState<string | null>(null);
  // State for which individual slot has dropdown open
  const [editingCell, setEditingCell] = React.useState<EditingCell | null>(null);
  // Track pending edits per crew: Map<crewId, Map<slotStartMinutes, {roleId, roleCode}>>
  const [pendingEdits, setPendingEdits] = React.useState<Map<string, Map<number, { roleId: number; roleCode: string }>>>(new Map());
  
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setEditingCell(null);
      }
    }
    if (editingCell) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [editingCell]);

  const roleCodeById = React.useMemo(() => {
    const map = new Map<number, string>();
    roles.forEach((role) => map.set(role.id, role.code));
    return map;
  }, [roles]);

  const roleBlockSizeById = React.useMemo(() => {
    const map = new Map<number, number>();
    roles.forEach((role) => map.set(role.id, role.blockSize ?? 1));
    return map;
  }, [roles]);

  const crewEligibleRoles = React.useMemo(() => {
    const map = new Map<string, Set<number>>();
    crew.forEach((member) => {
      map.set(member.id, new Set(member.eligibleRoleIds ?? []));
    });
    return map;
  }, [crew]);

  const crewNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    crew.forEach((member) => map.set(member.id, member.name));
    return map;
  }, [crew]);

  const timelineAssignments: AssignmentForTimeline[] = React.useMemo(() => {
    return assignments
      .map((assignment) => {
        const startMinutes = assignment.startMinutes ?? minutesFromDateTime(assignment.startTime);
        const endMinutes = assignment.endMinutes ?? minutesFromDateTime(assignment.endTime);

        if (startMinutes === undefined || endMinutes === undefined) {
          return null;
        }

        const roleLabel =
          (assignment.roleId !== undefined
            ? roleCodeById.get(assignment.roleId)
            : undefined) ??
          assignment.roleCode ??
          assignment.taskType ??
          (assignment.roleId !== undefined ? `ROLE_${assignment.roleId}` : 'UNASSIGNED');

        return {
          id: assignment.id,
          crewId: assignment.crewId,
          roleId: assignment.roleId,
          roleCode: roleLabel,
          startMinutes,
          endMinutes,
        } as AssignmentForTimeline;
      })
      .filter((assignment): assignment is AssignmentForTimeline => assignment !== null);
  }, [assignments, roleCodeById]);

  const timelineShifts: ShiftForTimeline[] = React.useMemo(() => {
    return shifts
      .map((shift) => {
        const startMinutes = shift.startMinutes ?? minutesFromDateTime(shift.startTime);
        const endMinutes = shift.endMinutes ?? minutesFromDateTime(shift.endTime);

        if (startMinutes === undefined || endMinutes === undefined) {
          return null;
        }

        return {
          id: shift.id,
          crewId: shift.crewId,
          startMinutes,
          endMinutes,
        } satisfies ShiftForTimeline;
      })
      .filter((shift): shift is ShiftForTimeline => shift !== null);
  }, [shifts]);

  // group assignments by crew
  const assignmentsByCrew = React.useMemo(() => {
    const grouped: Record<string, AssignmentForTimeline[]> = {};
    for (const assignment of timelineAssignments) {
      if (!grouped[assignment.crewId]) grouped[assignment.crewId] = [];
      grouped[assignment.crewId].push(assignment);
    }
    return grouped;
  }, [timelineAssignments]);

  // First explode all assignments into 30-min slots
  const explodedAssignmentsByCrew = React.useMemo(() => {
    const exploded: Record<string, AssignmentForTimeline[]> = {};
    
    for (const [crewId, crewAssignments] of Object.entries(assignmentsByCrew)) {
      const slots: AssignmentForTimeline[] = [];
      
      for (const assignment of crewAssignments) {
        // Split this assignment into 30-min (slotMinutes) chunks
        let currentStart = assignment.startMinutes;
        let slotIndex = 0;
        
        while (currentStart < assignment.endMinutes) {
          const slotEnd = Math.min(currentStart + slotMinutes, assignment.endMinutes);
          slots.push({
            id: `${assignment.id}_slot${slotIndex}`,
            crewId: assignment.crewId,
            roleId: assignment.roleId,
            roleCode: assignment.roleCode,
            startMinutes: currentStart,
            endMinutes: slotEnd,
          });
          currentStart = slotEnd;
          slotIndex++;
        }
      }
      
      // Sort by start time
      slots.sort((a, b) => a.startMinutes - b.startMinutes);
      exploded[crewId] = slots;
    }
    
    return exploded;
  }, [assignmentsByCrew, slotMinutes]);

  // Apply pending edits to exploded assignments
  // This ensures visual consistency when exiting edit mode before parent updates
  const assignmentsWithPendingEdits = React.useMemo(() => {
    const result: Record<string, AssignmentForTimeline[]> = {};
    
    for (const [crewId, crewAssignments] of Object.entries(explodedAssignmentsByCrew)) {
      const crewPendingEdits = pendingEdits.get(crewId);
      
      if (!crewPendingEdits || crewPendingEdits.size === 0) {
        // No pending edits for this crew, use original
        result[crewId] = crewAssignments;
        continue;
      }
      
      // Apply pending edits to each 30-min slot
      result[crewId] = crewAssignments.map((assignment) => {
        const pendingEdit = crewPendingEdits.get(assignment.startMinutes);
        if (pendingEdit) {
          return {
            ...assignment,
            roleId: pendingEdit.roleId,
            roleCode: pendingEdit.roleCode,
          };
        }
        return assignment;
      });
    }
    
    return result;
  }, [explodedAssignmentsByCrew, pendingEdits]);

  // merge contiguous assignments with same role, but only within the same hour
  const mergedAssignmentsByCrew = React.useMemo(() => {
    const merged: Record<string, AssignmentForTimeline[]> = {};
    
    for (const [crewId, crewAssignments] of Object.entries(assignmentsWithPendingEdits)) {
      // Sort by start time
      const sorted = [...crewAssignments].sort((a, b) => a.startMinutes - b.startMinutes);
      
      const result: AssignmentForTimeline[] = [];
      
      for (const assignment of sorted) {
        const last = result[result.length - 1];
        
        // Check if within same hour: both start and end must be in same hour block
        const lastHour = last ? Math.floor(last.startMinutes / 60) : -1;
        const currentHour = Math.floor(assignment.startMinutes / 60);
        const wouldEndInSameHour = Math.floor(assignment.endMinutes / 60) === currentHour || assignment.endMinutes % 60 === 0 && Math.floor((assignment.endMinutes - 1) / 60) === currentHour;
        
        // Merge only if: contiguous, same role, AND within same hour
        if (
          last &&
          last.roleId === assignment.roleId &&
          last.roleCode === assignment.roleCode &&
          last.endMinutes === assignment.startMinutes &&
          lastHour === currentHour &&
          wouldEndInSameHour
        ) {
          // Merge: extend the last assignment's end time
          last.endMinutes = assignment.endMinutes;
          last.id = `${last.id}_${assignment.id}`;
        } else {
          // Start a new pill
          result.push({ ...assignment });
        }
      }
      
      merged[crewId] = result;
    }
    
    return merged;
  }, [assignmentsWithPendingEdits]);

  const earliestStartByCrew = React.useMemo(() => {
    const map = new Map<string, number>();

    const updateStart = (crewId: string, candidateStart: number | undefined) => {
      if (candidateStart === undefined || Number.isNaN(candidateStart)) {
        return;
      }
      const current = map.get(crewId);
      if (current === undefined || candidateStart < current) {
        map.set(crewId, candidateStart);
      }
    };

    timelineShifts.forEach((shift) => {
      updateStart(shift.crewId, shift.startMinutes);
    });

    timelineAssignments.forEach((assignment) => {
      updateStart(assignment.crewId, assignment.startMinutes);
    });

    return map;
  }, [timelineAssignments, timelineShifts]);

  // Filter crew by shift start time when filter is active
  const filteredCrewIds = React.useMemo(() => {
    if (filterStartTimeMinutes === null) return null;
    
    const matchingCrewIds = new Set<string>();
    timelineShifts.forEach((shift) => {
      if (shift.startMinutes === filterStartTimeMinutes) {
        matchingCrewIds.add(shift.crewId);
      }
    });
    return matchingCrewIds;
  }, [timelineShifts, filterStartTimeMinutes]);

  const crewRows = React.useMemo(() => {
    const baseRows: CrewMember[] =
      crew.length > 0
        ? crew.map((member) => ({
            ...member,
            name: member.name ?? crewNameById.get(member.id) ?? member.id,
          }))
        : Array.from(new Set(timelineAssignments.map((assignment) => assignment.crewId))).map(
            (crewId) => ({
              id: crewId,
              name: crewNameById.get(crewId) ?? crewId,
            })
          );

    const tokenizeName = (value?: string) => {
      const normalized = value?.trim();
      if (!normalized) {
        return { first: '', last: '' };
      }
      const parts = normalized.split(/\s+/);
      if (parts.length === 1) {
        const token = parts[0].toLocaleLowerCase();
        return { first: token, last: token };
      }
      const first = parts[0]?.toLocaleLowerCase() ?? '';
      const last = parts.at(-1)?.toLocaleLowerCase() ?? '';
      return { first, last };
    };

    return baseRows.sort((a, b) => {
      const startA = earliestStartByCrew.get(a.id) ?? Number.POSITIVE_INFINITY;
      const startB = earliestStartByCrew.get(b.id) ?? Number.POSITIVE_INFINITY;
      if (startA !== startB) {
        return startA - startB;
      }

      const labelA = a.name ?? crewNameById.get(a.id) ?? '';
      const labelB = b.name ?? crewNameById.get(b.id) ?? '';
      const tokensA = tokenizeName(labelA);
      const tokensB = tokenizeName(labelB);

      if (tokensA.first !== tokensB.first) {
        return tokensA.first.localeCompare(tokensB.first);
      }

      if (tokensA.last !== tokensB.last) {
        return tokensA.last.localeCompare(tokensB.last);
      }

      return (a.id ?? '').localeCompare(b.id ?? '');
    });
  }, [crew, crewNameById, earliestStartByCrew, timelineAssignments]);

  // Apply shift start time filter
  const displayedCrewRows = React.useMemo(() => {
    if (filteredCrewIds === null) return crewRows;
    return crewRows.filter((member) => filteredCrewIds.has(member.id));
  }, [crewRows, filteredCrewIds]);

  const hasTimelineData = timelineAssignments.length > 0;

  if (!hasTimelineData) {
    return null;
  }

  // Filter assignments for timeline bounds when shift filter is active
  const assignmentsForBounds = filteredCrewIds
    ? timelineAssignments.filter((a) => filteredCrewIds.has(a.crewId))
    : timelineAssignments;

  const { start: earliestStart, end: latestEnd } = getTimelineBounds(
    assignmentsForBounds
  );

  const gridStart = earliestStart - (earliestStart % slotMinutes);
  const remainder = latestEnd % slotMinutes;
  const normalizedEnd =
    remainder === 0 ? latestEnd : latestEnd + (slotMinutes - remainder);
  const gridEnd = normalizedEnd + slotMinutes; // pad one extra column so the final label & divider are visible
  const timelineDuration = Math.max(gridEnd - gridStart, slotMinutes);

  const slots: number[] = [];
  for (let t = gridStart; t < gridEnd; t += slotMinutes) {
    slots.push(t);
  }

  // Generate role options for editing a cell
  const generateRoleOptions = (crewId: string, blockCount: number): RoleOption[] => {
    const eligibleRoleIds = crewEligibleRoles.get(crewId) ?? new Set<number>();
    const options: RoleOption[] = [];
    
    // Get all roles this crew can do
    // If no explicit eligibility, fall back to ALL roles (crew may not have role assignments configured)
    const eligibleRoles = eligibleRoleIds.size > 0
      ? roles.filter((r) => eligibleRoleIds.has(r.id))
      : roles;
    
    if (blockCount === 1) {
      // Single 30-min block in edit mode: show ALL eligible roles (regardless of blockSize)
      eligibleRoles.forEach((r) => {
        options.push({
          label: r.code,
          roleIds: [r.id],
          roleCodes: [r.code],
        });
      });
    } else if (blockCount === 2) {
      // 1-hour block: show full-hour options AND split combos
      const block1Roles = eligibleRoles.filter((r) => (r.blockSize ?? 1) === 1);
      const block2Roles = eligibleRoles.filter((r) => (r.blockSize ?? 1) === 2);
      
      // Add full-hour blockSize=2 roles
      block2Roles.forEach((r) => {
        options.push({
          label: r.code,
          roleIds: [r.id, r.id],
          roleCodes: [r.code, r.code],
        });
      });
      
      // Add blockSize=1 roles repeated for full hour (show as single label)
      block1Roles.forEach((r) => {
        options.push({
          label: r.code,
          roleIds: [r.id, r.id],
          roleCodes: [r.code, r.code],
        });
      });
      
      // Add combo options (different roles for each 30-min slot)
      for (let i = 0; i < block1Roles.length; i++) {
        for (let j = 0; j < block1Roles.length; j++) {
          if (i !== j) {
            const r1 = block1Roles[i];
            const r2 = block1Roles[j];
            options.push({
              label: `${r1.code} | ${r2.code}`,
              roleIds: [r1.id, r2.id],
              roleCodes: [r1.code, r2.code],
            });
          }
        }
      }
    }
    
    return options;
  };

  // Handle selecting a role option
  const handleRoleSelect = (option: RoleOption) => {
    if (!editingCell || !onAssignmentEdit) return;
    
    onAssignmentEdit({
      assignmentId: editingCell.assignmentId,
      crewId: editingCell.crewId,
      startMinutes: editingCell.startMinutes,
      endMinutes: editingCell.endMinutes,
      newRoleIds: option.roleIds,
      newRoleCodes: option.roleCodes,
    });
    
    setEditingCell(null);
  };

  // Handle double-click on crew name to toggle edit mode
  const handleCrewNameDoubleClick = (crewId: string) => {
    // Helper to commit pending edits for a crew
    const commitPendingEdits = (targetCrewId: string) => {
      const crewPendingEdits = pendingEdits.get(targetCrewId);
      if (crewPendingEdits && crewPendingEdits.size > 0 && onAssignmentEdit) {
        // Call onAssignmentEdit for each slot edit
        crewPendingEdits.forEach((edit, slotStart) => {
          onAssignmentEdit({
            assignmentId: `${targetCrewId}-${slotStart}`, // Unique ID based on crew + slot
            crewId: targetCrewId,
            startMinutes: slotStart,
            endMinutes: slotStart + slotMinutes,
            newRoleIds: [edit.roleId],
            newRoleCodes: [edit.roleCode],
          });
        });
      }
    };

    if (editingCrewId === crewId) {
      // Exiting edit mode - commit pending edits for this crew
      commitPendingEdits(crewId);
      setEditingCrewId(null);
      setEditingCell(null);
    } else {
      // Switching to different crew or entering edit mode
      // First commit any pending edits for the previous crew
      if (editingCrewId) {
        commitPendingEdits(editingCrewId);
      }
      // Enter edit mode for the new crew
      setEditingCrewId(crewId);
      setEditingCell(null);
      // Initialize pending edits for this crew if not exists
      if (!pendingEdits.has(crewId)) {
        setPendingEdits((prev) => new Map(prev).set(crewId, new Map()));
      }
    }
  };

  // Handle selecting a role in edit mode (for individual slots)
  const handleSlotRoleSelect = (crewId: string, slotStart: number, roleId: number, roleCode: string) => {
    setPendingEdits((prev) => {
      const next = new Map(prev);
      const crewEdits = new Map(next.get(crewId) ?? new Map());
      crewEdits.set(slotStart, { roleId, roleCode });
      next.set(crewId, crewEdits);
      return next;
    });
    setEditingCell(null);
  };

  const renderSchedule = () => (
    <div className="isolate flex h-full flex-col bg-white">
      {/* Scrollable container - horizontal only, vertical scrolling handled by page */}
      <div className="overflow-x-auto overflow-y-visible">
        <div className="flex flex-col" style={{ minWidth: `${slots.length * columnWidth + 160}px` }}>
          {/* Sticky top header with time labels */}
          <div className="sticky top-0 z-30 flex-none bg-white">
            <div className="grid grid-cols-[10rem_auto] text-xs/5 text-gray-500">
              {/* Left spacer keeps the timeline aligned but stays visually empty */}
              <div
                aria-hidden
                className="border-b border-gray-100 bg-white px-3 py-3"
              />

              {/* Time axis */}
              <div className="border-b border-gray-100 bg-white">
                <div
                  className="grid"
                  style={{
                    gridTemplateColumns: `repeat(${slots.length}, ${columnWidth}px)`,
                  }}
                >
                  {slots.map((t) => {
                    const isHour = t % 60 === 0;
                    return (
                      <div
                        key={t}
                        className="relative py-2 text-xs font-normal text-gray-400"
                      >
                        {isHour && (
                          <span className="absolute left-0 bottom-0 translate-y-1 -translate-x-1/2 whitespace-nowrap">
                            {formatTimeLabel(t)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Body: one row per crew */}
          <div className="relative flex flex-col">
          {/* Decorative gradient blob behind y-axis */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-4 top-1/2 -z-10 -translate-y-1/2 transform-gpu opacity-30 blur-3xl"
          >
            <div
              style={{
                clipPath:
                  'polygon(100% 38.5%, 82.6% 100%, 60.2% 37.7%, 52.4% 32.1%, 47.5% 41.8%, 45.2% 65.6%, 27.5% 23.4%, 0.1% 35.3%, 17.9% 0%, 27.7% 23.4%, 76.2% 2.5%, 74.2% 56%, 100% 38.5%)',
              }}
              className="aspect-[1/2] w-48 bg-gradient-to-br from-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] to-[#9089FC]"
            />
          </div>
          {displayedCrewRows.map((c, index) => {
            const isCrewEditing = editingCrewId === c.id;
            // Use merged assignments normally, but exploded (individual 30-min slots) when in edit mode
            const crewAssignments = isCrewEditing 
              ? (explodedAssignmentsByCrew[c.id] ?? [])
              : (mergedAssignmentsByCrew[c.id] ?? []);
            const isFirst = index === 0;
            const isLast = index === displayedCrewRows.length - 1;

            return (
              <div
                key={c.id}
                className="grid grid-cols-[10rem_auto] border-b border-gray-100"
              >
                {/* Crew name cell (Y-axis labels) - double-click to toggle edit mode */}
                <div 
                  className={`sticky left-4 z-20 flex items-center w-[8rem] border-y border-white/25 bg-white/50 px-3 py-3 text-xs text-gray-900 shadow-sm supports-[backdrop-filter]:backdrop-blur-lg cursor-pointer select-none outline-none ${isFirst ? 'rounded-t-2xl' : ''} ${isLast ? 'rounded-b-2xl' : ''} ${isCrewEditing ? 'font-bold' : 'font-medium'}`}
                  onDoubleClick={() => handleCrewNameDoubleClick(c.id)}
                >
                  <span>{c.name ?? crewNameById.get(c.id) ?? c.id}</span>
                </div>

                {/* Timeline grid */}
                <div
                  className="relative min-h-[53px]"
                  style={{ width: `${slots.length * columnWidth}px` }}
                >
                  <div
                    className="absolute inset-0"
                    style={{
                      marginLeft: '-10rem',
                      paddingLeft: '10rem',
                      backgroundImage: `linear-gradient(to right, rgba(229, 231, 235, 0.4) 1px, transparent 1px)`,
                      backgroundSize: `${columnWidth}px 100%`,
                    }}
                  />

                  <div className="relative h-full w-full">
                    {crewAssignments.map((a, slotIndex) => {
                      const clampedStart = Math.max(a.startMinutes, gridStart);
                      const clampedEnd = Math.min(a.endMinutes, gridEnd);
                      const duration = Math.max(clampedEnd - clampedStart, 0);

                      const leftPercent =
                        ((clampedStart - gridStart) / timelineDuration) * 100;
                      const widthPercent =
                        (Math.max(duration, slotMinutes) / timelineDuration) * 100;

                      // Check if this slot has a pending edit
                      const pendingEdit = isCrewEditing ? pendingEdits.get(c.id)?.get(a.startMinutes) : null;
                      const displayRoleCode = pendingEdit?.roleCode ?? a.roleCode;
                      const displayRoleId = pendingEdit?.roleId ?? a.roleId;

                      const isSlotEditing = editingCell?.assignmentId === a.id;
                      // In edit mode, show ALL roles (blockCount=1 since we're editing individual slots)
                      const roleOptions = isSlotEditing ? generateRoleOptions(a.crewId, 1) : [];

                      // Create varied delays - alternate between very different phases
                      const delays = [0, 0.17, 0.08, 0.25, 0.04, 0.21, 0.12, 0.29, 0.02, 0.19, 0.1, 0.27, 0.06, 0.23, 0.14, 0.31];
                      const wiggleDelay = delays[slotIndex % delays.length];

                      return (
                        <div
                          key={a.id}
                          className="group absolute inset-y-1 flex px-1"
                          style={{
                            left: `calc(${leftPercent}% + 0.5px)`,
                            width: `${widthPercent}%`,
                            minWidth: `${(slotMinutes / timelineDuration) * 100}%`,
                          }}
                        >
                          <div
                            className={`${ASSIGNMENT_PILL_BASE_CLASSES} ${
                              ROLE_ASSIGNMENT_THEMES[displayRoleId ?? -1] ?? DEFAULT_ASSIGNMENT_THEME
                            } ${isCrewEditing || onAssignmentEdit ? 'cursor-pointer' : ''} ${pendingEdit ? 'ring-2 ring-blue-400' : ''} ${isCrewEditing ? 'segment-pop-in' : ''}`}
                            style={{
                              // Stagger the pop-in animation, then start wiggling after
                              animationDelay: isCrewEditing ? `${wiggleDelay * 0.15}s` : undefined,
                            }}
                            onAnimationEnd={(e) => {
                              // After pop-in completes, switch to wiggle animation
                              if (e.animationName === 'segment-pop-in') {
                                const el = e.currentTarget;
                                el.classList.remove('segment-pop-in');
                                el.classList.add('wiggle');
                                el.style.animationDelay = `${wiggleDelay}s`;
                              }
                            }}
                            onClick={isCrewEditing ? (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setEditingCell({
                                assignmentId: a.id,
                                crewId: a.crewId,
                                startMinutes: a.startMinutes,
                                endMinutes: a.endMinutes,
                                blockCount: 1,
                              });
                            } : undefined}
                          >
                            {displayRoleCode}
                          </div>
                          {/* Edit dropdown - opens upward for last 2 rows to avoid clipping */}
                          {isSlotEditing && (
                            <div
                              ref={dropdownRef}
                              className={`absolute inset-x-1 z-50 overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-black/5 ${
                                index >= displayedCrewRows.length - 2 
                                  ? 'bottom-full mb-1' 
                                  : 'top-full mt-1'
                              }`}
                            >
                              <div className="max-h-60 overflow-y-auto py-1 text-xs text-gray-700">
                                {roleOptions.length === 0 ? (
                                  <div className="px-3 py-1.5 text-gray-400">No eligible roles</div>
                                ) : (
                                  roleOptions.map((option, idx) => (
                                    <button
                                      key={`${option.label}-${idx}`}
                                      type="button"
                                      onClick={() => {
                                        if (isCrewEditing) {
                                          handleSlotRoleSelect(a.crewId, a.startMinutes, option.roleIds[0], option.roleCodes[0]);
                                        } else {
                                          handleRoleSelect(option);
                                        }
                                      }}
                                      className="block w-full px-3 py-1.5 text-left hover:bg-gray-100"
                                    >
                                      {option.label}
                                    </button>
                                  ))
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Inject wiggle animation CSS */}
      <style dangerouslySetInnerHTML={{ __html: WIGGLE_KEYFRAMES }} />
      <div className="flex flex-col gap-8">{renderSchedule()}</div>
    </>
  );
}
