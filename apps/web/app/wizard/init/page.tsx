"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useEffect } from "react";
import { useWizardStore } from "../../../lib/wizardStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type Store = { id: number; name: string };

export default function WizardInitPage() {
  const router = useRouter();
  const { date, setDate, storeId, setStoreId, shifts, updateShift, addShift, removeShift } = useWizardStore();
  const [localStoreId, setLocalStoreId] = useState<number>(storeId ?? 768);
  const [stores, setStores] = useState<Store[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const [searching, setSearching] = useState(false);
  const [allCrew, setAllCrew] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    setStoreId(localStoreId);
  }, [localStoreId, setStoreId]);

  // Load stores list
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!API_URL) return;
      try {
        const res = await fetch(`${API_URL}/stores`);
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as Store[];
        if (!cancelled) setStores(json);
      } catch (e: any) {
        console.error('Failed to load stores:', e);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [API_URL]);

  // Load all crew for selected store to compute availability
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!API_URL || !localStoreId) {
        setAllCrew([]);
        return;
      }
      try {
        const res = await fetch(`${API_URL}/crew?storeId=${localStoreId}`);
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (!cancelled) setAllCrew((json || []).map((c: any) => ({ id: c.id, name: c.name })));
      } catch {
        if (!cancelled) setAllCrew([]);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [API_URL, localStoreId]);

  const canProceed = useMemo(() => {
    if (!date) return false;
    if (!shifts.length) return false;
    return shifts.every((s) => s.crewId && s.start && s.end);
  }, [date, shifts]);

  // Live search crew by name (debounced via effect timing)
  useEffect(() => {
    let cancelled = false;
    const term = search.trim();
    if (!API_URL || term.length < 1 || !localStoreId) {
      setResults([]);
      setSelectedIdx(-1);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/crew?search=${encodeURIComponent(term)}&storeId=${localStoreId}`);
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        if (!cancelled) setResults((json || []).map((c: any) => ({ id: c.id, name: c.name })));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(handle); };
  }, [search, localStoreId]);

  const selectedCrewIds = useMemo(() => new Set((shifts || []).map(s => s.crewId).filter(Boolean)), [shifts]);
  const filteredResults = useMemo(() => results.filter(r => !selectedCrewIds.has(r.id)), [results, selectedCrewIds]);
  const availableCrewCount = useMemo(() => allCrew.filter(c => !selectedCrewIds.has(c.id)).length, [allCrew, selectedCrewIds]);

  // reset/highlight first result when results change (after filtering)
  useEffect(() => {
    if (filteredResults.length > 0) setSelectedIdx(0);
    else setSelectedIdx(-1);
  }, [filteredResults]);

  function addCrewAt(index: number) {
    const r = filteredResults[index];
    if (!r) return;
    if (selectedCrewIds.has(r.id)) return; // prevent duplicates
    addShift(r.id, r.name);
    setSearch("");
    setResults([]);
    setSelectedIdx(-1);
  }

  function handleNext() {
    if (!canProceed) return;
    router.push("/wizard/segments");
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Wizard — Init</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>
        Enter your store, date, and crew shifts for the day.
      </p>

      <section style={{ display: "grid", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>
            <strong>Store</strong>
            <select
              value={localStoreId}
              onChange={(e) => setLocalStoreId(Number(e.target.value) || 0)}
              style={{ marginLeft: 8, minWidth: 200 }}
            >
              <option value={0} disabled>Choose…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.id})
                </option>
              ))}
            </select>
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginLeft: 8 }} />
          </label>
          <button type="button" onClick={() => setDate("2025-01-01")}>Jan 1, 2025</button>
          <button type="button" onClick={() => { const d = new Date(`${date || "2025-01-01"}T00:00:00`); d.setDate(d.getDate() - 1); setDate(d.toISOString().slice(0,10)); }}>◀ Prev day</button>
          <button type="button" onClick={() => { const d = new Date(`${date || "2025-01-01"}T00:00:00`); d.setDate(d.getDate() + 1); setDate(d.toISOString().slice(0,10)); }}>Next day ▶</button>
        </div>
      </section>

      {availableCrewCount > 0 && (
      <section style={{ borderTop: '1px solid #eee', paddingTop: 12, marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 8 }}>Find crew by name</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            placeholder="Search crew…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (!filteredResults.length) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIdx((prev) => Math.min((prev < 0 ? 0 : prev) + 1, filteredResults.length - 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIdx((prev) => Math.max((prev < 0 ? 0 : prev) - 1, 0));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                if (selectedIdx >= 0) addCrewAt(selectedIdx);
              }
            }}
            style={{ flex: 1 }}
          />
          {searching && <span style={{ color: '#888' }}>Searching…</span>}
        </div>
        {!!filteredResults.length && (
          <div
            role="listbox"
            aria-label="Crew search results"
            style={{ marginTop: 8, border: '1px solid #ddd', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}
          >
            {filteredResults.map((r, i) => {
              const selected = i === selectedIdx;
              return (
                <div
                  key={r.id}
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setSelectedIdx(i)}
                  onClick={() => addCrewAt(i)}
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-start',
                    padding: '6px 8px',
                    borderBottom: '1px solid #eee',
                    background: selected ? '#eaf2ff' : 'transparent',
                    cursor: 'pointer',
                    gap: 8,
                  }}
                >
                  <span>{r.name} <span style={{ color: '#888' }}>({r.id})</span></span>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* Selected crew and their shifts */}

      <section style={{ display: "grid", gap: 10 }}>
        {shifts.map((s, idx) => (
          <div key={idx} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ minWidth: 180 }}>
              <strong>{s.crewName || s.crewId}</strong>
              {s.crewName && <span style={{ color: '#888', marginLeft: 6 }}>({s.crewId})</span>}
            </div>
            <label>
              Start
              <input
                type="time"
                value={s.start}
                onChange={(e) => {
                  const startValue = e.target.value;
                  updateShift(idx, { start: startValue });
                  
                  // Auto-fill end time to 8 hours later
                  if (startValue) {
                    const [hours, minutes] = startValue.split(':').map(Number);
                    const endHours = (hours + 8) % 24;
                    const endTime = `${String(endHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                    updateShift(idx, { end: endTime });
                  }
                }}
                style={{ marginLeft: 6 }}
              />
            </label>
            <label>
              End
              <input
                type="time"
                value={s.end}
                onChange={(e) => updateShift(idx, { end: e.target.value })}
                style={{ marginLeft: 6 }}
              />
            </label>
            <button type="button" onClick={() => removeShift(idx)} aria-label="remove">✕</button>
          </div>
        ))}
      </section>

      <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
        <button type="button" onClick={handleNext} disabled={!canProceed}>
          Next →
        </button>
      </div>
    </main>
  );
}
