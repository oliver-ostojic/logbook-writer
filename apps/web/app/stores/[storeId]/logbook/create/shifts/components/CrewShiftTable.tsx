"use client";
import { useState, useMemo, useEffect } from "react";
import { BarsArrowUpIcon, BarsArrowDownIcon } from '@heroicons/react/20/solid';
import { aiGlassLightBorderStyle } from '@/components/ui/ai-glass';

type CrewMember = {
  id: number;
  name: string;
  email: string;
  crewId: string;
};

type CrewShiftTableProps = {
  selectedCrew: CrewMember[];
  onRemoveCrew: (crewId: string) => void;
  initialShiftTimes?: ShiftTimes;
  onShiftTimesChange?: (t: ShiftTimes) => void;
};

type SortField = 'name' | 'start' | null;

type ShiftTimes = {
  [key: string]: { start: string; end: string };
};

// NOTE: Accept props as any to avoid overzealous "serializable props" checks in certain analyzers
export default function CrewShiftTable(props: any) {
  const { selectedCrew, onRemoveCrew, initialShiftTimes, onShiftTimesChange } = props as CrewShiftTableProps;
  const [primarySort, setPrimarySort] = useState<SortField>(null);
  const [nameSortAsc, setNameSortAsc] = useState(true);
  const [startSortAsc, setStartSortAsc] = useState(true);
  const [shiftTimes, setShiftTimes] = useState<ShiftTimes>({});

  // Helper function to add 8 hours to a time string
  const addEightHours = (timeString: string): string => {
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    date.setHours(date.getHours() + 8);
    
    const newHours = String(date.getHours()).padStart(2, '0');
    const newMinutes = String(date.getMinutes()).padStart(2, '0');
    return `${newHours}:${newMinutes}`;
  };

  // Initialize shift times for new crew members
  useEffect(() => {
    const newTimes: ShiftTimes = { ...shiftTimes };
    let hasChanges = false;
    selectedCrew.forEach((person) => {
      if (!newTimes[person.crewId]) {
        newTimes[person.crewId] = { start: '09:00', end: '18:00' };
        hasChanges = true;
      }
    });
    if (hasChanges) {
      setShiftTimes(newTimes);
      onShiftTimesChange?.(newTimes);
    }
  }, [selectedCrew]);

  // Apply initial shift times from backend when provided
  useEffect(() => {
    if (!initialShiftTimes) return;
    const merged: ShiftTimes = { ...shiftTimes };
    for (const [k, v] of Object.entries(initialShiftTimes)) {
      merged[k] = { start: v.start, end: v.end };
    }
    setShiftTimes(merged);
    onShiftTimesChange?.(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialShiftTimes]);

  const sortedCrew = useMemo(() => {
    if (!primarySort) return selectedCrew;
    
    const copy = [...selectedCrew];
    copy.sort((a, b) => {
      // Determine which field to use as primary and secondary
      const isPrimaryName = primarySort === 'name';
      const primaryField = isPrimaryName ? 'name' : 'start';
      const secondaryField = isPrimaryName ? 'start' : 'name';
      
      // Primary sort
      let primaryResult = 0;
      if (primaryField === 'name') {
        primaryResult = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
        if (!nameSortAsc) primaryResult = -primaryResult;
      } else {
        const aTime = shiftTimes[a.crewId]?.start || '09:00';
        const bTime = shiftTimes[b.crewId]?.start || '09:00';
        primaryResult = aTime.localeCompare(bTime);
        if (!startSortAsc) primaryResult = -primaryResult;
      }

      // If primary values are equal, use secondary sort
      if (primaryResult === 0) {
        let secondaryResult = 0;
        if (secondaryField === 'name') {
          secondaryResult = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          if (!nameSortAsc) secondaryResult = -secondaryResult;
        } else {
          const aTime = shiftTimes[a.crewId]?.start || '09:00';
          const bTime = shiftTimes[b.crewId]?.start || '09:00';
          secondaryResult = aTime.localeCompare(bTime);
          if (!startSortAsc) secondaryResult = -secondaryResult;
        }
        return secondaryResult;
      }

      return primaryResult;
    });
    return copy;
  }, [selectedCrew, primarySort, nameSortAsc, startSortAsc, shiftTimes]);

  const handleSort = (field: SortField) => {
    if (primarySort === field) {
      // Toggle the direction of the current primary field
      if (field === 'name') {
        setNameSortAsc(!nameSortAsc);
      } else if (field === 'start') {
        setStartSortAsc(!startSortAsc);
      }
    } else {
      // Change primary sort field
      setPrimarySort(field);
    }
  };

  return (
    <div className="mt-[26px]">
      <div
        className="ai-glass-border overflow-hidden rounded-[1rem]"
        style={aiGlassLightBorderStyle('1rem', '0, 0, 0', 0.08)}
      >
        <div className="max-h-[480px] overflow-y-auto">
          <table className="relative min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6 w-auto">
                  <div className="flex items-center gap-2">
                    <span>Name</span>
                    <button
                      type="button"
                      onClick={() => handleSort('name')}
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-1 text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
                    >
                      {nameSortAsc ? (
                        <BarsArrowUpIcon className={`size-4 ${primarySort === 'name' ? '' : 'opacity-40'}`} aria-hidden="true" />
                      ) : (
                        <BarsArrowDownIcon className={`size-4 ${primarySort === 'name' ? '' : 'opacity-40'}`} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-48">
                  <div className="flex items-center gap-2">
                    <span>Shift Start</span>
                    <button
                      type="button"
                      onClick={() => handleSort('start')}
                      className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-1 text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
                    >
                      {startSortAsc ? (
                        <BarsArrowUpIcon className={`size-4 ${primarySort === 'start' ? '' : 'opacity-40'}`} aria-hidden="true" />
                      ) : (
                        <BarsArrowDownIcon className={`size-4 ${primarySort === 'start' ? '' : 'opacity-40'}`} aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900 w-48">Shift End</th>
                <th scope="col" className="py-3.5 pl-3 pr-4 text-right sm:pr-6 w-20">
                  <span className="sr-only">Delete</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {sortedCrew.length === 0 ? (
                <tr className="opacity-50">
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-400 italic sm:pl-6">
                    No selection
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex">
                      <input
                        type="time"
                        disabled
                        className="rounded-none rounded-s-lg block w-full pl-2.5 pr-1.5 py-2 bg-gray-100 border border-gray-300 text-gray-400 text-sm cursor-not-allowed"
                        value="09:00"
                      />
                      <span className="inline-flex items-center px-2 text-sm text-gray-400 bg-gray-100 border rounded-s-0 border-s-0 border-gray-300 rounded-e-md">
                        <svg className="w-4 h-4 text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex">
                      <input
                        type="time"
                        disabled
                        className="rounded-none rounded-s-lg flex-1 block w-full pl-2.5 pr-1.5 py-2 bg-gray-100 border border-gray-300 text-gray-400 text-sm cursor-not-allowed"
                        value="18:00"
                      />
                      <span className="inline-flex items-center px-2 text-sm text-gray-400 bg-gray-100 border rounded-s-0 border-s-0 border-gray-300 rounded-e-md">
                        <svg className="w-4 h-4 text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <button
                      type="button"
                      disabled
                      className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-gray-50 p-2 text-gray-300 cursor-not-allowed"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M5 7H19M10 11V17M14 11V17M6 7L7 19C7.10557 20.6569 8.34315 22 10 22H14C15.6569 22 16.8944 20.6569 17 19L18 7M9 7L10 5C10.5523 4.44772 11.4477 4 12 4C12.5523 4 13.4477 4.44772 14 5L15 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    </button>
                  </td>
                </tr>
              ) : sortedCrew.map((person, index) => {
                const isFirst = index === 0;
                const prevPerson = isFirst ? null : sortedCrew[index - 1];
                const prevStart = prevPerson ? (shiftTimes[prevPerson.crewId]?.start || '09:00') : null;
                const prevEnd = prevPerson ? (shiftTimes[prevPerson.crewId]?.end || '18:00') : null;
                
                const copyStartFromAbove = () => {
                  if (!prevStart) return;
                  const newEndTime = addEightHours(prevStart);
                  setShiftTimes(prev => {
                    const next = { ...prev, [person.crewId]: { start: prevStart, end: newEndTime } };
                    onShiftTimesChange?.(next);
                    return next;
                  });
                };
                
                const copyEndFromAbove = () => {
                  if (!prevEnd) return;
                  setShiftTimes(prev => {
                    const next = { ...prev, [person.crewId]: { ...prev[person.crewId], start: prev[person.crewId]?.start || '09:00', end: prevEnd } };
                    onShiftTimesChange?.(next);
                    return next;
                  });
                };
                
                return (
                <tr key={person.crewId}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    {person.name}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex">
                      <input
                        type="time"
                        id={`start-${person.crewId}`}
                        value={shiftTimes[person.crewId]?.start || '09:00'}
                        onChange={(e) => {
                          const newStartTime = e.target.value;
                          const newEndTime = addEightHours(newStartTime);
                          setShiftTimes(prev => {
                            const next = { ...prev, [person.crewId]: { start: newStartTime, end: newEndTime } };
                            onShiftTimesChange?.(next);
                            return next;
                          });
                        }}
                        className="rounded-none rounded-s-lg block w-[120px] pl-2.5 pr-1.5 py-2 bg-gray-50 border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-0 focus:border-gray-300 shadow-sm placeholder:text-gray-700 transition-colors duration-150 ease-out hover:text-blue-700 hover:font-semibold focus:text-blue-700 focus:font-semibold"
                        min="09:00"
                        max="18:00"
                        required
                      />
                      {isFirst ? (
                        <span className="inline-flex items-center px-2 text-sm bg-gray-50 text-gray-500 border rounded-s-0 border-s-0 border-gray-300 rounded-e-md">
                          <svg className="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={copyStartFromAbove}
                          title={`Copy ${prevStart} from above`}
                          className="inline-flex items-center px-2 text-sm border rounded-s-0 border-s-0 border-gray-300 rounded-e-md bg-gray-50 text-gray-500"
                        >
                          <svg className="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex">
                      <input
                        type="time"
                        id={`end-${person.crewId}`}
                        value={shiftTimes[person.crewId]?.end || '18:00'}
                        onChange={(e) => setShiftTimes(prev => {
                          const next = { ...prev, [person.crewId]: { ...prev[person.crewId], start: prev[person.crewId]?.start || '09:00', end: e.target.value } };
                          onShiftTimesChange?.(next);
                          return next;
                        })}
                        className="rounded-none rounded-s-lg block w-[120px] pl-2.5 pr-1.5 py-2 bg-gray-50 border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-0 focus:border-gray-300 shadow-sm placeholder:text-gray-700 transition-colors duration-150 ease-out hover:text-blue-700 hover:font-semibold focus:text-blue-700 focus:font-semibold"
                        min="09:00"
                        max="18:00"
                        required
                      />
                      {isFirst ? (
                        <span className="inline-flex items-center px-2 text-sm bg-gray-50 text-gray-500 border rounded-s-0 border-s-0 border-gray-300 rounded-e-md">
                          <svg className="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={copyEndFromAbove}
                          title={`Copy ${prevEnd} from above`}
                          className="inline-flex items-center px-2 text-sm border rounded-s-0 border-s-0 border-gray-300 rounded-e-md bg-gray-50 text-gray-500"
                        >
                          <svg className="w-4 h-4" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                        </button>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <button
                        type="button"
                        onClick={() => onRemoveCrew(person.crewId)}
                        aria-label={`Remove ${person.name}`}
                        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-2 text-gray-500 shadow-sm transition-colors hover:text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] hover:border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] hover:bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l)_/_0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M5 7H19M10 11V17M14 11V17M6 7L7 19C7.10557 20.6569 8.34315 22 10 22H14C15.6569 22 16.8944 20.6569 17 19L18 7M9 7L10 5C10.5523 4.44772 11.4477 4 12 4C12.5523 4 13.4477 4.44772 14 5L15 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </button>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
