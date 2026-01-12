'use client';

import { useState, useEffect } from 'react';
import { CardContainer, aiGlassLightBorderStyle, aiGlassLightContentStyle } from '@/components/ui/ai-glass';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface RoleDetailViewProps {
  roleId: number;
}

interface RoleData {
  id: number;
  code: string;
  displayName: string;
  storeId: number;
  familyId: number | null;
  family?: { id: number; name: string } | null;
  assignmentModel: string;
  consecutivePolicy: string;
  taskLength: number;
}

export function RoleDetailView({ roleId }: RoleDetailViewProps) {
  const [role, setRole] = useState<RoleData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRole() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`${API_URL}/roles?id=${roleId}`);
        if (!res.ok) throw new Error('Failed to load role data');
        const data = await res.json();
        if (!cancelled) setRole(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadRole();
    return () => { cancelled = true; };
  }, [roleId]);

  if (loading) {
    return (
      <CardContainer lightMode={true} borderRadius="1.5rem" padding="1.5rem">
        <div className="flex items-center justify-center py-8">
          <span style={{ fontFamily: 'var(--font-open-sans)', color: '#6B6B6B' }}>Loading...</span>
        </div>
      </CardContainer>
    );
  }

  if (error || !role) {
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
          {error || 'Role not found'}
        </div>
      </CardContainer>
    );
  }

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
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Code</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500, letterSpacing: '0.05em' }}>{role.code}</span>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Display Name</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500 }}>{role.displayName}</span>
            </div>
            {role.family && (
              <div className="flex justify-between">
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Family</span>
                <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C' }}>{role.family.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.08) 40%, rgba(0,0,0,0.08) 60%, transparent 100%)' }} />

        {/* Settings Section */}
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
            Settings
          </h3>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Assignment Model</span>
              <div
                className="ai-glass-border"
                style={aiGlassLightBorderStyle('9999px')}
              >
                <div
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.5),
                    padding: '2px 10px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: '#2C2C2C',
                  }}
                >
                  {role.assignmentModel}
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Consecutive Policy</span>
              <div
                className="ai-glass-border"
                style={aiGlassLightBorderStyle('9999px')}
              >
                <div
                  style={{
                    ...aiGlassLightContentStyle('9999px', 0.5),
                    padding: '2px 10px',
                    fontFamily: 'var(--font-open-sans)',
                    fontSize: '11px',
                    fontWeight: 500,
                    color: role.consecutivePolicy === 'REQUIRED' ? 'hsl(0, 84%, 60%)' : '#2C2C2C',
                  }}
                >
                  {role.consecutivePolicy}
                </div>
              </div>
            </div>
            <div className="flex justify-between">
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#9A999E' }}>Task Length</span>
              <span style={{ fontFamily: 'var(--font-open-sans)', fontSize: '13px', color: '#2C2C2C', fontWeight: 500 }}>{role.taskLength} min</span>
            </div>
          </div>
        </div>
      </div>
    </CardContainer>
  );
}
