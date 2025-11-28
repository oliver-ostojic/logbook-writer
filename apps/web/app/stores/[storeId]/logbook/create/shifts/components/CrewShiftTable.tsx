"use client";
import { useState, useMemo } from "react";
import { BarsArrowUpIcon, BarsArrowDownIcon } from '@heroicons/react/20/solid';

type CrewMember = {
  id: number;
  name: string;
  email: string;
};

type CrewShiftTableProps = {
  selectedCrew: CrewMember[];
  onRemoveCrew: (id: number) => void;
};

type SortField = 'name' | 'start' | null;

type ShiftTimes = {
  [key: number]: { start: string; end: string };
};

export default function CrewShiftTable({ selectedCrew, onRemoveCrew }: CrewShiftTableProps) {
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
  useMemo(() => {
    const newTimes: ShiftTimes = { ...shiftTimes };
    selectedCrew.forEach((person) => {
      if (!newTimes[person.id]) {
        newTimes[person.id] = { start: '09:00', end: '18:00' };
      }
    });
    setShiftTimes(newTimes);
  }, [selectedCrew]);

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
        const aTime = shiftTimes[a.id]?.start || '09:00';
        const bTime = shiftTimes[b.id]?.start || '09:00';
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
          const aTime = shiftTimes[a.id]?.start || '09:00';
          const bTime = shiftTimes[b.id]?.start || '09:00';
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
    <div className="mt-8">
      <div className="overflow-hidden shadow outline outline-1 outline-black/5 rounded-lg">
  <div className="max-h-[640px] overflow-y-auto">
          <table className="relative min-w-full divide-y divide-gray-300">
            <thead className="bg-gray-50">
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
                    No crew members selected
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
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M5 7H19M10 11V17M14 11V17M6 7L7 19C7.10557 20.6569 8.34315 22 10 22H14C15.6569 22 16.8944 20.6569 17 19L18 7M9 7L10 5C10.5523 4.44772 11.4477 4 12 4C12.5523 4 13.4477 4.44772 14 5L15 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    </button>
                  </td>
                </tr>
              ) : sortedCrew.map((person) => (
                <tr key={person.id}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                    {person.name}
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex">
                      <input
                        type="time"
                        id={`start-${person.id}`}
                        value={shiftTimes[person.id]?.start || '09:00'}
                        onChange={(e) => {
                          const newStartTime = e.target.value;
                          const newEndTime = addEightHours(newStartTime);
                          setShiftTimes(prev => ({
                            ...prev,
                            [person.id]: { start: newStartTime, end: newEndTime }
                          }));
                        }}
                        className="rounded-none rounded-s-lg block w-full pl-2.5 pr-1.5 py-2 bg-gray-50 border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-0 focus:border-gray-300 shadow-sm placeholder:text-gray-700 transition-colors duration-150 ease-out hover:text-blue-700 hover:font-semibold focus:text-blue-700 focus:font-semibold"
                        min="09:00"
                        max="18:00"
                        required
                      />
                      <span className="inline-flex items-center px-2 text-sm text-gray-900 bg-gray-50 border rounded-s-0 border-s-0 border-gray-300 rounded-e-md">
                        <svg className="w-4 h-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex">
                      <input
                        type="time"
                        id={`end-${person.id}`}
                        value={shiftTimes[person.id]?.end || '18:00'}
                        onChange={(e) => setShiftTimes(prev => ({
                          ...prev,
                          [person.id]: { ...prev[person.id], start: prev[person.id]?.start || '09:00', end: e.target.value }
                        }))}
                        className="rounded-none rounded-s-lg flex-1 block w-full pl-2.5 pr-1.5 py-2 bg-gray-50 border border-gray-300 text-gray-900 text-sm focus:outline-none focus:ring-0 focus:border-gray-300 shadow-sm placeholder:text-gray-700 transition-colors duration-150 ease-out hover:text-blue-700 hover:font-semibold focus:text-blue-700 focus:font-semibold"
                        min="09:00"
                        max="18:00"
                        required
                      />
                      <span className="inline-flex items-center px-2 text-sm text-gray-900 bg-gray-50 border rounded-s-0 border-s-0 border-gray-300 rounded-e-md">
                        <svg className="w-4 h-4 text-gray-500" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <button
                        type="button"
                        onClick={() => onRemoveCrew(person.id)}
                        aria-label={`Remove ${person.name}`}
                        className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white p-2 text-gray-500 shadow-sm transition-colors hover:text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] hover:border-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] hover:bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l)_/_0.08)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none"><path d="M5 7H19M10 11V17M14 11V17M6 7L7 19C7.10557 20.6569 8.34315 22 10 22H14C15.6569 22 16.8944 20.6569 17 19L18 7M9 7L10 5C10.5523 4.44772 11.4477 4 12 4C12.5523 4 13.4477 4.44772 14 5L15 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                      </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
