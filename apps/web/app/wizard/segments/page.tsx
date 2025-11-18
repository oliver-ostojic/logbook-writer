"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWizardStore } from "../../../lib/wizardStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type CrewSegments = {
  crewId: string;
  shift: { start: string; end: string };
  regWindow: { start: string; end: string };
  segments: Array<{ start: string; end: string; kind: "PRODUCT" | "FLEX" }>;
  productMinutes: number;
  flexMinutes: number;
};

type SegmentsResp = {
  normalizedDate: string;
  date: string;
  store_id: number;
  segmentsByCrew: CrewSegments[];
};

export default function WizardSegmentsPage() {
  const router = useRouter();
  const { date, storeId, shifts } = useWizardStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SegmentsResp | null>(null);

  // Map crewId -> display name from current shifts
  const crewNameById = useMemo(() => {
    const m = new Map<string, string>();
    (shifts || []).forEach((s) => {
      if (s.crewId) m.set(s.crewId, s.crewName || s.crewId);
    });
    return m;
  }, [shifts]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!API_URL) return;
      if (!date || !storeId || !(shifts?.length)) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${API_URL}/wizard/segments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, store_id: storeId, shifts }),
        });
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as SegmentsResp;
        if (!cancelled) setData(json);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [date, storeId, shifts]);

  function handleNext() {
    router.push("/wizard/requirements");
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Wizard — Segments</h1>


      {loading && <div>Loading…</div>}
      {error && (
        <div style={{ margin: "8px 0", padding: 8, background: "#fee", border: "1px solid #f99", borderRadius: 6 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <section style={{ display: "grid", gap: 16 }}>
          {/* Legend */}
          <div style={{ display: "flex", gap: 16, alignItems: "center", color: "#555" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 10, background: "#c6efd3", border: "1px solid #9dd3ad", borderRadius: 2 }} /> Product
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 10, background: "#dbe5ff", border: "1px solid #adc2ff", borderRadius: 2 }} /> Flex
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 16, height: 10, background: "transparent", border: "1px dashed #d0d0d0", borderRadius: 2 }} /> Closed Hours
            </span>
          </div>

          {/* Hour header (0..23) */}
          <HourHeader regStart={data.segmentsByCrew[0]?.regWindow.start} regEnd={data.segmentsByCrew[0]?.regWindow.end} />

          <div style={{ display: "grid", gap: 12 }}>
            {data.segmentsByCrew.map((cs, idx) => (
              <div key={idx} style={{ padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                  <div>
                    <strong>{crewNameById.get(cs.crewId) || cs.crewId}</strong>
                    <span style={{ color: "#888", marginLeft: 6 }}>({cs.crewId})</span>
                  </div>
                  <div style={{ color: "#666" }}>
                    Shift: {cs.shift.start} – {cs.shift.end}
                  </div>
                </div>

                {/* Timeline row */}
                <TimelineRow
                  segments={cs.segments}
                  regStart={data.segmentsByCrew[0]?.regWindow.start}
                  regEnd={data.segmentsByCrew[0]?.regWindow.end}
                />

                {/* Badge list for quick reading */}
                <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {cs.segments.length ? (
                    cs.segments.map((s, i) => (
                      <span key={i} style={{ padding: "4px 8px", borderRadius: 999, background: s.kind === "PRODUCT" ? "#e6f4ea" : "#eef3ff", border: `1px solid ${s.kind === "PRODUCT" ? "#9dd3ad" : "#adc2ff"}` }}>
                        {s.kind === "PRODUCT" ? "Product" : "Flex"} {s.start}–{s.end}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: "#999" }}>No overlap with register window</span>
                  )}
                </div>

                <div style={{ marginTop: 8, color: "#555" }}>
                  Product minutes: <strong>{cs.productMinutes}</strong> · Flex minutes: <strong>{cs.flexMinutes}</strong>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/wizard/init">← Back</Link>
        <button type="button" onClick={handleNext} disabled={!data || loading}>Next →</button>
      </div>
    </main>
  );
}

function parseHour(hhmm?: string): number {
  if (!hhmm) return 0;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return 0;
  return Math.max(0, Math.min(24, parseInt(m[1], 10)));
}

function HourHeader({ regStart, regEnd }: { regStart?: string; regEnd?: string }) {
  const rs = parseHour(regStart);
  const re = parseHour(regEnd);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, alignItems: "end" }}>
      {Array.from({ length: 24 }, (_, h) => (
        <div key={h} style={{ textAlign: "center", fontSize: 11, color: h >= rs && h < re ? "#333" : "#aaa" }}>
          {String(h).padStart(2, "0")}
        </div>
      ))}
    </div>
  );
}

function TimelineRow({
  segments,
  regStart,
  regEnd,
}: {
  segments: Array<{ start: string; end: string; kind: "PRODUCT" | "FLEX" }>;
  regStart?: string;
  regEnd?: string;
}) {
  const rs = parseHour(regStart);
  const re = parseHour(regEnd);

  // Hourly kind map: PRODUCT wins over FLEX if overlapping
  const kinds: ("PRODUCT" | "FLEX" | null)[] = Array(24).fill(null);
  for (const s of segments) {
    const sh = parseHour(s.start);
    const eh = parseHour(s.end);
    for (let h = Math.max(0, sh); h < Math.min(24, eh); h++) {
      if (s.kind === "PRODUCT") kinds[h] = "PRODUCT";
      else if (!kinds[h]) kinds[h] = "FLEX";
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
      {kinds.map((k, h) => {
        const inReg = h >= rs && h < re;
        const baseStyle: React.CSSProperties = {
          height: 14,
          borderRadius: 3,
          border: inReg ? "1px solid #e0e0e0" : "1px dashed #d0d0d0",
          background: inReg ? "#fafafa" : "#f3f3f3",
        };
        const kindStyle: React.CSSProperties =
          k === "PRODUCT"
            ? { background: "#c6efd3", borderColor: "#9dd3ad" }
            : k === "FLEX"
            ? { background: "#dbe5ff", borderColor: "#adc2ff" }
            : {};
        return <div key={h} title={`${String(h).padStart(2, "0")}:00`} style={{ ...baseStyle, ...kindStyle }} />;
      })}
    </div>
  );
}
