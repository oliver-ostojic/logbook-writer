'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CrewCombobox from "./CrewSearchBar";
import Calendar from "./Calendar";
import DateBadge from "./DateBadge";
import dayjs from "dayjs";
import CrewShiftTable from "./CrewShiftTable";
import CrewCounter from './CrewCounter';
import ShiftValidationBox from './ShiftValidationBox';
import Footer from '../../../../../../../components/Footer';

type CrewMember = {
  id: number; // local numeric id for UI (used for display only)
  name: string;
  email: string;
  crewId: string; // backend id (string) - STABLE identifier
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function BentoGrid() {
  const router = useRouter();
  const params = useParams();
  const storeId = params.storeId as string;

  const [allPeople, setAllPeople] = useState<CrewMember[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [initialShiftTimes, setInitialShiftTimes] = useState<Record<string, { start: string; end: string }>>({});
  const [shiftTimes, setShiftTimes] = useState<Record<string, { start: string; end: string }>>({});
  const [hasLoadedFromBackend, setHasLoadedFromBackend] = useState(false);
  const [selectedCrew, setSelectedCrew] = useState<CrewMember[]>([]);
  // Track which date the current state belongs to (prevents saving stale data to wrong date)
  const [loadedForDate, setLoadedForDate] = useState<string | null>(null);

  // LocalStorage key for persisting unsaved shifts
  const getLocalStorageKey = (date: string) => `shifts-draft-${storeId}-${date}`;

  // Save to localStorage whenever selectedCrew or shiftTimes change (after initial backend load)
  // Only save if the data belongs to the currently loaded date
  useEffect(() => {
    if (!hasLoadedFromBackend || !storeId || !selectedDate) return;
    // Don't save if the current state doesn't belong to selectedDate
    if (loadedForDate !== selectedDate) return;
    
    const key = getLocalStorageKey(selectedDate);
    const data = {
      selectedCrew,
      shiftTimes,
      savedAt: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(data));
  }, [selectedCrew, shiftTimes, hasLoadedFromBackend, storeId, selectedDate, loadedForDate]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!API_URL || !storeId) return;
        setLoadingPeople(true);
        const res = await fetch(`${API_URL}/crew?storeId=${encodeURIComponent(storeId)}`);
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        // Map backend crew array to local CrewMember[] with stable numeric ids for UI
        const mapped: CrewMember[] = (data || []).map((c: any, idx: number) => ({
          id: idx + 1,
          name: c.name || c.id,
          email: c.email || '',
          crewId: c.id,
        }));
        setAllPeople(mapped);
      } catch (e) {
        console.error('Failed to load crew list', e);
      } finally {
        if (!cancelled) setLoadingPeople(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [API_URL, storeId]);

  const availablePeople = useMemo(() => {
    // Use crewId (stable backend id) for filtering, not id (unstable array index)
    const selectedCrewIds = new Set(selectedCrew.map(p => p.crewId));
    return allPeople.filter(p => !selectedCrewIds.has(p.crewId));
  }, [allPeople, selectedCrew]);

  const handleAddCrew = (crew: CrewMember) => {
    // Check if crew member is already in the list (use crewId for stable comparison)
    if (!selectedCrew.find(c => c.crewId === crew.crewId)) {
      setSelectedCrew([...selectedCrew, crew]);
    }
  };

  const handleRemoveCrew = (crewId: string) => {
    setSelectedCrew(selectedCrew.filter(crew => crew.crewId !== crewId));
  };

  // Load existing shifts for selected date -> populate selectedCrew + initialShiftTimes
  // Also check localStorage for unsaved drafts
  useEffect(() => {
    let cancelled = false;
    setHasLoadedFromBackend(false);
    setLoadedForDate(null); // Clear until load completes
    
    async function loadShifts() {
      try {
        if (!API_URL || !storeId || !selectedDate) return;
        
        // First, check localStorage for a draft
        const localKey = getLocalStorageKey(selectedDate);
        const localData = localStorage.getItem(localKey);
        let localDraft: { selectedCrew: CrewMember[]; shiftTimes: Record<string, { start: string; end: string }>; savedAt: number } | null = null;
        
        if (localData) {
          try {
            localDraft = JSON.parse(localData);
          } catch {
            // Invalid JSON, ignore
          }
        }
        
        // Load from backend
        const res = await fetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/shifts?date=${encodeURIComponent(selectedDate)}`);
        if (cancelled) return;
        
        if (!res.ok) {
          // No backend data - use localStorage draft if available
          if (localDraft && localDraft.selectedCrew.length > 0) {
            setSelectedCrew(localDraft.selectedCrew);
            setShiftTimes(localDraft.shiftTimes);
            setInitialShiftTimes({});
          } else {
            setSelectedCrew([]);
            setInitialShiftTimes({});
            setShiftTimes({});
          }
          setLoadedForDate(selectedDate);
          setHasLoadedFromBackend(true);
          setLoadedForDate(selectedDate);
          return;
        }
        
        const data = await res.json();
        if (cancelled) return;
        
        if (!Array.isArray(data) || data.length === 0) {
          // No backend data - use localStorage draft if available
          if (localDraft && localDraft.selectedCrew.length > 0) {
            setSelectedCrew(localDraft.selectedCrew);
            setShiftTimes(localDraft.shiftTimes);
            setInitialShiftTimes({});
          } else {
            setSelectedCrew([]);
            setInitialShiftTimes({});
            setShiftTimes({});
          }
          setLoadedForDate(selectedDate);
          setHasLoadedFromBackend(true);
          setLoadedForDate(selectedDate);
          return;
        }
        
        // Map shifts to known people
        const byCrewId = new Map(allPeople.map(p => [p.crewId, p] as const));
        const mappedCrew: CrewMember[] = [];
        const times: Record<string, { start: string; end: string }> = {};
        for (const s of data) {
          const p = byCrewId.get(s.crewId);
          if (!p) continue;
          mappedCrew.push(p);
          times[p.crewId] = { start: s.start, end: s.end };
        }
        
        // If we have a localStorage draft, prefer it (user might have added more crew)
        // But only if it has at least as many crew as the backend
        if (localDraft && localDraft.selectedCrew.length >= mappedCrew.length) {
          setSelectedCrew(localDraft.selectedCrew);
          setShiftTimes(localDraft.shiftTimes);
          setInitialShiftTimes(times);
        } else {
          // Use backend data and clear the draft
          setSelectedCrew(mappedCrew);
          setInitialShiftTimes(times);
          setShiftTimes(times);
          localStorage.removeItem(localKey);
        }
        
        setLoadedForDate(selectedDate);
        setHasLoadedFromBackend(true);
        setLoadedForDate(selectedDate);
      } catch (e) {
        console.error('Failed to load shifts for date', selectedDate, e);
        setSelectedCrew([]);
        setInitialShiftTimes({});
        setShiftTimes({});
        setLoadedForDate(selectedDate);
        setHasLoadedFromBackend(true);
        setLoadedForDate(selectedDate);
      }
    }
    loadShifts();
    return () => { cancelled = true; };
  }, [API_URL, storeId, selectedDate, allPeople]);

  // Validate shift times: start must be before end
  const shiftValidationErrors = useMemo(() => {
    const errors: string[] = [];
    
    // Helper to convert HH:MM to minutes from midnight
    const toMinutes = (time: string): number => {
      const [hours, minutes] = time.split(':').map(Number);
      return hours * 60 + minutes;
    };
    
    // Helper to format HH:MM to AM/PM
    const formatAmPm = (time: string): string => {
      const [hours, minutes] = time.split(':').map(Number);
      const period = hours >= 12 ? 'PM' : 'AM';
      const hour12 = hours % 12 || 12;
      return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
    };
    
    for (const crew of selectedCrew) {
      const times = shiftTimes[crew.crewId];
      if (!times) continue;
      
      const startMinutes = toMinutes(times.start);
      const endMinutes = toMinutes(times.end);
      
      if (startMinutes >= endMinutes) {
        errors.push(`${crew.name}'s shift start time (${formatAmPm(times.start)}) must be before end time (${formatAmPm(times.end)})`);
      }
    }
    
    return errors;
  }, [selectedCrew, shiftTimes]);

  return (
      <div className="bg-gray-50 pt-10 pb-12 sm:pt-16 sm:pb-16">
        <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
        <p className="text-xl font-medium tracking-tight pb-2 text-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))]" style={{ fontFamily: 'var(--font-heading)' }}>
          Crew selection
        </p>
        <p className="text-4xl font-semibold tracking-tight text-pretty text-gray-900 sm:text-5xl" style={{ fontFamily: 'var(--font-heading)' }}>
          Start by searching for crew members, add them, and record their shift times
        </p>
        
        {/* Shift validation errors */}
        {shiftValidationErrors.length > 0 && (
          <div className="mt-8 mb-5 sm:mb-8">
            <ShiftValidationBox errors={shiftValidationErrors} />
          </div>
        )}
        
        <div className="mt-5 sm:mt-8 grid grid-cols-1 gap-4 lg:grid-cols-6 lg:auto-rows-auto">
          {/* Top-left tile - Date selection */}
          <div className="relative lg:col-span-2">
            <div className="absolute inset-0 rounded-lg bg-white max-lg:rounded-t-[2rem] lg:rounded-tl-[3rem]" />
            <div className="relative flex h-full flex-col overflow-hidden max-lg:rounded-t-[2rem] lg:rounded-tl-[3rem]">
              <div className="p-10 pt-10">
                <h3 className="text-sm/4 font-semibold text-gray-500">Step 1</h3>
                <p className="mt-2 text-xl font-medium tracking-tight text-gray-700 pb-5" style={{ fontFamily: 'var(--font-heading)' }}>Choose the date</p>
                <Calendar selectedDate={selectedDate} onChange={setSelectedDate} />
                <DateBadge selectedDate={selectedDate} />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5 max-lg:rounded-t-[2rem] lg:rounded-tl-[3rem]" />
          </div>

          {/* Right tile - Crew selection - spans full height */}
          <div className="relative lg:col-span-4 lg:row-span-2">
            <div className="absolute inset-0 rounded-lg bg-white lg:rounded-r-[3rem]" />
            <div className="relative flex h-full flex-col overflow-hidden lg:rounded-r-[3rem]">
              <div className="p-10 pt-10">
                <div className="flex gap-6">
                  {/* Left container: Step 2, title, search bar */}
                  <div className="flex-1">
                    <h3 className="text-sm/4 font-semibold text-gray-500">Step 2</h3>
                    <p className="mt-2 text-xl font-medium tracking-tight text-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>Select crew</p>
                    <div className="flex flex-row gap-10">
                      <div className="flex-1">
                        <CrewCombobox people={availablePeople} onSelectCrew={handleAddCrew} loading={loadingPeople} />
                      </div>
                      <div className="flex-shrink-0 mt-2">
                        <CrewCounter count={selectedCrew.length} />
                      </div>
                    </div>
                  </div>
                </div>
                
                <CrewShiftTable
                  selectedCrew={selectedCrew}
                  onRemoveCrew={handleRemoveCrew}
                  initialShiftTimes={initialShiftTimes}
                  onShiftTimesChange={setShiftTimes}
                />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5 lg:rounded-r-[3rem]" />
          </div>

          {/* Bottom-left tile - Review & save */}
          <div className="relative lg:col-span-2 lg:row-auto">
            <div className="absolute inset-0 rounded-lg bg-white max-lg:rounded-b-[2rem] lg:rounded-bl-[3rem]" />
            <div className="relative flex flex-col overflow-hidden max-lg:rounded-b-[2rem] lg:rounded-bl-[3rem]">
              <div className="p-10 pt-10">
                <h3 className="text-sm/4 font-semibold text-gray-500">Step 3</h3>
                <p className="mt-2 text-xl font-medium tracking-tight text-gray-700" style={{ fontFamily: 'var(--font-heading)' }}>Review & save shifts</p>
                <p className="mt-2 text-sm/6 text-gray-600">
                  When everything looks good, hit <em>Continue</em> to save today's shifts and move on to role constraints.
                </p>
                {/* Button container that keeps the button vertically centered between the text above and card bottom */}
                <SaveAndNext
                  storeId={storeId}
                  selectedDate={selectedDate}
                  selectedCrew={selectedCrew}
                  shiftTimes={shiftTimes}
                  hasValidationErrors={shiftValidationErrors.length > 0}
                  onNavigate={(path) => router.push(path)}
                  onSaveSuccess={() => localStorage.removeItem(getLocalStorageKey(selectedDate))}
                />
              </div>
            </div>
            <div className="pointer-events-none absolute inset-0 rounded-lg shadow-sm outline outline-1 outline-black/5 max-lg:rounded-b-[2rem] lg:rounded-bl-[3rem]" />
          </div>
        </div>
        <Footer />
      </div>
    </div>
  )
}

function SaveAndNext({
  storeId,
  selectedDate,
  selectedCrew,
  shiftTimes,
  hasValidationErrors,
  onNavigate,
  onSaveSuccess,
}: {
  storeId: string;
  selectedDate: string;
  selectedCrew: CrewMember[];
  shiftTimes: Record<string, { start: string; end: string }>;
  hasValidationErrors: boolean;
  onNavigate: (path: string) => void;
  onSaveSuccess?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Build payload for API: use backend crewId and HH:MM times
      const items = selectedCrew
        .filter(p => p.crewId)
        .map(p => ({
          crewId: p.crewId,
          start: shiftTimes[p.crewId]?.start || '09:00',
          end: shiftTimes[p.crewId]?.end || '18:00',
        }));
      const res = await fetch(`${API_URL}/stores/${encodeURIComponent(storeId)}/shifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, shifts: items }),
      });
      if (!res.ok) throw new Error(await res.text());
      // Clear localStorage draft on successful save
      onSaveSuccess?.();
      onNavigate(`/stores/${storeId}/logbook/create/constraints?date=${encodeURIComponent(selectedDate)}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to save shifts');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col">
      {error && (
        <p className="text-sm text-red-600 mb-2">{error}</p>
      )}
      <div className="flex-1 flex items-center justify-center py-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || hasValidationErrors}
          className="rounded-full bg-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-[hsl(var(--brand-h)_var(--brand-s)_55%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[hsl(var(--brand-h)_var(--brand-s)_var(--brand-l))] font-sans disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : 'Continue to constraints'}
        </button>
      </div>
    </div>
  );
}