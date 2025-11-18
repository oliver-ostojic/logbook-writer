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

type CoverageWindow = {
  startHour: number;
  endHour: number;
  length: number;
};

type ScheduleOption = {
  name: string;
  description: string;
  demoWindow: CoverageWindow;
  wineDemoWindow: CoverageWindow;
  totalCombinations: number;
};

type CombinationsResponse = {
  ok: boolean;
  normalizedDate: string;
  options?: ScheduleOption[];
  windows?: CoverageWindow[];
  message: string;
};

function hh(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

export default function WizardCoveragePage() {
  const router = useRouter();
  const { date, storeId, shifts } = useWizardStore();
  const [roles, setRoles] = useState<Role[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [initData, setInitData] = useState<InitResp | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [combinations, setCombinations] = useState<CombinationsResponse | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);

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

  // Toggle role selection
  const toggleRole = (roleName: string) => {
    setSelectedRoles(prev => 
      prev.includes(roleName) 
        ? prev.filter(r => r !== roleName)
        : [...prev, roleName]
    );
    // Clear results when selection changes
    setCombinations(null);
    setSelectedOption(null);
    setError(null);
  };

  // Compute combinations
  async function handleComputeCombinations() {
    if (!date || !storeId || !shifts?.length || selectedRoles.length === 0) return;
    
    setComputing(true);
    setError(null);
    setCombinations(null);
    setSelectedOption(null);
    
    try {
      const res = await fetch(`${API_URL}/wizard/compute-coverage-combinations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          store_id: storeId,
          shifts,
          selectedRoles,
        }),
      });
      
      if (!res.ok) throw new Error(await res.text());
      
      const json = (await res.json()) as CombinationsResponse;
      setCombinations(json);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setComputing(false);
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
        <>
          <section style={{ marginBottom: 20 }}>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Select Roles</h2>
            <div style={{ display: "flex", gap: 16 }}>
              {availableCoverageRoles.map(role => (
                <label key={role.id} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input 
                    type="checkbox" 
                    checked={selectedRoles.includes(role.name)}
                    onChange={() => toggleRole(role.name)}
                  />
                  <span>{role.name}</span>
                </label>
              ))}
            </div>
          </section>

          <button 
            type="button" 
            onClick={handleComputeCombinations}
            disabled={computing || selectedRoles.length === 0}
            style={{ 
              padding: "8px 16px",
              background: selectedRoles.length === 0 ? "#ccc" : "#0070f3",
              color: "white",
              border: "none",
              borderRadius: 6,
              cursor: selectedRoles.length === 0 ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {computing ? "Computing..." : "Compute Coverage Windows"}
          </button>

          {combinations && (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: 18, marginBottom: 12 }}>Longest Coverage Windows</h2>

              {/* Two roles selected - show schedule sets with scores */}
              {combinations.options && combinations.options.length > 0 && (
                <div>
                  <p style={{ color: "#666", marginBottom: 16 }}>
                    Select a schedule set. Score = number of possible crew reorderings (higher = more flexibility).
                  </p>
                  <div style={{ display: "grid", gap: 12 }}>
                    {combinations.options.map((opt, idx) => (
                      <div 
                        key={idx}
                        onClick={() => setSelectedOption(idx)}
                        style={{ 
                          padding: 16, 
                          background: selectedOption === idx ? "#e6f2ff" : "#f9f9f9",
                          border: selectedOption === idx ? "2px solid #0070f3" : "1px solid #ddd",
                          borderRadius: 8,
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                          <h3 style={{ fontSize: 16, margin: 0, color: "#333" }}>
                            Schedule Set {idx + 1}
                          </h3>
                          <div style={{ 
                            padding: "4px 12px", 
                            background: "#0070f3", 
                            color: "white", 
                            borderRadius: 12,
                            fontSize: 14,
                            fontWeight: 600,
                          }}>
                            Score: {opt.totalCombinations}
                          </div>
                        </div>
                        <div style={{ display: "grid", gap: 6, fontSize: 14 }}>
                          <div>
                            <strong>DEMO:</strong> {hh(opt.demoWindow.startHour)} - {hh(opt.demoWindow.endHour)} ({opt.demoWindow.length} hours)
                          </div>
                          <div>
                            <strong>WINE_DEMO:</strong> {hh(opt.wineDemoWindow.startHour)} - {hh(opt.wineDemoWindow.endHour)} ({opt.wineDemoWindow.length} hours)
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  {selectedOption !== null && (
                    <div style={{ marginTop: 16, padding: 12, background: "#eefbea", border: "1px solid #b4e2b5", borderRadius: 6 }}>
                      <strong>✓ Selected:</strong> Schedule Set {selectedOption + 1}
                    </div>
                  )}
                </div>
              )}

              {/* Single role selected - show all longest windows */}
              {combinations.windows && combinations.windows.length > 0 && (
                <div>
                  <h3 style={{ fontSize: 16, marginBottom: 12, color: "#333" }}>{selectedRoles[0]}</h3>
                  <div style={{ display: "grid", gap: 8 }}>
                    {combinations.windows.map((window, idx) => (
                      <div 
                        key={idx}
                        style={{ 
                          padding: 12, 
                          background: "#f0f8ff", 
                          border: "1px solid #b3d9ff", 
                          borderRadius: 6 
                        }}
                      >
                        {hh(window.startHour)} - {hh(window.endHour)} ({window.length} hours)
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

      <div style={{ marginTop: 32, display: "flex", gap: 12, alignItems: "center" }}>
        <Link href="/wizard/requirements">← Back</Link>
        <Link href="/wizard/store-rules">
          <button type="button">
            Next: Store Rules →
          </button>
        </Link>
      </div>
    </main>
  );
}
