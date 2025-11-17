export function startOfDay(d: Date | string) {
  // If string, parse as UTC date to avoid timezone shifts
  if (typeof d === 'string') {
    const match = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, year, month, day] = match;
      return new Date(Date.UTC(+year, +month - 1, +day, 0, 0, 0, 0));
    }
  }
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function parseMaybeHM(date: Date, value?: string | null): Date | null {
  if (!value) return null;
  // If it's already an ISO datetime
  if (/T/.test(value)) return new Date(value);
  // Expect HH:mm
  const [h, m] = value.split(':').map(Number);
  const dt = startOfDay(date);
  dt.setHours(h || 0, m || 0, 0, 0);
  return dt;
}

export function hourOf(hhmm: string): number {
  const [h] = hhmm.split(':').map(Number);
  return h || 0;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
