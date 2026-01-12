'use client';

import { useState, useEffect } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface CrewDetailViewProps {
  crewId: string;
  userRole?: 'mate' | 'captain' | 'admin';
}

interface CrewData {
  id: string;
  name: string;
  storeId: number;
  roles: Array<{
    roleId: number;
    role: {
      id: number;
      code: string;
      displayName: string;
    };
  }>;
  roleRules?: Array<{
    id: number;
    isPriority: boolean;
    valueInt: number | null;
    roleRule: {
      id: number;
      type: string;
      constraintType: string;
      role: { id: number; code: string; displayName: string };
      targetRole: { id: number; code: string; displayName: string } | null;
    };
  }>;
}

export function CrewDetailView({ crewId, userRole = 'mate' }: CrewDetailViewProps) {
  const [crew, setCrew] = useState<CrewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadCrew() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_URL}/crew/${crewId}?include=roles,roleRules`);
        if (!res.ok) throw new Error('Failed to load crew data');
        const data = await res.json();
        if (!cancelled) setCrew(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCrew();
    return () => { cancelled = true; };
  }, [crewId]);

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  if (error || !crew) {
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
          {error || 'Crew not found'}
        </div>
      </CardContainer>
    );
  }

  const canManagePreferences = userRole === 'admin';

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
            Basic Info
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>ID</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500, letterSpacing: '0.05em' }}>{crew.id}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Name</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500 }}>{crew.name}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Store ID</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C' }}>{crew.storeId}</span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Roles Section */}
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
            Assigned Roles ({crew.roles.length})
          </h3>
          {crew.roles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {crew.roles.map((r) => (
                <div
                  key={r.roleId}
                  className="ai-glass-border"
                  style={aiGlassLightBorderStyle('9999px')}
                >
                  <div
                    style={{
                      ...aiGlassLightContentStyle('9999px', 0.5),
                      padding: '4px 12px',
                      fontFamily: 'var(--font-open-sans)',
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#2C2C2C',
                    }}
                  >
                    {r.role.displayName}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>No roles assigned</span>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Preferences Section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
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
              Preferences ({crew.roleRules?.length || 0})
            </h3>
            {!canManagePreferences && (
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '11px',
                  color: '#9A999E',
                  fontStyle: 'italic',
                }}
              >
                Admin only
              </span>
            )}
          </div>
          {crew.roleRules && crew.roleRules.length > 0 ? (
            <div className="flex flex-col gap-2">
              {crew.roleRules.map((rule) => (
                <div
                  key={rule.id}
                  className="ai-glass-border"
                  style={aiGlassLightBorderStyle('0.5rem')}
                >
                  <div
                    className="flex items-center justify-between"
                    style={{
                      ...aiGlassLightContentStyle('0.5rem', 0.4),
                      padding: '10px 14px',
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500 }}>
                        {rule.roleRule.type.replace(/_/g, ' ')}
                      </span>
                      <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '12px', color: '#9A999E' }}>
                        {rule.roleRule.role.displayName}
                        {rule.roleRule.targetRole && ` → ${rule.roleRule.targetRole.displayName}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {rule.isPriority && (
                        <span
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '10px',
                            fontWeight: 600,
                            color: 'hsl(0, 84%, 60%)',
                            textTransform: 'uppercase',
                          }}
                        >
                          Priority
                        </span>
                      )}
                      {rule.valueInt !== null && (
                        <span
                          style={{
                            fontFamily: 'var(--font-open-sans)',
                            fontSize: '12px',
                            color: '#6B6B6B',
                          }}
                        >
                          {rule.valueInt}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>No preferences set</span>
          )}
        </div>
      </div>
    </CardContainer>
  );
}
