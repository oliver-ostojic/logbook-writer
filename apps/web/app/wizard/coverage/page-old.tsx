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
    availByHour: number[];
  };
};

type Role = { id: string; name: string };
type Store = { id: number; name: string };

type CoverageWindow = {
  roleId: string;
  roleName: string;
  suggestedWindows: Array<{ start: string; end: string }>; // All possible longest windows
  selectedSuggestionIndex: number | null; // null means no window selected yet
  setStart: string | null;       // Editable, inside selected suggested window
  setEnd: string | null;         // Editable, inside selected suggested window
  requiredPerHour: number;
  availByHour: number[];
};

function hh(hour: number) {
  return String(hour).padStart(2, "0") + ":00";
}

function formatHourAmPm(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour < 12) return `${hour}:00 AM`;
  if (hour === 12) return "12:00 PM";
  return `${hour - 12}:00 PM`;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function parseTimeToHour(hhmm?: string): number | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Math.max(0, Math.min(24, parseInt(m[1], 10)));
}

function computeAvailByHourWithConflicts(
  eligibilities: Array<{ crewId: string; roleName: string }>,
  shifts: Array<{ crewId: string; start: string; end: string }>,
  targetRole: string,
  existingWindows: Array<{ roleName: string; windowStart: string; windowEnd: string }>
): number[] {
  const availByHour = new Array(24).fill(0);
  
  const eligibleCrewIds = new Set(
    eligibilities
      .filter(e => e.roleName.toUpperCase() === targetRole.toUpperCase())
      .map(e => e.crewId)
  );

  shifts.forEach(shift => {
    if (!eligibleCrewIds.has(shift.crewId)) return;
    
    const shiftStart = parseTimeToHour(shift.start) ?? 0;
    const shiftEnd = parseTimeToHour(shift.end) ?? 24;
    
    for (let h = shiftStart; h < shiftEnd; h++) {
      let conflicted = false;
      for (const w of existingWindows) {
        const wStart = parseTimeToHour(w.windowStart) ?? 0;
        const wEnd = parseTimeToHour(w.windowEnd) ?? 24;
        
        const crewHasConflictRole = eligibilities.some(
          e => e.crewId === shift.crewId && e.roleName.toUpperCase() === w.roleName.toUpperCase()
        );
        
        if (crewHasConflictRole && h >= wStart && h < wEnd) {
          conflicted = true;
          break;
        }
      }
      
      if (!conflicted) {
        availByHour[h]++;
      }
    }
  });

  return availByHour;
}

function contiguousSegments(availByHour: number[], minAvail: number): Array<{ startHour: number; endHour: number }> {
  const segments: Array<{ startHour: number; endHour: number }> = [];
  let start: number | null = null;

  for (let h = 0; h < 24; h++) {
    if (availByHour[h] >= minAvail) {
      if (start === null) start = h;
    } else {
      if (start !== null) {
        segments.push({ startHour: start, endHour: h });
        start = null;
      }
    }
  }
  if (start !== null) {
    segments.push({ startHour: start, endHour: 24 });
  }
  return segments;
}

function suggestLongestSegment(segments: Array<{ startHour: number; endHour: number }>): { startHour: number; endHour: number } | null {
  if (segments.length === 0) return null;
  return segments.reduce((best, seg) =>
    (seg.endHour - seg.startHour) > (best.endHour - best.startHour) ? seg : best
  );
}

