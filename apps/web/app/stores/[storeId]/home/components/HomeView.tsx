'use client';

import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import { CardContainer, GlassPillCard, GlassPillButton, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { ActivityLogItem, ActivityFilter } from '@/lib/api/activity';
import { getActivityDisplayType, formatRelativeTime, formatActivityDate } from '../utils';

const ACTIVITY_FILTER_OPTIONS: { id: ActivityFilter; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'today', label: 'Today' },
  { id: 'last2days', label: 'Last 2 days' },
  { id: 'oneweek', label: 'One week' },
  { id: 'onemonth', label: 'One month' },
];

const ACTIVITY_USER_FILTER_OPTIONS: { id: 'everyone' | 'mine'; label: string }[] = [
  { id: 'everyone', label: 'Everyone' },
  { id: 'mine', label: 'Mine' },
];

interface HomeViewProps {
  activityLoading: boolean;
  activityFilter: ActivityFilter;
  setActivityFilter: (f: ActivityFilter) => void;
  activityUserFilter: 'everyone' | 'mine';
  setActivityUserFilter: (f: 'everyone' | 'mine') => void;
  activityPage: number;
  setActivityPage: (p: number | ((prev: number) => number)) => void;
  filteredActivityLogs: ActivityLogItem[];
  totalActivityPages: number;
  paginatedActivityLogs: ActivityLogItem[];
  commentText: string;
  setCommentText: (t: string) => void;
  commentSubmitting: boolean;
  hoveredCommentId: string | null;
  setHoveredCommentId: (id: string | null) => void;
  deleteConfirmLogId: string | null;
  setDeleteConfirmLogId: (id: string | null) => void;
  handleCommentSubmit: () => void;
  handleDeleteComment: (id: string) => void;
  user: any | null;
}

