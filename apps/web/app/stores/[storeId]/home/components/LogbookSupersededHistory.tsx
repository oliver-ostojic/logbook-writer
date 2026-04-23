'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { fetchActivityLogsByDate, ActivityLogItem } from '@/lib/api/activity';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

// Helper to format relative time
function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Helper to get display text for action type
function getActivityDisplayType(action: string): string {
  switch (action) {
    case 'shifts_add': return 'added shifts';
    case 'shifts_edit': return 'edited shifts';
    case 'shifts_save': return 'saved shifts';
    case 'constraints_save': return 'updated constraints';
    case 'solver_run': return 'ran solver';
    case 'logbook_generate': return 'generated logbook';
    case 'logbook_regenerate': return 'regenerated logbook';
    case 'logbook_publish': return 'published logbook';
    case 'logbook_publish_with_edits': return 'published logbook';
    case 'assignment_edit': return 'edited assignments';
    case 'comment': return 'commented';
    default: return action.replace(/_/g, ' ');
  }
}

interface LogbookVersion {
  id: string;
  date: string;
  status: string;
  storedFilePath: string | null;
  createdByName: string | null;
  publishedAt: string | null;
  createdAt: string;
  runId: string | null;
}

interface LogbookSupersededHistoryProps {
  logbookId: string;
  onViewPdf: (logbookId: string, date: string) => void;
  onViewRunInfo?: (runId: string) => void;
  onDelete?: (logbookId: string) => void;
  onClose: () => void;
}

