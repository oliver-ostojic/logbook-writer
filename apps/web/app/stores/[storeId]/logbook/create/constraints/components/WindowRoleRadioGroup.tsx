import { useState, useEffect, useCallback } from 'react'
import { CheckCircleIcon } from '@heroicons/react/20/solid'
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass'

type RoleWithCrew = {
  roleId: number;
  roleCode: string;
  roleName: string;
  crewCount: number;
  assignmentModel: string;
};

type ConstraintRule = 'MIN' | 'MAX' | 'EXACTLY';

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
  onConstraintChange?: (roleId: number, value?: { roleId: number; startHour: number; endHour: number; requiredPerHour: number; constraintRule: ConstraintRule }) => void;
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

  // Helper to check if role can be configured in both Window (Step 1) and Hourly (Step 3)
  // HOURLY_OR_WINDOW roles need mutual exclusion - can only be configured in one step
  const needsMutualExclusion = (role: RoleWithCrew) => {
    return role.assignmentModel === 'HOURLY_OR_WINDOW';
  };

  const isRoleComplete = useCallback((roleId: number) => {
    if (!selected.has(roleId)) return false;
    const cfg = config[roleId];
    if (!cfg) return false;
    return !!cfg.duration && cfg.duration.trim() !== '';
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
      // Parse both hour and minute from time string (e.g., "10:30")
      const timeParts = (cfg.time ?? '0:00').split(':');
      const hourPart = Number.parseInt(timeParts[0] ?? '0', 10);
      const minutePart = Number.parseInt(timeParts[1] ?? '0', 10);
      const startMinutes = hourPart * 60 + minutePart;  // Total minutes from midnight
      const durationMinutes = Number(cfg.duration);
      if (!Number.isFinite(startMinutes) || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
        onConstraintChange(role.roleId, undefined);
        return;
      }
      const endMinutes = startMinutes + durationMinutes;
      // Clamp to valid day range (0 to 1440 = 24 hours)
      const normalizedStart = Math.max(0, Math.min(1440, startMinutes));
      const normalizedEnd = Math.max(normalizedStart + 30, Math.min(1440, endMinutes));

      onConstraintChange(role.roleId, {
        roleId: role.roleId,
        startHour: normalizedStart,  // Now in minutes, but keeping prop name for compatibility
        endHour: normalizedEnd,      // Now in minutes, but keeping prop name for compatibility
        requiredPerHour: Math.max(1, cfg.crewPerHour ?? 1),
        constraintRule: 'EXACTLY',
      });
    });
  }, [config, selected, roles, onConstraintChange, isRoleComplete]);

  const applyDefaults = (roleId: number) => {
    setConfig(prev => {
      const existing = prev[roleId] ?? {};
      return {
        ...prev,
        [roleId]: { ...existing, time: existing.time ?? '10:00', crewPerHour: existing.crewPerHour ?? 1 },
      };
    });
  };

  const toggle = (roleId: number) => {
    const isAdding = !selected.has(roleId);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
    if (isAdding) applyDefaults(roleId);
  };

  const updateTime = (roleId: number, time: string) => {
    setConfig(prev => ({ ...prev, [roleId]: { ...prev[roleId], time } }));
    setSelected(prev => {
      if (prev.has(roleId)) return prev;
      const next = new Set(prev);
      next.add(roleId);
      return next;
    });
  };

  const updateDuration = (roleId: number, duration: string) => {
    setConfig(prev => {
      const existing = prev[roleId] ?? {};
      return {
        ...prev,
        [roleId]: { ...existing, time: existing.time ?? '10:00', crewPerHour: existing.crewPerHour ?? 1, duration },
      };
    });
    setSelected(prev => {
      if (prev.has(roleId)) return prev;
      const next = new Set(prev);
      next.add(roleId);
      return next;
    });
  };

  const updateCrewPerHour = (roleId: number, value?: number) => {
    setConfig(prev => ({ ...prev, [roleId]: { ...prev[roleId], crewPerHour: value } }));
  };

  return (
    <fieldset>
  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role, roleIndex) => {
          const isSelected = selected.has(role.roleId)
          const cfg = config[role.roleId] || { time: '', duration: '' }
          const hasDuration = !!cfg.duration
          const hasCrewPerHour = typeof cfg.crewPerHour === 'number' && !Number.isNaN(cfg.crewPerHour)
          const isComplete = isSelected && hasDuration
          const isLocked = lockedRoleIds.has(role.roleId) && needsMutualExclusion(role);

          return (
          <div
            key={role.roleId}
            data-tutorial-id={roleIndex === 0 ? 'constraints-role-card' : undefined}
            className={`${isSelected ? '' : 'ai-glass-border'} rounded-[1.5rem] ${
              isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
            }`}
            style={isSelected
              ? { borderRadius: '1.5rem', position: 'relative' as const, overflow: 'hidden', boxShadow: '0 0 0 1.6px hsl(var(--brand-h) var(--brand-s) var(--brand-l)), 0 4px 24px rgba(0, 0, 0, 0.06)' }
              : { ...aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08), overflow: 'hidden' }}
          >
          <div
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
                e.preventDefault()
                if (!selected.has(role.roleId)) {
                  setSelected(prev => {
                    const next = new Set(prev);
                    next.add(role.roleId);
                    return next;
                  });
                  applyDefaults(role.roleId);
                }
              }
            }}
            className="group relative flex px-6 py-6 rounded-[1.5rem]"
            style={{
              background: 'white',
            }}
          >
            {isLocked && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900/5 rounded-[1.5rem] pointer-events-none">
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
                {/* Right stack: counter + Crew/Hr label below */}
                <div className="flex flex-col items-center gap-1">
                  <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px') }}>
                    <div style={{ ...aiGlassLightContentStyle('9999px', 0.6) }}>
                      {(() => {
                        const cfg = config[role.roleId] || {};
                        const ph = '1';
                        const hasValue = typeof cfg.crewPerHour === 'number' && !Number.isNaN(cfg.crewPerHour);
                        const cls = hasValue
                          ? 'w-[3rem] rounded-full bg-white px-3 py-1 text-xs text-gray-900 text-center focus:outline-none focus:ring-0 focus:ring-transparent focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 border-0'
                          : 'w-[3rem] rounded-full bg-gray-50 px-3 py-1 text-xs text-gray-500 text-center focus:outline-none focus:ring-0 focus:ring-transparent focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 border-0';
                        return (
                          <input
                            type="text"
                            pattern="[0-9]*"
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
                              const val = e.target.value.replace(/[^0-9]/g, '');
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
                    </div>
                  </div>
                  <span className="text-xs font-medium text-gray-700 font-sans">Crew/Min</span>
                </div>
              </div>
              {/* Time picker + duration under title */}
              <form className="mt-3 max-w-xs" onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
                <label htmlFor={`time-${role.roleId}`} className="block mb-2 text-xs font-medium text-gray-700 font-sans">
                  Start time:
                </label>
                <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px') }}>
                  <div style={{ ...aiGlassLightContentStyle('9999px', 0.6) }}>
                    <div className="flex items-center">
                      <input
                        type="time"
                        id={`time-${role.roleId}`}
                        className="rounded-none rounded-l-full flex-1 block w-full pl-4 pr-1.5 py-2 bg-gray-50 text-gray-900 text-sm focus:outline-none focus:outline-0 focus:ring-0 focus:ring-transparent focus:ring-offset-0 placeholder:text-gray-500 border-0"
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
                      {/* Faded divider line */}
                      <div
                        style={{
                          width: 1,
                          height: 24,
                          background: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.1) 20%, rgba(0,0,0,0.1) 80%, transparent 100%)',
                        }}
                      />
                      <div className="shrink-0 inline-flex items-center rounded-r-full overflow-hidden">
                        <select
                          aria-label="Duration"
                          className={`bg-gray-50 hover:bg-gray-100 text-gray-900 font-medium leading-5 text-sm pl-4 pr-8 py-2 appearance-none focus:outline-none focus:outline-0 focus:ring-0 focus:ring-transparent focus:ring-offset-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-transparent focus:shadow-none ${hasDuration ? '' : 'text-gray-500'} border-0 rounded-r-full`}
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
                  </div>
                </div>
              </form>
            </div>
          </div>
          </div>
          )
        })}
      </div>
    </fieldset>
  )
}