export function HomeView({
  activityLoading,
  activityFilter,
  setActivityFilter,
  activityUserFilter,
  setActivityUserFilter,
  activityPage,
  setActivityPage,
  filteredActivityLogs,
  totalActivityPages,
  paginatedActivityLogs,
  commentText,
  setCommentText,
  commentSubmitting,
  hoveredCommentId,
  setHoveredCommentId,
  deleteConfirmLogId,
  setDeleteConfirmLogId,
  handleCommentSubmit,
  handleDeleteComment,
  user,
}: HomeViewProps) {
  return (
    <>
      <div data-tutorial-id="activity-feed">
        <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
          <div className="flex flex-col gap-3">
            <div style={{ margin: '-1rem -1rem 0 -1rem', width: 'calc(100% + 2rem)' }}>
              <GlassPillCard padding="1rem" borderRadius="1.5rem 1.5rem 0 0" contentStyle={{ width: '100%' }}>
                <div className="flex items-center justify-between" style={{ width: '100%' }}>
                  <div>
                    {totalActivityPages > 1 && (
                      <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                        <div
                          className="flex items-center gap-1"
                          style={{
                            ...aiGlassLightContentStyle('9999px', 0.6),
                            padding: '0 14px',
                            height: '36px',
                          }}
                        >
                          <button
                            onClick={() => setActivityPage(p => Math.max(1, p - 1))}
                            disabled={activityPage === 1}
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '12px',
                              color: activityPage === 1 ? '#9A999E' : '#6B6B6B',
                              background: 'none',
                              border: 'none',
                              cursor: activityPage === 1 ? 'default' : 'pointer',
                              padding: '0 4px',
                            }}
                          >
                            ◀
                          </button>
                          {Array.from({ length: totalActivityPages }, (_, i) => i + 1).map(page => (
                            <button
                              key={page}
                              onClick={() => setActivityPage(page)}
                              style={{
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '14px',
                                fontWeight: activityPage === page ? 600 : 400,
                                color: activityPage === page ? '#2C2C2C' : '#9A999E',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0 4px',
                              }}
                            >
                              {page}
                            </button>
                          ))}
                          <button
                            onClick={() => setActivityPage(p => Math.min(totalActivityPages, p + 1))}
                            disabled={activityPage === totalActivityPages}
                            style={{
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '12px',
                              color: activityPage === totalActivityPages ? '#9A999E' : '#6B6B6B',
                              background: 'none',
                              border: 'none',
                              cursor: activityPage === totalActivityPages ? 'default' : 'pointer',
                              padding: '0 4px',
                            }}
                          >
                            ▶
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-6">
                    <Menu as="div" style={{ zIndex: 100 }}>
                      <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                        <MenuButton
                          className="inline-flex items-center focus:outline-none focus:ring-0 transition-all"
                          style={{
                            ...aiGlassLightContentStyle('9999px', 0.6),
                            padding: '0 14px',
                            height: '36px',
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#6B6B6B',
                            cursor: 'pointer',
                          }}
                        >
                          {ACTIVITY_USER_FILTER_OPTIONS.find(o => o.id === activityUserFilter)?.label}
                          <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </MenuButton>
                      </div>
                      <MenuItems
                        anchor="bottom end"
                        portal={false}
                        transition
                        className="w-32 origin-top-right shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                        style={{ zIndex: 100, ...aiGlassLightBorderStyle('0.75rem'), marginTop: 8 }}
                      >
                        <div
                          className="py-1"
                          style={{
                            ...aiGlassLightContentStyle('0.75rem', 0.6),
                            backdropFilter: 'blur(2px)',
                            WebkitBackdropFilter: 'blur(2px)',
                          }}
                        >
                          {ACTIVITY_USER_FILTER_OPTIONS.map((option) => (
                            <MenuItem key={option.id}>
                              <div className="flex items-center justify-between px-4 py-2">
                                <button
                                  onClick={() => setActivityUserFilter(option.id)}
                                  className="text-left text-sm focus:outline-none flex-1"
                                  style={{
                                    fontFamily: 'var(--font-open-sans)',
                                    color: activityUserFilter === option.id ? '#2C2C2C' : '#6B6B6B',
                                    backgroundColor: 'transparent',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                                  onMouseLeave={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'transparent'}
                                >
                                  {option.label}
                                </button>
                              </div>
                            </MenuItem>
                          ))}
                        </div>
                      </MenuItems>
                    </Menu>

                    <Menu as="div" style={{ zIndex: 100 }}>
                      <div className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
                        <MenuButton
                          className="inline-flex items-center focus:outline-none focus:ring-0 transition-all"
                          style={{
                            ...aiGlassLightContentStyle('9999px', 0.6),
                            padding: '0 14px',
                            height: '36px',
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '14px',
                            fontWeight: 500,
                            color: '#6B6B6B',
                            cursor: 'pointer',
                          }}
                        >
                          {ACTIVITY_FILTER_OPTIONS.find(o => o.id === activityFilter)?.label}
                          <svg className="ml-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </MenuButton>
                      </div>
                      <MenuItems
                        anchor="bottom end"
                        portal={false}
                        transition
                        className="w-36 origin-top-right shadow-lg transition data-[closed]:scale-95 data-[closed]:transform data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75 data-[enter]:ease-out data-[leave]:ease-in focus:outline-none ai-glass-border"
                        style={{ zIndex: 100, ...aiGlassLightBorderStyle('0.75rem'), marginTop: 8 }}
                      >
                        <div
                          className="py-1"
                          style={{
                            ...aiGlassLightContentStyle('0.75rem', 0.6),
                            backdropFilter: 'blur(2px)',
                            WebkitBackdropFilter: 'blur(2px)',
                          }}
                        >
                          {ACTIVITY_FILTER_OPTIONS.map((option) => (
                            <MenuItem key={option.id}>
                              <div className="flex items-center justify-between px-4 py-2">
                                <button
                                  onClick={() => setActivityFilter(option.id)}
                                  className="text-left text-sm focus:outline-none flex-1"
                                  style={{
                                    fontFamily: 'var(--font-open-sans)',
                                    color: activityFilter === option.id ? '#2C2C2C' : '#6B6B6B',
                                    backgroundColor: 'transparent',
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'rgba(0, 0, 0, 0.05)'}
                                  onMouseLeave={(e) => e.currentTarget.parentElement!.style.backgroundColor = 'transparent'}
                                >
                                  {option.label}
                                </button>
                              </div>
                            </MenuItem>
                          ))}
                        </div>
                      </MenuItems>
                    </Menu>
                  </div>
                </div>
              </GlassPillCard>
            </div>

            {activityLoading ? (
              <div className="flex items-center justify-center py-8">
                <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B', fontSize: '13px' }}>Loading activity...</span>
              </div>
            ) : filteredActivityLogs.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <span style={{ fontFamily: 'var(--font-open-sans)', color: '#9A999E', fontSize: '13px' }}>No activity yet</span>
              </div>
            ) : (
              <div style={{ paddingTop: '4px' }}>
                <GlassPillCard padding="1.5rem" borderRadius="1rem" contentStyle={{ width: '100%' }}>
                  <div className="flex flex-col gap-6 w-full">
                    {paginatedActivityLogs
                      .filter((log) => !(log.action === 'comment' && log.metadata?.deleted === true))
                      .map((log) => {
                        const isComment = log.action === 'comment';
                        const isPublish = log.action === 'logbook_publish' || log.action === 'logbook_publish_with_edits';
                        const isPublishWithEdits = log.action === 'logbook_publish_with_edits';
                        const displayType = getActivityDisplayType(log.action);
                        const relativeTime = formatRelativeTime(log.createdAt);
                        const comment = log.metadata?.comment;
                        const canDelete = isComment && user && log.User.id === user.id;
                        const isHovered = hoveredCommentId === log.id;
                        const activityDate = formatActivityDate(log.date);
                        const initials = log.User.name.split(' ').map(n => n[0]).join('');

                        return (
                          <div key={log.id} className="flex items-center gap-4">
                            {isComment ? (
                              <div
                                className="flex-none rounded-full flex items-center justify-center"
                                style={{
                                  width: 24,
                                  height: 24,
                                  backgroundColor: log.User.role === 'CAPTAIN' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                                  fontSize: '10px',
                                  fontWeight: 500,
                                  color: log.User.role === 'CAPTAIN' ? 'hsl(0, 84%, 50%)' : '#6B6B6B',
                                }}
                              >
                                {initials}
                              </div>
                            ) : (
                              <div className="flex-none flex items-center justify-center" style={{ width: 24, height: 24 }}>
                                {isPublish ? (
                                  <CheckCircleIcon className="w-6 h-6" style={{ color: 'hsl(0, 84%, 60%)' }} />
                                ) : (
                                  <div
                                    className="rounded-full"
                                    style={{ width: 6, height: 6, backgroundColor: 'rgba(0, 0, 0, 0.15)', border: '1px solid rgba(0, 0, 0, 0.25)' }}
                                  />
                                )}
                              </div>
                            )}

                            {isComment ? (
                              <div className="flex-1 flex items-center gap-6">
                                <div
                                  className="flex-1 p-3"
                                  style={{
                                    backgroundColor: 'rgba(0, 0, 0, 0.03)',
                                    border: '1px solid rgba(0, 0, 0, 0.06)',
                                    borderRadius: '1rem',
                                  }}
                                  onMouseEnter={() => canDelete && setHoveredCommentId(log.id)}
                                  onMouseLeave={() => setHoveredCommentId(null)}
                                >
                                  <div className="flex justify-between gap-x-4">
                                    <div style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}>
                                      <span style={{ fontWeight: 500, color: '#2C2C2C' }}>{log.User.name}</span> commented
                                    </div>
                                    {canDelete && isHovered && (
                                      <button
                                        onClick={() => setDeleteConfirmLogId(log.id)}
                                        style={{
                                          fontSize: '12px',
                                          color: 'hsl(0, 84%, 50%)',
                                          fontFamily: 'var(--font-open-sans)',
                                          background: 'none',
                                          border: 'none',
                                          cursor: 'pointer',
                                          padding: 0,
                                        }}
                                      >
                                        Delete
                                      </button>
                                    )}
                                  </div>
                                  <p style={{ fontSize: '13px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)', marginTop: '4px' }}>
                                    {comment}
                                  </p>
                                </div>
                                <time
                                  dateTime={log.createdAt}
                                  className="flex-none"
                                  style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                                >
                                  {relativeTime}
                                </time>
                              </div>
                            ) : (
                              <div className="flex-1 flex justify-between items-center">
                                <p style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}>
                                  <span style={{ fontWeight: 500, color: '#2C2C2C' }}>{log.User.name}</span>{' '}
                                  {displayType}{activityDate ? ` ${activityDate}` : ''}{isPublishWithEdits ? ' (with edits)' : ''}.
                                </p>
                                <time
                                  dateTime={log.createdAt}
                                  style={{ fontSize: '12px', color: '#6B6B6B', fontFamily: 'var(--font-open-sans)' }}
                                >
                                  {relativeTime}
                                </time>
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </GlassPillCard>
              </div>
            )}

            <GlassPillCard borderRadius="1rem" className="w-full" padding="1.5rem" contentStyle={{ justifyContent: 'stretch', paddingLeft: '0.75rem' }}>
              <div className="flex gap-3 w-full">
                <div
                  className="flex-none rounded-full flex items-center justify-center"
                  style={{
                    width: 24,
                    height: 24,
                    backgroundColor: user?.role === 'CAPTAIN' ? 'rgba(220, 38, 38, 0.1)' : 'rgba(0, 0, 0, 0.08)',
                    fontSize: '10px',
                    fontWeight: 500,
                    color: user?.role === 'CAPTAIN' ? 'hsl(0, 84%, 50%)' : '#6B6B6B',
                  }}
                >
                  {user?.name ? user.name.split(' ').map((n: string) => n[0]).join('') : 'You'}
                </div>
                <div className="relative flex-auto">
                  <div className="overflow-hidden" style={{ backgroundColor: 'rgba(0, 0, 0, 0.03)', borderRadius: '1rem' }}>
                    <textarea
                      rows={4}
                      placeholder="Add a comment..."
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      disabled={commentSubmitting}
                      className="block w-full resize-none bg-transparent text-sm placeholder:text-gray-400 focus:outline-none focus:ring-0"
                      style={{ fontFamily: 'var(--font-open-sans)', color: '#2C2C2C', outline: 'none', border: 'none', boxShadow: 'none', padding: '0.75rem', paddingBottom: '0.375rem' }}
                    />
                    <div className="flex justify-end" style={{ padding: '0 0.75rem 0.75rem 0.75rem' }}>
                      <GlassPillButton
                        onClick={() => { if (commentText.trim() && !commentSubmitting) handleCommentSubmit(); }}
                        padding="6px 12px"
                        borderRadius="0.75rem"
                        style={{
                          opacity: commentText.trim() && !commentSubmitting ? 1 : 0.5,
                          cursor: commentText.trim() && !commentSubmitting ? 'pointer' : 'default',
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', fontWeight: 500, color: commentText.trim() && !commentSubmitting ? '#2C2C2C' : '#6B6B6B' }}>
                          {commentSubmitting ? 'Posting...' : 'Comment'}
                        </span>
                      </GlassPillButton>
                    </div>
                  </div>
                </div>
              </div>
            </GlassPillCard>
          </div>
        </CardContainer>
      </div>

      {deleteConfirmLogId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.4)' }}
          onClick={() => setDeleteConfirmLogId(null)}
        >
          <div
            className="p-6"
            style={{ backgroundColor: 'white', borderRadius: '1rem', maxWidth: '400px', width: '90%', boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontFamily: 'var(--font-open-sans)', fontSize: '16px', fontWeight: 600, color: '#2C2C2C', marginBottom: '8px' }}>
              Delete comment?
            </h3>
            <p style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', color: '#6B6B6B', marginBottom: '20px' }}>
              This action cannot be undone. The comment will be marked as deleted.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirmLogId(null)}
                style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', padding: '8px 16px', borderRadius: '8px', backgroundColor: 'rgba(0, 0, 0, 0.05)', color: '#6B6B6B', border: 'none', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteComment(deleteConfirmLogId)}
                style={{ fontFamily: 'var(--font-open-sans)', fontSize: '14px', padding: '8px 16px', borderRadius: '8px', backgroundColor: 'hsl(0, 84%, 50%)', color: 'white', border: 'none', cursor: 'pointer' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