// Build a conflict-aware predicate: is crew c available at hour h for targetRole
function crewAvailableAtHour(
  eligibilities: Array<{ crewId: string; roleName: string }>,
  shifts: Array<{ crewId: string; start: string; end: string }>,
  cId: string,
  h: number,
  targetRole: string,
  existingWindows: Array<{ roleName: string; windowStart: string; windowEnd: string }>
): boolean {
  // Must be eligible for targetRole
  const eligible = eligibilities.some(e => e.crewId === cId && e.roleName.toUpperCase() === targetRole.toUpperCase());
  if (!eligible) {
    console.log(`[crewAvailableAtHour] ${cId} hour ${h}: NOT eligible for ${targetRole}`);
    return false;
  }
  // Must be working this hour
  const shift = shifts.find(s => s.crewId === cId);
  if (!shift) {
    console.log(`[crewAvailableAtHour] ${cId} hour ${h}: NO shift found`);
    return false;
  }
  const s = parseTimeToHour(shift.start) ?? 0;
  const e = parseTimeToHour(shift.end) ?? 24;
  if (!(h >= s && h < e)) {
    console.log(`[crewAvailableAtHour] ${cId} hour ${h}: Outside shift ${s}-${e}`);
    return false;
  }
  // Must not be in conflict window for any other role they can do
  for (const w of existingWindows) {
    const wS = parseTimeToHour(w.windowStart) ?? 0;
    const wE = parseTimeToHour(w.windowEnd) ?? 24;
    const canDoConflictRole = eligibilities.some(
      e => e.crewId === cId && e.roleName.toUpperCase() === w.roleName.toUpperCase()
    );
    if (canDoConflictRole && h >= wS && h < wE) {
      console.log(`[crewAvailableAtHour] ${cId} hour ${h}: CONFLICT with ${w.roleName}`);
      return false;
    }
  }
  console.log(`[crewAvailableAtHour] ${cId} hour ${h}: ✓ AVAILABLE`);
  return true;
}

// Test whether a window [startHour, endHour) can be fully covered with unique crew (each crew at most 1 hour)
function canCoverWindowWithUniqueCrew(
  eligibilities: Array<{ crewId: string; roleName: string }>,
  shifts: Array<{ crewId: string; start: string; end: string }>,
  targetRole: string,
  startHour: number,
  endHour: number,
  existingWindows: Array<{ roleName: string; windowStart: string; windowEnd: string }>
): boolean {
  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);
  if (hours.length === 0) return false;

  // All crew ids eligible for target role
  const eligibleCrewIds = Array.from(new Set(
    eligibilities
      .filter(e => e.roleName.toUpperCase() === targetRole.toUpperCase())
      .map(e => e.crewId)
  ));

  // Build bipartite graph: hours -> eligible crew available at that hour
  const edges: number[][] = hours.map(() => []);
  const crewIndexMap = new Map<string, number>();
  eligibleCrewIds.forEach((cid, i) => crewIndexMap.set(cid, i));

  eligibleCrewIds.forEach((cid, i) => {
    hours.forEach((h, hi) => {
      if (crewAvailableAtHour(eligibilities, shifts, cid, h, targetRole, existingWindows)) {
        edges[hi].push(i);
      }
    });
  });

  // Quick fail: each hour must have at least one candidate
  if (edges.some(e => e.length === 0)) return false;

  // Max bipartite matching (DFS-based augmenting paths) hours -> crew
  const mCrew: number[] = new Array(eligibleCrewIds.length).fill(-1);
  function dfs(u: number, seen: boolean[]): boolean {
    for (const v of edges[u]) {
      if (seen[v]) continue;
      seen[v] = true;
      if (mCrew[v] === -1 || dfs(mCrew[v], seen)) {
        mCrew[v] = u;
        return true;
      }
    }
    return false;
  }

  let match = 0;
  for (let u = 0; u < hours.length; u++) {
    const seen = new Array(eligibleCrewIds.length).fill(false);
    if (dfs(u, seen)) match++;
    else return false; // early exit: this hour couldn't be matched
  }
  return match === hours.length;
}

