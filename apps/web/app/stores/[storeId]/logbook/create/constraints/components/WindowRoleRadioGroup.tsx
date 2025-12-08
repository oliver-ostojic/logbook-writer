import { useState, useEffect, useCallback } from 'react'
import { CheckCircleIcon } from '@heroicons/react/20/solid'

type RoleWithCrew = {
  roleId: number;
  roleCode: string;
  roleName: string;
  crewCount: number;
  assignmentModel: string[];
};

type WindowConstraintValue = {
  time: string;
  duration: string;
  crewPerHour?: number;
};

type Props = {
  roles: RoleWithCrew[];
  lockedRoleIds: Set<number>;
  onRoleConfigured: (roleId: number, isConfigured: boolean) => void;
  initialConstraints?: Record<number, WindowConstraintValue> | null;
  onConstraintChange?: (roleId: number, value?: { roleId: number; startHour: number; endHour: number; requiredPerHour: number }) => void;
};

export default function RadioGroup({ roles, lockedRoleIds, onRoleConfigured, initialConstraints, onConstraintChange }: Props) {
  // Allow multi-select (0 to all)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Store per-tile config input state
  const [config, setConfig] = useState<Record<number, WindowConstraintValue>>({})

  // Hydrate from persisted data
  useEffect(() => {
    if (!initialConstraints) return;
    const hydratedSelected = new Set<number>();
    const hydratedConfig: Record<number, WindowConstraintValue> = {};
    Object.entries(initialConstraints).forEach(([roleIdStr, value]) => {
      const roleId = Number(roleIdStr);
      hydratedSelected.add(roleId);
      hydratedConfig[roleId] = value;
    });
    setSelected(hydratedSelected);
    setConfig(hydratedConfig);
  }, [initialConstraints]);

  // Helper to check if role has both HOURLY and HOURLY_WINDOW (needs mutual exclusion)
  const needsMutualExclusion = (role: RoleWithCrew) => {
    return role.assignmentModel.includes('HOURLY') && role.assignmentModel.includes('HOURLY_WINDOW');
  };

  const isRoleComplete = useCallback((roleId: number) => {
    if (!selected.has(roleId)) return false;
    const cfg = config[roleId];
    if (!cfg) return false;
    const hasTime = !!cfg.time && cfg.time.trim() !== '';
    const hasDuration = !!cfg.duration && cfg.duration.trim() !== '';
    const hasCrewPerHour = cfg.crewPerHour !== undefined && cfg.crewPerHour > 0;
    return hasTime && hasDuration && hasCrewPerHour;
  }, [config, selected]);

  // Watch for config changes and notify parent when completion status changes
  useEffect(() => {
    roles.forEach(role => {
      const complete = isRoleComplete(role.roleId);
      onRoleConfigured(role.roleId, complete);
    });
  }, [config, selected, roles, onRoleConfigured, isRoleComplete]);

  useEffect(() => {
    if (!onConstraintChange) return;
    roles.forEach(role => {
      const complete = isRoleComplete(role.roleId);
      if (!complete) {
        onConstraintChange(role.roleId, undefined);
        return;
      }
      const cfg = config[role.roleId];
      if (!cfg) {
        onConstraintChange(role.roleId, undefined);
        return;
      }
      const [hourStr] = (cfg.time ?? '0:00').split(':');
      const startHour = Number.parseInt(hourStr ?? '0', 10);
      const durationMinutes = Number(cfg.duration);
      if (!Number.isFinite(startHour) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        onConstraintChange(role.roleId, undefined);
        return;
      }
      const durationHours = durationMinutes / 60;
      const unclampedEnd = startHour + durationHours;
      const normalizedStart = Math.max(0, Math.min(23, Math.floor(startHour)));
      const normalizedEnd = Math.max(normalizedStart + 1, Math.min(24, Math.round(unclampedEnd)));

      onConstraintChange(role.roleId, {
        roleId: role.roleId,
        startHour: normalizedStart,
        endHour: normalizedEnd,
        requiredPerHour: Math.max(0, cfg.crewPerHour ?? 0),
      });
    });
  }, [config, selected, roles, onConstraintChange, isRoleComplete]);

  const toggle = (roleId: number) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId)
      }
      return next
    })
  }

  const updateTime = (roleId: number, time: string) => {
    setConfig(prev => ({ ...prev, [roleId]: { ...prev[roleId], time } }));
    // Auto-select tile when user interacts
    setSelected(prev => {
      if (prev.has(roleId)) return prev
      const next = new Set(prev)
      next.add(roleId)
      return next
    })
  }

  const updateDuration = (roleId: number, duration: string) => {
    setConfig(prev => ({ ...prev, [roleId]: { ...prev[roleId], duration } }));
    // Auto-select tile when user interacts
    setSelected(prev => {
      if (prev.has(roleId)) return prev
      const next = new Set(prev)
      next.add(roleId)
      return next
    })
  }

  const updateCrewPerHour = (roleId: number, value?: number) => {
    setConfig(prev => ({ ...prev, [roleId]: { ...prev[roleId], crewPerHour: value } }));
  };

  return (
    <fieldset>
  <div className="mt-6 grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => {
          const isSelected = selected.has(role.roleId)
          const cfg = config[role.roleId] || { time: '', duration: '' }
          const hasTime = !!cfg.time
          const hasDuration = !!cfg.duration
          const hasCrewPerHour = typeof cfg.crewPerHour === 'number' && !Number.isNaN(cfg.crewPerHour)
          const isComplete = isSelected && hasTime && hasDuration && hasCrewPerHour
          const isLocked = lockedRoleIds.has(role.roleId) && needsMutualExclusion(role);
          
          return (
          <div
            key={role.roleId}
            aria-label={role.roleName}
            role="checkbox"
            aria-checked={isSelected}
            aria-disabled={isLocked}
            tabIndex={isLocked ? -1 : 0}
            onClick={() => !isLocked && toggle(role.roleId)}
            onKeyDown={(e) => {
              if (isLocked) return;
              if (e.key === ' ') {
                e.preventDefault()
                toggle(role.roleId)
              }
              if (e.key === 'Enter') {
                console.log('Enter pressed on role', role.roleId, 'isLocked:', isLocked);
                e.preventDefault()
                // Set default as true (select without toggling off)
                setSelected(prev => {
                  if (prev.has(role.roleId)) return prev
                  const next = new Set(prev)
                  next.add(role.roleId)
                  return next
                })
                // Optionally initialize default inputs so it's immediately valid-ish
                // Set only a default time; require user to pick duration
                if (!isLocked) {
                  setConfig(prev => ({
                    ...prev,
                    [role.roleId]: {
                      ...prev[role.roleId], // Preserve all existing fields (like crewPerHour)
                      time: prev[role.roleId]?.time ?? '10:00',
                      duration: prev[role.roleId]?.duration ?? '',
                    }
                  }))
                }
              }
            }}
            className={`group relative flex rounded-lg border bg-white px-4 py-[21px] ${
              isLocked
                ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                : isComplete
                ? 'border-gray-300 outline outline-2 -outline-offset-2 outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] bg-white cursor-pointer'
                : isSelected
                  ? 'border-gray-300 bg-gray-50 opacity-80 cursor-pointer'
                  : 'border-gray-300 bg-white cursor-pointer'
            }`}
          >
            {isLocked && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/5 rounded-lg pointer-events-none">
                <div className="bg-white px-3 py-1 rounded-md shadow-sm border border-gray-300">
                  <p className="text-xs font-medium text-gray-700">Configured in Step 3</p>
                </div>
              </div>
            )}
            <div className="flex-1">
              {/* Row container: left (title + crew available), right (counter + Crew/Hr) */}
              <div className="flex items-start justify-between gap-4">
                {/* Left stack: role name (with checkmark inline) + crew available */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="block text-sm font-medium text-gray-900 font-sans">{role.roleName}</span>
                    <CheckCircleIcon
                      aria-hidden="true"
                      className={`${isComplete ? 'visible' : 'invisible'} size-5 text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]`}
                    />
                  </div>
                  <p className="text-xs text-gray-600 font-sans">{role.crewCount} crew available</p>
                </div>
                {/* Right stack: counter + Crew/Hr */}
                <div className="inline-flex flex-col items-end gap-1">
                  {(() => {
                    const cfg = config[role.roleId] || {};
                    const ph = (role.roleName?.toLowerCase() === 'parking helms') ? '2' : '1';
                    const hasValue = typeof cfg.crewPerHour === 'number' && !Number.isNaN(cfg.crewPerHour);
                    const cls = hasValue
                      ? 'w-[2.75rem] rounded-md border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900 shadow-sm focus:border-gray-300 focus:outline-none focus:ring-0 focus:ring-transparent focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0'
                      : 'w-[2.75rem] rounded-md border border-gray-300 border-dashed bg-gray-50 px-2 py-1 text-xs text-gray-500 shadow-sm focus:border-gray-300 focus:outline-none focus:ring-0 focus:ring-transparent focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0';
                    return (
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        aria-label="Crew per hour"
                        placeholder={ph}
                        value={hasValue ? String(cfg.crewPerHour) : ''}
                        className={cls}
                        disabled={isLocked}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onFocus={(e) => {
                          e.currentTarget.style.outline = 'none';
                          e.currentTarget.style.outlineColor = 'transparent';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                        onChange={(e) => {
                          if (isLocked) return;
                          const val = e.target.value;
                          const numVal = val === '' ? undefined : Number(val);
                          updateCrewPerHour(role.roleId, numVal);
                        }}
                        onKeyDown={(e) => {
                          if (isLocked) return;
                          if (e.key === 'Enter') {
                            // Set placeholder as value on Enter
                            const target = e.currentTarget as HTMLInputElement;
                            updateCrewPerHour(role.roleId, Number(ph));
                            // Prevent form submission and card toggle
                            e.preventDefault();
                            e.stopPropagation();
                            // Reflect immediately in the input
                            target.value = ph;
                          }
                        }}
                      />
                    );
                  })()}
                  <span className="text-[11px] leading-4 text-gray-600 font-sans">Crew/Task</span>
                </div>
              </div>
              {/* Time picker + duration under title */}
              <form className="mt-3 max-w-xs" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <label htmlFor={`time-${role.roleId}`} className="block mb-2 text-xs font-medium text-gray-700 font-sans">
                  Start time:
                </label>
                <div className="flex">
                  <input
                    type="time"
                    id={`time-${role.roleId}`}
                    className={`rounded-none rounded-s-lg flex-1 block w-full pl-2.5 pr-1.5 py-2 bg-gray-50 border text-gray-900 text-sm focus:outline-none focus:outline-0 focus:ring-0 focus:ring-transparent focus:ring-offset-0 shadow-sm placeholder:text-gray-500 ${hasTime ? 'border-gray-300 focus:border-gray-300' : 'border-dashed border-gray-300 focus:border-gray-300'}`}
                    min="09:00"
                    max="18:00"
                    value={cfg.time || '10:00'}
                    disabled={isLocked}
                    onChange={(e) => {
                      if (isLocked) return;
                      // Keep focus while typing so users can enter both digits
                      updateTime(role.roleId, e.target.value)
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.outline = 'none'
                      e.currentTarget.style.outlineColor = 'transparent'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  />
                  <div className={`border-s-0 shrink-0 inline-flex items-center rounded-e-lg overflow-hidden ${hasDuration ? 'border border-gray-300' : 'border border-gray-300 border-dashed'}`}>
                    <select
                      aria-label="Duration"
                      className={`bg-gray-50 hover:bg-gray-100 text-gray-900 font-medium leading-5 text-sm pl-4 pr-8 py-2 appearance-none focus:outline-none focus:outline-0 focus:ring-0 focus:ring-transparent focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-transparent focus:shadow-none ${hasDuration ? '' : 'text-gray-500'} border-0 rounded-e-lg`}
                      style={{ outline: 'none', outlineColor: 'transparent', boxShadow: 'none', WebkitAppearance: 'none', WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                      value={cfg.duration}
                      disabled={isLocked}
                      onChange={(e) => {
                        if (isLocked) return;
                        updateDuration(role.roleId, e.target.value)
                        e.currentTarget.blur()
                      }}
                      onFocus={(e) => {
                        e.currentTarget.style.outline = 'none'
                        e.currentTarget.style.outlineColor = 'transparent'
                        e.currentTarget.style.boxShadow = 'none'
                      }}
                    >
                    <option value="" disabled>Duration</option>
                    <option value="60">1 hr</option>
                    <option value="120">2 hrs</option>
                    <option value="180">3 hrs</option>
                    <option value="240">4 hrs</option>
                    <option value="300">5 hrs</option>
                    <option value="360">6 hrs</option>
                    <option value="420">7 hrs</option>
                    <option value="480">8 hrs</option>
                    <option value="540">9 hrs</option>
                    <option value="600">10 hrs</option>
                    <option value="660">11 hrs</option>
                    <option value="720">12 hrs</option>
                    </select>
                  </div>
                </div>
              </form>
            </div>
          </div>
          )
        })}
      </div>
    </fieldset>
  )
}
