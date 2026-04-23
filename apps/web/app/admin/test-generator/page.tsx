'use client';

import { useState, useEffect } from 'react';
import {
  CardContainer,
  GlassPillCard,
  GlassPillButton,
  aiGlassAnimations,
  aiGlassLightBorderStyle,
  aiGlassLightContentStyle,
} from '@/components/ui/ai-glass';
import { authFetch } from '@/lib/api/authFetch';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// ─── Types ────────────────────────────────────────────────────────────────────

type Store = { id: number; name: string };
type Role = { id: number; displayName: string };

type DistRow = { id: string; value: string | number; percentage: number };
type StartTimeRow = { id: string; hhmm: string; percentageMin: number; percentageMax: number };
type QuotaLengthRow = { id: string; lengthHours: number; percentageMin: number; percentageMax: number };
type QuotaEntry = {
  id: string;
  roleId: number;
  coverageRateMin: number;
  coverageRateMax: number;
  lengths: QuotaLengthRow[];
};
type CoverageEntry = {
  id: string;
  roleId: number;
  startHhmm: string;
  endHhmm: string;
  pctPerHourMin: number;
  pctPerHourMax: number;
  constraintRule: 'MIN' | 'MAX' | 'EXACTLY';
};
type WindowCoverageEntry = {
  id: string;
  roleId: number;
  startHhmm: string;
  endHhmm: string;
  crewCount: number;
  constraintRule: 'MIN' | 'MAX' | 'EXACTLY';
  usageProbability: number;
};

type DaySummary = {
  date: string;
  summary: {
    crewUsed: string[];
    shiftsWritten: number;
    coverageWindowsWritten: number;
    quotasWritten: number;
  };
};

type PublishDayStatus = 'pending' | 'solving' | 'publishing' | 'success' | 'failed';
type PublishDay = {
  date: string;
  status: PublishDayStatus;
  pctPrefsMet?: number;
  gapCount?: number;
  error?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2); }
function hhmmToMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}
function pctTotal(rows: { percentageMin: number }[]) {
  return rows.reduce((s, r) => s + (r.percentageMin || 0), 0);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 14, fontWeight: 600, color: '#2C2C2C' }}>
      {children}
    </span>
  );
}

function PctBadge({ rows }: { rows: { percentageMin: number }[] }) {
  const total = pctTotal(rows);
  const ok = Math.abs(total - 100) < 0.5;
  return (
    <span style={{
      fontFamily: 'var(--font-open-sans)', fontSize: 12,
      color: ok ? '#059669' : '#dc2626', fontWeight: 500,
    }}>
      {total.toFixed(0)}%
    </span>
  );
}

function SmallInput({
  label, value, onChange, type = 'number', min, max, step, placeholder
}: {
  label?: string; value: string | number; onChange: (v: string) => void;
  type?: string; min?: number; max?: number; step?: number; placeholder?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {label && <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>{label}</span>}
      <input
        type={type}
        value={value}
        min={min} max={max} step={step}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
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
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 16, color: '#9A999E', lineHeight: 1, padding: '0 4px',
      }}
    >
      ×
    </button>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: '1px dashed rgba(0,0,0,0.15)',
        borderRadius: 8, padding: '6px 14px', cursor: 'pointer',
        fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#6B6B6B',
        display: 'flex', alignItems: 'center', gap: 4,
      }}
    >
      <span style={{ color: 'hsl(0,84%,60%)', fontSize: 15 }}>+</span>{label}
    </button>
  );
}

