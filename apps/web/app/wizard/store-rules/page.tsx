"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWizardStore } from "../../../lib/wizardStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type HourlyRule = {
  hour: number;
  minReg: number;
  minProduct: number;
  minParkingHelms: number;
};

type Store = {
  id: number;
  name: string;
  regHoursStartMin: number;
  regHoursEndMin: number;
};

function hh(hour: number) {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}

function minutesToHour(minutes: number): number {
  return Math.floor(minutes / 60);
}

function timeStrToMinutes(t: string): number {
  // expects "HH:MM" 24h
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return 0;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return hh * 60 + mm;
}

export default function WizardStoreRulesPage() {
  const router = useRouter();
  const { date, storeId, shifts } = useWizardStore();
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(false);
  const [crewCountByHour, setCrewCountByHour] = useState<Record<number, number>>({});
  
  // Load store details
  useEffect(() => {
    let cancelled = false;
    async function loadStore() {
      if (!API_URL || !storeId) return;
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/stores`);
        if (!res.ok) throw new Error(await res.text());
        const stores = (await res.json()) as Store[];
        const foundStore = stores.find(s => s.id === storeId);
        if (!cancelled && foundStore) {
          setStore(foundStore);
          
          // Initialize rules only for store hours
          const startHour = minutesToHour(foundStore.regHoursStartMin);
          const endHour = minutesToHour(foundStore.regHoursEndMin);
          const rules: HourlyRule[] = [];
          
          for (let hour = startHour; hour < endHour; hour++) {
            rules.push({
              hour,
              minReg: 0,
              minProduct: 0,
              minParkingHelms: 2,
            });
          }
          
          setHourlyRules(rules);
          
          // initialize crew count for these hours
          const counts: Record<number, number> = {};
          for (let hour = startHour; hour < endHour; hour++) counts[hour] = 0;
          setCrewCountByHour(counts);
        }
      } catch (e) {
        console.error('Failed to load store:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadStore();
    return () => { cancelled = true; };
  }, [storeId]);
  
  const [hourlyRules, setHourlyRules] = useState<HourlyRule[]>([]);

  // Recompute crew counts when shifts or store hours change
  useEffect(() => {
    if (!store || !hourlyRules.length) return;
    const startHour = minutesToHour(store.regHoursStartMin);
    const endHour = minutesToHour(store.regHoursEndMin);
    const counts: Record<number, number> = {};
    for (let hour = startHour; hour < endHour; hour++) {
      const hourStartMin = hour * 60;
      const hourEndMin = hourStartMin + 60;
      let c = 0;
      for (const sh of shifts) {
        if (!sh.start || !sh.end) continue;
        const s = timeStrToMinutes(sh.start);
        const e = timeStrToMinutes(sh.end);
        // overlap if shift intersects [hourStartMin, hourEndMin)
        if (s < hourEndMin && e > hourStartMin) c++;
      }
      counts[hour] = c;
    }
    setCrewCountByHour(counts);
  }, [shifts, store, hourlyRules.length]);

  const updateRule = (hour: number, field: keyof Omit<HourlyRule, 'hour'>, value: number) => {
    setHourlyRules(prev =>
      prev.map(rule =>
        rule.hour === hour ? { ...rule, [field]: value } : rule
      )
    );
  };

  const handleGenerateLogbook = async () => {
    if (!storeId || !date || !shifts.length || !hourlyRules.length) {
      alert('Missing required data. Please complete all wizard steps.');
      return;
    }
    
    setLoading(true);
    try {
      // Step 1: Save store hour rules to database
      const saveRes = await fetch(`${API_URL}/wizard/store-rules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          store_id: storeId,
          rules: hourlyRules.map(r => ({
            hour: r.hour,
            requiredRegisters: r.minReg,
            minProduct: r.minProduct,
            minParking: r.minParkingHelms,
          })),
        }),
      });
      
      if (!saveRes.ok) {
        throw new Error(`Failed to save rules: ${await saveRes.text()}`);
      }
      
      // Step 2: Call solver endpoint
      const solverRes = await fetch(`${API_URL}/solve-logbook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date,
          store_id: storeId,
          shifts: shifts.map(s => ({
            crewId: s.crewId,
            start: s.start,
            end: s.end,
          })),
          time_limit_seconds: 60,
        }),
      });
      
      if (!solverRes.ok) {
        throw new Error(`Solver failed: ${await solverRes.text()}`);
      }
      
      const result = await solverRes.json();
      
      // Step 3: Check solver status
      if (!result.ok || !result.solver?.success) {
        const status = result.solver?.metadata?.status || 'UNKNOWN';
        const error = result.solver?.error || result.error || 'Unknown error';
        alert(`Solver failed with status ${status}: ${error}`);
        return;
      }
      
      // Step 4: Success - navigate to results
      console.log('Solver result:', result.solver);
      router.push('/wizard/results');
    } catch (e: any) {
      console.error('Error generating logbook:', e);
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Wizard — Store Rules</h1>

      <section style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 24 }}>
        <div>
          <strong>Date:</strong> {date || 'Not set'}
        </div>
        <div>
          <strong>Store:</strong> {store?.name || storeId || 'Not set'}
        </div>
        {store && (
          <div style={{ color: "#666", fontSize: 14 }}>
            (Hours: {hh(minutesToHour(store.regHoursStartMin))} - {hh(minutesToHour(store.regHoursEndMin))})
          </div>
        )}
      </section>

      {loading && <div>Loading store hours...</div>}

      {!loading && hourlyRules.length === 0 && (
        <div style={{ padding: 16, background: "#f9f9f9", borderRadius: 6 }}>
          No store hours configured.
        </div>
      )}

      {!loading && hourlyRules.length > 0 && (
        <>
          <div style={{ marginBottom: 16 }}>
            <p style={{ color: "#666", fontSize: 14 }}>
              Set staffing counts (exact) for each hour during store operating hours.
            </p>
          </div>

      {/* Table Header */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "80px 100px 1fr 1fr 1fr", 
        gap: 12,
        padding: "12px 16px",
        background: "#f5f5f5",
        borderRadius: "8px 8px 0 0",
        border: "1px solid #ddd",
        borderBottom: "none",
        fontWeight: 600,
        fontSize: 14,
      }}>
        <div>Hour</div>
  <div>TOTAL CREW</div>
  <div>REG</div>
  <div>PRODUCT</div>
  <div>PARKING HELMS</div>
      </div>

      {/* Table Rows */}
      <div style={{ 
        border: "1px solid #ddd",
        borderRadius: "0 0 8px 8px",
        maxHeight: 600,
        overflowY: "auto",
      }}>
        {hourlyRules.map((rule, idx) => (
          <div
            key={rule.hour}
            style={{
              display: "grid",
              gridTemplateColumns: "80px 100px 1fr 1fr 1fr",
              gap: 12,
              padding: "12px 16px",
              background: idx % 2 === 0 ? "white" : "#fafafa",
              borderBottom: idx < hourlyRules.length - 1 ? "1px solid #eee" : "none",
              alignItems: "center",
            }}
          >
            <div style={{ fontWeight: 500 }}>{hh(rule.hour)}</div>
            <div style={{ color: "#333", textAlign: "center" }}>{crewCountByHour[rule.hour] ?? 0}</div>
            
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="REG exact count"
              value={rule.minReg === 0 ? '' : String(rule.minReg)}
              placeholder="0"
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                const num = digits === '' ? 0 : parseInt(digits, 10);
                updateRule(rule.hour, 'minReg', num);
              }}
              style={{
                padding: "6px 12px",
                border: "1px solid #ddd",
                borderRadius: 4,
                fontSize: 14,
                width: "100%",
              }}
            />
            
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="PRODUCT exact count"
              value={rule.minProduct === 0 ? '' : String(rule.minProduct)}
              placeholder="0"
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                const num = digits === '' ? 0 : parseInt(digits, 10);
                updateRule(rule.hour, 'minProduct', num);
              }}
              style={{
                padding: "6px 12px",
                border: "1px solid #ddd",
                borderRadius: 4,
                fontSize: 14,
                width: "100%",
              }}
            />
            
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              aria-label="PARKING HELMS exact count"
              value={rule.minParkingHelms === 0 ? '' : String(rule.minParkingHelms)}
              placeholder="0"
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '');
                const num = digits === '' ? 0 : parseInt(digits, 10);
                updateRule(rule.hour, 'minParkingHelms', num);
              }}
              style={{
                padding: "6px 12px",
                border: "1px solid #ddd",
                borderRadius: 4,
                fontSize: 14,
                width: "100%",
              }}
            />
          </div>
        ))}
      </div>
      </>
      )}

      {/* Actions */}
      <div style={{ marginTop: 24, display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/wizard/coverage">← Back</Link>
        <button
          type="button"
          onClick={handleGenerateLogbook}
          style={{
            padding: "10px 24px",
            background: "#0070f3",
            color: "white",
            border: "none",
            borderRadius: 6,
            cursor: "pointer",
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          Generate Logbook
        </button>
      </div>
    </main>
  );
}
