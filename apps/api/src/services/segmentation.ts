export type SegmentKind = 'PRODUCT' | 'REGISTER' | 'FLEX';

export type Segment = {
  startMin: number; // inclusive, minutes since midnight [0,1440)
  endMin: number;   // exclusive
  kind: SegmentKind;
};

function clampDay(n: number) {
  return Math.max(0, Math.min(1440, n));
}

export function hhmmToMin(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return clampDay(h * 60 + m);
}

export function minToHHMM(min: number): string {
  const m = clampDay(min);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}`;
}

// Segments a single-day shift by the store register window.
// Outside window => PRODUCT. Inside window => FLEX (to be allocated to REGISTER/roles later).
export function segmentShiftByRegisterWindow(
  shiftStartMin: number,
  shiftEndMin: number,
  regStartMin: number,
  regEndMin: number
): { segments: Segment[]; productMinutes: number; flexMinutes: number } {
  const S = clampDay(shiftStartMin);
  const E = clampDay(shiftEndMin);
  const RS = clampDay(regStartMin);
  const RE = clampDay(regEndMin);

  const segments: Segment[] = [];
  if (E <= S) return { segments, productMinutes: 0, flexMinutes: 0 };

  // Left PRODUCT: [S, min(E, RS))
  const leftEnd = Math.min(E, RS);
  if (leftEnd > S) segments.push({ startMin: S, endMin: leftEnd, kind: 'PRODUCT' });

  // FLEX window portion: [max(S, RS), min(E, RE))
  const flexStart = Math.max(S, RS);
  const flexEnd = Math.min(E, RE);
  if (flexEnd > flexStart) segments.push({ startMin: flexStart, endMin: flexEnd, kind: 'FLEX' });

  // Right PRODUCT: [max(S, RE), E)
  const rightStart = Math.max(S, RE);
  if (E > rightStart) segments.push({ startMin: rightStart, endMin: E, kind: 'PRODUCT' });

  const productMinutes = segments
    .filter(s => s.kind === 'PRODUCT')
    .reduce((a, s) => a + (s.endMin - s.startMin), 0);
  const flexMinutes = segments
    .filter(s => s.kind === 'FLEX')
    .reduce((a, s) => a + (s.endMin - s.startMin), 0);

  return { segments, productMinutes, flexMinutes };
}

// Optional: after you allocate roles, breaks, and actual REGISTER time within FLEX,
// you can compute final buckets. Roles count toward PRODUCT.
export type Allocation = {
  startMin: number;
  endMin: number;
  type: 'REGISTER' | 'PRODUCT' | 'BREAK' | 'ART' | 'DEMO' | 'WINE_DEMO' | 'ORDER_WRITER' | 'PARKING_HELM';
};

export function summarizeBuckets(
  shiftSegments: Segment[],
  allocations: Allocation[]
): {
  registerMinutes: number;
  productMinutes: number; // includes roles + explicit PRODUCT + PRODUCT edges
  breakMinutes: number;
  roleMinutesByType: Record<string, number>;
} {
  // Compute base PRODUCT minutes from edge segments
  let baseProduct = shiftSegments
    .filter(s => s.kind === 'PRODUCT')
    .reduce((a, s) => a + (s.endMin - s.startMin), 0);

  // Sum allocations inside FLEX
  let registerMinutes = 0;
  let breakMinutes = 0;
  const roleMinutesByType: Record<string, number> = {};
  let explicitProduct = 0;

  for (const a of allocations) {
    const mins = Math.max(0, Math.min(1440, a.endMin) - Math.max(0, a.startMin));
    if (mins <= 0) continue;
    if (a.type === 'REGISTER') registerMinutes += mins;
    else if (a.type === 'BREAK') breakMinutes += mins;
    else if (a.type === 'PRODUCT') explicitProduct += mins;
    else {
      // Roles count as PRODUCT
      roleMinutesByType[a.type] = (roleMinutesByType[a.type] ?? 0) + mins;
    }
  }

  const roleMinutes = Object.values(roleMinutesByType).reduce((a, n) => a + n, 0);
  const productMinutes = baseProduct + explicitProduct + roleMinutes;

  return { registerMinutes, productMinutes, breakMinutes, roleMinutesByType };
}
