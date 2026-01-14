'use client';

import { useState, useEffect } from 'react';
import { CardContainer } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface RunDetailViewProps {
  runId: string;
  onDelete?: () => void;
}

interface RunData {
  id: string;
  date: string;
  storeId: number;
  engine: string;
  seed: number;
  status: string;
  runtimeMs: number;
  violations: any[];
  objectiveScore: number | null;
  mipGap: number | null;
  logbookId: string | null;
  inputParams: any;
  solverVersion: string | null;
  triggeredBy: string | null;
  inputHash: string | null;
  constraintCount: number | null;
  variableCount: number | null;
  createdAt: string;
  Store: {
    id: number;
    name: string;
  };
  Logbook: {
    id: string;
    status: string;
    generatedAt: string;
  } | null;
}

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
};

const formatTime = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

export function RunDetailView({ runId, onDelete }: RunDetailViewProps) {
  const [run, setRun] = useState<RunData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRun = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/runs/${runId}`);
      if (!response.ok) throw new Error('Failed to load run data');
      const data = await response.json();
      setRun(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRun();
  }, [runId]);

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  if (error || !run) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div
          style={{
            padding: '12px',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            borderRadius: '0.5rem',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '13px',
            color: 'rgb(220, 38, 38)',
          }}
        >
          {error || 'Run not found'}
        </div>
      </CardContainer>
    );
  }

  const statusColor = run.status === 'OPTIMAL' ? '#10b981' :
                      run.status === 'FEASIBLE' ? '#3b82f6' :
                      run.status === 'TIME_LIMIT' ? '#f59e0b' :
                      run.status === 'INFEASIBLE' ? '#ef4444' :
                      '#6b7280';

  return (
    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
      <div className="flex flex-col gap-6">
        {/* Basic Info Section */}
        <div className="flex flex-col gap-3">
          <h3
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 600,
              color: '#6B6B6B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Run Info
          </h3>

          <div className="flex flex-col gap-2">
            {/* Status */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Status</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: statusColor, fontWeight: 600 }}>{run.status}</span>
            </div>

            {/* Engine */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Engine</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{run.engine}</span>
            </div>

            {/* Date */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Date</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{formatDate(run.date)}</span>
            </div>

            {/* Runtime */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Runtime</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{formatDuration(run.runtimeMs)}</span>
            </div>

            {/* Objective Score */}
            {run.objectiveScore !== null && (
              <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Objective Score</span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{run.objectiveScore}</span>
              </div>
            )}

            {/* MIP Gap */}
            {run.mipGap !== null && (
              <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>MIP Gap</span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{(run.mipGap * 100).toFixed(2)}%</span>
              </div>
            )}

            {/* Store */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Store</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{run.Store.name}</span>
            </div>

            {/* Created At */}
            <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Created At</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '11px', color: '#2C2C2C' }}>
                {formatDate(run.createdAt)} {formatTime(run.createdAt)}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Technical Details Section */}
        <div className="flex flex-col gap-3">
          <h3
            style={{
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 600,
              color: '#6B6B6B',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Technical Details
          </h3>

          <div className="flex flex-col gap-2">
            {/* Constraint Count */}
            {run.constraintCount !== null && (
              <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Constraints</span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{run.constraintCount.toLocaleString()}</span>
              </div>
            )}

            {/* Variable Count */}
            {run.variableCount !== null && (
              <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Variables</span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{run.variableCount.toLocaleString()}</span>
              </div>
            )}

            {/* Solver Version */}
            {run.solverVersion && (
              <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Solver Version</span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{run.solverVersion}</span>
              </div>
            )}

            {/* Triggered By */}
            {run.triggeredBy && (
              <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Triggered By</span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{run.triggeredBy}</span>
              </div>
            )}

            {/* Logbook */}
            {run.Logbook && (
              <div className="flex justify-between items-center" style={{ minHeight: '28px' }}>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Logbook</span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#2C2C2C' }}>{run.Logbook.status}</span>
              </div>
            )}
          </div>
        </div>

        {/* Violations Section (if any) */}
        {run.violations && run.violations.length > 0 && (
          <>
            <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />
            <div className="flex flex-col gap-3">
              <h3
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#6B6B6B',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                Violations ({run.violations.length})
              </h3>
              <div className="flex flex-col gap-2">
                {run.violations.slice(0, 5).map((violation: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderRadius: '0.5rem',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '11px',
                      color: '#ef4444',
                    }}
                  >
                    {typeof violation === 'string' ? violation : JSON.stringify(violation)}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Delete Button */}
        <button
          onClick={onDelete}
          style={{
            width: 'fit-content',
            padding: '10px 16px',
            fontFamily: 'var(--font-open-sans)',
            fontSize: '13px',
            fontWeight: 500,
            color: 'hsl(0, 84%, 60%)',
            backgroundColor: 'rgba(220, 38, 38, 0.1)',
            border: 'none',
            borderRadius: '0.5rem',
            cursor: 'pointer',
          }}
        >
          Delete
        </button>
      </div>
    </CardContainer>
  );
}
