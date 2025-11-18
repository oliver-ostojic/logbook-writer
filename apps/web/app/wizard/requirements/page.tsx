"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useWizardStore } from "../../../lib/wizardStore";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

type InitResp = {
  normalizedDate: string;
  normalizedShifts: Array<{ crewId: string; start: string; end: string }>;
  eligibilities: Array<{ crewId: string; roleName: string }>;
  rulesByHour: number[];
  demoFeasible: {
    segments: Array<{ startHour: number; endHour: number }>;
    recommended: { startHour: number; endHour: number } | null;
    availByHour: number[];
  };
};

type Role = { id: string; name: string };

type Store = { id: number; name: string };

type RequirementRow = {
  crewId: string;
  roleId: string;
  requiredHours: number;
};

export default function WizardRequirementsPage() {
  const router = useRouter();
  const { date, storeId, setStoreId, shifts } = useWizardStore();

  const [initData, setInitData] = useState<InitResp | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reqs, setReqs] = useState<RequirementRow[]>([]);
  const [localStoreId, setLocalStoreId] = useState<number>(storeId ?? 1);

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

  // Load init data and roles
  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!API_URL) return;
      if (!date || !shifts?.length || !localStoreId) return;
      setLoading(true);
      setError(null);
      try {
        const [initRes, rolesRes] = await Promise.all([
          fetch(`${API_URL}/wizard/init`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, store_id: localStoreId, shifts }),
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
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [API_URL, date, shifts, localStoreId]);

  const crewIds = useMemo(() => {
    const ids = new Set<string>();
    initData?.normalizedShifts.forEach(s => ids.add(s.crewId));
    return Array.from(ids);
  }, [initData]);

  const eligByCrew = useMemo(() => {
    const m = new Map<string, string[]>();
    initData?.eligibilities.forEach(e => {
      const arr = m.get(e.crewId) || [];
      arr.push(e.roleName);
      m.set(e.crewId, arr);
    });
    return m;
  }, [initData]);

  // Build crew list from wizard store shifts, with names
  const crewList = useMemo(() => {
    const byId = new Map<string, string | undefined>();
    (shifts || []).forEach(s => byId.set(s.crewId, s.crewName));
    return Array.from(byId.entries()).map(([id, name]) => ({ id, name: name || id }));
  }, [shifts]);

  // Helper: filter out coverage-window roles from crew-specific dropdowns
  const isCoverageWindowRole = (roleName: string) => {
    const n = roleName.toUpperCase();
    return n === 'DEMO' || n === 'WINE_DEMO' || n === 'WINE';
  };

  // Non-coverage eligible roles for a given crew, strictly from eligibilities
  const nonCoverageRoleOptionsForCrew = useMemo(() => {
    return (crewId: string): Role[] => {
      const names = eligByCrew.get(crewId) || [];
      return roles.filter(r => names.includes(r.name) && !isCoverageWindowRole(r.name));
    };
  }, [eligByCrew, roles]);

  // Only show crews that have at least one non-coverage role eligible
  const eligibleCrewList = useMemo(() => {
    return crewList.filter(c => nonCoverageRoleOptionsForCrew(c.id).length > 0);
  }, [crewList, nonCoverageRoleOptionsForCrew]);

  // UI state: no eligible crew means we only show a message and auto-redirect
  const noEligible = useMemo(() => !loading && !!initData && eligibleCrewList.length === 0, [loading, initData, eligibleCrewList]);

  // If there are no eligible crews (no non-coverage roles), show a note and auto-skip to coverage
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (noEligible) {
      // delay so the message can be read before navigating
      timer = setTimeout(() => router.push("/wizard/coverage"), 2000);
    }
    return () => { if (timer) clearTimeout(timer); };
  }, [noEligible, router]);

  // Available crews are those not already in requirements
  const availableCrewList = useMemo(() => {
    const usedCrewIds = new Set(reqs.map(r => r.crewId));
    return eligibleCrewList.filter(c => !usedCrewIds.has(c.id));
  }, [eligibleCrewList, reqs]);

  function addRequirement() {
    // default to first available crew + first non-coverage eligible role
    const crew = availableCrewList[0]?.id || "";
    const rc = crew ? nonCoverageRoleOptionsForCrew(crew) : [];
    const roleId = rc[0]?.id || "";
    
    setReqs(prev => [...prev, { crewId: crew, roleId, requiredHours: 1 }]);
  }

  function updateReq(i: number, patch: Partial<RequirementRow>) {
    const updated = { ...reqs[i], ...patch };
    
    // Check for duplicate crew+role if either changed
    if (patch.crewId !== undefined || patch.roleId !== undefined) {
      const duplicate = reqs.some((r, idx) => 
        idx !== i && r.crewId === updated.crewId && r.roleId === updated.roleId
      );
      if (duplicate) {
        alert('This crew and role combination already exists.');
        return;
      }
    }
    
    setReqs(prev => prev.map((r, idx) => (idx === i ? updated : r)));
  }
  function removeReq(i: number) {
    setReqs(prev => prev.filter((_, idx) => idx !== i));
  }

  // no daily requirements on this page anymore

  function roleOptionsForCrew(crewId: string): Role[] {
    return nonCoverageRoleOptionsForCrew(crewId);
  }

  async function handleNext() {
    if (!API_URL || !date || !localStoreId || !reqs.length) return;
    try {
      setLoading(true);
      setError(null);
      const body = {
        date,
        store_id: localStoreId,
        requirements: reqs,
      };
      const res = await fetch(`${API_URL}/wizard/requirements`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      // Proceed to next page (coverage step placeholder)
      router.push("/wizard/coverage");
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Wizard — Requirements</h1>

      <section style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div>
          <strong>Date:</strong> {date}
        </div>
        <div>
          <strong>Store:</strong> {stores.find(s => s.id === storeId)?.name || storeId}
        </div>
        {API_URL ? <span style={{ color: "#888" }}>API: {API_URL}</span> : <span style={{ color: "#c55" }}>Set NEXT_PUBLIC_API_URL</span>}
      </section>

      {loading && <div>Loading…</div>}
      {error && (
        <div style={{ margin: "8px 0", padding: 8, background: "#fee", border: "1px solid #f99", borderRadius: 6 }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {noEligible && (
        <div
          role="status"
          aria-live="polite"
          style={{
            margin: "12px 0",
            padding: 10,
            background: "#f6f8ff",
            border: "1px solid #b3c0ff",
            borderRadius: 6,
            color: "#223",
          }}
        >
          No crew-specific role requirements for this date and store. Redirecting to coverage…
        </div>
      )}

      {!noEligible && (
      <section style={{ display: "grid", gap: 12 }}>
        <h2 style={{ fontSize: 18 }}>Crew-Specific Role Requirements</h2>
        {availableCrewList.length > 0 && (
          <div>
            <button type="button" onClick={addRequirement}>+ Add requirement</button>
          </div>
        )}
        {reqs.map((r, i) => {
          const roleOpts = roleOptionsForCrew(r.crewId);
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <label>
                Crew
                <select value={r.crewId} onChange={(e) => updateReq(i, { crewId: e.target.value, roleId: "" })} style={{ marginLeft: 6, minWidth: 180 }}>
                  <option value="" disabled>Choose…</option>
                  {eligibleCrewList.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Role
                <select value={r.roleId} onChange={(e) => updateReq(i, { roleId: e.target.value })} style={{ marginLeft: 6 }}>
                  <option value="" disabled>Choose…</option>
                  {roleOpts.map(ro => (
                    <option key={ro.id} value={ro.id}>{ro.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Required hours
                <input type="number" min={0} max={24} value={r.requiredHours} onChange={(e) => updateReq(i, { requiredHours: Number(e.target.value || 0) })} style={{ marginLeft: 6, width: 70 }} />
              </label>
              <button type="button" onClick={() => removeReq(i)} aria-label="remove">✕</button>
            </div>
          );
        })}
      </section>
      )}
      {!noEligible && (
        <div style={{ marginTop: 20 }}>
          <button type="button" onClick={handleNext} disabled={!reqs.length || loading}>Next →</button>
        </div>
      )}
    </main>
  );
}
