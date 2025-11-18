"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useWizardStore } from "../../../lib/wizardStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type InitResp = {
  normalizedDate: string;
  normalizedShifts: Array<{ crewId: string; start: string; end: string }>;
  eligibilities: Array<{ crewId: string; roleName: string }>;
  demoFeasible: {
    segments: Array<{ startHour: number; endHour: number }>;
    recommended: { startHour: number; endHour: number } | null;
  };
};

type Role = { id: string; name: string };

type Store = { id: number; name: string };

function hh(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export default function WizardCoveragePage() {
  const router = useRouter();
  const { date, storeId, shifts } = useWizardStore();
  const [roles, setRoles] = useState<Role[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [initData, setInitData] = useState<InitResp | null>(null);
  const [roleId, setRoleId] = useState<string>("");
  const [windowStart, setWindowStart] = useState<string>("09:00");
  const [windowEnd, setWindowEnd] = useState<string>("17:00");
  const [requiredPerHour, setRequiredPerHour] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

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

  // Load init data (with eligibilities) and roles
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!API_URL) return;
      if (!date || !shifts?.length || !storeId) return;
      setLoading(true);
      setError(null);
      try {
        const [initRes, rolesRes] = await Promise.all([
          fetch(`${API_URL}/wizard/init`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, store_id: storeId, shifts }),
          }),
          fetch(`${API_URL}/roles`),
        ]);
        if (!initRes.ok) throw new Error(await initRes.text());
        if (!rolesRes.ok) throw new Error(await rolesRes.text());
        const initJson = (await initRes.json()) as InitResp;
        const rolesJson = (await rolesRes.json()) as any[];
        if (!cancelled) {
          setInitData(initJson);
          setRoles(rolesJson.map(r => ({ id: r.id, name: r.name })));
          
          // Pre-fill window from recommended demo window
          const rec = initJson.demoFeasible?.recommended;
          if (rec) {
            setWindowStart(hh(rec.startHour));
            setWindowEnd(hh(rec.endHour));
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [API_URL, date, shifts, storeId]);

  // Compute available coverage roles: DEMO or WINE_DEMO where at least one crew has that role
  const availableCoverageRoles = useMemo(() => {
    if (!initData) return [];
    const coverageRoleNames = new Set<string>();
    initData.eligibilities.forEach(e => {
      const name = e.roleName.toUpperCase();
      if (name === 'DEMO' || name === 'WINE_DEMO') {
        coverageRoleNames.add(e.roleName);
      }
    });
    return roles.filter(r => coverageRoleNames.has(r.name));
  }, [initData, roles]);

  // Auto-select first available coverage role
  useEffect(() => {
    if (availableCoverageRoles.length > 0 && !roleId) {
      setRoleId(availableCoverageRoles[0].id);
    }
  }, [availableCoverageRoles, roleId]);

  const canSave = useMemo(() => !!(API_URL && date && storeId && roleId && windowStart && windowEnd), [date, storeId, roleId, windowStart, windowEnd]);

  async function handleSave() {
    if (!canSave) return;
    try {
      setLoading(true);
      setError(null);
      setSaved(false);
      const res = await fetch(`${API_URL}/wizard/coverage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          store_id: storeId,
          role_id: roleId,
          windowStart,
          windowEnd,
          requiredPerHour,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSaved(true);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Wizard — Coverage</h1>

      <section style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div>
          <strong>Date:</strong> {date}
        </div>
        <div>
          <strong>Store:</strong> {stores.find(s => s.id === storeId)?.name || storeId}
        </div>
      </section>

      {error && (
        <div style={{ margin: "8px 0", padding: 8, background: "#fee", border: "1px solid #f99", borderRadius: 6 }}>
          <strong>Error:</strong> {error}
        </div>
      )}
      {saved && (
        <div style={{ margin: "8px 0", padding: 8, background: "#eefbea", border: "1px solid #b4e2b5", borderRadius: 6 }}>
          Coverage saved for {date}.
        </div>
      )}

      {availableCoverageRoles.length === 0 && !loading && (
        <div style={{ margin: "16px 0", padding: 16, background: "#f9f9f9", border: "1px solid #ddd", borderRadius: 6 }}>
          <p style={{ margin: 0, color: "#666" }}>
            No crew available to fulfill coverage windows for DEMO or WINE_DEMO.
          </p>
          <p style={{ margin: "8px 0 0 0", fontSize: 14, color: "#888" }}>
            Ensure crew members with DEMO or WINE_DEMO roles are added in the init step.
          </p>
        </div>
      )}

      {availableCoverageRoles.length > 0 && (
        <section style={{ display: "grid", gap: 12 }}>
          <label>
            Role
            <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={{ marginLeft: 6 }}>
              <option value="" disabled>Choose…</option>
              {availableCoverageRoles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </label>
          <div style={{ display: "flex", gap: 12 }}>
            <label>
              Window start
              <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} style={{ marginLeft: 6 }} />
            </label>
            <label>
              Window end
              <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} style={{ marginLeft: 6 }} />
            </label>
          </div>
          <label>
            Required per hour
            <input type="number" min={0} max={20} value={requiredPerHour} onChange={(e) => setRequiredPerHour(Number(e.target.value || 0))} style={{ marginLeft: 6, width: 80 }} />
          </label>
        </section>
      )}

      <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/wizard/requirements">← Back</Link>
        {availableCoverageRoles.length > 0 && (
          <>
            <button type="button" onClick={handleSave} disabled={!canSave || loading}>{loading ? "Saving…" : "Save coverage"}</button>
            {saved && (
              <button type="button" onClick={() => router.push("/wizard/init")}>
                Done →
              </button>
            )}
          </>
        )}
      </div>
    </main>
  );
}
