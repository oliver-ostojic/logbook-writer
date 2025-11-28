'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import CrewCombobox from "./CrewSearchBar";
import Calendar from "./Calendar";
import DateBadge from "./DateBadge";
import CrewShiftTable from "./CrewShiftTable";
import CrewCounter from './CrewCounter';

type CrewMember = {
  id: number;
  name: string;
  email: string;
};

export default function BentoGrid() {
  const params = useParams();
  const storeId = params.storeId as string;

  const allPeople: CrewMember[] = useMemo(() => ([
    { id: 1, name: 'Oliver Ostojic', email: 'oliver@example.com' },
    { id: 2, name: 'Sarah Chen', email: 'sarah@example.com' },
    { id: 3, name: 'Marcus Thompson', email: 'marcus@example.com' },
    { id: 4, name: 'Emily Rodriguez', email: 'emily@example.com' },
    { id: 5, name: 'James Park', email: 'james@example.com' },
    { id: 6, name: 'Maya Patel', email: 'maya@example.com' },
    { id: 7, name: 'Lucas Kim', email: 'lucas@example.com' },
    { id: 8, name: 'Sophia Martinez', email: 'sophia@example.com' },
    { id: 9, name: 'Ryan O\'Connor', email: 'ryan@example.com' },
    { id: 10, name: 'Zoe Williams', email: 'zoe@example.com' },
    { id: 11, name: 'Nathan Brooks', email: 'nathan@example.com' },
    { id: 12, name: 'Isabella Taylor', email: 'isabella@example.com' },
  ]), []);

  const [selectedCrew, setSelectedCrew] = useState<CrewMember[]>([]);
  const availablePeople = useMemo(() => {
    const selectedIds = new Set(selectedCrew.map(p => p.id));
    return allPeople.filter(p => !selectedIds.has(p.id));
  }, [allPeople, selectedCrew]);

  const handleAddCrew = (crew: CrewMember) => {
    // Check if crew member is already in the list
    if (!selectedCrew.find(c => c.id === crew.id)) {
      setSelectedCrew([...selectedCrew, crew]);
    }
  };

  const handleRemoveCrew = (id: number) => {
    setSelectedCrew(selectedCrew.filter(crew => crew.id !== id));
  };

  return (
    <div className="bg-gray-50 pt-10 pb-24 sm:pt-16 sm:pb-32">
      <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
        <p className="text-lg font-medium tracking-tight pb-2 text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]" style={{ fontFamily: 'var(--font-heading)' }}>
          Crew selection
        </p>
        <p className="text-4xl font-semibold tracking-tight text-pretty text-gray-900 sm:text-5xl" style={{ fontFamily: 'var(--font-heading)' }}>
          Start by searching for crew members, add them, and record their shift times
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:mt-16 lg:grid-cols-6 lg:auto-rows-auto">
          {/* Left tile - spans full height */}
          <div className="relative lg:col-span-4 lg:row-span-2">
            <div className="absolute inset-0 rounded-lg bg-white max-lg:rounded-t-[2rem] lg:rounded-l-[3rem]" />
            <div className="relative flex h-full flex-col overflow-hidden max-lg:rounded-t-[2rem] lg:rounded-l-[3rem]">
              <div className="p-10 pt-10">
                <div className="flex gap-6">
                  {/* Left container: Step 1, title, search bar */}
                  <div className="flex-1">
                    <h3 className="text-sm/4 font-semibold text-gray-500">Step 1</h3>
                    <p className="mt-2 text-lg font-medium tracking-tight text-gray-900">Select crew</p>
                    <div className="flex flex-row gap-10">
                      <div style={{ flex: '65' }}>
                        <CrewCombobox people={availablePeople} onSelectCrew={handleAddCrew} />
                      </div>
                      <div style={{ flex: '35' }} className="mt-2">
                        <CrewCounter count={selectedCrew.length} />
                      </div>
                    </div>
                  </div>
                </div>
                
                <CrewShiftTable selectedCrew={selectedCrew} onRemoveCrew={handleRemoveCrew} />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5 max-lg:rounded-t-[2rem] lg:rounded-l-[3rem]" />
          </div>

          {/* Top-right tile */}
          <div className="relative lg:col-span-2">
            <div className="absolute inset-0 rounded-lg bg-white lg:rounded-tr-[3rem]" />
            <div className="relative flex h-full flex-col overflow-hidden lg:rounded-tr-[3rem]">
              <div className="p-10 pt-10">
                <h3 className="text-sm/4 font-semibold text-gray-500">Step 2</h3>
                <p className="mt-2 text-lg font-medium tracking-tight text-gray-900 pb-5">Choose the date</p>
                <Calendar />
                <DateBadge />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5 lg:rounded-tr-[3rem]" />
          </div>

          {/* Bottom-right tile */}
          <div className="relative lg:col-span-2 lg:row-auto">
            <div className="absolute inset-0 rounded-lg bg-white max-lg:rounded-b-[2rem] lg:rounded-br-[3rem]" />
            <div className="relative flex flex-col overflow-hidden max-lg:rounded-b-[2rem] lg:rounded-br-[3rem]">
              <div className="p-10 pt-10">
                <h3 className="text-sm/4 font-semibold text-gray-500">Step 3</h3>
                <p className="mt-2 text-lg font-medium tracking-tight text-gray-900">Verify selections</p>
                <p className="mt-2 text-sm/6 text-gray-600">
                  Hit next. The system will verify that all selections are valid.
                </p>
                {/* Button container that keeps the button vertically centered between the text above and card bottom */}
                <div className="mt-6 flex flex-col">
                  <div className="flex-1 flex items-center justify-center py-4">
                    <Link 
                      href={`/stores/${storeId}/logbook/create/constraints`}
                      className="rounded-full bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-[hsl(var(--brand-h)_var(--brand-s)_55%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]" 
                      style={{ fontFamily: 'var(--font-heading)' }}
                    >
                      Next: Add Constraints
                    </Link>
                  </div>
                </div>
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5 max-lg:rounded-b-[2rem] lg:rounded-br-[3rem]" />
          </div>
        </div>
      </div>
    </div>
  )
}