// Given hour availability (≥1) segments, find ALL possible longest sub-windows that are coverable with unique crew
// This uses a greedy approach: try to extend from each start hour, assigning crew (each crew only once)
function suggestAllLongestFeasibleWindows(
  eligibilities: Array<{ crewId: string; roleName: string }>,
  shifts: Array<{ crewId: string; start: string; end: string }>,
  targetRole: string,
  existingWindows: Array<{ roleName: string; windowStart: string; windowEnd: string }>,
  availByHour: number[]
): Array<{ startHour: number; endHour: number }> {
  console.log('[suggestAllLongestFeasibleWindows] Starting algorithm');
  
  // Get all crew eligible for this role
  const eligibleCrewIds = Array.from(new Set(
    eligibilities
      .filter(e => e.roleName.toUpperCase() === targetRole.toUpperCase())
      .map(e => e.crewId)
  ));

  console.log('[suggestAllLongestFeasibleWindows] Eligible crew:', eligibleCrewIds);

  if (eligibleCrewIds.length === 0) {
    console.log('[suggestAllLongestFeasibleWindows] No eligible crew');
    return [];
  }

  // Find earliest and latest hours with availability
  let earliest = -1;
  let latest = -1;
  for (let h = 0; h < 24; h++) {
    if (availByHour[h] >= 1) {
      if (earliest === -1) earliest = h;
      latest = h + 1;
    }
  }
  
  console.log('[suggestAllLongestFeasibleWindows] Time range:', earliest, 'to', latest);
  
  if (earliest === -1) {
    console.log('[suggestAllLongestFeasibleWindows] No hours available');
    return [];
  }

  const allWindows: Array<{ startHour: number; endHour: number }> = [];
  let maxLen = 0;

  // Try each possible start hour
  for (let start = earliest; start < latest; start++) {
    const usedCrew = new Set<string>();
    let endHour = start;

    console.log(`[suggestAllLongestFeasibleWindows] Trying start hour ${start}`);

    // Try to extend from this start hour, using each crew at most once
    for (let h = start; h < latest; h++) {
      console.log(`  [suggestAllLongestFeasibleWindows] Extending to hour ${h}, usedCrew:`, Array.from(usedCrew));
      
      // Find a crew that can work this hour and hasn't been used yet
      const candidate = eligibleCrewIds.find(crewId => {
        if (usedCrew.has(crewId)) {
          console.log(`    [suggestAllLongestFeasibleWindows] ${crewId} already used, skipping`);
          return false;
        }
        const available = crewAvailableAtHour(eligibilities, shifts, crewId, h, targetRole, existingWindows);
        console.log(`    [suggestAllLongestFeasibleWindows] ${crewId} available at ${h}? ${available}`);
        return available;
      });

      if (!candidate) {
        console.log(`  [suggestAllLongestFeasibleWindows] No candidate found for hour ${h}, stopping at ${endHour}`);
        break; // Can't extend further
      }
      
      console.log(`  [suggestAllLongestFeasibleWindows] Selected ${candidate} for hour ${h}`);
      usedCrew.add(candidate);
      endHour = h + 1;
    }

    const windowLen = endHour - start;
    console.log(`[suggestAllLongestFeasibleWindows] Window from ${start} has length ${windowLen}`);
    
    if (windowLen === 0) continue;

    if (windowLen > maxLen) {
      // Found a longer window, clear previous results
      maxLen = windowLen;
      allWindows.length = 0;
      allWindows.push({ startHour: start, endHour });
    } else if (windowLen === maxLen) {
      // Found another window of the same max length
      allWindows.push({ startHour: start, endHour });
    }
  }

  console.log('[suggestAllLongestFeasibleWindows] Result - maxLen:', maxLen, 'windows:', allWindows.length);
  console.log('[suggestAllLongestFeasibleWindows] Windows:', allWindows);

  return allWindows;
}

