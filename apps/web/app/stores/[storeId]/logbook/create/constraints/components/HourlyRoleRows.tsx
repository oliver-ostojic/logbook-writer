import { useState, useEffect, useMemo, useCallback } from 'react';

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
  onHourlyConstraintsChange?: (entries: Array<{ roleId: number; hour: number; requiredPerHour: number }>) => void;
  storeHours?: StoreHours | null;
};

export default function HourlyRoleRows({ hourlyData, roles, lockedRoleIds, onRoleConfigured, initialConstraints, onHourlyConstraintsChange, storeHours }: HourlyRoleRowsProps) {
  // Use the first available hour as default, or 8 if data is empty
  const defaultHour = hourlyData.find(h => h.inStock)?.hour ?? 8;
  const [selected, setSelected] = useState<number>(defaultHour);
  const [registerValues, setRegisterValues] = useState<Record<number, string>>({});
  const [parkingHelmsValues, setParkingHelmsValues] = useState<Record<number, string>>({});
  const [confirmedRegister, setConfirmedRegister] = useState<Set<number>>(new Set());
  const [confirmedParkingHelms, setConfirmedParkingHelms] = useState<Set<number>>(new Set());

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
      // Roles with HOURLY or HOURLY_OR_WINDOW assignment model can be configured in Step 3
      if (role.assignmentModel !== 'HOURLY' && role.assignmentModel !== 'HOURLY_OR_WINDOW') return;
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

  // Find the roles that need mutual exclusion and have HOURLY assignment
  const registerRole = roles.find(r => r.roleCode === 'REGISTER' || r.roleName.toLowerCase().includes('register'));
  const parkingHelmsRole = roles.find(r => r.roleCode === 'PARKING_HELM' || r.roleName.toLowerCase().includes('parking helm'));
  
  // HOURLY_OR_WINDOW roles need mutual exclusion - can only be configured in one step
  const needsMutualExclusion = (role: RoleWithCrew | undefined) => {
    if (!role) return false;
    return role.assignmentModel === 'HOURLY_OR_WINDOW';
  };

  const isRegisterLocked = registerRole && lockedRoleIds.has(registerRole.roleId) && needsMutualExclusion(registerRole);
  const isParkingHelmsLocked = parkingHelmsRole && lockedRoleIds.has(parkingHelmsRole.roleId) && needsMutualExclusion(parkingHelmsRole);

  // Watch for value changes and notify parent when any hour has a value
  useEffect(() => {
    if (registerRole) {
      const hasAnyRegisterValue = Object.values(registerValues).some(v => v && v !== '');
      onRoleConfigured(registerRole.roleId, hasAnyRegisterValue);
    }
    if (parkingHelmsRole) {
      const hasAnyParkingHelmsValue = Object.values(parkingHelmsValues).some(v => v && v !== '');
      onRoleConfigured(parkingHelmsRole.roleId, hasAnyParkingHelmsValue);
    }
  }, [registerValues, parkingHelmsValues, registerRole, parkingHelmsRole, onRoleConfigured]);

  // Hydrate from persisted constraints
  useEffect(() => {
    if (!initialConstraints) return;
    if (registerRole && initialConstraints[registerRole.roleId]) {
      const nextValues: Record<number, string> = {};
      Object.entries(initialConstraints[registerRole.roleId]).forEach(([hour, value]) => {
        nextValues[Number(hour)] = String(value);
      });
      setRegisterValues(nextValues);
      setConfirmedRegister(new Set(Object.keys(nextValues).map(Number)));
    } else if (registerRole) {
      setRegisterValues({});
      setConfirmedRegister(new Set());
    }
    if (parkingHelmsRole && initialConstraints[parkingHelmsRole.roleId]) {
      const nextValues: Record<number, string> = {};
      Object.entries(initialConstraints[parkingHelmsRole.roleId]).forEach(([hour, value]) => {
        nextValues[Number(hour)] = String(value);
      });
      setParkingHelmsValues(nextValues);
      setConfirmedParkingHelms(new Set(Object.keys(nextValues).map(Number)));
    } else if (parkingHelmsRole) {
      setParkingHelmsValues({});
      setConfirmedParkingHelms(new Set());
    }
  }, [initialConstraints, registerRole, parkingHelmsRole]);

  // Bubble up normalized entries
  useEffect(() => {
    if (!onHourlyConstraintsChange) return;
    const entries: Array<{ roleId: number; hour: number; requiredPerHour: number }> = [];

    if (registerRole) {
      Object.entries(registerValues).forEach(([hourStr, value]) => {
        const parsed = Number(value);
        const parsedHour = Number(hourStr);
        if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsedHour)) return;
        if (!isRoleAllowedAtHour(registerRole.roleId, parsedHour)) return;
        entries.push({ roleId: registerRole.roleId, hour: parsedHour, requiredPerHour: Math.round(parsed) });
      });
    }
    if (parkingHelmsRole) {
      Object.entries(parkingHelmsValues).forEach(([hourStr, value]) => {
        const parsed = Number(value);
        const parsedHour = Number(hourStr);
        if (!Number.isFinite(parsed) || parsed <= 0 || !Number.isInteger(parsedHour)) return;
        if (!isRoleAllowedAtHour(parkingHelmsRole.roleId, parsedHour)) return;
        entries.push({ roleId: parkingHelmsRole.roleId, hour: parsedHour, requiredPerHour: Math.round(parsed) });
      });
    }

    onHourlyConstraintsChange(entries);
  }, [registerValues, parkingHelmsValues, registerRole, parkingHelmsRole, onHourlyConstraintsChange, isRoleAllowedAtHour]);

  const selectedOption = hourlyData.find(opt => opt.hour === selected);
  const allowedRolesForSelectedHour = allowedRoleIdsByHour.get(selected) ?? new Set<number>();

  // Get value with default
  const getRegisterValue = (hour: number) => registerValues[hour] ?? '';
  const getParkingHelmsValue = (hour: number) => parkingHelmsValues[hour] ?? '';
  
  const isRegisterConfirmed = confirmedRegister.has(selected);
  const isParkingHelmsConfirmed = confirmedParkingHelms.has(selected);
  const isRegisterAllowedAtHour = registerRole ? allowedRolesForSelectedHour.has(registerRole.roleId) : false;
  const isParkingAllowedAtHour = parkingHelmsRole ? allowedRolesForSelectedHour.has(parkingHelmsRole.roleId) : false;

  const handleRegisterChange = (value: string) => {
    if (isRegisterLocked || !isRegisterAllowedAtHour) return;
    setRegisterValues({ ...registerValues, [selected]: value });
    setConfirmedRegister(new Set(confirmedRegister).add(selected));
  };

  const handleRegisterKeyPress = (e: React.KeyboardEvent<HTMLInputElement>, value: string, setValue: (val: string) => void) => {
    if (isRegisterLocked || !isRegisterAllowedAtHour) return;
    if (e.key === 'Enter') {
      if (!value) {
        setValue('0');
      }
    }
  };

  const handleParkingHelmsChange = (value: string) => {
    if (isParkingHelmsLocked || !isParkingAllowedAtHour) return;
    setParkingHelmsValues({ ...parkingHelmsValues, [selected]: value });
    setConfirmedParkingHelms(new Set(confirmedParkingHelms).add(selected));
  };

  const handleParkingHelmsKeyPress = (e: React.KeyboardEvent<HTMLInputElement>, value: string, setValue: (val: string) => void) => {
    if (isParkingHelmsLocked || !isParkingAllowedAtHour) return;
    if (e.key === 'Enter') {
      if (!value) {
        setValue('0');
      }
    }
  };

  return (
    <div className="flex flex-row gap-10 items-stretch pt-4">
      {/* Left card - 50% */}
      <div className="w-[50%] bg-white border border-gray-300 rounded-lg p-6 shadow-sm">
        {selectedOption && (
          <div className="space-y-6">
            {/* Hour display */}
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{selectedOption.label}</h3>
              <p className="text-sm text-gray-600 mt-1 font-sans">{selectedOption.crewAvailable} crew available</p>
            </div>

            {/* Register and Parking Helms inputs in a row */}
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Register input */}
              {registerRole && isRegisterAllowedAtHour && (
                <div className="flex-1 relative">
                  <label htmlFor="register" className="block text-sm font-medium text-gray-700 mb-2">
                    Register
                    {isRegisterLocked && (
                      <span className="ml-2 text-xs text-gray-500">(Configured in Step 1)</span>
                    )}
                  </label>
                  <input
                    type="number"
                    id="register"
                    min="0"
                    max={selectedOption.crewAvailable}
                    value={getRegisterValue(selected)}
                    onChange={(e) => handleRegisterChange(e.target.value)}
                    onKeyDown={(e) => handleRegisterKeyPress(e, getRegisterValue(selected), (val) => handleRegisterChange(val))}
                    disabled={isRegisterLocked}
                    className={`block w-full rounded-md shadow-sm border px-3 py-2 sm:text-sm ${
                      isRegisterLocked
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : !isRegisterConfirmed 
                        ? 'bg-gray-100 text-gray-500 border-gray-300 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] focus:border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]' 
                        : 'bg-white border-gray-300 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] focus:border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]'
                    }`}
                    placeholder="0"
                  />
                </div>
              )}

              {/* Parking Helms input */}
              {parkingHelmsRole && isParkingAllowedAtHour && (
                <div className="flex-1 relative">
                  <label htmlFor="parkingHelms" className="block text-sm font-medium text-gray-700 mb-2">
                    Parking Helms
                  </label>
                  <input
                    type="number"
                    id="parkingHelms"
                    min="0"
                    max={selectedOption.crewAvailable}
                    value={getParkingHelmsValue(selected)}
                    onChange={(e) => handleParkingHelmsChange(e.target.value)}
                    onKeyDown={(e) => handleParkingHelmsKeyPress(e, getParkingHelmsValue(selected), (val) => handleParkingHelmsChange(val))}
                    disabled={isParkingHelmsLocked}
                    className={`block w-full rounded-md shadow-sm border px-3 py-2 sm:text-sm ${
                      isParkingHelmsLocked
                        ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                        : !isParkingHelmsConfirmed 
                        ? 'bg-gray-100 text-gray-500 border-gray-300 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] focus:border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]'
                        : 'bg-white border-gray-300 focus:outline-none focus:ring-1 focus:ring-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] focus:border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]'
                    }`}
                    placeholder="0"
                  />
                  {isParkingHelmsLocked && (
                    <p className="text-xs mt-1 font-sans font-normal" style={{ color: 'hsl(var(--brand-h) var(--brand-s) var(--brand-l))' }}>Configured in Step 1</p>
                  )}
                </div>
              )}
              {!((registerRole && isRegisterAllowedAtHour) || (parkingHelmsRole && isParkingAllowedAtHour)) && (
                <p className="text-sm text-gray-500">No HOURLY roles are available at this hour. Pick a different time to set staffing.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Right: buttons container - 50% */}
      <div className="w-[50%]">
        <div role="radiogroup" aria-label="Choose a memory option" className="grid grid-cols-4 gap-3">
          {hourlyData.map(option => {
            const isSelected = selected === option.hour;
            const enabled = isHourEnabled(option);
            return (
              <button
                key={option.hour}
                role="radio"
                aria-checked={isSelected}
                disabled={!enabled}
                onClick={() => enabled && setSelected(option.hour)}
                className={`relative flex items-center justify-center rounded-md border p-3 text-sm font-medium uppercase transition-colors
                  ${isSelected ? 'bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] text-white hover:bg-[hsl(var(--brand-h)_var(--brand-s)_calc(var(--brand-l)_-_5%))]' : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-50'}
                  ${!enabled ? 'opacity-40 cursor-not-allowed' : ''}
                  focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
