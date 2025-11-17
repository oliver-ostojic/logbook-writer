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
  const [hRaw, mRaw] = value.split(':');
  const h = Number(hRaw);
  const m = Number(mRaw);
  // Build a UTC datetime on the same calendar date as `date`
  const y = date.getUTCFullYear();
  const mo = date.getUTCMonth();
  const d = date.getUTCDate();
  return new Date(Date.UTC(y, mo, d, (isNaN(h) ? 0 : h), (isNaN(m) ? 0 : m), 0, 0));
}

export function hourOf(hhmm: string): number {
  const [h] = hhmm.split(':').map(Number);
  return h || 0;
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
