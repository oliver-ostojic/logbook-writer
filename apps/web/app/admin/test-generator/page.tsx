'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  CardContainer,
  GlassPillCard,
  GlassPillButton,
  aiGlassAnimations,
  aiGlassLightBorderStyle,
  aiGlassLightContentStyle,
} from '@/components/ui/ai-glass';
import { NavStatsCard } from '@/app/stores/[storeId]/home/components';
import { useAuthStore } from '@/lib/authStore';
import { logout } from '@/lib/api/auth';
import { authFetch } from '@/lib/api/authFetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
const STORAGE_KEY = 'test-generator-last-inputs';

// ─── Types ────────────────────────────────────────────────────────────────────

type Store = { id: number; name: string };
type Role = { id: number; displayName: string };

type DistRow = { id: string; value: string | number; percentage: number };
type StartTimeRow = { id: string; hhmm: string; percentage: number };
type QuotaLengthRow = { id: string; lengthHours: number; percentage: number };
type QuotaEntry = { id: string; roleId: number; coverageRate: number; lengths: QuotaLengthRow[] };
type CoverageEntry = {
  id: string; roleId: number; startHhmm: string; endHhmm: string;
  pctPerHourMin: number; pctPerHourMax: number;
  constraintRule: 'MIN' | 'MAX' | 'EXACTLY';
};
type WindowCoverageEntry = {
  id: string; roleId: number; startHhmm: string; endHhmm: string;
  crewCount: number; constraintRule: 'MIN' | 'MAX' | 'EXACTLY'; usageProbability: number;
};
type DaySummary = {
  date: string;
  summary: { crewUsed: string[]; shiftsWritten: number; coverageWindowsWritten: number; quotasWritten: number };
};
type PublishDayStatus = 'pending' | 'solving' | 'publishing' | 'success' | 'failed';
type PublishDay = { date: string; status: PublishDayStatus; pctPrefsMet?: number; violationCount?: number; error?: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }
function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function pctTotal(rows: { percentage: number }[]) {
  return rows.reduce((s, r) => s + (r.percentage || 0), 0);
}
function applyVariance(pct: number, variance: number) {
  return { min: Math.max(0.01, pct - variance) / 100, max: Math.min(100, pct + variance) / 100 };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 14, fontWeight: 600, color: '#2C2C2C' }}>
      {children}
    </span>
  );
}

function PctBadge({ rows }: { rows: { percentage: number }[] }) {
  const total = pctTotal(rows);
  const ok = Math.abs(total - 100) < 0.5;
  return (
    <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 12, color: ok ? '#059669' : '#dc2626', fontWeight: 500 }}>
      {total.toFixed(0)}%
    </span>
  );
}

function SmallInput({ label, value, onChange, type = 'number', min, max, step, placeholder }: {
  label?: string; value: string | number; onChange: (v: string) => void;
  type?: string; min?: number; max?: number; step?: number; placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {label && <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>{label}</span>}
      <input
        type={type} value={value ?? ''} min={min} max={max} step={step} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={e => e.target.select()}
        style={{
          fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C',
          background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 8, padding: '5px 10px', width: '100%', outline: 'none',
        }}
      />
    </div>
  );
}

function RemoveBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9A999E', lineHeight: 1, padding: '0 4px' }}>
      ×
    </button>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: '1px dashed rgba(0,0,0,0.15)', borderRadius: 8,
      padding: '6px 14px', cursor: 'pointer', fontFamily: 'var(--font-open-sans)',
      fontSize: 13, color: '#6B6B6B', display: 'flex', alignItems: 'center', gap: 4,
    }}>
      <span style={{ color: 'hsl(0,84%,60%)', fontSize: 15 }}>+</span>{label}
    </button>
  );
}