export default function WizardCoveragePage() {
  const router = useRouter();
  const { date, storeId, shifts } = useWizardStore();
  const [roles, setRoles] = useState<Role[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [initData, setInitData] = useState<InitResp | null>(null);
  const [coverageWindows, setCoverageWindows] = useState<CoverageWindow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!API_URL) return;
      try {
        const res = await fetch(API_URL + "/stores");
        if (!res.ok) throw new Error(await res.text());
        const json = (await res.json()) as Store[];
        if (!cancelled) setStores(json);
      } catch (e: any) {
        console.error("Failed to load stores:", e);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!API_URL) return;
      if (!date || !shifts?.length || !storeId) return;
      setLoading(true);
      setError(null);
      try {
        const [initRes, rolesRes] = await Promise.all([
          fetch(API_URL + "/wizard/init", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, store_id: storeId, shifts }),
          }),
          fetch(API_URL + "/roles"),
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
    return () => {
      cancelled = true;
    };
  }, [date, shifts, storeId]);

  const availableCoverageRoles = useMemo(() => {
    if (!initData) return [];
    const coverageRoleNames = new Set<string>();
    initData.eligibilities.forEach(e => {
      const name = e.roleName.toUpperCase();
      if (name === "DEMO" || name === "WINE_DEMO") {
        coverageRoleNames.add(e.roleName);
      }
    });
    return roles.filter(r => coverageRoleNames.has(r.name));
  }, [initData, roles]);

  const unadded = useMemo(() => {
    const addedIds = new Set(coverageWindows.map(w => w.roleId));
    return availableCoverageRoles.filter(r => !addedIds.has(r.id));
  }, [availableCoverageRoles, coverageWindows]);

  const noCoverageRoles = useMemo(
    () => !loading && !!initData && availableCoverageRoles.length === 0,
    [loading, initData, availableCoverageRoles]
  );
  
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    if (noCoverageRoles) {
      setRedirecting(true);
      t = setTimeout(() => {
        router.push("/wizard/init");
      }, 2000);
    }
    return () => {
      if (t) clearTimeout(t);
    };
  }, [noCoverageRoles, router]);

  function handleAddRole(roleId: string) {
    const role = roles.find(r => r.id === roleId);
    if (!role || !initData) return;

    const existingWins = coverageWindows
      .filter(w => w.selectedSuggestionIndex !== null)
      .map(w => ({
        roleName: w.roleName,
        windowStart: w.setStart!,
        windowEnd: w.setEnd!,
      }));
    const availByHour = computeAvailByHourWithConflicts(
      initData.eligibilities,
      initData.normalizedShifts,
      role.name,
      existingWins
    );
    
    console.log('[Coverage Debug] Role:', role.name);
    console.log('[Coverage Debug] Shifts:', initData.normalizedShifts);
    console.log('[Coverage Debug] Eligibilities:', initData.eligibilities.filter(e => e.roleName === role.name));
    console.log('[Coverage Debug] availByHour:', availByHour);
    
    // Use matching-based feasibility so each crew can be used at most once
    const allSuggested = suggestAllLongestFeasibleWindows(
      initData.eligibilities,
      initData.normalizedShifts,
      role.name,
      existingWins,
      availByHour
    );
    
    console.log('[Coverage Debug] All suggested windows:', allSuggested);

    const suggestedWindows = allSuggested.length > 0
      ? allSuggested.map(w => ({ start: hh(w.startHour), end: hh(w.endHour) }))
      : [{ start: "09:00", end: "17:00" }]; // Fallback if no windows found

    const newWindow: CoverageWindow = {
      roleId: role.id,
      roleName: role.name,
      suggestedWindows,
      selectedSuggestionIndex: null, // No window selected yet - user must choose
      setStart: null,
      setEnd: null,
      requiredPerHour: 1,
      availByHour,
    };
    setCoverageWindows([...coverageWindows, newWindow]);
  }

  function handleRemoveRole(roleId: string) {
    setCoverageWindows(coverageWindows.filter(w => w.roleId !== roleId));
  }

  function handleUpdateWindow(roleId: string, field: "setStart" | "setEnd", value: string) {
    setCoverageWindows(
      coverageWindows.map(w => {
        if (w.roleId !== roleId || w.selectedSuggestionIndex === null) return w;
        
        // Enforce bounds: setStart >= selected suggested start, setEnd <= selected suggested end
        const selectedWindow = w.suggestedWindows[w.selectedSuggestionIndex];
        const suggestedStartH = parseTimeToHour(selectedWindow.start) ?? 0;
        const suggestedEndH = parseTimeToHour(selectedWindow.end) ?? 24;
        const valueH = parseTimeToHour(value) ?? (field === "setStart" ? suggestedStartH : suggestedEndH);
        
        if (field === "setStart") {
          const clampedH = Math.max(suggestedStartH, Math.min(valueH, parseTimeToHour(w.setStart ?? selectedWindow.start) ?? 24));
          return { ...w, setStart: hh(clampedH) };
        } else {
          const clampedH = Math.min(suggestedEndH, Math.max(valueH, parseTimeToHour(w.setEnd ?? selectedWindow.end) ?? 0));
          return { ...w, setEnd: hh(clampedH) };
        }
      })
    );
  }

  function handleSelectSuggestion(roleId: string, suggestionIndex: number) {
    setCoverageWindows(
      coverageWindows.map(w => {
        if (w.roleId !== roleId) return w;
        const newSuggestion = w.suggestedWindows[suggestionIndex];
        return {
          ...w,
          selectedSuggestionIndex: suggestionIndex,
          setStart: newSuggestion.start,
          setEnd: newSuggestion.end,
        };
      })
    );
  }

  async function handleNext() {
    if (!date || !storeId) return;
    
    // Navigate to store-rules page with selected roles
    // The store-rules page will compute the 3 options automatically
    router.push("/wizard/store-rules");
  }

  async function handleComputeRules() {
    if (!API_URL || !date || !storeId || !initData) return;
    try {
      setLoading(true);
      setError(null);
      setSaveStatus(null);

      // Step 2: Compute all valid crew assignment combinations
      // This finds all ways to cover DEMO and WINE_DEMO windows with no conflicts
      const res = await fetch(API_URL + "/wizard/compute-coverage-combinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          date, 
          store_id: storeId,
          shifts: initData.normalizedShifts 
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }

      const result = await res.json();
      console.log("Coverage combinations result:", result);
      
      setSaveStatus(`Success! Found ${result.totalCombinations || 0} valid crew assignment combination(s).`);
      
      // Log sample formatted combinations to console for debugging
      if (result.sampleFormatted) {
        console.log("Sample schedule sets:");
        result.sampleFormatted.forEach((formatted: string) => console.log(formatted));
      }

      // Redirect to store rules page to view combinations
      setTimeout(() => {
        router.push("/wizard/store-rules");
      }, 1000);
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
      {saveStatus && (
        <div style={{ margin: "8px 0", padding: 8, background: "#eefbea", border: "1px solid #b4e2b5", borderRadius: 6 }}>
          {saveStatus}
        </div>
      )}

      {noCoverageRoles && (
        <div
          role="status"
          aria-live="polite"
          style={{ margin: "16px 0", padding: 16, background: "#f6f8ff", border: "1px solid #b3c0ff", borderRadius: 6, color: "#223" }}
        >
          No DEMO or WINE_DEMO crew available for coverage. Redirecting to next step…
        </div>
      )}

      {!noCoverageRoles && availableCoverageRoles.length > 0 && (
        <section style={{ display: "grid", gap: 16 }}>
          {coverageWindows.map(win => (
            <div key={win.roleId} style={{ padding: 16, border: "1px solid #ccc", borderRadius: 8, background: "#f5f5f5" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <strong style={{ fontSize: 18 }}>{win.roleName}</strong>
                <button
                  type="button"
                  onClick={() => handleRemoveRole(win.roleId)}
                  style={{ padding: "4px 12px", fontSize: 13, background: "#fee", border: "1px solid #f99", borderRadius: 4, cursor: "pointer" }}
                >
                  Remove
                </button>
              </div>

              {/* Show ALL possible windows for selection */}
              <div style={{ marginBottom: 16, padding: 12, background: "#fff", border: "1px solid #ddd", borderRadius: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10, color: "#555" }}>
                  {win.selectedSuggestionIndex === null 
                    ? `All Possible Windows (${win.suggestedWindows.length} option${win.suggestedWindows.length === 1 ? '' : 's'})` 
                    : "Selected Window"}
                </div>
                
                {win.suggestedWindows.length === 0 ? (
                  <div style={{ fontSize: 14, color: "#999" }}>
                    No valid windows found for this role.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {win.suggestedWindows.map((suggestion, idx) => (
                      <label
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: 10,
                          border: win.selectedSuggestionIndex === idx ? "2px solid #36c" : "1px solid #ddd",
                          borderRadius: 4,
                          background: win.selectedSuggestionIndex === idx ? "#f0f8ff" : "#fff",
                          cursor: "pointer",
                          transition: "all 0.2s",
                        }}
                      >
                        <input
                          type="radio"
                          name={`suggestion-${win.roleId}`}
                          checked={win.selectedSuggestionIndex === idx}
                          onChange={() => handleSelectSuggestion(win.roleId, idx)}
                          style={{ cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 16, color: "#333", fontWeight: win.selectedSuggestionIndex === idx ? 600 : 400 }}>
                          {formatHourAmPm(parseTimeToHour(suggestion.start) ?? 0)} – {formatHourAmPm(parseTimeToHour(suggestion.end) ?? 0)}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Only show drag/shrink interface if a window is selected */}
              {win.selectedSuggestionIndex !== null && win.setStart && win.setEnd && (
                <div style={{ marginBottom: 16, padding: 12, background: "#fff", border: "1px solid #36c", borderRadius: 6 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: "#36c" }}>
                    Fine-tune Window (shrink or drag within selected bounds)
                  </div>
                  <div style={{ display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", color: "#555", fontSize: 11 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 14, height: 8, background: "#dbe5ff", border: "1px solid #adc2ff", borderRadius: 2 }} /> Feasible hours
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 14, height: 8, background: "#d4f4dd", border: "1px solid #7ea0ff", borderRadius: 2 }} /> Selected bounds
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <span style={{ width: 14, height: 8, background: "#fff", border: "2px solid #36c", borderRadius: 2 }} /> Current window
                      </span>
                    </div>
                    <HourHeader />
                    <DragRange
                      availByHour={win.availByHour}
                      suggestedStart={win.suggestedWindows[win.selectedSuggestionIndex].start}
                      suggestedEnd={win.suggestedWindows[win.selectedSuggestionIndex].end}
                      start={win.setStart}
                      end={win.setEnd}
                      onChange={(start, end) => {
                        setCoverageWindows(coverageWindows.map(w => w.roleId === win.roleId ? { ...w, setStart: start, setEnd: end } : w));
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}

          {unadded.length > 0 && (
            <div style={{ padding: 12, border: "1px dashed #ccc", borderRadius: 6, background: "#fff" }}>
              <label>
                Add coverage role
                <select
                  value=""
                  onChange={e => {
                    if (e.target.value) handleAddRole(e.target.value);
                  }}
                  style={{ marginLeft: 8, padding: 6 }}
                >
                  <option value="">Choose…</option>
                  {unadded.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
        </section>
      )}

      {!redirecting && (
        <div style={{ marginTop: 20, display: "flex", gap: 12, alignItems: "center" }}>
          <Link href="/wizard/requirements">← Back</Link>
          <button type="button" onClick={handleNext} disabled={loading}>
            {loading ? "Loading…" : "Next →"}
          </button>
        </div>
      )}
    </main>
  );
}

function HourHeader() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2, alignItems: "end" }}>
      {Array.from({ length: 24 }, (_, h) => {
        const label = h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;
        return (
          <div key={h} style={{ textAlign: "center", fontSize: 10, color: "#444" }}>
            {label}
          </div>
        );
      })}
    </div>
  );
}

function CoverageTimelineRow({
  availByHour,
  suggested,
  selected,
}: {
  availByHour: number[];
  suggested: { start: string; end: string };
  selected: { start: string; end: string };
}) {
  const hours = Array.from({ length: 24 }, (_, h) => h);
  const sugStartH = parseTimeToHour(suggested.start);
  const sugEndH = parseTimeToHour(suggested.end);
  const selStartH = parseTimeToHour(selected.start);
  const selEndH = parseTimeToHour(selected.end);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(24, 1fr)", gap: 2 }}>
      {hours.map(h => {
        const feasible = (availByHour[h] ?? 0) >= 1;
        const inSuggested = sugStartH != null && sugEndH != null && h >= sugStartH && h < sugEndH;
        const inSelected = selStartH != null && selEndH != null && h >= selStartH && h < selEndH;
        
        let bg = "#f3f3f3"; // Non-feasible default
        let border = "1px dashed #d0d0d0";
        
        if (feasible) {
          bg = "#dbe5ff"; // Feasible
          border = "1px solid #adc2ff";
        }
        if (inSuggested) {
          bg = "#d4f4dd"; // Suggested window overlay
          border = "1px solid #7ea0ff";
        }
        if (inSelected) {
          border = "2px solid #36c"; // Set window highlight
        }

        const style: React.CSSProperties = {
          height: 14,
          borderRadius: 2,
          border,
          background: bg,
          position: "relative",
        };

        return <div key={h} title={pad2(h) + ":00"} style={style} />;
      })}
    </div>
  );
}

function DragRange({
  availByHour,
  suggestedStart,
  suggestedEnd,
  start,
  end,
  onChange,
}: {
  availByHour: number[];
  suggestedStart: string;
  suggestedEnd: string;
  start: string;
  end: string;
  onChange: (start: string, end: string) => void;
}) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = React.useState<null | 'start' | 'end' | 'move'>(null);
  const [moveOffsetH, setMoveOffsetH] = React.useState<number>(0);

  const sugS = parseTimeToHour(suggestedStart) ?? 0;
  const sugE = parseTimeToHour(suggestedEnd) ?? 24;
  const selS = parseTimeToHour(start) ?? sugS;
  const selE = parseTimeToHour(end) ?? sugE;

  function hourToPct(h: number) {
    return (h / 24) * 100;
  }

  function clientXToHour(clientX: number) {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const rel = Math.min(Math.max(clientX - rect.left, 0), rect.width);
    const pct = rel / rect.width;
    let h = Math.round(pct * 24);
    h = Math.max(sugS, Math.min(h, sugE));
    // keep window non-empty
    if (drag === 'start') h = Math.min(h, selE - 1);
    if (drag === 'end') h = Math.max(h, selS + 1);
    return h;
  }

  function onMouseMove(e: MouseEvent) {
    if (!drag) return;
    const h = clientXToHour(e.clientX);
    if (drag === 'start') {
      onChange(hh(h), end);
    } else if (drag === 'end') {
      onChange(start, hh(h));
    } else if (drag === 'move') {
      const widthH = selE - selS;
      let newStartH = h - moveOffsetH;
      newStartH = Math.max(sugS, Math.min(newStartH, sugE - widthH));
      const newEndH = newStartH + widthH;
      onChange(hh(newStartH), hh(newEndH));
    }
  }

  React.useEffect(() => {
    function up() {
      setDrag(null);
      window.removeEventListener('mousemove', onMouseMove as any);
      window.removeEventListener('mouseup', up);
    }
    if (drag) {
      window.addEventListener('mousemove', onMouseMove as any);
      window.addEventListener('mouseup', up);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove as any);
      window.removeEventListener('mouseup', up);
    };
  }, [drag, start, end, suggestedStart, suggestedEnd]);

  return (
    <div style={{ position: 'relative', height: 28 }}>
      {/* Track */}
      <div ref={trackRef} style={{ position: 'absolute', left: 0, right: 0, top: 12, height: 4, background: '#eee', borderRadius: 4 }} />
      {/* Feasible bars per hour */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 6 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2 }}>
          {Array.from({ length: 24 }, (_, h) => {
            const feasible = (availByHour[h] ?? 0) >= 1;
            return (
              <div key={h} style={{ height: 8, background: feasible ? '#dbe5ff' : '#f3f3f3', border: feasible ? '1px solid #adc2ff' : '1px dashed #d0d0d0', borderRadius: 2 }} />
            );
          })}
        </div>
      </div>
      {/* Suggested overlay */}
      <div style={{ position: 'absolute', left: `${hourToPct(sugS)}%`, width: `${hourToPct(sugE - sugS)}%`, top: 8, height: 12, background: '#d4f4dd', border: '1px solid #7ea0ff', borderRadius: 3 }} />
      {/* Selected window (draggable) */}
      <div
        onMouseDown={(e) => {
          // If click near handles they'll capture; otherwise treat as move
          const h = clientXToHour(e.clientX);
          setDrag('move');
          setMoveOffsetH(h - selS);
        }}
        style={{ position: 'absolute', left: `${hourToPct(selS)}%`, width: `${hourToPct(selE - selS)}%`, top: 8, height: 12, border: '2px solid #36c', background: '#fff', borderRadius: 3, cursor: 'grab' }}
      />
      {/* Handles */}
      <div
        role="slider"
        aria-label="start-handle"
        aria-valuemin={sugS}
        aria-valuemax={selE - 1}
        aria-valuenow={selS}
        onMouseDown={() => setDrag('start')}
        style={{ position: 'absolute', left: `${hourToPct(selS)}%`, top: 4, width: 10, height: 20, marginLeft: -5, background: '#36c', borderRadius: 3, cursor: 'ew-resize' }}
      />
      <div
        role="slider"
        aria-label="end-handle"
        aria-valuemin={selS + 1}
        aria-valuemax={sugE}
        aria-valuenow={selE}
        onMouseDown={() => setDrag('end')}
        style={{ position: 'absolute', left: `${hourToPct(selE)}%`, top: 4, width: 10, height: 20, marginLeft: -5, background: '#36c', borderRadius: 3, cursor: 'ew-resize' }}
      />
    </div>
  );
}
