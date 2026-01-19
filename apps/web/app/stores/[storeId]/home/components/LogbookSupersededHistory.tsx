'use client';

import { useState, useEffect } from 'react';
import { CardContainer, CardHeader, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface LogbookVersion {
  id: string;
  date: string;
  status: string;
  storedFilePath: string | null;
  createdByName: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface LogbookSupersededHistoryProps {
  logbookId: string;
  onViewPdf: (logbookId: string, date: string) => void;
  onClose: () => void;
}

export function LogbookSupersededHistory({ logbookId, onViewPdf, onClose }: LogbookSupersededHistoryProps) {
  const [current, setCurrent] = useState<LogbookVersion | null>(null);
  const [supersededVersions, setSupersededVersions] = useState<LogbookVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_URL}/logbooks/${logbookId}/history`);
        if (!res.ok) throw new Error('Failed to load logbook history');
        const data = await res.json();
        if (!cancelled) {
          setCurrent(data.current);
          setSupersededVersions(data.supersededVersions || []);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();
    return () => { cancelled = true; };
  }, [logbookId]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4 h-full">
        <CardHeader
          title="Version History"
          lightMode={true}
          borderRadius="1.5rem"
          titleStyle={{ color: '#2C2C2C' }}
          rightContent={
            <button
              onClick={onClose}
              className="transition-colors duration-150"
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 8px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 400,
                color: '#6B6B6B',
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          }
        />
        <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
          <div className="flex items-center justify-center py-8">
            <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading history...</span>
          </div>
        </CardContainer>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4 h-full">
        <CardHeader
          title="Version History"
          lightMode={true}
          borderRadius="1.5rem"
          titleStyle={{ color: '#2C2C2C' }}
          rightContent={
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#6B6B6B', cursor: 'pointer' }}>×</button>
          }
        />
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
            {error}
          </div>
        </CardContainer>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <CardHeader
        title="Version History"
        lightMode={true}
        borderRadius="1.5rem"
        titleStyle={{ color: '#2C2C2C' }}
        leftContent={
          <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
            <div
              style={{
                background: 'rgba(0, 0, 0, 0.06)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                borderRadius: '9999px',
                fontFamily: 'var(--font-open-sans)',
                color: '#6B6B6B',
                fontWeight: 500,
                padding: '6px 14px',
                fontSize: '14px',
              }}
            >
              {supersededVersions.length + 1} versions
            </div>
          </div>
        }
        rightContent={
          <button
            onClick={onClose}
            className="transition-colors duration-150"
            style={{
              background: 'none',
              border: 'none',
              padding: '4px 8px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '14px',
              fontWeight: 400,
              color: '#6B6B6B',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => e.currentTarget.style.color = '#2C2C2C'}
            onMouseLeave={(e) => e.currentTarget.style.color = '#6B6B6B'}
          >
            ×
          </button>
        }
      />

      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
        <div className="flex flex-col gap-3">
          {/* Current version */}
          {current && (
            <VersionCard
              version={current}
              isCurrent={true}
              formatDate={formatDate}
              formatDateTime={formatDateTime}
              onViewPdf={() => onViewPdf(current.id, formatDate(current.date))}
            />
          )}

          {/* Superseded versions */}
          {supersededVersions.length > 0 && (
            <>
              <div
                className="flex items-center gap-2 py-2"
                style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#9A999E' }}
              >
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
                <span>Other Versions</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(0,0,0,0.08)' }} />
              </div>
              {supersededVersions.map((version) => (
                <VersionCard
                  key={version.id}
                  version={version}
                  isCurrent={false}
                  formatDate={formatDate}
                  formatDateTime={formatDateTime}
                  onViewPdf={() => onViewPdf(version.id, formatDate(version.date))}
                />
              ))}
            </>
          )}

          {supersededVersions.length === 0 && (
            <p style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E', textAlign: 'center', padding: '16px 0' }}>
              No other versions for this date
            </p>
          )}
        </div>
      </CardContainer>
    </div>
  );
}

interface VersionCardProps {
  version: LogbookVersion;
  isCurrent: boolean;
  formatDate: (date: string) => string;
  formatDateTime: (date: string) => string;
  onViewPdf: () => void;
}

function VersionCard({ version, isCurrent, formatDate, formatDateTime, onViewPdf }: VersionCardProps) {
  return (
    <div
      className="ai-glass-border"
      style={aiGlassLightBorderStyle('0.75rem')}
    >
      <div
        className="flex items-center justify-between"
        style={{
          ...aiGlassLightContentStyle('0.75rem', isCurrent ? 0.5 : 0.3),
          padding: '12px 16px',
        }}
      >
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: '#2C2C2C' }}>
              {formatDate(version.date)}
            </span>
            {isCurrent && (
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '10px',
                  fontWeight: 600,
                  color: 'hsl(0, 84%, 60%)',
                  textTransform: 'uppercase',
                  backgroundColor: 'rgba(220, 38, 38, 0.1)',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                Current
              </span>
            )}
            <span
              style={{
                fontFamily: 'var(--font-open-sans)',
                fontSize: '10px',
                fontWeight: 500,
                color: version.status === 'PUBLISHED' ? '#22c55e' : version.status === 'SUPERSEDED' ? '#9A999E' : '#6B6B6B',
                textTransform: 'uppercase',
              }}
            >
              {version.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {version.createdByName && (
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#6B6B6B' }}>
                by {version.createdByName}
              </span>
            )}
            {version.publishedAt && (
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#9A999E' }}>
                {formatDateTime(version.publishedAt)}
              </span>
            )}
          </div>
        </div>
        {version.storedFilePath && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewPdf();
            }}
            className="transition-all duration-150"
            style={{
              background: 'rgba(0, 0, 0, 0.06)',
              border: 'none',
              borderRadius: '0.5rem',
              padding: '6px 12px',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '12px',
              fontWeight: 500,
              color: '#2C2C2C',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.1)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0, 0, 0, 0.06)')}
          >
            View PDF
          </button>
        )}
      </div>
    </div>
  );
}