// Separate scrollable activity list component
function ActivityList({ logs }: { logs: ActivityLogItem[] }) {
  return (
    <div
      style={{
        maxHeight: '300px',
        overflowY: 'scroll',
        overflowX: 'hidden',
      }}
    >
      <ul className="space-y-6">
        {logs.map((log, idx) => {
          const isComment = log.action === 'comment';
          const isDeleted = log.metadata?.deleted === true;
          const isPublish = log.action === 'logbook_publish' || log.action === 'logbook_publish_with_edits';
          const isPublishWithEdits = log.action === 'logbook_publish_with_edits';
          const displayType = getActivityDisplayType(log.action);
          const relativeTime = formatRelativeTime(log.createdAt);
          const initials = log.User.name.split(' ').map(n => n[0]).join('');
          const comment = log.metadata?.comment;

          return (
            <li key={log.id} className="relative flex gap-x-4">
              {isComment ? (
                <>
                  {/* Avatar for comments */}
                  <div
                    className="relative mt-3 flex-none rounded-full flex items-center justify-center"
                    style={{
                      width: 24,
                      height: 24,
                    }}
                  >
                    <div
                      className="w-full h-full rounded-full flex items-center justify-center"
                      style={{
                        backgroundColor: isDeleted ? 'rgba(0, 0, 0, 0.04)' : log.User.role === 'CAPTAIN' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                        fontSize: '10px',
                        fontWeight: 500,
                        color: isDeleted ? '#9A999E' : log.User.role === 'CAPTAIN' ? 'hsl(0, 84%, 50%)' : '#6B6B6B',
                      }}
                    >
                      {initials}
                    </div>
                  </div>
                  {/* Comment bubble */}
                  <div
                    className="flex-auto p-3"
                    style={{
                      backgroundColor: isDeleted ? 'rgba(0, 0, 0, 0.02)' : 'rgba(0, 0, 0, 0.03)',
                      border: '1px solid rgba(0, 0, 0, 0.06)',
                      borderRadius: '1rem',
                      opacity: isDeleted ? 0.7 : 1,
                    }}
                  >
                    <div className="flex justify-between gap-x-4">
                      <div style={{ fontSize: '12px', color: isDeleted ? '#9A999E' : '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}>
                        <span style={{ fontWeight: 500, color: isDeleted ? '#9A999E' : '#2C2C2C' }}>{log.User.name}</span> {isDeleted ? 'deleted their comment' : 'commented'}
                      </div>
                      <time
                        dateTime={log.createdAt}
                        style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                      >
                        {relativeTime}
                      </time>
                    </div>
                    {!isDeleted && (
                      <p style={{ fontSize: '13px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)', marginTop: '4px' }}>
                        {comment}
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Icon for system events */}
                  <div
                    className="relative flex flex-none items-center justify-center rounded-full"
                    style={{
                      width: 24,
                      height: 24,
                    }}
                  >
                    {isPublish ? (
                      <CheckCircleIcon className="w-6 h-6" style={{ color: 'hsl(0, 84%, 60%)' }} />
                    ) : (
                      <div
                        className="rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          backgroundColor: 'rgba(0, 0, 0, 0.1)',
                          border: '1px solid rgba(0, 0, 0, 0.2)',
                        }}
                      />
                    )}
                  </div>
                  {/* Event text */}
                  <p
                    className="flex-auto py-0.5"
                    style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                  >
                    <span style={{ fontWeight: 500, color: '#2C2C2C' }}>{log.User.name}</span>{' '}
                    {displayType}{isPublishWithEdits ? ' (with edits)' : ''}.
                  </p>
                  <time
                    dateTime={log.createdAt}
                    className="flex-none py-0.5"
                    style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                  >
                    {relativeTime}
                  </time>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function LogbookSupersededHistory({ logbookId, onViewPdf, onViewRunInfo, onDelete, onClose }: LogbookSupersededHistoryProps) {
  const params = useParams();
  const router = useRouter();
  const storeId = params?.storeId as string;
  const [current, setCurrent] = useState<LogbookVersion | null>(null);
  const [supersededVersions, setSupersededVersions] = useState<LogbookVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityLogs, setActivityLogs] = useState<ActivityLogItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const loadHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/logbooks/${logbookId}/history`);
      if (!res.ok) throw new Error('Failed to load logbook history');
      const data = await res.json();
      setCurrent(data.current);
      setSupersededVersions(data.supersededVersions || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function fetchHistory() {
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

    fetchHistory();
    return () => { cancelled = true; };
  }, [logbookId]);

  const handleDeleteVersion = async (versionId: string) => {
    try {
      const res = await fetch(`${API_URL}/schedule/logbook/${versionId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete logbook');

      // If we deleted the current version and it was the only one, close the panel
      const isCurrentVersion = current?.id === versionId;
      const hasOtherVersions = supersededVersions.length > 0;

      if (isCurrentVersion && !hasOtherVersions) {
        onDelete?.(versionId);
        onClose();
      } else {
        // Refresh the history to show remaining versions
        onDelete?.(versionId);
        await loadHistory();
      }
    } catch (err) {
      console.error('Failed to delete logbook:', err);
    }
  };

  // Fetch activity logs once we have the current logbook's date
  useEffect(() => {
    if (!current?.date || !storeId) return;
    let cancelled = false;

    async function loadActivityLogs() {
      setActivityLoading(true);
      try {
        const dateStr = current!.date.slice(0, 10);
        const response = await fetchActivityLogsByDate(Number(storeId), dateStr);
        if (!cancelled) {
          setActivityLogs(response.logs);
        }
      } catch (err) {
        console.error('Failed to fetch activity logs:', err);
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    }

    loadActivityLogs();
    return () => { cancelled = true; };
  }, [current?.date, storeId]);

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
      <div className="flex flex-col gap-6">
        {/* Version History header - embedded in outer card top */}
        <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
          <div
            className="ai-glass-border"
            style={aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08)}
          >
            <div
              style={{
                ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                padding: '16px 24px',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08)}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '6px 14px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#2C2C2C',
                    }}
                  >
                    Version History
                  </div>
                </div>
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
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading history...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        {/* Version History header - embedded in outer card top */}
        <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
          <div
            className="ai-glass-border"
            style={aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08)}
          >
            <div
              style={{
                ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                padding: '16px 24px',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08)}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '6px 14px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#2C2C2C',
                    }}
                  >
                    Version History
                  </div>
                </div>
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
              </div>
            </div>
          </div>
        </div>
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
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Version History header - embedded in outer card top */}
      <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
        <div
          className="ai-glass-border"
          style={aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08)}
        >
          <div
            style={{
              ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
              padding: '16px 24px',
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08)}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '6px 14px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '14px',
                      fontWeight: 600,
                      color: '#2C2C2C',
                    }}
                  >
                    Version History
                  </div>
                </div>
                <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08)}>
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.6),
                      padding: '6px 14px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#6B6B6B',
                    }}
                  >
                    {supersededVersions.length + 1} versions
                  </div>
                </div>
              </div>
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
            </div>
          </div>
        </div>
      </div>

      {/* Version cards */}
      <div className="flex flex-col gap-3">
        {/* Current version */}
        {current && (
          <VersionCard
            version={current}
            isCurrent={true}
            formatDate={formatDate}
            formatDateTime={formatDateTime}
            onViewPdf={() => onViewPdf(current.id, formatDate(current.date))}
            onViewRunInfo={current.runId && onViewRunInfo ? () => onViewRunInfo(current.runId!) : undefined}
            onDelete={() => handleDeleteVersion(current.id)}
            onEdit={() => router.push(`/stores/${storeId}/logbook/create/preview?logbookId=${current.id}`)}
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
                onViewRunInfo={version.runId && onViewRunInfo ? () => onViewRunInfo(version.runId!) : undefined}
                onDelete={() => handleDeleteVersion(version.id)}
              />
            ))}
          </>
        )}

      </div>

      {/* Activity Log - card with embedded header */}
      <div
        className="ai-glass-border"
        style={aiGlassLightBorderStyle('1.5rem', '0, 0, 0', 0.08)}
      >
        <div
          className="rounded-[1.5rem]"
          style={{
            ...aiGlassLightContentStyle('1.5rem', 0.6),
            padding: '24px',
          }}
        >
          <div className="flex flex-col gap-4">
            {/* Activity Log header - embedded at top of card */}
            <div style={{ margin: '-1.5rem -1.5rem 0 -1.5rem', width: 'calc(100% + 3rem)' }}>
              <div
                className="ai-glass-border"
                style={aiGlassLightBorderStyle('1.5rem 1.5rem 0 0', '0, 0, 0', 0.08)}
              >
                <div
                  style={{
                    ...aiGlassLightContentStyle('1.5rem 1.5rem 0 0', 0.6),
                    padding: '16px 24px',
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08)}>
                      <div
                        style={{
                          ...aiGlassLightContentStyle('9999px', 0.6),
                          padding: '6px 14px',
                          fontFamily: 'var(--font-open-sans)',
                          fontSize: '14px',
                          fontWeight: 600,
                          color: '#2C2C2C',
                        }}
                      >
                        Activity Log
                      </div>
                    </div>
                    {!activityLoading && activityLogs.length > 0 && (
                      <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px', '0, 0, 0', 0.08)}>
                        <div
                          style={{
                            ...aiGlassLightContentStyle('9999px', 0.6),
                            padding: '6px 14px',
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '13px',
                            fontWeight: 500,
                            color: '#6B6B6B',
                          }}
                        >
                          {activityLogs.length} action{activityLogs.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Activity content */}
            {activityLoading ? (
              <div className="flex items-center justify-center py-8">
                <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B', fontSize: '13px' }}>Loading activity...</span>
              </div>
            ) : activityLogs.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <span style={{ fontFamily: 'var(--font-open-sans)', color: '#9A999E', fontSize: '13px' }}>No activity for this date</span>
              </div>
            ) : (
              <ActivityList logs={activityLogs} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

interface VersionCardProps {
  version: LogbookVersion;
  isCurrent: boolean;
  formatDate: (date: string) => string;
  formatDateTime: (date: string) => string;
  onViewPdf: () => void;
  onViewRunInfo?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
}

function VersionCard({ version, isCurrent, formatDate, formatDateTime, onViewPdf, onViewRunInfo, onDelete, onEdit }: VersionCardProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false);
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
        <div className="flex items-center gap-2">
          {onViewRunInfo && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onViewRunInfo();
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
              View Run Info
            </button>
          )}
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
          {onEdit && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="transition-all duration-150"
              title="Edit logbook"
              style={{
                background: 'rgba(59, 130, 246, 0.15)',
                border: 'none',
                borderRadius: '0.5rem',
                padding: '6px 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563eb',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.28)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}
          {onDelete && (
            confirmingDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                  className="transition-all duration-150"
                  style={{
                    background: 'rgba(220, 38, 38, 0.15)',
                    border: 'none',
                    borderRadius: '0.5rem',
                    padding: '6px 12px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: '#b91c1c',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(220, 38, 38, 0.25)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(220, 38, 38, 0.15)')}
                >
                  Confirm
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmingDelete(false);
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
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingDelete(true);
                }}
                className="transition-all duration-150"
                title="Delete logbook"
                style={{
                  background: 'rgba(220, 38, 38, 0.1)',
                  border: 'none',
                  borderRadius: '0.5rem',
                  padding: '6px 8px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#b91c1c',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(220, 38, 38, 0.18)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(220, 38, 38, 0.1)')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