function DistRowInput({
  rows, onChange, valueLabel, valueKind = 'number', valuePlaceholder
}: {
  rows: DistRow[];
  onChange: (rows: DistRow[]) => void;
  valueLabel: string;
  valueKind?: 'number' | 'time' | 'hours';
  valuePlaceholder?: string;
}) {
  const defaultValue = valueKind === 'time' ? '08:00' : valueKind === 'hours' ? 8 : 0;
  const updateValue = (id: string, val: string) =>
    onChange(rows.map(r => r.id === id ? { ...r, value: valueKind === 'time' ? val : Number(val) } : r));
  const updatePct = (id: string, val: string) =>
    onChange(rows.map(r => r.id === id ? { ...r, percentage: Number(val) } : r));
  const remove = (id: string) => onChange(rows.filter(r => r.id !== id));
  const add = () => onChange([...rows, { id: uid(), value: defaultValue, percentage: 0 }]);

  const inputType = valueKind === 'time' ? 'time' : 'number';
  const inputStep = valueKind === 'hours' ? 0.5 : undefined;
  const inputMin = valueKind === 'hours' ? 0 : undefined;

  const pctRows = rows.map(r => ({ percentageMin: r.percentage }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(row => (
        <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <SmallInput label={valueLabel} value={row.value} type={inputType} step={inputStep} min={inputMin} placeholder={valuePlaceholder} onChange={v => updateValue(row.id, v)} />
          </div>
          <div style={{ flex: 1 }}>
            <SmallInput label="%" value={row.percentage} onChange={v => updatePct(row.id, v)} />
          </div>
          <RemoveBtn onClick={() => remove(row.id)} />
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <AddBtn label="Add row" onClick={add} />
        {rows.length > 0 && <PctBadge rows={pctRows} />}
      </div>
    </div>
  );
}

function QuotaSection({
  quotas, roles, onChange,
}: {
  quotas: QuotaEntry[];
  roles: Role[];
  onChange: (quotas: QuotaEntry[]) => void;
}) {
  const updateQuota = (id: string, patch: Partial<QuotaEntry>) =>
    onChange(quotas.map(q => q.id === id ? { ...q, ...patch } : q));
  const removeQuota = (id: string) => onChange(quotas.filter(q => q.id !== id));
  const addQuota = () => onChange([...quotas, {
    id: uid(), roleId: roles[0]?.id ?? 0,
    coverageRateMin: 0.6, coverageRateMax: 0.9,
    lengths: [{ id: uid(), lengthHours: 1, percentageMin: 100, percentageMax: 100 }],
  }]);

  const updateLengths = (qid: string, lengths: QuotaLengthRow[]) => updateQuota(qid, { lengths });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {quotas.map(q => (
        <div key={q.id} style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Role</span>
              <select
                value={q.roleId}
                onChange={e => updateQuota(q.id, { roleId: Number(e.target.value) })}
                style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}
              >
                {roles.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <SmallInput label="Coverage % min" value={Math.round(q.coverageRateMin * 100)} min={0} max={100} onChange={v => updateQuota(q.id, { coverageRateMin: Number(v) / 100 })} />
            </div>
            <div style={{ flex: 1 }}>
              <SmallInput label="Coverage % max" value={Math.round(q.coverageRateMax * 100)} min={0} max={100} onChange={v => updateQuota(q.id, { coverageRateMax: Number(v) / 100 })} />
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
                    <SmallInput label="% min" value={row.percentageMin} onChange={v => updateLengths(q.id, q.lengths.map(l => l.id === row.id ? { ...l, percentageMin: Number(v) } : l))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <SmallInput label="% max" value={row.percentageMax} onChange={v => updateLengths(q.id, q.lengths.map(l => l.id === row.id ? { ...l, percentageMax: Number(v) } : l))} />
                  </div>
                  <RemoveBtn onClick={() => updateLengths(q.id, q.lengths.filter(l => l.id !== row.id))} />
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <AddBtn label="Add" onClick={() => updateLengths(q.id, [...q.lengths, { id: uid(), lengthHours: 1, percentageMin: 0, percentageMax: 0 }])} />
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

function CoverageSection({
  windows, roles, onChange,
}: {
  windows: CoverageEntry[];
  roles: Role[];
  onChange: (windows: CoverageEntry[]) => void;
}) {
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
              <select
                value={w.roleId}
                onChange={e => update(w.id, { roleId: Number(e.target.value) })}
                style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}
              >
                {roles.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Rule</span>
              <select
                value={w.constraintRule}
                onChange={e => update(w.id, { constraintRule: e.target.value as CoverageEntry['constraintRule'] })}
                style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}
              >
                <option value="MIN">MIN</option>
                <option value="MAX">MAX</option>
                <option value="EXACTLY">EXACTLY</option>
              </select>
            </div>
            <RemoveBtn onClick={() => remove(w.id)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <SmallInput label="Start" value={w.startHhmm} type="time" onChange={v => update(w.id, { startHhmm: v })} />
            </div>
            <div style={{ flex: 1 }}>
              <SmallInput label="End" value={w.endHhmm} type="time" onChange={v => update(w.id, { endHhmm: v })} />
            </div>
            <div style={{ flex: 1 }}>
              <SmallInput label="% per hour (min)" value={Math.round(w.pctPerHourMin * 100)} min={0} max={100} onChange={v => update(w.id, { pctPerHourMin: Number(v) / 100 })} />
            </div>
            <div style={{ flex: 1 }}>
              <SmallInput label="% per hour (max)" value={Math.round(w.pctPerHourMax * 100)} min={0} max={100} onChange={v => update(w.id, { pctPerHourMax: Number(v) / 100 })} />
            </div>
          </div>
        </div>
      ))}
      <AddBtn label="Add coverage window" onClick={add} />
    </div>
  );
}

function WindowCoverageSection({
  windows, roles, onChange,
}: {
  windows: WindowCoverageEntry[];
  roles: Role[];
  onChange: (windows: WindowCoverageEntry[]) => void;
}) {
  const update = (id: string, patch: Partial<WindowCoverageEntry>) =>
    onChange(windows.map(w => w.id === id ? { ...w, ...patch } : w));
  const remove = (id: string) => onChange(windows.filter(w => w.id !== id));
  const add = () => onChange([...windows, {
    id: uid(), roleId: roles[0]?.id ?? 0, startHhmm: '08:00', endHhmm: '20:00',
    crewCount: 1, constraintRule: 'EXACTLY', usageProbability: 1,
  }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {windows.map(w => (
        <div key={w.id} style={{ background: 'rgba(0,0,0,0.03)', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 2 }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Role</span>
              <select
                value={w.roleId}
                onChange={e => update(w.id, { roleId: Number(e.target.value) })}
                style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}
              >
                {roles.map(r => <option key={r.id} value={r.id}>{r.displayName}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E' }}>Rule</span>
              <select
                value={w.constraintRule}
                onChange={e => update(w.id, { constraintRule: e.target.value as WindowCoverageEntry['constraintRule'] })}
                style={{ display: 'block', width: '100%', fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#2C2C2C', background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.1)', borderRadius: 8, padding: '5px 10px', outline: 'none', marginTop: 2 }}
              >
                <option value="MIN">MIN</option>
                <option value="MAX">MAX</option>
                <option value="EXACTLY">EXACTLY</option>
              </select>
            </div>
            <RemoveBtn onClick={() => remove(w.id)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <SmallInput label="Start" value={w.startHhmm} type="time" onChange={v => update(w.id, { startHhmm: v })} />
            </div>
            <div style={{ flex: 1 }}>
              <SmallInput label="End" value={w.endHhmm} type="time" onChange={v => update(w.id, { endHhmm: v })} />
            </div>
            <div style={{ flex: 1 }}>
              <SmallInput label="Crew count" value={w.crewCount} type="number" min={0} onChange={v => update(w.id, { crewCount: Number(v) })} />
            </div>
            <div style={{ flex: 1 }}>
              <SmallInput label="Usage %" value={Math.round(w.usageProbability * 100)} min={0} max={100} onChange={v => update(w.id, { usageProbability: Number(v) / 100 })} />
            </div>
          </div>
        </div>
      ))}
      <AddBtn label="Add window" onClick={add} />
    </div>
  );
}

function StartTimeSection({
  rows, onChange,
}: {
  rows: StartTimeRow[];
  onChange: (rows: StartTimeRow[]) => void;
}) {
  const update = (id: string, patch: Partial<StartTimeRow>) =>
    onChange(rows.map(r => r.id === id ? { ...r, ...patch } : r));
  const remove = (id: string) => onChange(rows.filter(r => r.id !== id));
  const add = () => onChange([...rows, { id: uid(), hhmm: '08:00', percentageMin: 0, percentageMax: 0 }]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rows.map(row => (
        <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div style={{ flex: 2 }}>
            <SmallInput label="Time" value={row.hhmm} type="time" onChange={v => update(row.id, { hhmm: v })} />
          </div>
          <div style={{ flex: 1 }}>
            <SmallInput label="% min" value={row.percentageMin} onChange={v => update(row.id, { percentageMin: Number(v) })} />
          </div>
          <div style={{ flex: 1 }}>
            <SmallInput label="% max" value={row.percentageMax} onChange={v => update(row.id, { percentageMax: Number(v) })} />
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
  const [stores, setStores] = useState<Store[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [storeId, setStoreId] = useState<number>(0);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [dayCount, setDayCount] = useState(1);
  const [crewCountMin, setCrewCountMin] = useState(6);
  const [crewCountMax, setCrewCountMax] = useState(10);
  const [seed, setSeed] = useState('');
  const [startTimes, setStartTimes] = useState<StartTimeRow[]>([
    { id: uid(), hhmm: '08:00', percentageMin: 70, percentageMax: 90 },
    { id: uid(), hhmm: '12:00', percentageMin: 10, percentageMax: 30 },
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

  useEffect(() => {
    authFetch(`${API_URL}/stores`).then(r => r.json()).then((data: Store[]) => {
      setStores(data);
      if (data.length > 0) setStoreId(data[0].id);
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
        storeId,
        date,
        dayCount,
        seed: seed ? Number(seed) : undefined,
        config: {
          crewCountMin,
          crewCountMax,
          startTimes: startTimes.map(r => ({ timeMin: hhmmToMin(r.hhmm), percentageMin: r.percentageMin, percentageMax: r.percentageMax })),
          shiftLengths: shiftLengths.map(r => ({ lengthMin: Math.round(Number(r.value) * 60), percentage: r.percentage })),
          quotas: quotas.map(q => ({
            roleId: q.roleId,
            coverageRateMin: q.coverageRateMin,
            coverageRateMax: q.coverageRateMax,
            lengths: q.lengths.map(l => ({
              lengthMin: Math.round(l.lengthHours * 60),
              percentageMin: l.percentageMin,
              percentageMax: l.percentageMax,
            })),
          })),
          coverage: coverage.map(c => ({
            roleId: c.roleId,
            startMin: hhmmToMin(c.startHhmm),
            endMin: hhmmToMin(c.endHhmm),
            pctPerHourMin: c.pctPerHourMin,
            pctPerHourMax: c.pctPerHourMax,
            constraintRule: c.constraintRule,
          })),
          windowCoverage: windowCoverage.map(w => ({
            roleId: w.roleId,
            startMin: hhmmToMin(w.startHhmm),
            endMin: hhmmToMin(w.endHhmm),
            crewCount: w.crewCount,
            constraintRule: w.constraintRule,
            usageProbability: w.usageProbability,
          })),
        },
      };

      const res = await authFetch(`${API_URL}/testgen/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed');
      } else {
        setDays(data.days);
      }
    } catch (err: any) {
      setError(err.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async () => {
    if (!days || days.length === 0) return;
    const initial: PublishDay[] = days.map(d => ({ date: d.date, status: 'pending' }));
    setPublishState(initial);
    setPublishing(true);

    const updateDay = (date: string, patch: Partial<PublishDay>) => {
      setPublishState(prev => prev ? prev.map(p => p.date === date ? { ...p, ...patch } : p) : prev);
    };

    for (const day of days) {
      updateDay(day.date, { status: 'solving' });
      try {
        const solveRes = await authFetch(`${API_URL}/solver/v2/solve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storeId, date: day.date, saveLogbook: true }),
        });
        const solveData = await solveRes.json();
        if (!solveRes.ok || !solveData.success || !solveData.logbookId) {
          updateDay(day.date, { status: 'failed', error: solveData.error || `Solver ${solveData.status || 'failed'}` });
          continue;
        }

        const prefSummary = solveData.constraintAnalysis?.preferenceSummary;
        const pctPrefsMet = prefSummary && prefSummary.totalPreferences > 0
          ? (prefSummary.satisfiedPreferences / prefSummary.totalPreferences) * 100
          : 0;
        const violations: Array<{ category: string; details?: { gapCount?: number } }> = solveData.constraintAnalysis?.violations ?? [];
        const gapCount = violations
          .filter(v => v.category === 'gap')
          .reduce((s, v) => s + (v.details?.gapCount ?? 0), 0);

        updateDay(day.date, { status: 'publishing', pctPrefsMet, gapCount });

        const publishRes = await authFetch(`${API_URL}/schedule/logbook/${solveData.logbookId}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!publishRes.ok) {
          const publishData = await publishRes.json().catch(() => ({}));
          updateDay(day.date, { status: 'failed', error: publishData.error || 'Publish failed' });
          continue;
        }

        updateDay(day.date, { status: 'success' });
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
        <div
          className="ai-glass-border"
          style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
        >
          <div
            className="rounded-[1.5rem]"
            style={{ ...aiGlassLightContentStyle('1.5rem', 0.6), padding: '1rem' }}
          >
            <div className="flex flex-col gap-4">
              {/* Header */}
              <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
                <GlassPillCard padding="8px" borderRadius="1.5rem 1.5rem 0 0" borderOpacity={0.08} contentStyle={{ width: '100%' }}>
                  <div style={{ padding: '8px 10px' }}>
                    <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 15, fontWeight: 600, color: '#2C2C2C' }}>
                      Test Generator
                    </span>
                  </div>
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
                    <input type="number" value={dayCount} min={1} onChange={e => setDayCount(Math.max(1, Number(e.target.value)))} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 1 80px' }}>
                    <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E', display: 'block', marginBottom: 2 }}>Crew min</label>
                    <input type="number" value={crewCountMin} min={1} onChange={e => setCrewCountMin(Number(e.target.value))} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 1 80px' }}>
                    <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E', display: 'block', marginBottom: 2 }}>Crew max</label>
                    <input type="number" value={crewCountMax} min={1} onChange={e => setCrewCountMax(Number(e.target.value))} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                  <div style={{ flex: '0 1 100px' }}>
                    <label style={{ fontFamily: 'var(--font-open-sans)', fontSize: 11, color: '#9A999E', display: 'block', marginBottom: 2 }}>Seed (opt)</label>
                    <input type="number" value={seed} placeholder="random" onChange={e => setSeed(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
                  </div>
                </div>
              </Section>

              {/* Start times */}
              <Section title="Start Times">
                <StartTimeSection rows={startTimes} onChange={setStartTimes} />
              </Section>

              {/* Shift lengths */}
              <Section title="Shift Lengths">
                <DistRowInput rows={shiftLengths} onChange={setShiftLengths} valueLabel="Hours" valueKind="hours" />
              </Section>

              {/* Quotas */}
              <Section title="Quotas">
                <QuotaSection quotas={quotas} roles={roles} onChange={setQuotas} />
              </Section>

              {/* Window coverage (fixed crew across full window) */}
              <Section title="Window Coverage (fixed crew)">
                <WindowCoverageSection windows={windowCoverage} roles={roles} onChange={setWindowCoverage} />
              </Section>

              {/* Coverage windows (per hour) */}
              <Section title="Coverage Windows (per hour)">
                <CoverageSection windows={coverage} roles={roles} onChange={setCoverage} />
              </Section>

              {/* Error banner */}
              {error && (
                <div style={{
                  background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)',
                  borderRadius: 10, padding: '10px 14px',
                  fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#dc2626',
                }}>
                  {error}
                </div>
              )}

              {/* Success summary */}
              {days && (
                <div style={{
                  background: 'rgba(5,150,105,0.07)', border: '1px solid rgba(5,150,105,0.2)',
                  borderRadius: 10, padding: '10px 14px',
                  fontFamily: 'var(--font-open-sans)', fontSize: 13, color: '#047857',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <span style={{ fontWeight: 600 }}>Generated {days.length} day{days.length !== 1 ? 's' : ''}</span>
                  {days.map(d => (
                    <div key={d.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#065f46' }}>
                      <span style={{ fontWeight: 500 }}>{d.date}</span>
                      <span>{d.summary.shiftsWritten} shifts · {d.summary.coverageWindowsWritten} windows · {d.summary.quotasWritten} quotas</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Generate button */}
              <GlassPillButton
                onClick={handleGenerate}
                disabled={loading || !storeId}
                padding="12px 24px"
                backgroundOpacity={0.7}
                contentStyle={{ justifyContent: 'center' }}
              >
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 14, fontWeight: 600, color: '#2C2C2C' }}>
                  {loading ? 'Generating...' : 'Generate & Save'}
                </span>
              </GlassPillButton>

              {/* Publish button */}
              <GlassPillButton
                onClick={handlePublish}
                disabled={publishing || !days || days.length === 0}
                padding="12px 24px"
                backgroundOpacity={0.7}
                contentStyle={{ justifyContent: 'center' }}
              >
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: 14, fontWeight: 600, color: '#2C2C2C' }}>
                  {publishing ? 'Publishing...' : 'Publish Logbooks'}
                </span>
              </GlassPillButton>

              {/* Publish progress strip */}
              {publishState && <PublishStrip days={publishState} />}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// ─── Publish strip ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<PublishDayStatus, { bg: string; border: string; dot: string; text: string }> = {
  pending:    { bg: 'rgba(0,0,0,0.03)',        border: 'rgba(0,0,0,0.08)',  dot: '#9A999E', text: '#6B6B6B' },
  solving:    { bg: 'rgba(59,130,246,0.08)',   border: 'rgba(59,130,246,0.25)', dot: '#3b82f6', text: '#1d4ed8' },
  publishing: { bg: 'rgba(168,85,247,0.08)',   border: 'rgba(168,85,247,0.25)', dot: '#a855f7', text: '#7e22ce' },
  success:    { bg: 'rgba(5,150,105,0.08)',    border: 'rgba(5,150,105,0.25)',  dot: '#059669', text: '#047857' },
  failed:     { bg: 'rgba(220,38,38,0.08)',    border: 'rgba(220,38,38,0.25)',  dot: '#dc2626', text: '#b91c1c' },
};

const STATUS_LABEL: Record<PublishDayStatus, string> = {
  pending: 'Queued',
  solving: 'Solving',
  publishing: 'Publishing',
  success: 'Published',
  failed: 'Failed',
};

function formatShortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[Number(m) - 1]} ${Number(d)}`;
}

function PublishStrip({ days }: { days: PublishDay[] }) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 8,
      background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,0,0,0.06)',
      borderRadius: 12, padding: 10,
    }}>
      {days.map(d => {
        const c = STATUS_COLORS[d.status];
        const pulsing = d.status === 'solving' || d.status === 'publishing';
        return (
          <div
            key={d.date}
            title={d.error ? `${d.date}: ${d.error}` : `${d.date} — ${STATUS_LABEL[d.status]}`}
            style={{
              background: c.bg, border: `1px solid ${c.border}`, borderRadius: 10,
              padding: '8px 10px', minWidth: 96,
              display: 'flex', flexDirection: 'column', gap: 4,
              fontFamily: 'var(--font-open-sans)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                className={pulsing ? 'animate-pulse' : undefined}
                style={{ width: 8, height: 8, borderRadius: '50%', background: c.dot }}
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#2C2C2C' }}>{formatShortDate(d.date)}</span>
            </div>
            <span style={{ fontSize: 10, color: c.text, fontWeight: 500 }}>{STATUS_LABEL[d.status]}</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6B6B6B' }}>
              <span>{d.pctPrefsMet !== undefined ? `${d.pctPrefsMet.toFixed(0)}% prefs` : '—'}</span>
              <span>{d.gapCount !== undefined ? `${d.gapCount} gap${d.gapCount === 1 ? '' : 's'}` : ''}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