function DistRowInput({ rows, onChange, valueLabel, valueKind = 'number', valuePlaceholder }: {
  rows: DistRow[]; onChange: (rows: DistRow[]) => void;
  valueLabel: string; valueKind?: 'number' | 'time' | 'hours'; valuePlaceholder?: string;
}) {
  const defaultValue = valueKind === 'time' ? '08:00' : valueKind === 'hours' ? 8 : 0;
  const updateValue = (id: string, val: string) =>
    onChange(rows.map(r => r.id === id ? { ...r, value: valueKind === 'time' ? val : Number(val) } : r));
  const updatePct = (id: string, val: string) =>
    onChange(rows.map(r => r.id === id ? { ...r, percentage: Number(val) } : r));
  const remove = (id: string) => onChange(rows.filter(r => r.id !== id));
  const add = () => onChange([...rows, { id: uid(), value: defaultValue, percentage: 1 }]);
  const inputType = valueKind === 'time' ? 'time' : 'number';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(row => (
        <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <SmallInput label={valueLabel} value={row.value} type={inputType} step={valueKind === 'hours' ? 0.5 : undefined} min={valueKind === 'hours' ? 0 : undefined} placeholder={valuePlaceholder} onChange={v => updateValue(row.id, v)} />
          </div>
          <div style={{ flex: 1 }}>
            <SmallInput label="%" value={row.percentage} onChange={v => updatePct(row.id, v)} />
          </div>
          <RemoveBtn onClick={() => remove(row.id)} />
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <AddBtn label="Add row" onClick={add} />
        {rows.length > 0 && <PctBadge rows={rows} />}
      </div>
    </div>
  );
}

function StartTimeSection({ rows, onChange, variance, onVarianceChange }: {
  rows: StartTimeRow[]; onChange: (rows: StartTimeRow[]) => void;
  variance: number; onVarianceChange: (v: number) => void;
}) {
  const update = (id: string, patch: Partial<StartTimeRow>) =>
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  const remove = (id: string) => onChange(rows.filter(r => r.id !== id));
  const add = () => onChange([...rows, { id: uid(), hhmm: '08:00', percentage: 1 }]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(row => (
        <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <SmallInput label="Time" value={row.hhmm} type="time" onChange={v => update(row.id, { hhmm: v })} />
          </div>
          <div style={{ flex: 1 }}>
            <SmallInput label="%" value={row.percentage} onChange={v => update(row.id, { percentage: Number(v) })} />
          </div>
          <RemoveBtn onClick={() => remove(row.id)} />
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <AddBtn label="Add row" onClick={add} />
        {rows.length > 0 && <PctBadge rows={rows} />}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
        <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>% variance (±)</span>
        <div style={{ width: 80 }}>
          <SmallInput value={variance} min={0} max={100} onChange={v => onVarianceChange(Number(v))} />
        </div>
      </div>
    </div>
  );
}

function QuotaSection({ quotas, roles, onChange }: { quotas: QuotaEntry[]; roles: Role[]; onChange: (quotas: QuotaEntry[]) => void }) {
  const updateQuota = (id: string, patch: Partial<QuotaEntry>) =>
    onChange(quotas.map(q => q.id === id ? { ...q, ...patch } : q));
  const removeQuota = (id: string) => onChange(quotas.filter(q => q.id !== id));
  const addQuota = () => onChange([...quotas, {
    id: uid(), roleId: roles[0]?.id ?? 0, coverageRate: 0.75,
    lengths: [{ id: uid(), lengthHours: 1, percentage: 100 }],
  }]);
  const updateLengths = (qid: string, lengths: QuotaLengthRow[]) => updateQuota(qid, { lengths });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {quotas.map(q => (
        <div key={q.id} style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Role</span>
              <select value={q.roleId} onChange={e => updateQuota(q.id, { roleId: Number(e.target.value) })
              } style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <SmallInput label="Coverage %" value={Math.round(q.coverageRate * 100)} min={0} max={100} onChange={v => updateQuota(q.id, { coverageRate: Number(v) / 100 })} />
            </div>
            <RemoveBtn onClick={() => removeQuota(q.id)} />
          </div>
          <div style={{ borderTop: '1px solid rgba(0,0,0,0.07)', paddingTop: 8 }}>
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Required length distribution</span>
            <div style={{ marginTop: 6 }}>
              {q.lengths.map(row => (
                <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 6 }}>
                  <div style={{ flex: 2 }}>
                    <SmallInput label="Hours" value={row.lengthHours} type="number" step={0.5} min={0} onChange={v => updateLengths(q.id, q.lengths.map(l => l.id === row.id ? { ...l, lengthHours: Number(v) } : l))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <SmallInput label="%" value={row.percentage} onChange={v => updateLengths(q.id, q.lengths.map(l => l.id === row.id ? { ...l, percentage: Number(v) } : l))} />
                  </div>
                  <RemoveBtn onClick={() => updateLengths(q.id, q.lengths.filter(l => l.id !== row.id))} />
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <AddBtn label="Add" onClick={() => updateLengths(q.id, [...q.lengths, { id: uid(), lengthHours: 1, percentage: 1 }])} />
                {q.lengths.length > 0 && <PctBadge rows={q.lengths} />}
              </div>
            </div>
          </div>
        </div>
      ))}
      <AddBtn label="Add quota" onClick={addQuota} />
    </div>
  );
}

function CoverageSection({ windows, roles, onChange }: { windows: CoverageEntry[]; roles: Role[]; onChange: (windows: CoverageEntry[]) => void }) {
  const update = (id: string, patch: Partial<CoverageEntry>) =>
    onChange(windows.map(w => w.id === id ? { ...w, ...patch } : w));
  const remove = (id: string) => onChange(windows.filter(w => w.id !== id));
  const add = () => onChange([...windows, { id: uid(), roleId: roles[0]?.id ?? 0, startHhmm: '08:00', endHhmm: '20:00', pctPerHourMin: 0.15, pctPerHourMax: 0.6, constraintRule: 'MIN' }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {windows.map(w => (
        <div key={w.id} style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Role</span>
              <select value={w.roleId} onChange={e => update(w.id, { roleId: Number(e.target.value) })} style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Rule</span>
              <select value={w.constraintRule} onChange={e => update(w.id, { constraintRule: e.target.value as CoverageEntry['constraintRule'] })} style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}>
                <option value="MIN">MIN</option>
                <option value="MAX">MAX</option>
                <option value="EXACTLY">EXACTLY</option>
              </select>
            </div>
            <RemoveBtn onClick={() => remove(w.id)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><SmallInput label="Start" value={w.startHhmm} type="time" onChange={v => update(w.id, { startHhmm: v })} /></div>
            <div style={{ flex: 1 }}><SmallInput label="End" value={w.endHhmm} type="time" onChange={v => update(w.id, { endHhmm: v })} /></div>
            <div style={{ flex: 1 }}><SmallInput label="% per hr (min)" value={Math.round(w.pctPerHourMin * 100)} min={0} max={100} onChange={v => update(w.id, { pctPerHourMin: Number(v) / 100 })} /></div>
            <div style={{ flex: 1 }}><SmallInput label="% per hr (max)" value={Math.round(w.pctPerHourMax * 100)} min={0} max={100} onChange={v => update(w.id, { pctPerHourMax: Number(v) / 100 })} /></div>
          </div>
        </div>
      ))}
      <AddBtn label="Add coverage window" onClick={add} />
    </div>
  );
}

function WindowCoverageSection({ windows, roles, onChange }: { windows: WindowCoverageEntry[]; roles: Role[]; onChange: (windows: WindowCoverageEntry[]) => void }) {
  const update = (id: string, patch: Partial<WindowCoverageEntry>) =>
    onChange(windows.map(w => w.id === id ? { ...w, ...patch } : w));
  const remove = (id: string) => onChange(windows.filter(w => w.id !== id));
  const add = () => onChange([...windows, { id: uid(), roleId: roles[0]?.id ?? 0, startHhmm: '08:00', endHhmm: '20:00', crewCount: 1, constraintRule: 'EXACTLY', usageProbability: 1 }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {windows.map(w => (
        <div key={w.id} style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Role</span>
              <select value={w.roleId} onChange={e => update(w.id, { roleId: Number(e.target.value) })} style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}>
                {roles.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Rule</span>
              <select value={w.constraintRule} onChange={e => update(w.id, { constraintRule: e.target.value as WindowCoverageEntry['constraintRule'] })} style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}>
                <option value="MIN">MIN</option>
                <option value="MAX">MAX</option>
                <option value="EXACTLY">EXACTLY</option>
              </select>
            </div>
            <RemoveBtn onClick={() => remove(w.id)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}><SmallInput label="Start" value={w.startHhmm} type="time" onChange={v => update(w.id, { startHhmm: v })} /></div>
            <div style={{ flex: 1 }}><SmallInput label="End" value={w.endHhmm} type="time" onChange={v => update(w.id, { endHhmm: v })} /></div>
            <div style={{ flex: 1 }}><SmallInput label="Crew count" value={w.crewCount} type="number" min={0} onChange={v => update(w.id, { crewCount: Number(v) })} /></div>
            <div style={{ flex: 1 }}><SmallInput label="Usage %" value={Math.round(w.usageProbability * 100)} min={0} max={100} onChange={v => update(w.id, { usageProbability: Number(v) / 100 })} /></div>
          </div>
        </div>
      ))}
      <AddBtn label="Add window" onClick={add} />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <CardContainer lightMode={true} borderRadius="1.25rem" padding="12px 14px" borderOpacity={0.08}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <SectionTitle>{title}</SectionTitle>
        {children}
      </div>
    </CardContainer>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TestGeneratorPage() {
  const router = useRouter();
  const { user, logout: logoutStore } = useAuthStore();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const isOutsideButton = userMenuRef.current && !userMenuRef.current.contains(target);
      const isOutsideDropdown = userDropdownRef.current && !userDropdownRef.current.contains(target);
      if (isOutsideButton && isOutsideDropdown) setIsUserMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = async () => {
    setIsUserMenuOpen(false);
    try { await logout(); } catch { /* ignore */ }
    logoutStore();
    router.push('/login');
  };

  const [stores, setStores] = useState<Store[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [storeId, setStoreId] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dayCount, setDayCount] = useState(1);
  const [crewCountMin, setCrewCountMin] = useState(6);
  const [crewCountMax, setCrewCountMax] = useState(10);
  const [pctVariance, setPctVariance] = useState(10);
  const [seed, setSeed] = useState('');
  const [startTimes, setStartTimes] = useState<StartTimeRow[]>([
    { id: uid(), hhmm: '08:00', percentage: 80 },
    { id: uid(), hhmm: '12:00', percentage: 20 },
  ]);
  const [shiftLengths, setShiftLengths] = useState<DistRow[]>([
    { id: uid(), value: 8, percentage: 60 },
    { id: uid(), value: 9, percentage: 40 },
  ]);
  const [quotas, setQuotas] = useState<QuotaEntry[]>([]);
  const [coverage, setCoverage] = useState<CoverageEntry[]>([]);
  const [windowCoverage, setWindowCoverage] = useState<WindowCoverageEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState<DaySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishState, setPublishState] = useState<PublishDay[] | null>(null);

  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (typeof saved.storeId === 'number') setStoreId(saved.storeId);
        if (typeof saved.dayCount === 'number') setDayCount(saved.dayCount);
        if (typeof saved.crewCountMin === 'number') setCrewCountMin(saved.crewCountMin);
        if (typeof saved.crewCountMax === 'number') setCrewCountMax(saved.crewCountMax);
        if (typeof saved.pctVariance === 'number') setPctVariance(saved.pctVariance);
        if (Array.isArray(saved.startTimes)) setStartTimes(saved.startTimes);
        if (Array.isArray(saved.shiftLengths)) setShiftLengths(saved.shiftLengths);
        if (Array.isArray(saved.quotas)) setQuotas(saved.quotas);
        if (Array.isArray(saved.coverage)) setCoverage(saved.coverage);
        if (Array.isArray(saved.windowCoverage)) setWindowCoverage(saved.windowCoverage);
      }
    } catch { /* ignore corrupt state */ }
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        storeId, dayCount, crewCountMin, crewCountMax, pctVariance,
        startTimes, shiftLengths, quotas, coverage, windowCoverage,
      }));
    } catch { /* quota exceeded or unavailable */ }
  }, [hasHydrated, storeId, dayCount, crewCountMin, crewCountMax, pctVariance,
      startTimes, shiftLengths, quotas, coverage, windowCoverage]);

  useEffect(() => {
    authFetch(`${API_URL}/stores`).then(r => r.json()).then((data: Store[]) => {
      setStores(data);
      // Only default to first store if no hydrated storeId was loaded.
      if (data.length > 0) setStoreId(prev => prev || data[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!storeId) return;
    authFetch(`${API_URL}/roles?storeId=${storeId}`).then(r => r.json()).then((data: { id: number; displayName: string }[]) => {
      setRoles(data.map(r => ({ id: r.id, displayName: r.displayName })));
    }).catch(() => {});
  }, [storeId]);

  const handleGenerate = async () => {
    setError(null);
    setDays(null);
    setLoading(true);
    try {
      const body = {
        storeId, date, dayCount,
        seed: seed ? Number(seed) : undefined,
        config: {
          crewCountMin, crewCountMax,
          startTimes: startTimes.map(r => {
            const { min, max } = applyVariance(r.percentage, pctVariance);
            return { timeMin: hhmmToMin(r.hhmm), percentageMin: min * 100, percentageMax: max * 100 };
          }),
          shiftLengths: shiftLengths.map(r => ({ lengthMin: Math.round(Number(r.value) * 60), percentage: r.percentage })),
          quotas: quotas.map(q => ({
            roleId: q.roleId,
            coverageRateMin: q.coverageRate,
            coverageRateMax: q.coverageRate,
            lengths: q.lengths.map(l => ({
              lengthMin: Math.round(l.lengthHours * 60),
              percentageMin: l.percentage,
              percentageMax: l.percentage,
            })),
          })),
          coverage: coverage.map(c => ({
            roleId: c.roleId,
            startMin: hhmmToMin(c.startHhmm), endMin: hhmmToMin(c.endHhmm),
            pctPerHourMin: c.pctPerHourMin, pctPerHourMax: c.pctPerHourMax,
            constraintRule: c.constraintRule,
          })),
          windowCoverage: windowCoverage.map(w => ({
            roleId: w.roleId,
            startMin: hhmmToMin(w.startHhmm), endMin: hhmmToMin(w.endHhmm),
            crewCount: w.crewCount, constraintRule: w.constraintRule,
            usageProbability: w.usageProbability,
          })),
        },
      };

      const res = await authFetch(`${API_URL}/testgen/generate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.details?.map((d: { path: string[]; message: string }) =>
          `${d.path.join('.')}: ${d.message}`
        ).join(' | ');
        setError(detail || data.error || 'Generation failed');
      } else setDays(data.days);
    } catch (err: any) {
      setError(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!days || days.length === 0) return;
    setPublishState(days.map(d => ({ date: d.date, status: 'pending' })));
    setPublishing(true);

    const updateDay = (date: string, patch: Partial<PublishDay>) =>
      setPublishState(prev => prev ? prev.map(p => p.date === date ? { ...p, ...patch } : p) : prev);

    for (const day of days) {
      updateDay(day.date, { status: 'solving' });
      try {
        const solveRes = await authFetch(`${API_URL}/solver/v2/solve`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, date: day.date, saveLogbook: true }),
        });
        const solveData = await solveRes.json();
        if (!solveRes.ok || !solveData.success || !solveData.logbookId) {
          updateDay(day.date, { status: 'failed', error: solveData.error || `Solver ${solveData.status || 'failed'}` });
          continue;
        }
        const violations: Array<{ category: string }> = solveData.constraintAnalysis?.violations ?? [];
        const violationCount = violations.length;
        updateDay(day.date, { status: 'publishing', violationCount });

        const publishRes = await authFetch(`${API_URL}/schedule/logbook/${solveData.logbookId}/publish`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
        });
        if (!publishRes.ok) {
          const publishData = await publishRes.json().catch(() => ({}));
          updateDay(day.date, { status: 'failed', error: publishData.error || 'Publish failed' });
          continue;
        }

        const logbookRes = await authFetch(`${API_URL}/schedule/logbook/${solveData.logbookId}`);
        const logbookData = await logbookRes.json().catch(() => ({}));
        const pm = logbookData?.preferenceMetadata;
        console.log(`[publish ${day.date}] status=${logbookRes.status}`, {
          preferenceMetadata: pm,
          percentMet: pm?.percentMet,
          avgSatisfactionPerCrew: pm?.avgSatisfactionPerCrew,
          avgSatisfaction: pm?.avgSatisfaction,
        });
        const pctPrefsMet =
          pm?.avgSatisfactionPerCrew ??
          pm?.avgSatisfaction ??
          pm?.percentMet ??
          0;
        updateDay(day.date, { status: 'success', pctPrefsMet });
      } catch (err: any) {
        updateDay(day.date, { status: 'failed', error: err.message || 'Unexpected error' });
      }
    }
    setPublishing(false);
  };

  const inputStyle = {
    fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C',
    background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)',
    borderRadius: 8, padding: '5px 10px', outline: 'none',
  } as const;

  return (
    <main className="min-h-screen" style={{ backgroundColor: 'transparent' }}>
      <style dangerouslySetInnerHTML={{ __html: aiGlassAnimations }} />
      <div className="px-6 lg:px-8 pt-12 pb-12" style={{ maxWidth: 700, margin: '0 auto' }}>
        <div className="ai-glass-border" style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}>
          <div className="rounded-[1.5rem]" style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '1rem' }}>
            <div className="flex flex-col gap-4">

              {/* Header */}
              <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
                <GlassPillCard padding="8px" borderRadius="1.5rem 1.5rem 0 0" borderOpacity={0.08} contentStyle={{ width: '100%' }}>
                  <nav className="flex items-center" style={{ width: '100%', gap: '8px' }}>
                    <NavStatsCard
                      label="Admin"
                      textOnly
                      isActive={false}
                      onClick={() => router.push('/admin')}
                    />
                    <NavStatsCard
                      label="Test Generator"
                      textOnly
                      isActive={true}
                      onClick={() => {}}
                    />
                    <div ref={userMenuRef} style={{ flex: 1, display: 'flex' }}>
                      <NavStatsCard
                        label="Account"
                        textOnly
                        isActive={isUserMenuOpen}
                        onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                      />
                    </div>
                  </nav>
                </GlassPillCard>
              </div>

              {/* Scope */}
              <Section title="Scope">
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 160px' }}>
                    <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E', display: 'block', marginBottom: 2 }}>Store</label>
                    <select value={storeId} onChange={e => setStoreId(Number(e.target.value))} style={{ ...inputStyle, width: '100%' }}>
                      {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: '1 1 130px' }}>
                    <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E', display: 'block', marginBottom: 2 }}>Start date</label>
                    <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 1 70px' }}>
                    <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E', display: 'block', marginBottom: 2 }}>Days</label>
                    <input type="number" value={dayCount} min={1} onChange={e => setDayCount(Math.max(1, Number(e.target.value)))} onFocus={e => e.target.select()} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 1 80px' }}>
                    <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E', display: 'block', marginBottom: 2 }}>Crew min</label>
                    <input type="number" value={crewCountMin} min={1} onChange={e => setCrewCountMin(Number(e.target.value))} onFocus={e => e.target.select()} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 1 80px' }}>
                    <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E', display: 'block', marginBottom: 2 }}>Crew max</label>
                    <input type="number" value={crewCountMax} min={1} onChange={e => setCrewCountMax(Number(e.target.value))} onFocus={e => e.target.select()} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 1 100px' }}>
                    <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E', display: 'block', marginBottom: 2 }}>Seed (opt)</label>
                    <input type="number" value={seed} placeholder="random" onChange={e => setSeed(e.target.value)} onFocus={e => e.target.select()} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                </div>
              </Section>

              <Section title="Start Times">
                <StartTimeSection rows={startTimes} onChange={setStartTimes} variance={pctVariance} onVarianceChange={setPctVariance} />
              </Section>

              <Section title="Shift Lengths">
                <DistRowInput rows={shiftLengths} onChange={setShiftLengths} valueLabel="Hours" valueKind="hours" />
              </Section>

              <Section title="Quotas">
                <QuotaSection quotas={quotas} roles={roles} onChange={setQuotas} />
              </Section>

              <Section title="Window Coverage (fixed crew)">
                <WindowCoverageSection windows={windowCoverage} roles={roles} onChange={setWindowCoverage} />
              </Section>

              <Section title="Coverage Windows (per hour)">
                <CoverageSection windows={coverage} roles={roles} onChange={setCoverage} />
              </Section>

              {error && (
                <div style={{ background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: 10, padding: '10px 14px', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#dc2626' }}>
                  {error}
                </div>
              )}

              {days && (
                <div style={{ background: 'rgba(5,150,105,0.07)', border: '1px solid rgba(5,150,105,0.2)', borderRadius: 10, padding: '10px 14px', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#047857', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontWeight: 600 }}>Generated {days.length} day{days.length !== 1 ? 's' : ''}</span>
                  {days.map(d => (
                    <div key={d.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#065f46' }}>
                      <span style={{ fontWeight: 500 }}>{d.date}</span>
                      <span>{d.summary.shiftsWritten} shifts · {d.summary.coverageWindowsWritten} windows · {d.summary.quotasWritten} quotas</span>
                    </div>
                  ))}
                </div>
              )}

              <GlassPillButton onClick={handleGenerate} disabled={loading || !storeId} padding="12px 24px" backgroundOpacity={0.7} contentStyle={{ justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 14, fontWeight: 600, color: '#2C2C2C' }}>
                  {loading ? 'Generating...' : 'Generate & Save'}
                </span>
              </GlassPillButton>

              <GlassPillButton onClick={handlePublish} disabled={publishing || !days || days.length === 0} padding="12px 24px" backgroundOpacity={0.7} contentStyle={{ justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 14, fontWeight: 600, color: '#2C2C2C' }}>
                  {publishing ? 'Publishing...' : 'Publish Logbooks'}
                </span>
              </GlassPillButton>

              {publishState && <PublishStrip days={publishState} />}
            </div>
          </div>
        </div>
      </div>

      {/* Account dropdown */}
      {isUserMenuOpen && userMenuRef.current && (
        <div
          ref={(el) => {
            userDropdownRef.current = el;
            if (el && userMenuRef.current) {
              const rect = userMenuRef.current.getBoundingClientRect();
              el.style.top = `${rect.bottom + 16}px`;
              el.style.left = `${rect.left}px`;
              el.style.width = `${rect.width}px`;
            }
          }}
          className="ai-glass-border"
          style={{ ...aiGlassLightBorderStyle('1rem'), position: 'fixed', zIndex: 99999 }}
        >
          <div style={{ ...aiGlassLightContentStyle('1rem', 0.95), padding: '8px', position: 'relative', zIndex: 5 }}>
            {user && (
              <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(0, 0, 0, 0.08)', marginBottom: '8px' }}>
                <div style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 600, color: '#2C2C2C' }}>{user.name}</div>
                <div style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#6B6B6B', marginTop: '2px' }}>{user.username}</div>
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="w-full transition-all"
              style={{ padding: '10px 16px', borderRadius: '8px', border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#2C2C2C', textAlign: 'left' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.04)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// ─── Publish strip ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<PublishDayStatus, { bg: string; border: string; dot: string; text: string }> = {
  pending:    { bg: 'rgba(0,0,0,0.03)',       border: 'rgba(0,0,0,0.08)',        dot: '#9A999E', text: '#6B6B6B' },
  solving:    { bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.25)',   dot: '#3b82f6', text: '#1d4ed8' },
  publishing: { bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.25)',   dot: '#a855f7', text: '#7e22ce' },
  success:    { bg: 'rgba(5,150,105,0.08)',   border: 'rgba(5,150,105,0.25)',    dot: '#059669', text: '#047857' },
  failed:     { bg: 'rgba(220,38,38,0.08)',   border: 'rgba(220,38,38,0.25)',    dot: '#dc2626', text: '#b91c1c' },
};

const STATUS_LABEL: Record<PublishDayStatus, string> = {
  pending: 'Queued', solving: 'Solving', publishing: 'Publishing', success: 'Published', failed: 'Failed',
};

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

function PublishStrip({ days }: { days: PublishDay[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 12, padding: 10 }}>
      {days.map(d => {
        const c = STATUS_COLORS[d.status];
        const pulsing = d.status === 'solving' || d.status === 'publishing';
        return (
          <div key={d.date} title={d.error ? `${d.date}: ${d.error}` : `${d.date} — ${STATUS_LABEL[d.status]}`} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10, padding: '8px 10px', minWidth: 96, display: 'flex', flexDirection: 'column', gap: 4, fontFamily: 'var(--font-open-sans)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span className={pulsing ? 'animate-pulse' : undefined} style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2C2C2C' }}>{formatShortDate(d.date)}</span>
            </div>
            <span style={{ fontSize: 10, color: c.text, fontWeight: 500 }}>{STATUS_LABEL[d.status]}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, fontSize: 10, color: '#6B6B6B' }}>
              <span>{d.pctPrefsMet !== undefined ? `${d.pctPrefsMet.toFixed(0)}% prefs` : '—'}</span>
              <span>{d.violationCount !== undefined ? `${d.violationCount} violation${d.violationCount === 1 ? '' : 's'}` : ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
