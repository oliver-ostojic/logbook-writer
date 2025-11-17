"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useWizardStore } from "../../../lib/wizardStore";

export default function WizardInitPage() {
  const router = useRouter();
  const { date, setDate, setShiftCount, shifts, updateShift } = useWizardStore();
  const [countInput, setCountInput] = useState<number>(shifts.length || 2);

  const canProceed = useMemo(() => {
    if (!date) return false;
    if (!shifts.length) return false;
    return shifts.every((s) => s.crewId && s.start && s.end);
  }, [date, shifts]);

  function handleApplyCount() {
    const n = Math.max(0, Math.min(50, Number(countInput) || 0));
    setShiftCount(n);
  }

  function handleNext() {
    if (!canProceed) return;
    router.push("/wizard/segments");
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Wizard — Init</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>
        Enter your total workforce and their shifts for the day.
      </p>

      <section style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginLeft: 8 }} />
          </label>
          <button type="button" onClick={() => setDate("2025-01-01")}>Jan 1, 2025</button>
          <button
            type="button"
            onClick={() => {
              const d = new Date(`${date || "2025-01-01"}T00:00:00`);
              d.setDate(d.getDate() - 1);
              const iso = d.toISOString().slice(0, 10);
              setDate(iso);
            }}
          >
            ◀ Prev day
          </button>
          <button
            type="button"
            onClick={() => {
              const d = new Date(`${date || "2025-01-01"}T00:00:00`);
              d.setDate(d.getDate() + 1);
              const iso = d.toISOString().slice(0, 10);
              setDate(iso);
            }}
          >
            Next day ▶
          </button>
        </div>
      </section>

      <section style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        <label>
          Crew members for the day
          <input
            type="number"
            min={0}
            max={50}
            value={countInput}
            onChange={(e) => setCountInput(Number(e.target.value))}
            style={{ marginLeft: 8, width: 80 }}
          />
        </label>
        <div>
          <button type="button" onClick={handleApplyCount}>Apply</button>
        </div>
      </section>

      <section style={{ display: "grid", gap: 10 }}>
        {shifts.map((s, idx) => (
          <div key={idx} style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <label style={{ minWidth: 80 }}>
              Crew ID
              <input
                value={s.crewId}
                onChange={(e) => updateShift(idx, { crewId: e.target.value })}
                placeholder={`crew-${idx + 1}`}
                style={{ marginLeft: 6 }}
              />
            </label>
            <label>
              Start
              <input
                type="time"
                value={s.start}
                onChange={(e) => updateShift(idx, { start: e.target.value })}
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
