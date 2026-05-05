'use client';

import { useState, useEffect } from 'react';
import { authFetch } from '@/lib/api/authFetch';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

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
}

interface AccountInfoCardProps {
  crewId: string;
  storeId: string;
}

export function AccountInfoCard({ crewId, storeId }: AccountInfoCardProps) {
  const [crew, setCrew] = useState<CrewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        const res = await authFetch(`${API_URL}/crew/${crewId}?include=roles`);
        if (!res.ok) throw new Error('Failed to load crew data');
        const data = await res.json();
        if (!cancelled) setCrew(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadData();
    return () => {
      cancelled = true;
    };
  }, [crewId]);

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1rem" padding="1rem">
        <div style={{ color: '#6B6B6B', fontSize: '14px' }}>Loading...</div>
      </CardContainer>
    );
  }

  if (error || !crew) {
    return (
      <CardContainer lightMode={true} borderRadius="1rem" padding="1rem">
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

  return (
    <CardContainer lightMode={true} borderRadius="1rem" padding="1rem">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Basic Info Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Title Bubble */}
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
              Basic Info
            </div>
          </div>

          {/* Info Rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>ID</span>
              <span
                style={{
                  fontFamily: 'var(--font-open-sans)',
                  fontSize: '13px',
                  color: '#2C2C2C',
                  fontWeight: 500,
                  letterSpacing: '0.05em',
                }}
              >
                {crew.id}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Name</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500 }}>
                {crew.name}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Store ID</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C' }}>
                {crew.storeId}
              </span>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            height: 1,
            background:
              'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)',
          }}
        />

        {/* Assigned Roles Section */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* Title Bubble */}
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
              Assigned Roles ({crew.roles?.length || 0})
            </div>
          </div>

          {/* Role Pills */}
          {crew.roles && crew.roles.length > 0 ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {crew.roles.map((r) => (
                <div key={r.roleId} className="ai-glass-border" style={aiGlassLightBorderStyle('9999px')}>
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
            <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E', paddingLeft: '4px' }}>
              No roles assigned
            </span>
          )}
        </div>
      </div>
    </CardContainer>
  );
}
