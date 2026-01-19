import { useState, useEffect, useMemo, useCallback } from 'react';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

type HourOption = {
  hour: number;
  label: string;
  crewAvailable: number;
  inStock: boolean;
};

type RoleWithCrew = {
  roleId: number;
  roleCode: string;
  roleName: string;
  crewCount: number;
  assignmentModel: string;
  allowOutsideStoreHours: boolean;
};

type StoreHours = {
  openMinutesFromMidnight: number;
  closeMinutesFromMidnight: number;
};

type HourlyRoleRowsProps = {
  hourlyData: HourOption[];
  roles: RoleWithCrew[];
  lockedRoleIds: Set<number>;
  onRoleConfigured: (roleId: number, isConfigured: boolean) => void;
  initialConstraints?: Record<number, Record<number, number>> | null;
  onHourlyConstraintsChange?: (entries: Array<{ roleId: number; hour: number; requiredPerHour: number; type: 'MIN' | 'EXACTLY' }>) => void;
  storeHours?: StoreHours | null;
};

export default function HourlyRoleRows({ hourlyData, roles, lockedRoleIds, onRoleConfigured, initialConstraints, onHourlyConstraintsChange, storeHours }: HourlyRoleRowsProps) {
  // Use the first available hour as default, or 8 if data is empty
  const defaultHour = hourlyData.find(h => h.inStock)?.hour ?? 8;
  const [selected, setSelected] = useState<number>(defaultHour);
  
  // Dynamic state: { [roleId]: { [hour]: string } }
  const [roleValues, setRoleValues] = useState<Record<number, Record<number, string>>>({});
  const [confirmedRoles, setConfirmedRoles] = useState<Record<number, Set<number>>>({});

  // Filter to hourly-type roles
  const hourlyRoles = useMemo(() => {
    return roles.filter(r => 
      r.assignmentModel === 'HOURLY' || 
      r.assignmentModel === 'HOURLY_OR_WINDOW' || 
      r.assignmentModel === 'HOURLY_AND_SOLVER'
    );
  }, [roles]);

  const allowedRoleIdsByHour = useMemo(() => {
    const result = new Map<number, Set<number>>();
    if (!roles.length) {
      return result;
    }

    const withinStoreHours = (hour: number) => {
      if (!storeHours) return true;
      const startMin = hour * 60;
      const endMin = (hour + 1) * 60;
      return startMin >= storeHours.openMinutesFromMidnight && endMin <= storeHours.closeMinutesFromMidnight;
    };

    roles.forEach((role) => {
      if (role.assignmentModel !== 'HOURLY' && role.assignmentModel !== 'HOURLY_OR_WINDOW' && role.assignmentModel !== 'HOURLY_AND_SOLVER') return;
      for (let hour = 0; hour < 24; hour++) {
        if (!role.allowOutsideStoreHours && !withinStoreHours(hour)) {
          continue;
        }
        if (!result.has(hour)) {
          result.set(hour, new Set());
        }
        result.get(hour)!.add(role.roleId);
      }
    });

    return result;
  }, [roles, storeHours]);

  const isHourEnabled = useCallback((option: HourOption) => {
    const allowedForHour = allowedRoleIdsByHour.get(option.hour);
    return Boolean(option.inStock && allowedForHour && allowedForHour.size > 0);
  }, [allowedRoleIdsByHour]);

  useEffect(() => {
    if (!hourlyData.length) return;
    const fallbackHour = hourlyData.find((option) => isHourEnabled(option))?.hour ?? hourlyData[0]?.hour;
    const hasSelected = hourlyData.some(option => option.hour === selected && isHourEnabled(option));
    if (!hasSelected && typeof fallbackHour === 'number') {
      setSelected(fallbackHour);
    }
  }, [hourlyData, selected, isHourEnabled]);

  const isRoleAllowedAtHour = useCallback((roleId: number, hour: number) => {
    const allowedForHour = allowedRoleIdsByHour.get(hour);
    return Boolean(allowedForHour && allowedForHour.has(roleId));
  }, [allowedRoleIdsByHour]);

  // HOURLY_OR_WINDOW roles need mutual exclusion - can only be configured in one step
  const needsMutualExclusion = (role: RoleWithCrew) => {
    return role.assignmentModel === 'HOURLY_OR_WINDOW';
  };

  const isRoleLocked = (role: RoleWithCrew) => {
    return lockedRoleIds.has(role.roleId) && needsMutualExclusion(role);
  };

  // Watch for value changes and notify parent
  useEffect(() => {
    hourlyRoles.forEach(role => {
      const values = roleValues[role.roleId] || {};
      const hasAnyValue = Object.values(values).some(v => v && v !== '');
      onRoleConfigured(role.roleId, hasAnyValue);
    });
  }, [roleValues, hourlyRoles, onRoleConfigured]);

  // Hydrate from persisted constraints
  useEffect(() => {
    if (!initialConstraints) return;
    const nextValues: Record<number, Record<number, string>> = {};
    const nextConfirmed: Record<number, Set<number>> = {};
    
    hourlyRoles.forEach(role => {
      if (initialConstraints[role.roleId]) {
        nextValues[role.roleId] = {};
        nextConfirmed[role.roleId] = new Set();
        Object.entries(initialConstraints[role.roleId]).forEach(([hour, value]) => {
          nextValues[role.roleId][Number(hour)] = String(value);
          nextConfirmed[role.roleId].add(Number(hour));
        });
      }
    });
    
    setRoleValues(nextValues);
    setConfirmedRoles(nextConfirmed);
  }, [initialConstraints, hourlyRoles]);

  // Bubble up normalized entries
  useEffect(() => {
    if (!onHourlyConstraintsChange) return;
    const entries: Array<{ roleId: number; hour: number; requiredPerHour: number; type: 'MIN' | 'EXACTLY' }> = [];

    hourlyRoles.forEach(role => {
      const values = roleValues[role.roleId] || {};
      Object.entries(values).forEach(([hourStr, value]) => {
        const parsed = Number(value);
        const parsedHour = Number(hourStr);
        if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsedHour)) return;
        if (!isRoleAllowedAtHour(role.roleId, parsedHour)) return;
        entries.push({ roleId: role.roleId, hour: parsedHour, requiredPerHour: Math.round(parsed), type: 'MIN' });
      });
    });

    onHourlyConstraintsChange(entries);
  }, [roleValues, hourlyRoles, onHourlyConstraintsChange, isRoleAllowedAtHour]);

  const selectedOption = hourlyData.find(opt => opt.hour === selected);
  const allowedRolesForSelectedHour = allowedRoleIdsByHour.get(selected) ?? new Set<number>();

  const getRoleValue = (roleId: number, hour: number) => roleValues[roleId]?.[hour] ?? '';
  const isRoleConfirmedAtHour = (roleId: number, hour: number) => confirmedRoles[roleId]?.has(hour) ?? false;

  const handleRoleChange = (roleId: number, value: string) => {
    const role = hourlyRoles.find(r => r.roleId === roleId);
    if (!role || isRoleLocked(role) || !allowedRolesForSelectedHour.has(roleId)) return;
    
    setRoleValues(prev => ({
      ...prev,
      [roleId]: { ...(prev[roleId] || {}), [selected]: value }
    }));
    setConfirmedRoles(prev => ({
      ...prev,
      [roleId]: new Set(prev[roleId] || []).add(selected)
    }));
  };

  const handleRoleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>, roleId: number) => {
    const role = hourlyRoles.find(r => r.roleId === roleId);
    if (!role || isRoleLocked(role) || !allowedRolesForSelectedHour.has(roleId)) return;
    if (e.key === 'Enter') {
      const value = getRoleValue(roleId, selected);
      if (!value) {
        handleRoleChange(roleId, '0');
      }
    }
  };

  // Get roles that are allowed at the selected hour, sorted: HOURLY first, then HOURLY_AND_SOLVER, then HOURLY_OR_WINDOW
  const rolesForSelectedHour = useMemo(() => {
    const filtered = hourlyRoles.filter(role => allowedRolesForSelectedHour.has(role.roleId));
    const order: Record<string, number> = { 'HOURLY': 0, 'HOURLY_AND_SOLVER': 1, 'HOURLY_OR_WINDOW': 2 };
    return filtered.sort((a, b) => (order[a.assignmentModel] ?? 99) - (order[b.assignmentModel] ?? 99));
  }, [hourlyRoles, allowedRolesForSelectedHour]);

  return (
    <div className="flex flex-row gap-6 items-stretch pt-4">
      {/* Left card - 50% */}
      <div className="w-[50%] ai-glass-border rounded-[1.5rem]" style={{ ...aiGlassLightBorderStyle('1.5rem'), overflow: 'hidden' }}>
        <div className="rounded-[1.5rem]" style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '20px' }}>
          {selectedOption && (
            <div className="space-y-4">
              {/* Hour display + crew available in glass pill card */}
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('1.5rem') }}>
                <div style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '16px' }}>
                  <div className="flex items-center gap-3">
                    <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
                      <div style={{ ...aiGlassLightContentStyle('9999px', 0.6), padding: '8px 16px' }}>
                        <h3 className="text-xl font-semibold text-gray-900 font-sans">{selectedOption.label}</h3>
                      </div>
                    </div>
                    <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px', '34, 197, 94', 0.4), width: 'fit-content' }}>
                      <div style={{ ...aiGlassLightContentStyle('9999px', 0.6), backgroundColor: 'rgba(34, 197, 94, 0.08)', padding: '4px 12px' }}>
                        <span className="text-xs font-medium font-sans" style={{ color: 'rgb(22, 163, 74)' }}>{selectedOption.crewAvailable} crew available</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Role inputs in glass pill card - 2 per row */}
              <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('1.5rem') }}>
                <div style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '20px' }}>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {rolesForSelectedHour.map(role => {
                      const locked = isRoleLocked(role);
                      const confirmed = isRoleConfirmedAtHour(role.roleId, selected);
                      const value = getRoleValue(role.roleId, selected);

                      return (
                        <div key={role.roleId} className="relative">
                          <label htmlFor={`role-${role.roleId}`} className="block text-sm font-medium text-gray-700 mb-2 font-sans">
                            {role.roleName}
                            {role.assignmentModel === 'HOURLY_AND_SOLVER' && (
                              <span className="ml-1 text-xs text-gray-500">(Minimum)</span>
                            )}
                          </label>
                          <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), overflow: 'hidden' }}>
                            <div style={{ ...aiGlassLightContentStyle('9999px', 0.6) }}>
                              <input
                                type="number"
                                id={`role-${role.roleId}`}
                                min="0"
                                max={selectedOption.crewAvailable}
                                value={value}
                                onChange={(e) => handleRoleChange(role.roleId, e.target.value)}
                                onKeyDown={(e) => handleRoleKeyPress(e, role.roleId)}
                                disabled={locked}
                                className={`block w-full rounded-full px-4 py-2 text-sm border-0 focus:outline-none focus:ring-0 ${
                                  locked
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : !confirmed
                                    ? 'bg-gray-50 text-gray-500'
                                    : 'bg-white text-gray-900'
                                }`}
                                placeholder="0"
                                style={{ outline: 'none', boxShadow: 'none' }}
                              />
                            </div>
                          </div>
                          {locked && (
                            <p className="text-xs mt-1 font-sans font-normal" style={{ color: 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))' }}>Configured in Step 1</p>
                          )}
                        </div>
                      );
                    })}
                    {rolesForSelectedHour.length === 0 && (
                      <p className="text-sm text-gray-500 font-sans">No HOURLY roles are available at this hour. Pick a different time to set staffing.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right: buttons container - 50% */}
      <div className="w-[50%] ai-glass-border rounded-[1.5rem]" style={{ ...aiGlassLightBorderStyle('1.5rem'), overflow: 'hidden' }}>
        <div className="rounded-[1.5rem]" style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '20px' }}>
          <div role="radiogroup" aria-label="Choose a memory option" className="grid grid-cols-4 gap-3">
            {hourlyData.map(option => {
              const isSelected = selected === option.hour;
              const enabled = isHourEnabled(option);
              return (
                <div
                  key={option.hour}
                  className={`${isSelected ? '' : 'ai-glass-border'} rounded-[1rem]`}
                  style={isSelected
                    ? { borderRadius: '1rem', position: 'relative' as const, overflow: 'hidden', boxShadow: '0 0 0 1.6px hsl(var(--brand-h) var(--brand-s) var(--brand-l)), 0 4px 24px rgba(0, 0, 0, 0.06)' }
                    : { ...aiGlassLightBorderStyle('1rem', '0, 0, 0', 0.08, '1.6px'), overflow: 'hidden' }}
                >
                  <button
                    role="radio"
                    aria-checked={isSelected}
                    disabled={!enabled}
                    onClick={() => enabled && setSelected(option.hour)}
                    className={`w-full relative flex items-center justify-center rounded-[1rem] p-3 text-sm font-medium uppercase transition-colors
                      ${isSelected ? 'bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] text-white' : 'bg-white text-gray-900 hover:bg-gray-50'}
                      ${!enabled ? 'opacity-40 cursor-not-allowed' : ''}
                      focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]`}
                    style={{ fontFamily: 'var(--font-sans)' }}
                  >
                    {option.label}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
