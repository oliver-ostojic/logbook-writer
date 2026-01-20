'use client';

import { useState, useEffect } from 'react';
import { CardContainer, GlassPillButton, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';
import { PlusIcon, TrashIcon, ClipboardIcon, CheckIcon } from '@heroicons/react/20/solid';
import { createInviteCode, getInviteCodes, deleteInviteCode, InviteCode } from '@/lib/api/auth';
import { useAuthStore } from '@/lib/authStore';

interface InviteCodesSectionProps {
  storeId: string;
}

export function InviteCodesSection({ storeId }: InviteCodesSectionProps) {
  const { user, isAdmin } = useAuthStore();
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCodeRole, setNewCodeRole] = useState<'MATE' | 'CAPTAIN'>('MATE');
  const [expiresInDays, setExpiresInDays] = useState(7);

  const fetchInviteCodes = async () => {
    try {
      setLoading(true);
      const { inviteCodes: codes } = await getInviteCodes();
      // Filter to current store for non-admins
      const filteredCodes = isAdmin()
        ? codes.filter(c => c.store.id === parseInt(storeId))
        : codes;
      setInviteCodes(filteredCodes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load invite codes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInviteCodes();
  }, [storeId]);

  const handleCreate = async () => {
    try {
      setCreating(true);
      setError(null);
      await createInviteCode({
        targetRole: newCodeRole,
        storeId: parseInt(storeId),
        expiresInDays,
      });
      setShowCreateForm(false);
      await fetchInviteCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create invite code');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInviteCode(id);
      await fetchInviteCodes();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete invite code');
    }
  };

  const handleCopy = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // CAPTAIN can only create MATE codes, ADMIN can create both
  const canCreateCaptain = isAdmin();
  const availableRoles: Array<'MATE' | 'CAPTAIN'> = canCreateCaptain ? ['MATE', 'CAPTAIN'] : ['MATE'];

  return (
    <CardContainer lightMode={true} borderRadius="1.5rem" padding="1rem">
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="ai-glass-border" style={{ ...aiGlassLightBorderStyle('9999px'), width: 'fit-content' }}>
            <div
              style={{
                ...aiGlassLightContentStyle('9999px', 0.6),
                padding: '6px 14px',
                fontFamily: 'var(--font-open-sans)',
                fontSize: '14px',
                fontWeight: 500,
                color: '#2C2C2C',
              }}
            >
              Invite Codes
            </div>
          </div>

          {!showCreateForm && (
            <GlassPillButton
              onClick={() => setShowCreateForm(true)}
              padding="8px 14px"
            >
              <PlusIcon className="w-4 h-4" style={{ color: '#2C2C2C' }} />
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C' }}>
                Create Code
              </span>
            </GlassPillButton>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              color: '#DC2626',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {/* Create form */}
        {showCreateForm && (
          <div
            className="ai-glass-border"
            style={aiGlassLightBorderStyle('12px', '0, 0, 0', 0.1)}
          >
            <div
              style={{
                ...aiGlassLightContentStyle('12px', 0.5),
                padding: '16px',
              }}
            >
              <div className="flex flex-col gap-4">
                <div
                  style={{
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                  }}
                >
                  Create New Invite Code
                </div>

                {/* Role selector */}
                <div className="flex flex-col gap-2">
                  <label
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      color: '#6B6B6B',
                    }}
                  >
                    Target Role
                  </label>
                  <div className="flex gap-2">
                    {availableRoles.map((role) => (
                      <GlassPillButton
                        key={role}
                        onClick={() => setNewCodeRole(role)}
                        isSelected={newCodeRole === role}
                        padding="8px 16px"
                      >
                        <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C' }}>
                          {role.charAt(0) + role.slice(1).toLowerCase()}
                        </span>
                      </GlassPillButton>
                    ))}
                  </div>
                </div>

                {/* Expiration selector */}
                <div className="flex flex-col gap-2">
                  <label
                    style={{
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      color: '#6B6B6B',
                    }}
                  >
                    Expires In
                  </label>
                  <div className="flex gap-2">
                    {[1, 7, 14, 30].map((days) => (
                      <GlassPillButton
                        key={days}
                        onClick={() => setExpiresInDays(days)}
                        isSelected={expiresInDays === days}
                        padding="8px 16px"
                      >
                        <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C' }}>
                          {days} day{days > 1 ? 's' : ''}
                        </span>
                      </GlassPillButton>
                    ))}
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 justify-end">
                  <GlassPillButton
                    onClick={() => setShowCreateForm(false)}
                    padding="8px 16px"
                  >
                    <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#6B6B6B' }}>
                      Cancel
                    </span>
                  </GlassPillButton>
                  <GlassPillButton
                    onClick={handleCreate}
                    padding="8px 16px"
                    disabled={creating}
                  >
                    <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C' }}>
                      {creating ? 'Creating...' : 'Create'}
                    </span>
                  </GlassPillButton>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Codes list */}
        {loading ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              color: '#6B6B6B',
            }}
          >
            Loading...
          </div>
        ) : inviteCodes.length === 0 ? (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              fontFamily: 'var(--font-open-sans)',
              fontSize: '13px',
              color: '#6B6B6B',
            }}
          >
            No invite codes yet. Create one to invite team members.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {inviteCodes.map((code) => {
              const isExpired = code.isExpired || new Date(code.expiresAt) < new Date();
              const isUsed = !!code.usedBy;
              const isActive = !isExpired && !isUsed;

              return (
                <div
                  key={code.id}
                  className="ai-glass-border"
                  style={{
                    ...aiGlassLightBorderStyle('10px', '0, 0, 0', 0.08),
                    opacity: isActive ? 1 : 0.6,
                  }}
                >
                  <div
                    style={{
                      ...aiGlassLightContentStyle('10px', 0.4),
                      padding: '12px 16px',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        {/* Code and role */}
                        <div className="flex items-center gap-2">
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '14px',
                              fontWeight: 600,
                              color: '#2C2C2C',
                              letterSpacing: '0.5px',
                            }}
                          >
                            {code.code}
                          </span>
                          <span
                            style={{
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              backgroundColor: code.targetRole === 'CAPTAIN' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(34, 197, 94, 0.15)',
                              fontFamily: 'var(--font-open-sans)',
                              fontSize: '11px',
                              fontWeight: 500,
                              color: code.targetRole === 'CAPTAIN' ? '#2563EB' : '#16A34A',
                            }}
                          >
                            {code.targetRole.charAt(0) + code.targetRole.slice(1).toLowerCase()}
                          </span>
                          {isUsed && (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                backgroundColor: 'rgba(107, 114, 128, 0.15)',
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '11px',
                                fontWeight: 500,
                                color: '#6B7280',
                              }}
                            >
                              Used
                            </span>
                          )}
                          {isExpired && !isUsed && (
                            <span
                              style={{
                                padding: '2px 8px',
                                borderRadius: '9999px',
                                backgroundColor: 'rgba(239, 68, 68, 0.15)',
                                fontFamily: 'var(--font-open-sans)',
                                fontSize: '11px',
                                fontWeight: 500,
                                color: '#DC2626',
                              }}
                            >
                              Expired
                            </span>
                          )}
                        </div>

                        {/* Details */}
                        <div
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '12px',
                            color: '#6B6B6B',
                          }}
                        >
                          {isUsed ? (
                            <>Used by {code.usedBy?.name} on {formatDate(code.usedAt!)}</>
                          ) : (
                            <>Expires {formatDate(code.expiresAt)}</>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        {isActive && (
                          <button
                            onClick={() => handleCopy(code.code, code.id)}
                            className="flex items-center justify-center transition-all"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '8px',
                              border: 'none',
                              background: 'rgba(0, 0, 0, 0.04)',
                              cursor: 'pointer',
                            }}
                            title="Copy code"
                          >
                            {copiedId === code.id ? (
                              <CheckIcon className="w-4 h-4" style={{ color: '#16A34A' }} />
                            ) : (
                              <ClipboardIcon className="w-4 h-4" style={{ color: '#6B6B6B' }} />
                            )}
                          </button>
                        )}
                        {!isUsed && (
                          <button
                            onClick={() => handleDelete(code.id)}
                            className="flex items-center justify-center transition-all"
                            style={{
                              width: 32,
                              height: 32,
                              borderRadius: '8px',
                              border: 'none',
                              background: 'rgba(239, 68, 68, 0.08)',
                              cursor: 'pointer',
                            }}
                            title="Delete code"
                          >
                            <TrashIcon className="w-4 h-4" style={{ color: '#DC2626' }} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </CardContainer>
  );
}
